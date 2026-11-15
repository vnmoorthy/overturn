// Text viewers with verified-quote highlighting and auto-scroll to the active quote.
// Highlights read like a code-review diff: the line holding the active quote gets a tinted band with a
// 2px rule, the gutter carries a +/− marker, and the exact verified span is an inline tinted mark.
import { useEffect, useMemo, useRef } from 'react'
import { cx } from '../../ui/kit'

export interface Range { start: number; end: number; tone: 'green' | 'red' | 'amber' | 'violet'; active?: boolean; id?: string }
type Tone = Range['tone']

/** Inline mark on a verified span that is not the selected criterion. */
const MARK: Record<Tone, string> = {
  green: 'bg-mint-pale/70 text-ink-100',
  red: 'bg-rose-50 text-rose-800',
  amber: 'bg-amber-50 text-amber-900',
  violet: 'bg-paper-low text-ink-200 underline decoration-line-strong decoration-dotted underline-offset-[3px]',
}
/** Inline mark on the selected criterion's span (its line also gets a BAND + RULE). */
const MARK_ACTIVE: Record<Tone, string> = {
  green: 'bg-mint-pale text-mint-ink',
  red: 'bg-rose-100/80 text-rose-900',
  amber: 'bg-amber-100/80 text-amber-900',
  violet: 'bg-line/60 text-ink-100',
}
const BAND: Record<Tone, string> = { green: 'bg-mint-pale/40', red: 'bg-rose-50', amber: 'bg-amber-50/80', violet: 'bg-paper-low' }
const RULE: Record<Tone, string> = { green: 'bg-mint', red: 'bg-rose-400', amber: 'bg-amber-400', violet: 'bg-line-strong' }
const SIGN: Record<Tone, string> = { green: '+', red: '−', amber: '!', violet: '?' }
const SIGN_TEXT: Record<Tone, string> = { green: 'text-mint-deep', red: 'text-rose-700', amber: 'text-amber-700', violet: 'text-ink-400' }

function segments(text: string, ranges: Range[], offset = 0) {
  const rs = ranges
    .map(r => ({ ...r, start: Math.max(r.start - offset, 0), end: Math.min(r.end - offset, text.length) }))
    .filter(r => r.end > 0 && r.start < text.length && r.end > r.start)
    .sort((a, b) => a.start - b.start || Number(b.active) - Number(a.active))
  const out: { text: string; r?: Range }[] = []
  let i = 0
  for (const r of rs) {
    if (r.start < i) continue
    if (r.start > i) out.push({ text: text.slice(i, r.start) })
    out.push({ text: text.slice(r.start, r.end), r })
    i = r.end
  }
  if (i < text.length) out.push({ text: text.slice(i) })
  return out
}

function splitLines(text: string) {
  const out: { n: number; text: string; offset: number }[] = []
  let off = 0
  text.split('\n').forEach((t, i) => { out.push({ n: i + 1, text: t, offset: off }); off += t.length + 1 })
  return out
}

function useScrollToActive(dep: unknown) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current?.querySelector('[data-active="1"]') as HTMLElement | null
    if (el && box.current) {
      const top = el.offsetTop - box.current.clientHeight / 3
      box.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }, [dep])
  return box
}

function Marks({ segs, blank }: { segs: { text: string; r?: Range }[]; blank?: boolean }) {
  return <>{segs.map((s, i) => s.r
    ? <mark key={i} className={cx('rounded-[2px] px-[1px] [box-decoration-break:clone] transition-colors duration-300', s.r.active ? MARK_ACTIVE[s.r.tone] : MARK[s.r.tone])}>{s.text}</mark>
    : <span key={i}>{s.text || (blank && segs.length === 1 ? ' ' : '')}</span>)}</>
}

type PolicyLineKind = 'blank' | 'section' | 'caps' | 'subhead' | 'item' | 'body'

/**
 * The policy, set like a legal document: section headings as numbered mono rules, all-caps titles and
 * short sub-heads in serif, numbered / lettered / dashed criteria with a hanging indent.
 * `headings` (optional) are the section headings joined into `text`, so they can be told apart from body lines.
 */
export function PolicyViewer({ text, ranges, activeKey, className, headings }: { text: string; ranges: Range[]; activeKey: unknown; className?: string; headings?: string[] }) {
  const box = useScrollToActive(activeKey)
  const lines = useMemo(() => {
    const heads = new Set((headings || []).map(h => h.trim()))
    let sec = 0
    return splitLines(text).map((l, idx, all) => {
      const t = l.text.trim()
      const lead = l.text.length - l.text.trimStart().length
      let kind: PolicyLineKind = 'body'
      if (!t) kind = 'blank'
      else if (heads.has(t) && (idx === 0 || !all[idx - 1].text.trim())) kind = 'section'
      else if (/^(\d+|[A-Za-z]|[ivx]+)[.)]\s|^[-–•]\s/.test(t)) kind = 'item'
      else if (t.length > 3 && /[A-Z]/.test(t) && !/[a-z]/.test(t)) kind = 'caps'
      else if (t.length < 60 && t.split(/\s+/).length <= 6 && /^[A-Z]/.test(t) && !/[.;:,]$/.test(t)) kind = 'subhead'
      if (kind === 'section') sec++
      return { ...l, t, lead, kind, sec }
    })
  }, [text, headings])

  return (
    <div ref={box} className={cx('scrollbar-thin relative overflow-y-auto px-5 py-4 sm:px-6', className)}>
      {lines.map(l => {
        if (l.kind === 'blank') return <div key={l.n} aria-hidden className="h-2.5" />
        const segs = segments(l.text.slice(l.lead), ranges, l.offset + l.lead)
        const tone = segs.find(s => s.r?.active)?.r?.tone
        const quoted = segs.find(s => s.r)?.r?.tone
        if (l.kind === 'section') {
          return (
            <div key={l.n} data-active={tone ? '1' : undefined} className={cx('mb-1 flex gap-2.5 border-b border-line pb-1.5 font-mono text-[10.5px] font-medium uppercase leading-[1.6] tracking-[0.1em] text-ink-400', l.sec > 1 && 'mt-7')}>
              <span className="shrink-0 text-ink-100">§{l.sec}</span>
              <span className="min-w-0"><Marks segs={segs} /></span>
            </div>
          )
        }
        const indent = Math.min(l.lead, 12) * 0.42 // em
        const hang = l.kind === 'item' ? 1.45 : 0
        return (
          <div key={l.n} data-active={tone ? '1' : undefined} className={cx('relative -mx-3 rounded-[2px] px-3 transition-colors duration-300', tone && BAND[tone])}>
            {(tone || quoted) && <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[2px] transition-opacity duration-300', RULE[(tone || quoted)!], !tone && 'opacity-35')} />}
            <p style={{ paddingLeft: `${indent + hang}em`, textIndent: hang ? `-${hang}em` : undefined }}
              className={cx('font-serif',
                l.kind === 'caps' && 'pt-1 text-[13px] font-semibold tracking-[0.05em] text-ink-100',
                l.kind === 'subhead' && 'pt-1 text-[14.5px] font-semibold tracking-[-0.005em] text-ink-100',
                (l.kind === 'body' || l.kind === 'item') && 'text-[14px] leading-[1.72] text-ink-200')}>
              <Marks segs={segs} />
            </p>
          </div>
        )
      })}
    </div>
  )
}

/** Chart notes as a numbered mono listing; the active line reads like a diff hunk. */
export function ChartViewer({ text, ranges, activeKey, activeLine, className }: { text: string; ranges: Range[]; activeKey: unknown; activeLine?: number | null; className?: string }) {
  const box = useScrollToActive(activeKey)
  const lines = useMemo(() => splitLines(text), [text])
  const activeTone: Tone = ranges.find(r => r.active)?.tone ?? 'violet'
  return (
    <div ref={box} className={cx('scrollbar-thin relative overflow-y-auto py-2 font-mono text-[12.5px] leading-[1.7]', className)}>
      {lines.map(l => {
        const segs = segments(l.text, ranges, l.offset)
        const isActive = activeLine === l.n
        const header = /^---.*---$/.test(l.text.trim())
        const marked = segs.find(s => s.r?.active)?.r?.tone ?? segs.find(s => s.r)?.r?.tone
        const tone: Tone = segs.find(s => s.r?.active)?.r?.tone ?? activeTone
        return (
          <div key={l.n} data-active={isActive ? '1' : undefined}
            className={cx('relative flex pr-3 transition-colors duration-300', isActive ? BAND[tone] : header && 'bg-paper-low/70')}>
            {(isActive || marked) && <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[2px] transition-opacity duration-300', isActive ? RULE[tone] : RULE[marked!], !isActive && 'opacity-35')} />}
            <span className={cx('w-10 shrink-0 select-none border-r border-line/70 pr-2.5 text-right tabular-nums', isActive ? 'font-medium text-ink-100' : 'text-faint')}>{l.n}</span>
            <span aria-hidden className={cx('w-6 shrink-0 select-none text-center', marked ? SIGN_TEXT[marked] : 'text-transparent', marked && !isActive && 'opacity-70')}>{marked ? SIGN[marked] : '·'}</span>
            <span className={cx('min-w-0 flex-1 whitespace-pre-wrap break-words', header ? 'font-medium text-ink-100' : 'text-ink-300')}>
              <Marks segs={segs} blank />
            </span>
          </div>
        )
      })}
    </div>
  )
}
