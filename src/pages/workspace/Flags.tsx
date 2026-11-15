import { motion } from 'framer-motion'
import { BadgeCheck, CircleAlert, Gavel, Info, Siren } from 'lucide-react'
import type { Flag } from '../../lib/types'
import { SEVERITY_ORDER } from '../../lib/rules'
import { Badge, Card, cx } from '../../ui/kit'

const STYLE: Record<Flag['severity'], { tone: 'red' | 'amber' | 'green' | 'gray'; icon: typeof Siren; label: string; ring: string }> = {
  violation: { tone: 'red', icon: Siren, label: 'Possible violation', ring: 'border-rose-600/25 bg-rose-500/[0.07]' },
  warning: { tone: 'amber', icon: CircleAlert, label: 'Action', ring: 'border-amber-600/25 bg-amber-500/[0.07]' },
  strength: { tone: 'green', icon: BadgeCheck, label: 'Strength', ring: 'border-emerald-600/25 bg-emerald-500/[0.07]' },
  info: { tone: 'gray', icon: Info, label: 'Rule', ring: 'border-line/70 bg-black/[0.02]' },
}

export function FlagsPanel({ flags, compact }: { flags: Flag[]; compact?: boolean }) {
  const sorted = [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const v = flags.filter(f => f.severity === 'violation').length
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Gavel className="size-4 shrink-0 text-rose-700" /> Compliance findings</div>
        <div className="flex flex-wrap gap-1.5"><Badge tone="red">{v} possible violation{v === 1 ? '' : 's'}</Badge><Badge tone="gray">rules engine · deterministic</Badge></div>
      </div>
      <div className={cx('grid gap-2.5', !compact && 'md:grid-cols-2')}>
        {sorted.map((f, i) => {
          const s = STYLE[f.severity]
          const Icon = s.icon
          return (
            <motion.div key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cx('rounded-md border p-3.5', s.ring)}>
              <div className="flex items-start gap-2.5">
                <Icon className={cx('mt-0.5 size-4 shrink-0', f.severity === 'violation' ? 'text-rose-700' : f.severity === 'warning' ? 'text-amber-700' : f.severity === 'strength' ? 'text-emerald-700' : 'text-ink-400')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-ink-100">{f.title}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{f.detail}</p>
                  {f.evidence?.map((e, j) => (
                    <div key={j} className="mt-2 rounded-lg border border-line/70 bg-ink-800/70 px-2.5 py-1.5">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">{e.label}</div>
                      <div className="text-[12px] italic text-ink-200">“{e.text}”</div>
                    </div>
                  ))}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {f.citation && <span className="font-mono text-[10.5px] text-ink-400">{f.citation}</span>}
                    {f.severity === 'violation' && <span className="text-[10.5px] text-ink-400">· biller confirms</span>}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}
