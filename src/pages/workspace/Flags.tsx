import { motion } from 'framer-motion'
import { BadgeCheck, CircleAlert, Info, Siren } from 'lucide-react'
import type { Flag } from '../../lib/types'
import { SEVERITY_ORDER } from '../../lib/rules'
import { Eyebrow, cx } from '../../ui/kit'

type Sev = Flag['severity']
// Status is carried by a left rule and a mono label, never by tinting the whole card.
const STYLE: Record<Sev, { icon: typeof Siren; label: string; group: string; rule: string; text: string; num: string }> = {
  violation: { icon: Siren, label: 'Possible violation', group: 'Possible violations', rule: 'bg-rose-600', text: 'text-rose-700', num: 'text-rose-700' },
  warning: { icon: CircleAlert, label: 'Action', group: 'Actions for the biller', rule: 'bg-amber-500', text: 'text-amber-800', num: 'text-ink-100' },
  strength: { icon: BadgeCheck, label: 'Strength', group: 'Strengths', rule: 'bg-mint', text: 'text-[#0b6b4a]', num: 'text-ink-100' },
  info: { icon: Info, label: 'Rule', group: 'Governing rules', rule: 'bg-line-strong', text: 'text-ink-400', num: 'text-ink-100' },
}
const TALLY: Record<Sev, [string, string]> = {
  violation: ['possible violation', 'possible violations'],
  warning: ['action', 'actions'],
  strength: ['strength', 'strengths'],
  info: ['rule', 'rules'],
}

/** Regulation / policy reference as a mono chip. Not uppercased: "(b)(3)" must stay lower-case. */
function Cite({ children }: { children: string }) {
  return <span className="inline-flex items-center rounded-[3px] border border-line bg-paper px-1.5 py-[3px] font-mono text-[10.5px] leading-none text-ink-300">{children}</span>
}

/** Evidence label like "L33822 · 2020 version (no longer in effect)" → main label + coloured status note. */
function splitLabel(label: string) {
  const m = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (!m) return { main: label, note: null as string | null, noteCls: '' }
  const note = m[2]
  // `!` because .eyebrow sets its own colour outside Tailwind's layers.
  const noteCls = /no longer|retired|removed/i.test(note) ? '!text-rose-700' : /in effect/i.test(note) ? '!text-[#0b6b4a]' : ''
  return { main: m[1], note, noteCls }
}

function Evidence({ label, text }: { label: string; text: string }) {
  const { main, note, noteCls } = splitLabel(label)
  return (
    <figure className="rounded-md border border-line/70 bg-paper-low px-3.5 py-3">
      <figcaption className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="eyebrow">{main}</span>
        {note && <span className={cx('eyebrow', noteCls)}>· {note}</span>}
      </figcaption>
      <blockquote className="mt-1.5 font-serif text-[14px] italic leading-[1.6] text-ink-200">“{text}”</blockquote>
    </figure>
  )
}

function FindingCard({ f, n, wide }: { f: Flag; n: number; wide: boolean }) {
  const s = STYLE[f.severity]
  const Icon = s.icon
  const cites = (f.citation || '').split(' · ').map(x => x.trim()).filter(Boolean)
  const hasEvidence = !!f.evidence?.length
  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.05 }}
      className="relative h-full overflow-hidden rounded-lg border border-line bg-paper-high shadow-[0_1px_2px_rgba(20,20,20,0.03)]">
      <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[3px]', s.rule)} />
      <div className={cx('grid h-full gap-x-8 gap-y-4 py-4 pl-5 pr-4 sm:py-5 sm:pl-6 sm:pr-5', wide && hasEvidence && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3">
            <span className={cx('inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.13em]', s.text)}>
              <Icon className="size-3.5 shrink-0" aria-hidden />{s.label}
            </span>
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint">F-{String(n + 1).padStart(2, '0')}</span>
          </div>
          <h3 className="mt-2.5 font-serif text-[16.5px] font-medium leading-snug tracking-[-0.015em] text-ink-100">{f.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-300">{f.detail}</p>
          {(cites.length > 0 || f.severity === 'violation') && (
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
              {cites.map(c => <Cite key={c}>{c}</Cite>)}
              {f.severity === 'violation' && <span className="font-mono text-[10.5px] text-ink-400">· biller confirms</span>}
            </div>
          )}
        </div>
        {hasEvidence && (
          <div className="min-w-0 space-y-2">
            {f.evidence!.map((e, j) => <Evidence key={j} label={e.label} text={e.text} />)}
          </div>
        )}
      </div>
    </motion.article>
  )
}

export function FlagsPanel({ flags, compact }: { flags: Flag[]; compact?: boolean }) {
  const sorted = [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const v = flags.filter(f => f.severity === 'violation').length
  const order = sorted.map(f => f.severity).filter((x, i, a) => a.indexOf(x) === i)
  const groups = order.map(sev => ({ sev, items: sorted.filter(f => f.severity === sev) }))
  const tally = (['violation', 'warning', 'strength', 'info'] as const)
    .map(sev => ({ sev, n: sev === 'violation' ? v : flags.filter(f => f.severity === sev).length }))
    .filter(t => t.sev === 'violation' || t.n > 0)

  return (
    <section aria-label="Compliance findings">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-line pb-5">
        <div className="min-w-0 max-w-xl">
          <Eyebrow>Rules engine · deterministic</Eyebrow>
          <h2 className="mt-1.5 font-serif text-[26px] font-medium leading-[1.1] tracking-[-0.025em] text-ink-100">Compliance findings</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">
            Each finding is checked by fixed rules against the denial letter, every archived version of the policy and the cited regulations. The biller confirms each possible violation.
          </p>
        </div>
        <dl className="grid w-full grid-cols-4 gap-x-4 sm:flex sm:w-auto sm:flex-wrap sm:gap-x-7 sm:gap-y-3">
          {tally.map(t => (
            <div key={t.sev} className="flex min-w-0 flex-col-reverse sm:min-w-[64px]">
              <dt className="eyebrow mt-1.5">{TALLY[t.sev][t.n === 1 ? 0 : 1]}</dt>
              <dd className={cx('font-serif text-[30px] font-medium leading-none tracking-[-0.03em]', t.sev === 'violation' && t.n > 0 ? STYLE.violation.num : 'text-ink-100')}>{t.n}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-6 space-y-8">
        {groups.map(g => {
          const s = STYLE[g.sev]
          const wide = !compact && g.items.some(f => f.evidence?.length)
          return (
            <div key={g.sev}>
              <div className="mb-3 flex items-center gap-2.5">
                <span aria-hidden className={cx('h-3 w-[3px] rounded-[1px]', s.rule)} />
                <Eyebrow className="!text-ink-300">{s.group}</Eyebrow>
                <span className="font-mono text-[10.5px] text-faint">{String(g.items.length).padStart(2, '0')}</span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </div>
              <div className={cx('grid gap-3', !compact && !wide && 'md:grid-cols-2')}>
                {g.items.map(f => <FindingCard key={f.id} f={f} n={sorted.indexOf(f)} wide={wide} />)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
