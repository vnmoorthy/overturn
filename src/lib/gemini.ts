// Gemini client (browser). Every call goes through `run()`, which walks a model
// fallback chain with per-attempt timeouts and records a trace for the UI.

import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai'
import type { TraceEntry } from './types'

declare const __DEMO_KEY__: string

const LS_KEY = 'gemini_user_key'
const LS_QUALITY = 'overturn_quality'

export function getUserKey(): string {
  try { return localStorage.getItem(LS_KEY) || '' } catch { return '' }
}
export function setUserKey(k: string) {
  try { k ? localStorage.setItem(LS_KEY, k.trim()) : localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
  client = null
  try { window.dispatchEvent(new Event('overturn-key')) } catch { /* node */ }
}
let runtimeKey = ''
/** For Node scripts (cache recording) — browsers use Settings or the build-time demo key. */
export function setRuntimeKey(k: string) { runtimeKey = k; client = null }
export function activeKey(): string { return runtimeKey || getUserKey() || (typeof __DEMO_KEY__ !== 'undefined' ? __DEMO_KEY__ : '') || '' }
export function keySource(): 'user' | 'demo' | 'none' {
  return getUserKey() ? 'user' : activeKey() ? 'demo' : 'none'
}

export type Quality = 'max' | 'fast'
export function getQuality(): Quality {
  try { return (localStorage.getItem(LS_QUALITY) as Quality) || 'max' } catch { return 'max' }
}
export function setQuality(q: Quality) { try { localStorage.setItem(LS_QUALITY, q) } catch { /* ignore */ } }

let client: GoogleGenAI | null = null
export function ai(): GoogleGenAI {
  const k = activeKey()
  if (!k) throw new Error('No Gemini API key. Open Settings and paste a free key from aistudio.google.com/apikey')
  if (!client) client = new GoogleGenAI({ apiKey: k, httpOptions: { apiVersion: 'v1beta' } })
  return client
}

/** Model chains per task. First model is preferred; later ones are fallbacks. */
export function chain(task: Task): string[] {
  const max = getQuality() === 'max'
  switch (task) {
    case 'extract': return ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']
    case 'transcribe': return ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-4-hydrogen']
    case 'locate': return ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
    case 'match': return max ? ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'] : ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']
    case 'entail': return ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']
    case 'letter': return max ? ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'] : ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']
    case 'explain': return ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']
    case 'coach': return ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-4-hydrogen']
    case 'tts': return ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']
    case 'embed': return ['gemini-embedding-2']
  }
}
export type Task = 'extract' | 'transcribe' | 'locate' | 'match' | 'entail' | 'letter' | 'explain' | 'coach' | 'tts' | 'embed'

export const LIVE_MODEL = 'gemini-3.8-live'

const TIMEOUTS: Record<Task, number> = {
  extract: 45_000, transcribe: 60_000, locate: 20_000, match: 120_000, entail: 60_000,
  letter: 120_000, explain: 45_000, coach: 45_000, tts: 45_000, embed: 20_000,
}

export function thinkingFor(model: string, level: 'low' | 'medium' | 'high' = 'low'): { thinkingConfig?: ThinkingConfig } {
  const L = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }
  if (model.startsWith('gemini-4')) return { thinkingConfig: { thinkingLevel: L[level] } }
  if (model.startsWith('gemini-3.8-flash') && !model.includes('tts')) return { thinkingConfig: { thinkingLevel: level === 'high' ? L.medium : L.low } }
  if (model === 'gemini-3.5-flash') return { thinkingConfig: { thinkingLevel: L.low } }
  return {}
}

// ---- trace bus -------------------------------------------------------------
type TraceListener = (t: TraceEntry) => void
const traceListeners = new Set<TraceListener>()
export function onTrace(fn: TraceListener) { traceListeners.add(fn); return () => { traceListeners.delete(fn) } }
function emit(t: TraceEntry) { traceListeners.forEach(l => l(t)) }

export class AllModelsFailed extends Error {
  attempts: TraceEntry[]
  constructor(msg: string, attempts: TraceEntry[]) { super(msg); this.attempts = attempts }
}

function isRetryable(msg: string) {
  return /429|RESOURCE_EXHAUSTED|quota|503|UNAVAILABLE|overloaded|high demand|504|DEADLINE|timed? ?out|aborted|500|INTERNAL|fetch failed|NetworkError|Failed to fetch|404|not found|no longer available|empty response|JSON/i.test(msg)
}

/**
 * Run a Gemini request across the task's fallback chain.
 * `fn(model, signal)` performs the call and returns the parsed result.
 */
export async function run<T>(task: Task, fn: (model: string, signal: AbortSignal) => Promise<T>, models = chain(task)): Promise<{ value: T; model: string; ms: number; attempts: TraceEntry[] }> {
  const attempts: TraceEntry[] = []
  for (const model of models) {
    const ctrl = new AbortController()
    const t0 = performance.now()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUTS[task])
    try {
      const value = await Promise.race([
        fn(model, ctrl.signal),
        new Promise<never>((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error(`timed out after ${TIMEOUTS[task] / 1000}s`)))),
      ])
      clearTimeout(timer)
      const entry: TraceEntry = { task, model, ms: Math.round(performance.now() - t0), ok: true, at: Date.now() }
      attempts.push(entry); emit(entry)
      return { value, model, ms: entry.ms, attempts }
    } catch (e) {
      clearTimeout(timer)
      const msg = e instanceof Error ? e.message : String(e)
      const entry: TraceEntry = { task, model, ms: Math.round(performance.now() - t0), ok: false, error: shortErr(msg), at: Date.now() }
      attempts.push(entry); emit(entry)
      if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) throw new AllModelsFailed(friendlyError(e), attempts)
      if (!isRetryable(msg)) throw new AllModelsFailed(friendlyError(e), attempts)
    }
  }
  throw new AllModelsFailed(`All Gemini models for "${task}" are busy or rate-limited right now.`, attempts)
}

function shortErr(m: string) {
  const code = m.match(/"code":\s*(\d{3})/)?.[1]
  const status = m.match(/"status":\s*"([A-Z_]+)"/)?.[1]
  if (code || status) return [code, status].filter(Boolean).join(' ')
  return m.slice(0, 80)
}

export function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return 'That Gemini API key is not valid. Open Settings to update it.'
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(m)) return 'Gemini free-tier quota hit. Wait a few seconds, or add your own free key in Settings.'
  if (/503|UNAVAILABLE|high demand/i.test(m)) return 'Gemini is under heavy load right now. Retrying usually works in a few seconds.'
  if (/No Gemini API key/i.test(m)) return m
  if (/"code":\s*400|INVALID_ARGUMENT/i.test(m)) return 'Gemini could not read that input. Use a PDF, an image (JPG/PNG), or paste the text.'
  return m.length > 240 ? m.slice(0, 240) + '…' : m
}

/** Parse JSON from a model response, tolerating code fences. */
export function parseJson<T>(text: string | undefined): T {
  if (!text) throw new Error('empty response')
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { return JSON.parse(t) as T } catch {
    const s = t.indexOf('{'), e = t.lastIndexOf('}')
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1)) as T
    throw new Error('model returned invalid JSON')
  }
}

const LS_CACHE = 'overturn_use_cache'
/** When Gemini is busy/rate-limited, fall back to genuine saved runs for the demo cases. */
export function getUseCache(): boolean { try { return localStorage.getItem(LS_CACHE) !== '0' } catch { return true } }
export function setUseCache(v: boolean) { try { localStorage.setItem(LS_CACHE, v ? '1' : '0') } catch { /* ignore */ } }
