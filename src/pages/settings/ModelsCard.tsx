// Model quality switch and the per-task Gemini fallback chains.
import { useState } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { ChevronRight, Gauge, Info, Radio, Sparkles, Zap } from 'lucide-react'
import { LIVE_MODEL, chain, getQuality, setQuality, type Quality, type Task } from '../../lib/gemini'
import { Badge, cx, toast } from '../../ui/kit'
import { Note, SettingsCard } from './parts'

const TASKS: { task: Task; label: string; what: string }[] = [
  { task: 'extract', label: 'Extract', what: 'Reads the denial letter (PDF, photo or text) into structured fields' },
  { task: 'transcribe', label: 'Transcribe', what: 'Turns scanned or faxed chart pages into text' },
  { task: 'locate', label: 'Locate', what: 'Picks the governing coverage policy when codes do not settle it' },
  { task: 'match', label: 'Match', what: 'Checks each policy criterion against the chart and finds contradictions' },
  { task: 'entail', label: 'Entail', what: 'Second-key check: does each quote really support its criterion?' },
  { task: 'letter', label: 'Letter', what: 'Drafts the appeal with verified, cited quotes' },
  { task: 'explain', label: 'Explain', what: 'Writes the plain-language note for the patient' },
  { task: 'coach', label: 'Coach', what: 'Predicts peer-to-peer objections and responses' },
  { task: 'tts', label: 'Speech', what: 'Reads the patient explainer aloud in English or Spanish' },
  { task: 'embed', label: 'Embed', what: 'Finds the most similar past independent-review decisions' },
]
const QUALITY_TASKS: Task[] = ['match', 'letter'] // the chains that change with the quality setting

const OPTIONS: { q: Quality; title: string; sub: string; icon: typeof Sparkles }[] = [
  { q: 'max', title: 'Max', sub: 'Gemini 4 Hydrogen for matching & drafting', icon: Sparkles },
  { q: 'fast', title: 'Fast', sub: 'Gemini 3.5 Flash', icon: Zap },
]

export function ModelsCard({ delay }: { delay?: number }) {
  const [q, setQ] = useState<Quality>(getQuality())
  const pick = (v: Quality) => {
    if (v === q) return
    setQuality(v); setQ(v)
    toast(v === 'max' ? 'Max quality: Gemini 4 Hydrogen leads matching and drafting.' : 'Fast mode: Gemini 3.5 Flash leads matching and drafting.', 'violet')
  }

  return (
    <SettingsCard delay={delay} icon={<Gauge className="size-4 text-cyan-300" />} title="Model quality"
      sub="Choose which model leads the two reasoning-heavy steps: criteria matching and letter drafting. The other steps keep their fixed chains.">
      <div role="radiogroup" aria-label="Model quality" className="grid gap-1.5 rounded-2xl border border-white/8 bg-ink-950/50 p-1.5 sm:grid-cols-2">
        {OPTIONS.map(o => {
          const active = q === o.q
          const Icon = o.icon
          return (
            <button key={o.q} role="radio" aria-checked={active} onClick={() => pick(o.q)}
              className={cx('relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer', active ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100 hover:bg-white/[0.03]')}>
              {active && <motion.span layoutId="quality-pill" className="absolute inset-0 rounded-xl border border-violet-400/35 bg-gradient-to-b from-violet-500/20 to-violet-500/[0.06] shadow-[0_8px_30px_-12px_rgba(124,92,255,.7)]" transition={{ type: 'spring', damping: 28, stiffness: 380 }} />}
              <span className={cx('relative grid size-8 shrink-0 place-items-center rounded-lg border', active ? 'border-violet-300/40 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.04]')}>
                <Icon className="size-4" />
              </span>
              <span className="relative min-w-0">
                <span className="block text-[14px] font-semibold">{o.title}</span>
                <span className="block text-[12.5px] text-ink-300">{o.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          <span>Task</span><span className="hidden md:block">Model chain · first choice → fallbacks</span>
        </div>
        <LayoutGroup>
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/8">
            {TASKS.map(t => {
              const models = chain(t.task)
              const affected = QUALITY_TASKS.includes(t.task)
              return (
                <motion.div layout="position" key={t.task} className={cx('grid gap-2 px-3.5 py-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-center md:gap-4', affected && 'bg-violet-500/[0.04]')}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-ink-100">{t.task}</span>
                      {affected && <Badge tone="violet" className="!px-1.5 !py-0 text-[10.5px]">quality</Badge>}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-snug text-ink-400">{t.what}</div>
                  </div>
                  <ModelPath task={t.task} models={models} />
                </motion.div>
              )
            })}
            <div className="grid gap-2 px-3.5 py-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-center md:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12.5px] font-semibold text-ink-100">live</span>
                  <Badge tone="pink" icon={<Radio className="size-3" />} className="!py-0 text-[10.5px]">streaming</Badge>
                </div>
                <div className="mt-0.5 text-[12px] leading-snug text-ink-400">Real-time voice peer-to-peer rehearsal</div>
              </div>
              <ModelPath task="live" models={[LIVE_MODEL]} />
            </div>
          </div>
        </LayoutGroup>
      </div>

      <div className="mt-4">
        <Note icon={<Info className="size-3.5 text-cyan-300" />}>
          <span className="font-medium text-ink-100">Automatic fallback.</span> Each step tries its chain left to right. If a model returns 429 (quota) or 503 (overloaded), times out, or is unavailable, Overturn retries the same request on the next model. An invalid key stops right away. Every attempt and hop shows in the Agent trace, so you can always see which model actually answered.
        </Note>
      </div>
    </SettingsCard>
  )
}

function ModelPath({ task, models }: { task: string; models: string[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {models.map((m, i) => (
        <motion.span layout key={`${task}-${m}`} transition={{ type: 'spring', damping: 26, stiffness: 300 }} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 text-ink-400/60" />}
          <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]',
            i === 0 ? 'border-violet-400/35 bg-violet-500/[0.12] text-violet-100' : 'border-white/8 bg-white/[0.03] text-ink-400')}>
            {i === 0 && <Sparkles className="size-3 text-violet-300" />}{m}
          </span>
        </motion.span>
      ))}
    </div>
  )
}
