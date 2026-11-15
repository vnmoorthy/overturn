// Appeal letter assembly. The model never types quotations: it emits [[Q:rowId:policy|chart]]
// tokens that we expand into verified verbatim quotes. Any other quoted text is re-verified.
import type { MatchRow, PolicyVersion } from './types'
import { verifyQuote } from './verifier'

export interface Inline { kind: 'text' | 'bold' | 'quote' | 'freequote'; text: string; ok?: boolean; rowId?: string; field?: 'policy' | 'chart'; cite?: string }
export interface Block { kind: 'h' | 'p' | 'li'; inlines: Inline[] }
export interface LetterCtx {
  rows: MatchRow[]
  effective: PolicyVersion | null
  policyText: string
  chartText: string
  denialText: string
  rowOk: (row: MatchRow, field: 'policy' | 'chart') => boolean
}

const TOKEN = /\[\[Q:([a-z0-9]+):(policy|chart)\]\]/gi

function inlineParse(src: string, ctx: LetterCtx): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of src.matchAll(TOKEN)) {
    if (m.index! > last) out.push(...textParse(src.slice(last, m.index), ctx))
    const row = ctx.rows.find(r => r.id === m[1])
    const field = m[2].toLowerCase() as 'policy' | 'chart'
    if (!row) out.push({ kind: 'quote', text: `[unknown citation ${m[1]}]`, ok: false, rowId: m[1], field })
    else if (field === 'policy') out.push({ kind: 'quote', text: row.policy_quote, ok: ctx.rowOk(row, 'policy'), rowId: row.id, field, cite: ctx.effective ? `${ctx.effective.id}, version effective ${ctx.effective.effective_date}` : 'policy' })
    else if (!row.chart_quote) { /* no chart evidence to cite — token dropped */ }
    else out.push({ kind: 'quote', text: row.chart_quote, ok: ctx.rowOk(row, 'chart'), rowId: row.id, field, cite: `medical record, line ${row.chart_line}` })
    last = m.index! + m[0].length
  }
  if (last < src.length) out.push(...textParse(src.slice(last), ctx))
  return out
}

function textParse(src: string, ctx: LetterCtx): Inline[] {
  const out: Inline[] = []
  // Every quote pair is consumed in order, so text between two quotes is never mistaken for a quote.
  const re = /\*\*([^*]+)\*\*|“([^”]*)”|"([^"\n]*)"/g
  let last = 0
  for (const m of src.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    if (m[1] !== undefined) {
      const inner = textParse(m[1], ctx)
      if (inner.some(i => i.kind === 'freequote')) out.push(...inner)
      else out.push({ kind: 'bold', text: m[1] })
    } else {
      const q = (m[2] ?? m[3] ?? '').trim()
      if (q.split(/\s+/).length < 3) out.push({ kind: 'text', text: m[0] }) // a word or two in quotes is emphasis, not a quotation
      else {
        const ok = [ctx.policyText, ctx.chartText, ctx.denialText].some(s => verifyQuote(q, s).status === 'verified')
        out.push({ kind: 'freequote', text: q, ok })
      }
    }
    last = m.index! + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}

export function buildLetter(md: string, ctx: LetterCtx) {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { blocks.push({ kind: 'p', inlines: inlineParse(para.join(' '), ctx) }); para = [] } }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const h = line.match(/^#{1,4}\s+(.*)$/)
    const li = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/)
    if (h) { flush(); blocks.push({ kind: 'h', inlines: inlineParse(h[1].replace(/\*\*/g, ''), ctx) }) }
    else if (li) { flush(); blocks.push({ kind: 'li', inlines: inlineParse(li[1], ctx) }) }
    else para.push(line)
  }
  flush()
  const quotes = blocks.flatMap(b => b.inlines).filter(i => i.kind === 'quote' || i.kind === 'freequote')
  return { blocks, total: quotes.length, verified: quotes.filter(q => q.ok).length, unverified: quotes.filter(q => !q.ok) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function blocksToHtml(blocks: Block[]): string {
  const inl = (xs: Inline[]) => xs.map(i => {
    if (i.kind === 'bold') return `<strong>${esc(i.text)}</strong>`
    if (i.kind === 'quote') return `“${esc(i.text)}”${i.cite ? ` <span class="cite">(${esc(i.cite)})</span>` : ''}`
    if (i.kind === 'freequote') return `“${esc(i.text)}”`
    return esc(i.text)
  }).join('')
  let html = ''
  let inList = false
  for (const b of blocks) {
    if (b.kind === 'li' && !inList) { html += '<ul>'; inList = true }
    if (b.kind !== 'li' && inList) { html += '</ul>'; inList = false }
    if (b.kind === 'h') html += `<h3>${inl(b.inlines)}</h3>`
    else if (b.kind === 'li') html += `<li>${inl(b.inlines)}</li>`
    else html += `<p>${inl(b.inlines)}</p>`
  }
  if (inList) html += '</ul>'
  return html
}
