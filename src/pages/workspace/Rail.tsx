import { History } from 'lucide-react'
import { STEPS, type StepKey, type StepState } from '../../lib/engine'
import { cx } from '../../ui/kit'

const STATUS_WORD: Record<StepState['status'], string> = { idle: 'pending', running: 'running', done: 'done', cached: 'done (cached)', error: 'failed' }

/** Status dot: mint = done, ink + pulse = running, rose = failed, hollow = pending. */
function StepDot({ status }: { status: StepState['status'] }) {
  const ok = status === 'done' || status === 'cached'
  return (
    <span className="relative flex size-[11px] shrink-0 items-center justify-center" aria-hidden>
      {status === 'running' && <span className="absolute -inset-[3px] animate-ping rounded-full bg-ink-100/25 motion-reduce:animate-none" />}
      <span className={cx('relative size-[11px] rounded-full border transition-colors duration-300',
        ok ? 'border-mint-deep/50 bg-mint'
          : status === 'running' ? 'border-ink-100 bg-ink-100'
            : status === 'error' ? 'border-rose-700 bg-rose-600'
              : 'border-line-strong bg-paper-high')} />
    </span>
  )
}

/** Compact model chip (same look as the kit ModelChip, but truncates inside a narrow rail column).
 *  A cached (recorded) result swaps the mint dot for an amber history mark. */
function StepChip({ model, ms, cached }: { model: string; ms?: number; cached?: boolean }) {
  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-ink-400">
      <span className={cx('inline-flex min-w-0 items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px]', cached ? 'border-amber-200 bg-amber-50/60 text-ink-300' : 'border-line bg-paper text-ink-300')} title={cached ? `${model} · cached (recorded run)` : model}>
        {cached ? <History className="size-3 shrink-0 text-amber-700" /> : <span className="size-1.5 shrink-0 rounded-full bg-mint" />}
        <span className="truncate">{model}</span>
        {cached && <span className="sr-only">, cached</span>}
      </span>
      {ms ? <span className="shrink-0 tabular-nums">{ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}</span> : null}
    </div>
  )
}

export function PipelineRail({ steps }: { steps: Record<StepKey, StepState> }) {
  const doneCount = STEPS.filter(s => ['done', 'cached'].includes(steps[s.key].status)).length
  const current = STEPS.find(s => steps[s.key].status === 'running')
  const failed = STEPS.some(s => steps[s.key].status === 'error')
  const totalMs = STEPS.reduce((n, s) => n + (['done', 'cached'].includes(steps[s.key].status) ? steps[s.key].ms || 0 : 0), 0)
  const cachedCount = STEPS.filter(s => steps[s.key].status === 'cached').length
  return (
    <section aria-label="Agent pipeline" className="rounded-lg border border-line bg-paper-high shadow-[0_1px_0_rgba(20,20,20,0.02),0_1px_2px_rgba(20,20,20,0.03)]">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 sm:px-5">
        <div className="flex items-baseline gap-3">
          <span className="eyebrow !text-ink-100">Agent pipeline</span>
          <span className="hidden font-mono text-[10.5px] text-ink-400 sm:inline">extract → locate → match → verify → comply → draft</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] tabular-nums text-ink-400" aria-live="polite">
          {current
            ? <span className="flex items-center gap-1.5 text-ink-100"><span className="size-1.5 animate-pulse rounded-full bg-ink-100 motion-reduce:animate-none" />{current.label}</span>
            : failed ? <span className="text-rose-700">stopped</span> : null}
          <span className={cx(doneCount === STEPS.length && 'text-mint-deep')}>{String(doneCount).padStart(2, '0')}/{String(STEPS.length).padStart(2, '0')} done</span>
          {cachedCount > 0 && <span className="flex items-center gap-1 text-amber-800"><History className="size-3" />{cachedCount} cached</span>}
          {totalMs >= 100 && <span className="normal-case">{(totalMs / 1000).toFixed(1)}s</span>}
        </div>
      </header>
      <ol className="grid px-4 py-4 sm:grid-cols-3 sm:gap-y-6 sm:px-5 sm:py-5 xl:grid-cols-6">
        {STEPS.map((s, i) => {
          const st = steps[s.key]
          const active = st.status === 'running'
          const ok = st.status === 'done' || st.status === 'cached'
          const last = i === STEPS.length - 1
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0 sm:block sm:pb-0 sm:pr-5">
              {/* hairline connector: vertical on phones, horizontal from sm up; mint once the step is done */}
              {!last && (
                <span aria-hidden className={cx('absolute left-[5px] top-[17px] -bottom-[3px] w-px sm:left-[19px] sm:right-0 sm:top-[5px] sm:bottom-auto sm:h-px sm:w-auto',
                  ok ? 'bg-mint-deep/55' : 'bg-line')} />
              )}
              <span className="relative mt-[3px] sm:mt-0"><StepDot status={st.status} /></span>
              <div className="min-w-0 flex-1 sm:mt-2.5">
                <div className="flex items-baseline gap-2 sm:block">
                  <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{String(i + 1).padStart(2, '0')}</span>
                  <span className={cx('text-[13px] font-medium tracking-[-0.005em] sm:mt-0.5 sm:block', st.status === 'idle' ? 'text-ink-300' : 'text-ink-100')}>{s.label}</span>
                  <span className="sr-only"> — {STATUS_WORD[st.status]}</span>
                </div>
                <div className={cx('mt-0.5 font-mono text-[11px] leading-[1.5] text-ink-400', st.status === 'error' ? 'line-clamp-3' : 'line-clamp-2')} title={st.error || st.note || s.blurb}>
                  {st.status === 'idle' && s.blurb}
                  {active && <span className="text-ink-100">{s.key === 'match' ? 'Reading policy + chart…' : 'Working…'}<span className="caret ml-0.5 text-mint-deep">▍</span></span>}
                  {ok && <span className="text-ink-300">{st.note || 'done'}</span>}
                  {st.status === 'error' && <span className="text-rose-700">{st.error}</span>}
                </div>
                {ok && st.model && <StepChip model={st.model} ms={st.ms} cached={st.status === 'cached'} />}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
