// Key 1 of the two-key verifier: deterministic provenance.
// A quote is "verified" only if it exists in the source text after a conservative
// normalization (unicode, quotes, dashes, whitespace, case). No model is involved.

import type { DiffToken, VerifyResult } from './types'

interface Normalized { text: string; map: number[] } // map[i] = index in original of normalized char i

const CHAR_MAP: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '≥': '>=', '≤': '<=',
}

export function normalize(src: string): Normalized {
  const out: string[] = []
  const map: number[] = []
  let lastSpace = true
  for (let i = 0; i < src.length; i++) {
    let ch = src[i]
    if (ch === '­' || ch === '​' || ch === '﻿') continue // soft hyphen / zero-width
    // de-hyphenate words broken across lines: "medi-\ncal" -> "medical"
    if (ch === '-' && /[a-z]/i.test(src[i - 1] || '') && /\n/.test(src[i + 1] || '')) {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (/[a-z]/.test(src[j] || '')) { i = j - 1; continue }
    }
    const nf = (CHAR_MAP[ch] ?? ch).normalize('NFKC')
    for (const c of nf) {
      const lc = c.toLowerCase()
      if (/\s/.test(lc)) {
        if (lastSpace) continue
        out.push(' '); map.push(i); lastSpace = true
      } else {
        out.push(lc); map.push(i); lastSpace = false
      }
    }
    ch = ''
  }
  while (out.length && out[out.length - 1] === ' ') { out.pop(); map.pop() }
  return { text: out.join(''), map }
}

function stripWrapping(q: string): string {
  return q.trim().replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '').replace(/^(\.\.\.|…)\s*/, '').replace(/\s*(\.\.\.|…)$/, '').trim()
}

const sourceCache = new Map<string, Normalized>()
function normCached(source: string): Normalized {
  let n = sourceCache.get(source)
  if (!n) { n = normalize(source); if (sourceCache.size > 50) sourceCache.clear(); sourceCache.set(source, n) }
  return n
}

/** Verify a quote against a source. Supports "…" ellipses: segments must appear in order. */
export function verifyQuote(quote: string | null | undefined, source: string): VerifyResult {
  const q = stripWrapping(quote || '')
  if (!q || q.length < 4) return { status: 'not_found', start: -1, end: -1 }
  const src = normCached(source)
  const segments = q.split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).map(s => normalize(s).text.replace(/[.;,:]+$/, '')).filter(Boolean)
  let from = 0
  let start = -1
  let endN = -1
  for (const seg of segments) {
    const idx = src.text.indexOf(seg, from)
    if (idx < 0) {
      const near = closestSentence(q, source)
      return { status: 'not_found', start: -1, end: -1, closest: near, diff: near ? wordDiff(near, q) : undefined }
    }
    if (start < 0) start = idx
    endN = idx + seg.length
    from = endN
  }
  const oStart = src.map[start] ?? 0
  const oEnd = (src.map[endN - 1] ?? source.length - 1) + 1
  return { status: 'verified', start: oStart, end: oEnd }
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.;:!?])\s+(?=[A-Z0-9("“])|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 8)
}

function tokens(s: string): string[] { return normalize(s).text.split(/[^a-z0-9>=<%.]+/).filter(Boolean) }

/** Closest source sentence by token overlap (for showing what a tampered quote should have said). */
export function closestSentence(quote: string, source: string): string | undefined {
  const qt = new Set(tokens(quote))
  if (!qt.size) return undefined
  let best: string | undefined
  let bestScore = 0
  const sentences = splitSentences(source)
  // also consider windows of 2 consecutive sentences for long quotes
  const candidates = sentences.concat(sentences.slice(0, -1).map((s, i) => s + ' ' + sentences[i + 1]))
  for (const s of candidates) {
    const st = tokens(s)
    if (!st.length) continue
    let inter = 0
    const ss = new Set(st)
    qt.forEach(t => { if (ss.has(t)) inter++ })
    const score = inter / (qt.size + ss.size - inter)
    if (score > bestScore) { bestScore = score; best = s }
  }
  return bestScore > 0.25 ? best : undefined
}

/** Word-level LCS diff: tokens from `a` (source) vs `b` (quote). */
export function wordDiff(a: string, b: string): DiffToken[] {
  const A = a.split(/(\s+)/).filter(x => x.length)
  const B = b.split(/(\s+)/).filter(x => x.length)
  const key = (w: string) => normalize(w).text
  const n = A.length, m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = key(A[i]) === key(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffToken[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (key(A[i]) === key(B[j])) { out.push({ text: B[j], kind: 'same' }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ text: A[i], kind: 'removed' }); i++ }
    else { out.push({ text: B[j], kind: 'added' }); j++ }
  }
  while (i < n) out.push({ text: A[i++], kind: 'removed' })
  while (j < m) out.push({ text: B[j++], kind: 'added' })
  return out
}

/** Line helpers for chart notes. Lines are 1-indexed. */
export function toLines(text: string): string[] { return text.replace(/\r\n/g, '\n').split('\n') }
export function lineOfOffset(text: string, offset: number): number {
  if (offset < 0) return -1
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/** Mutate one meaningful word in a quote — used by the on-stage "Tamper" button. */
export function tamper(quote: string): string {
  const swaps: [RegExp, string][] = [
    [/\bfour\b/i, 'three'], [/\bthree\b/i, 'four'], [/\bsix\b/i, 'twelve'], [/\b(\d+)\b/, '$1'],
    [/\bor\b/, 'and'], [/\band\b/, 'or'], [/\bmust\b/i, 'may'], [/\bis\b/, 'is not'], [/\bhas\b/, 'has not'],
  ]
  for (const [re, rep] of swaps.slice(0, 3)) if (re.test(quote)) return quote.replace(re, rep)
  const num = quote.match(/\b(\d+)\b/)
  if (num) return quote.replace(num[0], String(Number(num[0]) + 2))
  for (const [re, rep] of swaps.slice(4)) if (re.test(quote)) return quote.replace(re, rep)
  const words = quote.split(' ')
  const k = Math.min(words.length - 1, Math.max(1, Math.floor(words.length / 2)))
  words[k] = words[k] + 'ly'
  return words.join(' ')
}
