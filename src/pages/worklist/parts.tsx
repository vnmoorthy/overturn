import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, CalendarClock, CircleCheck, CircleDollarSign, CircleX, Gauge, Landmark, Lightbulb, Scale, Send, ShieldCheck, Sparkles, TrendingUp, Trophy,
} from 'lucide-react'
import { Badge, Button, Card, CountUp, EmptyState, Modal, SectionTitle, cx } from '../../ui/kit'
import { imr } from '../../lib/imr'
import { STATUS_META, lossSuggestions, pct, usd, type Insight, type Kpis, type PlayCell, type Row } from './model'
import type { CaseStatus } from '../../lib/types'

// ------------------------------------------------------------------ KPI strip
function Kpi({ i, label, icon, iconTone, children, sub, glow }: {
  i: number; label: string; icon: ReactNode; iconTone: string; children: ReactNode; sub: ReactNode; glow?: boolean
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.06, duration: 0.4, ease: 'easeOut' }}
      className={cx(i === 4 && 'col-span-2 md:col-span-1')}>
      <Card glow={glow} className="group relative h-full overflow-hidden p-4 transition-colors hover:border-line-strong sm:p-5">
        {glow && <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-black/[0.04] blur-2xl" />}
        <div className="relative flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase leading-tight tracking-[0.1em] text-ink-400">{label}</span>
          <span className={cx('rounded-lg p-1.5', iconTone)}>{icon}</span>
        </div>
        <div className={cx('relative mt-3 text-[26px] font-semibold leading-none tracking-tight tabular-nums sm:text-[28px]', glow && 'text-gradient')}>{children}</div>
        <div className="relative mt-2 text-[12px] leading-snug text-ink-400">{sub}</div>
      </Card>
    </motion.div>
  )
}

export function KpiStrip({ k }: { k: Kpis }) {
  const baseline = imr()?.overall.rate
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi i={0} label="Appealable in queue" icon={<CircleDollarSign className="size-4" />} iconTone="bg-black/[0.045] text-ink-100"
        sub={<>{k.openCount} open {k.openCount === 1 ? 'denial' : 'denials'}{k.urgent > 0 && <> · <span className="text-amber-800">{k.urgent} due within 14 days</span></>}</>}>
        <CountUp to={k.appealable} prefix="$" />
      </Kpi>
      <Kpi i={1} glow label="Expected recoverable" icon={<TrendingUp className="size-4" />} iconTone="bg-black/[0.04] text-ink-200"
        sub="Odds from public independent-review outcomes (CA DMHC IMR), not a model guess">
        <CountUp to={k.expected} prefix="$" />
      </Kpi>
      <Kpi i={2} label="Value recovered" icon={<Landmark className="size-4" />} iconTone="bg-emerald-500/[0.108] text-emerald-700"
        sub={k.wonCount ? `${k.wonCount} ${k.wonCount === 1 ? 'denial' : 'denials'} overturned` : 'Mark a win to start the ledger'}>
        <span className={cx(k.recovered > 0 && 'text-emerald-700')}><CountUp to={k.recovered} prefix="$" /></span>
      </Kpi>
      <Kpi i={3} label="Appeals filed" icon={<Send className="size-4" />} iconTone="bg-teal-500/[0.108] text-teal-800"
        sub={k.filed ? `${k.awaiting} awaiting a decision` : 'Sign a letter, then mark it submitted'}>
        <CountUp to={k.filed} />
      </Kpi>
      <Kpi i={4} label="Win rate" icon={<Gauge className="size-4" />} iconTone="bg-amber-500/[0.108] text-amber-800"
        sub={baseline !== undefined ? `Public IMR baseline: ${(baseline * 100).toFixed(1)}%` : `${k.wonCount} won · ${k.lostCount} lost`}>
        {k.winRate === null ? <span className="text-ink-400">—</span> : <CountUp to={k.winRate * 100} suffix="%" />}
      </Kpi>
    </div>
  )
}

// ------------------------------------------------------------------ cells
export function StatusBadge({ status, note }: { status: CaseStatus; note?: string }) {
  const m = STATUS_META[status] || STATUS_META.new
  return (
    <span title={note || undefined}>
      <Badge tone={m.tone} icon={status === 'analyzing'
        ? <span className="relative mr-0.5 flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-500 opacity-70" /><span className="relative inline-flex size-1.5 rounded-full bg-teal-500" /></span>
        : status === 'won' ? <Trophy className="size-3" /> : status === 'lost' ? <CircleX className="size-3" /> : status === 'signed' ? <ShieldCheck className="size-3" /> : undefined}>
        {m.label}
      </Badge>
    </span>
  )
}

export function DeadlineCell({ r }: { r: Row }) {
  if (r.filed) {
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-ink-400">
        <CircleCheck className="size-3.5 text-emerald-700" /> {r.closed ? 'Closed' : 'Filed'}
      </div>
    )
  }
  if (r.days === null || !r.due) return <div className="text-[13px] text-ink-400">—<div className="text-[11.5px]">No notice date yet</div></div>
  const past = r.days < 0
  const soon = !past && r.days < 14
  const label = past ? `${Math.abs(r.days)} ${Math.abs(r.days) === 1 ? 'day' : 'days'} late` : r.days === 0 ? 'Due today' : `${r.days} ${r.days === 1 ? 'day' : 'days'}`
  const left = Math.max(0, Math.min(1, r.days / r.windowDays))
  return (
    <div className="min-w-[84px]">
      <div className={cx('flex items-center gap-1.5 text-[13px] font-medium tabular-nums', past ? 'text-rose-700' : soon ? 'text-amber-800' : 'text-ink-100')}>
        {(past || soon) && <CalendarClock className="size-3.5" />}{label}
      </div>
      <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-black/[0.045]" aria-hidden>
        <div className={cx('h-full rounded-full', past ? 'bg-rose-500' : soon ? 'bg-amber-500' : 'bg-ink-300/60')} style={{ width: `${past ? 100 : left * 100}%` }} />
      </div>
      <div className="mt-1 text-[11.5px] text-ink-400">Due {r.due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
    </div>
  )
}

export function OddsCell({ r }: { r: Row }) {
  const { rate, n, label } = r.odds
  return (
    <div className="min-w-[80px]" title={`${label}: ${pct(rate)} of ${n.toLocaleString('en-US')} independent reviews overturned the plan`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13.5px] font-semibold tabular-nums text-ink-100">{pct(rate)}</span>
        <span className="font-mono text-[10.5px] text-ink-400">n={n.toLocaleString('en-US')}</span>
      </div>
      <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-black/[0.045]" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400" style={{ width: `${rate * 100}%` }} />
      </div>
    </div>
  )
}

export function ValueCell({ r }: { r: Row }) {
  if (r.c.status === 'won') return <div className="text-right"><div className="text-[13.5px] font-semibold tabular-nums text-emerald-700">{usd(r.amount)}</div><div className="text-[11.5px] text-emerald-700">recovered</div></div>
  if (r.c.status === 'lost') return <div className="text-right"><div className="text-[13.5px] tabular-nums text-ink-400 line-through decoration-rose-400/60">{usd(r.amount * r.odds.rate)}</div><div className="text-[11.5px] text-ink-400">closed</div></div>
  return <div className="text-right text-[14px] font-semibold tabular-nums text-ink-100">{usd(r.ev)}</div>
}

// ------------------------------------------------------------------ modals
export function LostModal({ row, open, onClose, onConfirm }: { row: Row | null; open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open, row?.id])
  const ok = reason.trim().length > 0
  const submit = () => { if (ok) onConfirm(reason.trim()) }
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><CircleX className="size-4 text-rose-700" /> Record a lost appeal</span>}>
      {row && (
        <form onSubmit={e => { e.preventDefault(); submit() }} className="space-y-4">
          <div className="rounded-md border border-line/70 bg-black/[0.02] px-3.5 py-3">
            <div className="text-[14px] font-medium text-ink-100">{row.name}{row.service && <span className="text-ink-400"> — {row.service}</span>}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-400">{row.plan || row.brand} · {row.familyShort || 'Unrouted policy'} · {usd(row.amount)}</div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-ink-200">Why did {row.brand} uphold the denial?</span>
            <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
              placeholder="Paste the reviewer's rationale or summarize it in a sentence"
              className="w-full resize-none rounded-md border border-line bg-ink-900/70 px-3.5 py-2.5 text-[13.5px] text-ink-100 placeholder:text-ink-400 outline-none transition focus:border-line-strong focus:ring-2 focus:ring-emerald-600/20" />
          </label>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Common reasons</div>
            <div className="flex flex-wrap gap-1.5">
              {lossSuggestions(row.familyId).map(s => (
                <button type="button" key={s} onClick={() => setReason(s)}
                  className={cx('rounded-full border px-2.5 py-1 text-left text-[12px] transition-colors cursor-pointer',
                    reason === s ? 'border-rose-600/40 bg-rose-500/[0.108] text-rose-800' : 'border-line bg-black/[0.03] text-ink-300 hover:border-line-strong hover:text-ink-100')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-ink-400">The reason is written to the hash-chained audit trail and feeds the {row.brand} playbook, so the next {row.familyShort || 'appeal'} letter can pre-empt it.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={!ok} icon={<CircleX className="size-4" />}>Record loss</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function ResetModal({ open, onClose, onConfirm, count }: { open: boolean; onClose: () => void; onConfirm: () => void; count: number }) {
  return (
    <Modal open={open} onClose={onClose} title="Reset demo data?">
      <div className="space-y-4">
        <p className="text-[13.5px] leading-relaxed text-ink-300">
          This restores all {count} synthetic cases to their original state and clears analyses, drafted letters, signatures and outcomes stored in this browser.
          Cases you created with <span className="text-ink-100">New denial</span> are removed. The audit trail is kept and records the reset.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} autoFocus>Reset demo data</Button>
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ playbook
function WinBar({ rate }: { rate: number }) {
  const tone = rate >= 0.6 ? 'bg-emerald-500' : rate >= 0.4 ? 'bg-amber-500' : 'bg-rose-500'
  const text = rate >= 0.6 ? 'text-emerald-700' : rate >= 0.4 ? 'text-amber-800' : 'text-rose-700'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/[0.045]" aria-hidden><div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.max(4, rate * 100)}%` }} /></div>
      <span className={cx('text-[13px] font-semibold tabular-nums', text)}>{pct(rate)}</span>
    </div>
  )
}

export function Playbook({ cells, insights, emptyAction, onFocusPayer }: {
  cells: PlayCell[]; insights: Insight[]; emptyAction: ReactNode; onFocusPayer: (brand: string) => void
}) {
  const outcomes = cells.reduce((s, c) => s + c.total, 0)
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle eyebrow="Payer playbook" title={<span className="flex items-center gap-2"><BookOpen className="size-4 text-ink-200" /> How each plan behaves on appeal</span>}
        right={outcomes > 0 ? <Badge tone="violet" icon={<Sparkles className="size-3" />}>{outcomes} {outcomes === 1 ? 'outcome' : 'outcomes'} learned</Badge> : undefined} />
      <div className="mt-4">
        {cells.length === 0 ? (
          <EmptyState icon={<Scale className="size-5" />} title="No outcomes recorded yet"
            body="Mark outcomes to build your payer playbook — every win and loss compounds into per-payer intelligence." action={emptyAction} />
        ) : (
          <div className="space-y-4">
            {insights.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {insights.map(ins => (
                  <motion.div key={ins.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={cx('flex gap-3 rounded-md border px-3.5 py-3', ins.tone === 'red' ? 'border-rose-600/25 bg-rose-500/[0.07]' : 'border-emerald-600/25 bg-emerald-500/[0.07]')}>
                    <Lightbulb className={cx('mt-0.5 size-4 shrink-0', ins.tone === 'red' ? 'text-rose-700' : 'text-emerald-700')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed text-ink-100">{ins.text}</p>
                      <button onClick={() => onFocusPayer(ins.brand)} className="mt-1.5 text-[12px] font-medium text-ink-300 underline decoration-black/20 underline-offset-4 hover:text-ink-100 hover:decoration-black/50 cursor-pointer">
                        Show {ins.brand} cases
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-line/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    <th className="py-2 pr-3 font-semibold">Payer</th>
                    <th className="px-3 py-2 font-semibold">Policy</th>
                    <th className="px-3 py-2 text-right font-semibold">Won</th>
                    <th className="px-3 py-2 text-right font-semibold">Lost</th>
                    <th className="px-3 py-2 font-semibold">Win rate</th>
                    <th className="py-2 pl-3 font-semibold">Last lost reason</th>
                  </tr>
                </thead>
                <tbody>
                  {cells.map((c, i) => (
                    <motion.tr key={c.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                      className="border-b border-line/70 last:border-0">
                      <td className="py-2.5 pr-3">
                        <button onClick={() => onFocusPayer(c.brand)} className="text-left text-[13.5px] font-medium text-ink-100 hover:text-ink-200 cursor-pointer" title={c.plans.join(' · ')}>{c.brand}</button>
                        <div className="max-w-[220px] truncate text-[11.5px] text-ink-400">{c.plans.join(' · ') || 'Plan not extracted'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[13px] text-ink-200">{c.familyShort}{c.familyId && <Badge className="font-mono">{c.familyId}</Badge>}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13.5px] font-semibold tabular-nums text-emerald-700">{c.won}</td>
                      <td className="px-3 py-2.5 text-right text-[13.5px] font-semibold tabular-nums text-rose-700">{c.lost}</td>
                      <td className="px-3 py-2.5"><WinBar rate={c.winRate} /></td>
                      <td className="max-w-[320px] py-2.5 pl-3">
                        {c.lastLost
                          ? <div className="truncate text-[12.5px] text-ink-300" title={c.lastLost.reason || undefined}>{c.lastLost.reason ? `“${c.lastLost.reason}”` : <span className="text-ink-400">No reason recorded</span>}<span className="text-ink-400"> · {c.lastLost.name}</span></div>
                          : <span className="text-[12.5px] text-ink-400">No losses yet</span>}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
