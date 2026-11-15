import { motion } from 'framer-motion'
import { CircleCheck, CircleX, FileSearch, FileText, Gavel, PenLine, ScanSearch, ShieldCheck, History } from 'lucide-react'
import { STEPS, type StepKey, type StepState } from '../../lib/engine'
import { cx, Spinner } from '../../ui/kit'

const ICON: Record<StepKey, typeof FileText> = {
  extract: FileText, locate: FileSearch, match: ScanSearch, verify: ShieldCheck, flags: Gavel, draft: PenLine,
}

export function PipelineRail({ steps }: { steps: Record<StepKey, StepState> }) {
  const doneCount = STEPS.filter(s => ['done', 'cached'].includes(steps[s.key].status)).length
  return (
    <div className="glass relative overflow-hidden rounded-lg px-3 py-4 sm:px-5">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-black/[0.03]">
        <motion.div className="h-full bg-gradient-to-r from-emerald-600 via-teal-400 to-emerald-400" initial={false} animate={{ width: `${(doneCount / STEPS.length) * 100}%` }} transition={{ type: 'spring', damping: 30 }} />
      </div>
      <div className="scrollbar-thin flex gap-2 overflow-x-auto">
        {STEPS.map((s, i) => {
          const st = steps[s.key]
          const Icon = ICON[s.key]
          const active = st.status === 'running'
          const ok = st.status === 'done' || st.status === 'cached'
          return (
            <div key={s.key} className="flex min-w-[150px] flex-1 items-start gap-2">
              <div className={cx('relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors duration-300',
                active ? 'border-line-strong bg-black/[0.04] text-ink-200' : ok ? 'border-emerald-600/40 bg-emerald-500/[0.09] text-emerald-700' : st.status === 'error' ? 'border-rose-600/40 bg-rose-500/[0.09] text-rose-700' : 'border-line bg-black/[0.02] text-ink-400')}>
                {active ? <Spinner /> : ok ? <CircleCheck className="size-4" /> : st.status === 'error' ? <CircleX className="size-4" /> : <Icon className="size-4" />}
                {active && <span className="absolute inset-0 animate-ping rounded-md border border-line-strong" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-100">
                  <span className="text-ink-400 tabular-nums">{i + 1}</span>{s.label}
                </div>
                <div className={cx('text-[11.5px] leading-snug text-ink-400', st.status === 'error' ? 'line-clamp-3' : 'line-clamp-2')} title={st.error || st.note || s.blurb}>
                  {st.status === 'idle' && s.blurb}
                  {active && <span className="text-ink-200">{s.key === 'match' ? 'Reading policy + chart…' : 'Working…'}</span>}
                  {ok && (st.note || 'done')}
                  {st.status === 'error' && <span className="text-rose-700">{st.error}</span>}
                </div>
                {ok && st.model && (
                  <div className="mt-1 flex items-center gap-1 font-mono text-[10.5px] text-ink-400">
                    {st.status === 'cached' ? <History className="size-3 text-amber-700" /> : <span className="size-1.5 rounded-full bg-emerald-500" />}
                    <span className="truncate" title={st.model}>{st.model}{st.ms ? ` · ${(st.ms / 1000).toFixed(1)}s` : ''}</span>
                    {st.status === 'cached' && <span className="shrink-0 rounded bg-amber-500/[0.135] px-1 text-amber-800">cached</span>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
