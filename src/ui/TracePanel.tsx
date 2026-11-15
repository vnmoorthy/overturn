// Live "agent trace": every Gemini call, model, latency, and fallback hops.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, CircleCheck, CircleX, X } from 'lucide-react'
import { onTrace } from '../lib/gemini'
import type { TraceEntry } from '../lib/types'
import { cx } from './kit'

const log: TraceEntry[] = []
const subs = new Set<() => void>()
onTrace(t => { log.unshift(t); if (log.length > 200) log.pop(); subs.forEach(s => s()) })
export function pushTrace(t: TraceEntry) { log.unshift(t); subs.forEach(s => s()) }

export function useTraceLog() {
  const [, setN] = useState(0)
  useEffect(() => { const f = () => setN(n => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return log
}

export function TracePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useTraceLog()
  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="glass-strong fixed right-3 top-3 bottom-3 z-40 flex w-[340px] flex-col rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-cyan-300" /> Gemini agent trace</div>
            <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-white/10 cursor-pointer" aria-label="Close trace"><X className="size-4" /></button>
          </div>
          <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto p-3">
            {!entries.length && <div className="p-6 text-center text-sm text-ink-400">No calls yet. Run a case to watch Gemini work — including automatic fallbacks when a model is busy.</div>}
            {entries.map((e, i) => (
              <motion.div key={e.at + e.model + i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className={cx('rounded-lg border px-3 py-2 text-[12px]', e.ok ? 'border-emerald-400/15 bg-emerald-400/[0.04]' : 'border-rose-400/15 bg-rose-400/[0.04]')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-ink-100">
                    {e.ok ? <CircleCheck className="size-3.5 text-emerald-300" /> : <CircleX className="size-3.5 text-rose-300" />}{e.task}
                  </span>
                  <span className="font-mono text-ink-400">{(e.ms / 1000).toFixed(1)}s</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-300">{e.model}{e.cached ? ' · cached run' : ''}</div>
                {e.error && <div className="mt-0.5 text-[11px] text-rose-300/90">{e.error} → falling back</div>}
              </motion.div>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
