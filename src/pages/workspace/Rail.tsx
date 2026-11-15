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
    <div className="glass relative overflow-hidden rounded-2xl px-3 py-4 sm:px-5">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-white/5">
        <motion.div className="h-full bg-gradient-to-r from-violet-400 via-cyan-300 to-emerald-300" initial={false} animate={{ width: `${(doneCount / STEPS.length) * 100}%` }} transition={{ type: 'spring', damping: 30 }} />
      </div>
      <div className="scrollbar-thin flex gap-2 overflow-x-auto">
        {STEPS.map((s, i) => {
          const st = steps[s.key]
          const Icon = ICON[s.key]
          const active = st.status === 'running'
          const ok = st.status === 'done' || st.status === 'cached'
          return (
            <div key={s.key} className="flex min-w-[150px] flex-1 items-start gap-2">
              <div className={cx('relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-300',
                active ? 'border-violet-400/60 bg-violet-500/20 text-violet-100' : ok ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : st.status === 'error' ? 'border-rose-400/40 bg-rose-400/10 text-rose-300' : 'border-white/10 bg-white/[0.03] text-ink-400')}>
                {active ? <Spinner /> : ok ? <CircleCheck className="size-4" /> : st.status === 'error' ? <CircleX className="size-4" /> : <Icon className="size-4" />}
                {active && <span className="absolute inset-0 animate-ping rounded-xl border border-violet-400/40" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-100">
                  <span className="text-ink-400 tabular-nums">{i + 1}</span>{s.label}
                </div>
                <div className={cx('text-[11.5px] leading-snug text-ink-400', st.status === 'error' ? 'line-clamp-3' : 'line-clamp-2')} title={st.error || st.note || s.blurb}>
                  {st.status === 'idle' && s.blurb}
                  {active && <span className="text-violet-200">{s.key === 'match' ? 'Reading policy + chart…' : 'Working…'}</span>}
                  {ok && (st.note || 'done')}
                  {st.status === 'error' && <span className="text-rose-300">{st.error}</span>}
                </div>
                {ok && st.model && (
                  <div className="mt-1 flex items-center gap-1 font-mono text-[10.5px] text-ink-400">
                    {st.status === 'cached' ? <History className="size-3 text-amber-300" /> : <span className="size-1.5 rounded-full bg-emerald-400" />}
                    <span className="truncate" title={st.model}>{st.model}{st.ms ? ` · ${(st.ms / 1000).toFixed(1)}s` : ''}</span>
                    {st.status === 'cached' && <span className="shrink-0 rounded bg-amber-300/15 px-1 text-amber-200">cached</span>}
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
