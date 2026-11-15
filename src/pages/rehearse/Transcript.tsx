// Live transcript: merged per-turn bubbles for the provider and the medical director,
// plus the typed-reply box (text fallback).

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, Send } from 'lucide-react'
import { cx } from '../../ui/kit'
import { DIRECTOR, type TranscriptEntry } from './context'
import type { CallPhase } from './useLiveCall'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Dots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Speaking">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="size-1.5 rounded-full bg-current" animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </span>
  )
}

export function Transcript({ entries, phase, payer, micAvailable, onSend }: {
  entries: TranscriptEntry[]
  phase: CallPhase
  payer: string
  micAvailable: boolean
  onSend: (text: string) => boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const stick = useRef(true)
  const live = phase === 'live'
  const shown = entries.filter(e => e.role === 'system' || e.text.trim() || !e.done)

  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [entries])

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (onSend(draft)) setDraft('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }}
        className="scrollbar-thin h-[300px] space-y-3 lg:h-auto lg:min-h-[180px] lg:flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {!shown.length && (
          <div className="flex h-full min-h-[150px] flex-col items-center justify-center gap-2 text-center">
            <div className="text-[13.5px] font-medium text-ink-100">The transcript appears here as you talk</div>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-400">
              {DIRECTOR.short} opens by stating the denial reason. Name the governing criterion, then read the chart line that meets it.
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {shown.map(e => {
            if (e.role === 'system') {
              return (
                <motion.div key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-[0.14em] text-ink-400">
                  <span className="h-px flex-1 bg-white/8" />{e.text} · {clock(e.at)}<span className="h-px flex-1 bg-white/8" />
                </motion.div>
              )
            }
            const dir = e.role === 'director'
            return (
              <motion.div key={e.id} layout="position" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                className={cx('flex gap-2.5', dir ? 'justify-start' : 'flex-row-reverse')}>
                <div className={cx('mt-5 grid size-7 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold',
                  dir ? 'bg-gradient-to-br from-violet-400 to-pink-400 text-ink-950' : 'bg-gradient-to-br from-emerald-300 to-cyan-400 text-ink-950')}>
                  {dir ? DIRECTOR.initials : 'You'}
                </div>
                <div className={cx('min-w-0 max-w-[82%]', !dir && 'text-right')}>
                  <div className={cx('mb-1 flex items-center gap-1.5 text-[11px] text-ink-400', !dir && 'justify-end')}>
                    <span className={dir ? 'text-violet-200' : 'text-emerald-200'}>{dir ? `${DIRECTOR.name}, ${DIRECTOR.title}` : 'You (provider)'}</span>
                    {dir && <span className="hidden sm:inline">· {payer}</span>}
                    {e.typed && <Keyboard className="size-3" aria-label="typed" />}
                    <span className="font-mono">{clock(e.at)}</span>
                  </div>
                  <div className={cx('inline-block rounded-2xl border px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed',
                    dir ? 'rounded-tl-md border-violet-300/15 bg-violet-400/[0.08] text-ink-100' : 'rounded-tr-md border-emerald-300/15 bg-emerald-400/[0.08] text-ink-100')}>
                    {e.text.trim() ? e.text.trim() : <span className={dir ? 'text-violet-200' : 'text-emerald-200'}><Dots /></span>}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/8 px-3 py-3 sm:px-4">
        <div className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input value={draft} onChange={e => setDraft(e.target.value)} disabled={!live}
            placeholder={!live ? 'Start the call to reply' : micAvailable ? 'Or type a reply to the director' : 'No microphone: type your reply to the director'}
            aria-label="Type a reply to the medical director"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-400 outline-none transition focus:border-violet-300/40 focus:bg-white/[0.06] disabled:opacity-50" />
        </div>
        <button type="submit" disabled={!live || !draft.trim()} aria-label="Send reply"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-gradient-to-b from-[#8b6dff] to-[#6a4cf0] text-white transition hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40 cursor-pointer">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}
