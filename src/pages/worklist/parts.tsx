import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CircleCheck, CircleX, Scale } from 'lucide-react'
import { Button, Card, CountUp, EmptyState, Modal, SectionTitle, cx } from '../../ui/kit'
import { imr } from '../../lib/imr'
import { STATUS_META, lossSuggestions, pct, usd, type Insight, type Kpis, type PlayCell, type Row } from './model'
import type { CaseStatus } from '../../lib/types'

// Mono uppercase label. Written as utilities (not the global .eyebrow class) so the colour can change per state.
export const MONO_LABEL = 'font-mono text-[10.5px] font-medium uppercase tracking-[0.13em]'
// Deep mint is a touch too light for small text on paper; this darker step keeps small labels >= 4.5:1.
const MINT_TEXT = 'text-[#0b6b4a]'

/** Hairline track with a slightly heavier fill stroke — the system's only "chart" primitive. */
export function Meter({ value, tone = 'bg-mint', className }: { value: number; tone?: string; className?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100
  return (
    <div aria-hidden className={cx('relative h-[3px] w-16', className)}>
      <div className="absolute inset-x-0 top-px h-px bg-line-strong" />
      <div className={cx('absolute inset-y-0 left-0', tone)} style={{ width: `${w}%` }} />
    </div>
  )
}

/** Small mono id chip (policy LCD numbers and the like). */
export function IdChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-[3px] border border-line bg-paper px-1.5 py-px font-mono text-[10.5px] leading-[16px] tracking-[0.02em] text-ink-300', className)}>
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ KPI ledger
function Kpi({ i, label, children, sub, accent, extra, className }: {
  i: number; label: string; children: ReactNode; sub: ReactNode; accent?: boolean; extra?: ReactNode; className?: string
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 + i * 0.05, duration: 0.3, ease: 'easeOut' }}
      className={cx('relative flex min-w-0 flex-col bg-paper-high px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5 sm:pt-4', className)}>
      {accent && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-mint" />}
      <div className="flex items-start justify-between gap-3">
        <span className={cx(MONO_LABEL, 'leading-snug', accent ? MINT_TEXT : 'text-ink-400')}>{label}</span>
        <span aria-hidden className="font-mono text-[10.5px] tabular-nums text-faint">{String(i + 1).padStart(2, '0')}</span>
      </div>
      <div className={cx('mt-5 font-serif text-[30px] font-medium leading-none tracking-[-0.035em] tabular-nums sm:text-[34px]', accent ? 'text-mint-deep' : 'text-ink-100')}>
        {children}
      </div>
      {extra}
      <div className="mt-2.5 text-[12px] leading-snug text-ink-400">{sub}</div>
    </motion.div>
  )
}

export function KpiStrip({ k }: { k: Kpis }) {
  const baseline = imr()?.overall.rate
  return (
    <section aria-label="Worklist summary" className="overflow-hidden rounded-lg border border-line bg-line shadow-[0_1px_2px_rgba(20,20,20,0.03)]">
      {/* gap-px over a hairline-coloured background draws the ledger rules, however the grid wraps */}
      <div className="grid grid-cols-2 gap-px md:grid-cols-6 xl:grid-cols-5">
        <Kpi i={0} label="Appealable in queue" className="md:col-span-2 xl:col-span-1"
          sub={<>{k.openCount} open {k.openCount === 1 ? 'denial' : 'denials'}{k.urgent > 0 && <> · <span className="text-rose-700">{k.urgent} due within 14 days</span></>}</>}>
          <CountUp to={k.appealable} prefix="$" />
        </Kpi>
        <Kpi i={1} accent label="Expected recoverable" className="md:col-span-2 xl:col-span-1"
          sub="Odds from public independent-review outcomes (CA DMHC IMR), not a model guess">
          <CountUp to={k.expected} prefix="$" />
        </Kpi>
        <Kpi i={2} label="Value recovered" className="md:col-span-2 xl:col-span-1"
          sub={k.wonCount ? `${k.wonCount} ${k.wonCount === 1 ? 'denial' : 'denials'} overturned` : 'Mark a win to start the ledger'}>
          <CountUp to={k.recovered} prefix="$" />
        </Kpi>
        <Kpi i={3} label="Appeals filed" className="md:col-span-3 xl:col-span-1"
          sub={k.filed ? `${k.awaiting} awaiting a decision` : 'Sign a letter, then mark it submitted'}>
          <CountUp to={k.filed} />
        </Kpi>
        <Kpi i={4} label="Win rate" className="col-span-2 md:col-span-3 xl:col-span-1"
          sub={baseline !== undefined ? `Public IMR baseline: ${(baseline * 100).toFixed(1)}%` : `${k.wonCount} won · ${k.lostCount} lost`}
          extra={k.winRate !== null && baseline !== undefined && (
            <div aria-hidden className="relative mt-3.5 h-[7px] w-full max-w-[180px]">
              <div className="absolute inset-x-0 top-[3px] h-px bg-line-strong" />
              <div className="absolute left-0 top-[2px] h-[3px] bg-ink-100" style={{ width: `${Math.min(1, k.winRate) * 100}%` }} />
              <div className="absolute top-0 h-[7px] w-px bg-ink-400" style={{ left: `${Math.min(1, baseline) * 100}%` }} />
            </div>
          )}>
          {k.winRate === null ? <span className="text-faint">—</span> : <CountUp to={k.winRate * 100} suffix="%" />}
        </Kpi>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ cells
const STATUS_DOT: Record<CaseStatus, string> = {
  new: 'border border-ink-400',
  analyzing: 'bg-mint',
  ready: 'bg-ink-100',
  signed: 'bg-amber-500',
  submitted: 'border border-ink-300 bg-[linear-gradient(90deg,var(--color-ink-300)_50%,transparent_50%)]',
  won: 'bg-mint',
  lost: 'bg-rose-600',
}
const STATUS_TEXT: Record<CaseStatus, string> = {
  new: 'text-ink-400',
  analyzing: 'text-ink-200',
  ready: 'text-ink-100',
  signed: 'text-amber-800',
  submitted: 'text-ink-200',
  won: MINT_TEXT,
  lost: 'text-rose-700',
}

export function StatusBadge({ status, note }: { status: CaseStatus; note?: string }) {
  const m = STATUS_META[status] || STATUS_META.new
  const s: CaseStatus = STATUS_META[status] ? status : 'new'
  return (
    <span title={note || undefined} className={cx(MONO_LABEL, 'inline-flex items-center gap-1.5 whitespace-nowrap leading-5 !tracking-[0.1em]', STATUS_TEXT[s])}>
      {s === 'analyzing'
        ? <span aria-hidden className="relative flex size-[7px] shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-70" /><span className="relative inline-flex size-[7px] rounded-full bg-mint" /></span>
        : <span aria-hidden className={cx('size-[7px] shrink-0 rounded-full', STATUS_DOT[s])} />}
      {m.label}
    </span>
  )
}

/** Shared deadline maths for the full cell and the compact (mobile) variant. */
function deadline(r: Row) {
  if (r.days === null || !r.due) return null
  const past = r.days < 0
  const soon = !past && r.days < 14
  const label = past ? `${Math.abs(r.days)} ${Math.abs(r.days) === 1 ? 'day' : 'days'} late` : r.days === 0 ? 'Due today' : `${r.days} ${r.days === 1 ? 'day' : 'days'}`
  const left = Math.max(0, Math.min(1, r.days / r.windowDays))
  const date = r.due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { past, soon, label, left, date }
}

export function DeadlineCell({ r }: { r: Row }) {
  if (r.filed) {
    return (
      <div className={cx(MONO_LABEL, 'flex items-center gap-1.5 leading-5 !tracking-[0.1em] text-ink-400')}>
        <CircleCheck className="size-3.5 text-ink-400" /> {r.closed ? 'Closed' : 'Filed'}
      </div>
    )
  }
  const d = deadline(r)
  if (!d) return <div className="font-mono text-[12.5px] leading-5 text-ink-400">—<div className="font-sans text-[11.5px] leading-snug">No notice date yet</div></div>
  const hot = d.past || d.soon
  return (
    <div className="min-w-[88px]">
      <div className={cx('flex items-center gap-1.5 font-mono text-[12.5px] font-medium leading-5 tabular-nums', hot ? 'text-rose-700' : 'text-ink-100')}>
        {hot && <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-rose-600" />}{d.label}
      </div>
      <Meter value={d.past ? 1 : d.left} tone={hot ? 'bg-rose-600' : 'bg-ink-300'} className="mt-1.5" />
      <div className="mt-1.5 font-mono text-[11px] text-ink-400">Due {d.date}</div>
    </div>
  )
}

/** One-line deadline for compact rows where the deadline column is hidden. */
export function DeadlineInline({ r }: { r: Row }) {
  if (r.filed) return <span className="font-mono text-[11px] text-ink-400">{r.closed ? 'Closed' : 'Filed'}</span>
  const d = deadline(r)
  if (!d) return <span className="font-mono text-[11px] text-ink-400">No notice date yet</span>
  const hot = d.past || d.soon
  return (
    <span className={cx('inline-flex items-center gap-1 font-mono text-[11px] tabular-nums', hot ? 'font-medium text-rose-700' : 'text-ink-300')}>
      {hot && <span aria-hidden className="size-[5px] rounded-full bg-rose-600" />}{d.label}<span className="hidden text-ink-400 sm:inline"> · due {d.date}</span>
    </span>
  )
}

export function OddsCell({ r }: { r: Row }) {
  const { rate, n, label } = r.odds
  return (
    <div className="min-w-[84px]" title={`${label}: ${pct(rate)} of ${n.toLocaleString('en-US')} independent reviews overturned the plan`}>
      <div className="flex items-baseline gap-1.5 leading-5">
        <span className="text-[13px] font-medium tabular-nums text-ink-100">{pct(rate)}</span>
        <span className="font-mono text-[10.5px] text-ink-400">n={n.toLocaleString('en-US')}</span>
      </div>
      <Meter value={rate} className="mt-1.5 w-20" />
    </div>
  )
}

export function ValueCell({ r }: { r: Row }) {
  if (r.c.status === 'won') {
    return (
      <div className="text-right">
        <div className={cx('font-serif text-[15px] font-medium leading-5 tracking-[-0.01em] tabular-nums', MINT_TEXT)}>{usd(r.amount)}</div>
        <div className={cx(MONO_LABEL, 'mt-1 !text-[10px] !tracking-[0.1em]', MINT_TEXT)}>recovered</div>
      </div>
    )
  }
  if (r.c.status === 'lost') {
    return (
      <div className="text-right">
        <div className="font-serif text-[15px] leading-5 tabular-nums text-ink-400 line-through decoration-rose-400/70">{usd(r.amount * r.odds.rate)}</div>
        <div className={cx(MONO_LABEL, 'mt-1 !text-[10px] !tracking-[0.1em] text-ink-400')}>closed</div>
      </div>
    )
  }
  return <div className="text-right font-serif text-[15.5px] font-medium leading-5 tracking-[-0.01em] tabular-nums text-ink-100">{usd(r.ev)}</div>
}

// ------------------------------------------------------------------ modals
export function LostModal({ row, open, onClose, onConfirm }: { row: Row | null; open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open, row?.id])
  const ok = reason.trim().length > 0
  const submit = () => { if (ok) onConfirm(reason.trim()) }
  return (
    <Modal open={open} onClose={onClose} title="Record a lost appeal">
      {row && (
        <form onSubmit={e => { e.preventDefault(); submit() }} className="space-y-5">
          <div className="rounded-md border border-line/70 border-l-2 border-l-rose-600 bg-paper-low px-4 py-3">
            <div className="text-[14px] font-medium text-ink-100">{row.name}{row.service && <span className="font-normal text-ink-300"> — {row.service}</span>}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-400">
              <span>{row.plan || row.brand}</span><span aria-hidden>·</span>
              <span>{row.familyShort || 'Unrouted policy'}</span>
              {row.familyId && <IdChip>{row.familyId}</IdChip>}
              <span aria-hidden>·</span><span className="font-mono tabular-nums text-ink-200">{usd(row.amount)}</span>
            </div>
          </div>
          <label className="block">
            <span className={cx(MONO_LABEL, 'mb-2 block text-ink-400')}>Why did {row.brand} uphold the denial?</span>
            <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
              placeholder="Paste the reviewer's rationale or summarize it in a sentence"
              className="w-full resize-none rounded-md border border-line-strong bg-paper-high px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-100 placeholder:text-ink-400 outline-none transition-colors hover:border-ink-400 focus:border-ink-100 focus:shadow-[0_0_0_3px_rgba(47,206,150,0.2)]" />
          </label>
          <div>
            <div className={cx(MONO_LABEL, 'mb-2 text-ink-400')}>Common reasons</div>
            <div className="flex flex-wrap gap-1.5">
              {lossSuggestions(row.familyId).map(s => (
                <button type="button" key={s} onClick={() => setReason(s)} aria-pressed={reason === s}
                  className={cx('rounded-[4px] border px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint-deep',
                    reason === s ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-line bg-paper-high text-ink-300 hover:border-ink-400 hover:text-ink-100')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <p className="border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-400">The reason is written to the hash-chained audit trail and feeds the {row.brand} playbook, so the next {row.familyShort || 'appeal'} letter can pre-empt it.</p>
          <div className="flex justify-end gap-2">
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
      <div className="space-y-5">
        <p className="text-[14px] leading-relaxed text-ink-300">
          This restores all {count} synthetic cases to their original state and clears analyses, drafted letters, signatures and outcomes stored in this browser.
          Cases you created with <span className="font-medium text-ink-100">New denial</span> are removed. The audit trail is kept and records the reset.
        </p>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} autoFocus>Reset demo data</Button>
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ playbook
function WinBar({ rate }: { rate: number }) {
  const tone = rate >= 0.6 ? 'bg-mint' : rate >= 0.4 ? 'bg-amber-500' : 'bg-rose-600'
  const text = rate >= 0.6 ? MINT_TEXT : rate >= 0.4 ? 'text-amber-800' : 'text-rose-700'
  return (
    <div className="flex items-center justify-end gap-3 sm:justify-start">
      <Meter value={Math.max(0.04, rate)} tone={tone} className="hidden w-20 sm:block" />
      <span className={cx('w-10 font-mono text-[12.5px] font-medium tabular-nums', text)}>{pct(rate)}</span>
    </div>
  )
}

const TH = cx(MONO_LABEL, 'h-10 align-middle font-medium text-ink-400')

export function Playbook({ cells, insights, emptyAction, onFocusPayer }: {
  cells: PlayCell[]; insights: Insight[]; emptyAction: ReactNode; onFocusPayer: (brand: string) => void
}) {
  const outcomes = cells.reduce((s, c) => s + c.total, 0)
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pb-4 pt-5 sm:px-5">
        <SectionTitle eyebrow="Payer playbook" title={<>How each plan behaves <span className="text-gradient">on appeal</span></>}
          right={outcomes > 0
            ? <span className={cx(MONO_LABEL, 'hidden shrink-0 pb-1 text-ink-400 sm:inline')}><span className="text-ink-100 tabular-nums">{outcomes}</span> {outcomes === 1 ? 'outcome' : 'outcomes'} learned</span>
            : undefined} />
        {outcomes > 0 && (
          <div className={cx(MONO_LABEL, 'mt-2 text-ink-400 sm:hidden')}><span className="text-ink-100 tabular-nums">{outcomes}</span> {outcomes === 1 ? 'outcome' : 'outcomes'} learned</div>
        )}
      </div>

      {cells.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EmptyState icon={<Scale className="size-5" />} title="No outcomes recorded yet"
            body="Mark outcomes to build your payer playbook — every win and loss compounds into per-payer intelligence." action={emptyAction} />
        </div>
      ) : (
        <>
          {insights.length > 0 && (
            <div className="grid gap-3 px-4 pb-5 sm:px-5 md:grid-cols-2">
              {insights.map(ins => {
                const red = ins.tone === 'red'
                return (
                  <motion.div key={ins.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={cx('flex flex-col rounded-md border border-line border-l-2 bg-paper px-4 py-3.5', red ? 'border-l-rose-600' : 'border-l-mint')}>
                    <div className={cx(MONO_LABEL, 'flex items-center gap-2', red ? 'text-rose-700' : MINT_TEXT)}>
                      <span aria-hidden className={cx('size-[6px] rounded-full', red ? 'bg-rose-600' : 'bg-mint')} />
                      {ins.brand}
                    </div>
                    <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-100">{ins.text}</p>
                    <button onClick={() => onFocusPayer(ins.brand)}
                      className={cx(MONO_LABEL, 'mt-3 inline-flex items-center gap-1.5 self-start rounded-[3px] !tracking-[0.1em] text-ink-300 underline-offset-4 transition-colors hover:text-ink-100 hover:underline cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep')}>
                      Show {ins.brand} cases <ArrowRight className="size-3" />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          )}
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-y border-line bg-paper">
                  <th scope="col" className={cx(TH, 'pl-4 pr-3 sm:w-[32%] sm:pl-5 xl:w-[24%]')}>Payer</th>
                  <th scope="col" className={cx(TH, 'hidden w-[21%] px-3 xl:table-cell')}>Policy</th>
                  <th scope="col" className={cx(TH, 'w-12 px-2 text-right sm:w-16 sm:px-3')}>Won</th>
                  <th scope="col" className={cx(TH, 'w-14 px-2 text-right sm:w-16 sm:px-3')}>Lost</th>
                  <th scope="col" className={cx(TH, 'w-[84px] whitespace-nowrap pl-2 pr-4 text-right sm:w-40 sm:px-3 sm:text-left')}>Win rate</th>
                  <th scope="col" className={cx(TH, 'hidden whitespace-nowrap pl-3 pr-5 sm:table-cell')}>Last lost reason</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c, i) => (
                  <motion.tr key={c.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                    className="border-b border-line/70 align-top transition-colors last:border-0 hover:bg-paper-low">
                    <td className="py-3 pl-4 pr-3 sm:pl-5">
                      <button onClick={() => onFocusPayer(c.brand)} title={c.plans.join(' · ')}
                        className="block max-w-full truncate rounded-[3px] text-left text-[13.5px] font-medium leading-5 text-ink-100 underline-offset-4 decoration-line-strong hover:underline cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep">
                        {c.brand}
                      </button>
                      <div className="truncate text-[12px] text-ink-400">{c.plans.join(' · ') || 'Plan not extracted'}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-300 xl:hidden">{c.familyShort}{c.familyId && <IdChip>{c.familyId}</IdChip>}</div>
                      {c.lastLost && (
                        <div className="mt-1.5 truncate text-[12px] text-ink-400 sm:hidden" title={c.lastLost.reason || undefined}>
                          {c.lastLost.reason ? `“${c.lastLost.reason}”` : 'No reason recorded'}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 xl:table-cell">
                      <div className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-ink-200">{c.familyShort}{c.familyId && <IdChip>{c.familyId}</IdChip>}</div>
                    </td>
                    <td className={cx('px-2 py-3 text-right font-mono text-[13px] font-medium leading-5 tabular-nums sm:px-3', c.won > 0 ? MINT_TEXT : 'text-ink-400')}>{c.won}</td>
                    <td className={cx('px-2 py-3 text-right font-mono text-[13px] font-medium leading-5 tabular-nums sm:px-3', c.lost > 0 ? 'text-rose-700' : 'text-ink-400')}>{c.lost}</td>
                    <td className="py-3 pl-2 pr-4 leading-5 sm:px-3"><WinBar rate={c.winRate} /></td>
                    <td className="hidden py-3 pl-3 pr-5 sm:table-cell">
                      {c.lastLost
                        ? <div className="truncate text-[12.5px] leading-5 text-ink-300" title={c.lastLost.reason || undefined}>{c.lastLost.reason ? `“${c.lastLost.reason}”` : <span className="text-ink-400">No reason recorded</span>}<span className="text-ink-400"> · {c.lastLost.name}</span></div>
                        : <span className="font-mono text-[11px] leading-5 text-ink-400">No losses yet</span>}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
