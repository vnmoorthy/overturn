// Text viewers with verified-quote highlighting and auto-scroll to the active quote.
import { useEffect, useMemo, useRef } from 'react'
import { cx } from '../../ui/kit'

export interface Range { start: number; end: number; tone: 'green' | 'red' | 'amber' | 'violet'; active?: boolean; id?: string }

const TONE: Record<Range['tone'], string> = {
  green: 'bg-emerald-400/15 text-emerald-100 decoration-emerald-400/60',
  red: 'bg-rose-400/20 text-rose-100',
  amber: 'bg-amber-300/15 text-amber-100',
  violet: 'bg-violet-400/15 text-violet-100',
}
const ACTIVE: Record<Range['tone'], string> = {
  green: 'bg-emerald-400/30 text-white shadow-[0_0_0_1px_rgba(52,211,153,.6),0_0_28px_rgba(52,211,153,.45)]',
  red: 'bg-rose-500/35 text-white shadow-[0_0_0_1px_rgba(251,113,133,.7),0_0_28px_rgba(251,113,133,.45)]',
  amber: 'bg-amber-400/30 text-white shadow-[0_0_0_1px_rgba(251,191,36,.6)]',
  violet: 'bg-violet-500/30 text-white shadow-[0_0_0_1px_rgba(167,139,250,.6)]',
}

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

export function PolicyViewer({ text, ranges, activeKey, className }: { text: string; ranges: Range[]; activeKey: unknown; className?: string }) {
  const box = useScrollToActive(activeKey)
  const segs = useMemo(() => segments(text, ranges), [text, ranges])
  return (
    <div ref={box} className={cx('scrollbar-thin relative overflow-y-auto whitespace-pre-wrap px-5 py-4 font-[450] text-[13px] leading-[1.75] text-ink-300', className)}>
      {segs.map((s, i) => s.r
        ? <mark key={i} data-active={s.r.active ? '1' : undefined} className={cx('rounded-[4px] px-0.5 transition-all duration-500', s.r.active ? ACTIVE[s.r.tone] : TONE[s.r.tone])}>{s.text}</mark>
        : <span key={i}>{s.text}</span>)}
    </div>
  )
}

export function ChartViewer({ text, ranges, activeKey, activeLine, className }: { text: string; ranges: Range[]; activeKey: unknown; activeLine?: number | null; className?: string }) {
  const box = useScrollToActive(activeKey)
  const lines = useMemo(() => {
    const out: { n: number; text: string; offset: number }[] = []
    let off = 0
    text.split('\n').forEach((t, i) => { out.push({ n: i + 1, text: t, offset: off }); off += t.length + 1 })
    return out
  }, [text])
  return (
    <div ref={box} className={cx('scrollbar-thin relative overflow-y-auto py-3 font-mono text-[12.5px] leading-[1.7]', className)}>
      {lines.map(l => {
        const segs = segments(l.text, ranges, l.offset)
        const isActive = activeLine === l.n
        const header = /^---.*---$/.test(l.text.trim())
        return (
          <div key={l.n} data-active={isActive ? '1' : undefined}
            className={cx('flex gap-3 px-3 transition-colors duration-500', isActive && 'bg-emerald-400/[0.07]')}>
            <span className={cx('w-7 shrink-0 select-none text-right tabular-nums', isActive ? 'text-emerald-300' : 'text-ink-600')}>{l.n}</span>
            <span className={cx('min-w-0 flex-1 whitespace-pre-wrap break-words', header ? 'text-ink-400 font-semibold' : 'text-ink-300')}>
              {segs.map((s, i) => s.r
                ? <mark key={i} className={cx('rounded-[4px] px-0.5 transition-all duration-500', s.r.active ? ACTIVE[s.r.tone] : TONE[s.r.tone])}>{s.text}</mark>
                : <span key={i}>{s.text || (segs.length === 1 ? ' ' : '')}</span>)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
