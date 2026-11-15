// Live transcript: a clean call log, one merged row per turn for the provider and the
// medical director, plus the typed-reply box (text fallback).

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Keyboard } from 'lucide-react'
import { cx } from '../../ui/kit'
import { DIRECTOR, type TranscriptEntry } from './context'
import type { CallPhase } from './useLiveCall'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** In-progress turn: a blinking block caret, the system's only allowed idle animation. */
function Caret() {
  return <span className="caret ml-0.5 inline-block h-[1.05em] w-[0.5em] translate-y-[2px] bg-current" role="img" aria-label="Speaking" />
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
  const turns = shown.filter(e => e.role !== 'system').length

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
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <span className="eyebrow">Transcript</span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400 tabular-nums">
          {live && <span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-mint align-middle" aria-hidden />}
          {turns} {turns === 1 ? 'turn' : 'turns'}
        </span>
      </div>

      <div ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }}
        className="scrollbar-thin h-[300px] overflow-y-auto px-4 sm:px-5 lg:h-auto lg:min-h-[180px] lg:flex-1" aria-live="polite">
        {!shown.length && (
          <div className="flex h-full min-h-[150px] flex-col items-start justify-center gap-2 py-6 sm:items-center sm:text-center">
            <div className="font-serif text-[16px] font-medium tracking-[-0.015em] text-ink-100">The transcript appears here as you talk</div>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-400">
              {DIRECTOR.short} opens by stating the denial reason. Name the governing criterion, then read the chart line that meets it.
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {shown.map(e => {
            if (e.role === 'system') {
              return (
                <motion.div key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-3 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
                  <span className="h-px flex-1 bg-line" />{e.text} · {clock(e.at)}<span className="h-px flex-1 bg-line" />
                </motion.div>
              )
            }
            const dir = e.role === 'director'
            const who = dir ? `${DIRECTOR.name}, ${DIRECTOR.title} · ${payer}` : 'You (provider)'
            return (
              <motion.div key={e.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="grid gap-1 border-b border-line/70 py-3 last:border-b-0 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-4">
                <div className="flex items-baseline gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] sm:flex-col sm:gap-0.5 sm:pt-[3px]" title={who}>
                  <span className={cx('font-medium', dir ? 'text-ink-100' : 'text-mint-deep')}>{dir ? DIRECTOR.short : 'You'}</span>
                  <span className="sr-only">{who}</span>
                  <span className="flex items-center gap-1.5 text-ink-400 tabular-nums">
                    {clock(e.at)}
                    {e.typed && <span className="inline-flex items-center gap-1 normal-case tracking-normal"><Keyboard className="size-3" aria-hidden /><span>typed</span></span>}
                  </span>
                </div>
                <p className={cx('text-[13.5px] leading-relaxed', dir ? 'text-ink-100' : 'text-ink-200')}>
                  {e.text.trim() ? e.text.trim() : <span className={dir ? 'text-ink-300' : 'text-mint-deep'}><Caret /></span>}
                </p>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-paper-low/60 px-3 py-3 sm:px-4">
        <div className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input value={draft} onChange={e => setDraft(e.target.value)} disabled={!live}
            placeholder={!live ? 'Start the call to reply' : micAvailable ? 'Or type a reply to the director' : 'No microphone: type your reply to the director'}
            aria-label="Type a reply to the medical director"
            className="h-10 w-full rounded-[4px] border border-line bg-paper-high pl-9 pr-3 text-[13.5px] text-ink-100 placeholder:text-ink-400 outline-none transition-colors focus:border-ink-100 disabled:cursor-not-allowed disabled:bg-paper-low disabled:opacity-70" />
        </div>
        <button type="submit" disabled={!live || !draft.trim()} aria-label="Send reply"
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[4px] border border-ink-100 bg-ink-100 text-paper transition-colors hover:bg-[#2b2a27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep disabled:pointer-events-none disabled:opacity-30">
          <CornerDownLeft className="size-4" />
        </button>
      </form>
    </div>
  )
}
