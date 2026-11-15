import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Send, Undo2 } from 'lucide-react'
import { cx } from '../../ui/kit'
import { DeadlineCell, DeadlineInline, IdChip, MONO_LABEL, OddsCell, StatusBadge, ValueCell } from './parts'
import { pct, usd, type Row, type SortDir, type SortKey } from './model'

export interface RowActions {
  open: (r: Row) => void
  submit: (r: Row) => void
  won: (r: Row) => void
  lost: (r: Row) => void
  reopen: (r: Row) => void
}

function Th({ k, label, sort, onSort, right, wrap, className }: {
  k: SortKey; label: string; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void; right?: boolean; wrap?: boolean; className?: string
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cx('h-11 px-2.5 py-2 align-middle font-medium', right && 'text-right', className)}>
      <button type="button" onClick={() => onSort(k)}
        className={cx(MONO_LABEL, 'group/th -mx-1 inline-flex items-center gap-1.5 rounded-[3px] px-1 py-0.5 leading-[1.35] transition-colors cursor-pointer hover:text-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint-deep',
          wrap ? 'max-w-[96px]' : 'whitespace-nowrap', right ? 'flex-row-reverse text-right' : 'text-left', active ? 'text-ink-100' : 'text-ink-400')}>
        <span>{label}</span>
        <Icon className={cx('size-3 shrink-0 transition-opacity', active ? 'text-ink-100' : 'opacity-35 group-hover/th:opacity-80')} />
      </button>
    </th>
  )
}

const ACT: Record<'outline' | 'won' | 'lost' | 'ghost', string> = {
  outline: 'border-line-strong bg-paper-high text-ink-100 hover:border-ink-100',
  won: 'border-line-strong bg-paper-high text-[#0b6b4a] hover:border-mint-deep hover:bg-mint-pale hover:text-mint-ink',
  lost: 'border-line-strong bg-paper-high text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800',
  ghost: 'border-transparent text-ink-400 hover:bg-paper-low hover:text-ink-100',
}
/** Compact row-action button: small outline buttons for dense tables (kit Button metrics are too tall here). */
function Act({ tone, icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone: keyof typeof ACT; icon: ReactNode }) {
  return (
    <button type="button" {...rest}
      className={cx('inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] border text-[12px] font-medium transition-colors duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint-deep',
        children ? 'px-2' : 'w-7', ACT[tone], className)}>
      {icon}{children}
    </button>
  )
}

/** The status-dependent actions for a row (Mark submitted / Won / Lost / Reopen). */
function RowButtons({ r, actions, stop }: { r: Row; actions: RowActions; stop: (fn: (r: Row) => void, r: Row) => (e: MouseEvent) => void }) {
  return (<>
    {r.c.status === 'signed' && (
      <Act tone="outline" icon={<Send className="size-3.5 text-ink-400" />} onClick={stop(actions.submit, r)}>Mark submitted</Act>
    )}
    {r.c.status === 'submitted' && (<>
      <Act tone="won" icon={<span aria-hidden className="size-[6px] rounded-full bg-mint" />} onClick={stop(actions.won, r)} aria-label={`Mark ${r.name} won`}>Won</Act>
      <Act tone="lost" icon={<span aria-hidden className="size-[6px] rounded-full bg-rose-600" />} onClick={stop(actions.lost, r)} aria-label={`Mark ${r.name} lost`}>Lost</Act>
    </>)}
    {r.closed && (
      <Act tone="ghost" icon={<Undo2 className="size-3.5" />} onClick={stop(actions.reopen, r)} title="Clear the outcome and return to awaiting a decision">Reopen</Act>
    )}
  </>)
}

export function CaseTable({ rows, sort, onSort, actions, empty }: {
  rows: Row[]; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void; actions: RowActions; empty: ReactNode
}) {
  const stop = (fn: (r: Row) => void, r: Row) => (e: MouseEvent) => { e.stopPropagation(); fn(r) }
  return (
    <div className="scrollbar-thin overflow-x-auto">
      {/* Columns fold away as the viewport narrows; what they held moves into the patient cell's meta lines. */}
      <table className="w-full border-collapse text-left sm:min-w-[680px] lg:min-w-[820px] xl:min-w-[1000px]">
        <thead>
          <tr className="border-b border-line bg-paper">
            <Th k="patient" label="Patient & service" sort={sort} onSort={onSort} className="pl-4 sm:pl-5" />
            <Th k="policy" label="Policy" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
            <Th k="amount" label="Amount" sort={sort} onSort={onSort} right className="hidden sm:table-cell" />
            <Th k="deadline" label="Deadline" sort={sort} onSort={onSort} className="hidden md:table-cell" />
            <Th k="status" label="Status" sort={sort} onSort={onSort} className="hidden sm:table-cell" />
            <Th k="odds" label="Historical odds" sort={sort} onSort={onSort} wrap className="hidden lg:table-cell" />
            <Th k="ev" label="Expected value" sort={sort} onSort={onSort} right wrap className="pr-4 sm:pr-2.5" />
            <th scope="col" className="hidden py-2 pl-2.5 pr-4 text-right sm:table-cell sm:pr-5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-5 py-14">{empty}</td></tr>
          )}
          {rows.map((r, i) => {
            const hasActs = r.c.status === 'signed' || r.c.status === 'submitted' || r.closed
            return (
              <motion.tr key={r.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + Math.min(i, 16) * 0.02, duration: 0.25, ease: 'easeOut' }}
                tabIndex={0}
                onClick={() => actions.open(r)}
                onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); actions.open(r) } }}
                className="group cursor-pointer border-b border-line/70 align-top transition-colors duration-150 last:border-0 hover:bg-paper-low focus-visible:bg-paper-low focus-visible:shadow-[inset_2px_0_0_0_#0c8a5f] focus-visible:outline-none">
                <td className="relative py-3.5 pl-4 pr-3 sm:pl-5">
                  {r.c.hero && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-mint" />}
                  <div className="flex max-w-[220px] items-center gap-2 sm:max-w-[220px]">
                    <span className="truncate text-[13.5px] font-medium leading-5 text-ink-100">{r.name}</span>
                    {r.c.hero && <span className={cx(MONO_LABEL, 'shrink-0 rounded-[3px] border border-[#a9e3cb] bg-mint-pale px-1 py-px !text-[9.5px] !tracking-[0.1em] text-[#0b6b4a]')}>Demo</span>}
                  </div>
                  <div className="mt-0.5 max-w-[220px] truncate text-[12.5px] text-ink-300 sm:max-w-[220px]" title={[r.service, r.plan].filter(Boolean).join(' · ')}>
                    {r.service || <span className="text-ink-400">Add the denial letter to begin</span>}
                    {r.plan && <span className="text-ink-400"> · {r.plan}</span>}
                  </div>
                  {r.hook && (
                    <div className="mt-1.5 flex max-w-[220px] items-baseline gap-1.5 text-[12px] text-ink-300 sm:max-w-[220px]" title={r.hook}>
                      <span aria-hidden className="shrink-0 font-mono text-[11px] text-mint-deep">↳</span><span className="truncate italic">{r.hook}</span>
                    </div>
                  )}

                  {/* compact meta: policy below xl (odds move under the value below lg) */}
                  {(r.familyShort || r.familyId) && (
                    <div className="mt-2 flex max-w-[220px] items-center gap-2 sm:max-w-[220px] xl:hidden">
                      {r.familyId && <IdChip className="shrink-0">{r.familyId}</IdChip>}
                      {r.familyShort && <span className="truncate text-[11.5px] text-ink-400">{r.familyShort}</span>}
                    </div>
                  )}
                  {/* compact meta: status + amount below sm, deadline below md */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 md:hidden">
                    <span className="sm:hidden"><StatusBadge status={r.c.status} note={r.c.outcomeNote} /></span>
                    <span className="font-mono text-[11px] tabular-nums text-ink-300 sm:hidden">{r.amount ? usd(r.amount) : '—'}</span>
                    <DeadlineInline r={r} />
                  </div>
                  {r.c.status === 'lost' && r.c.outcomeNote && <div className="mt-1 max-w-[220px] truncate text-[11.5px] text-ink-400 sm:hidden" title={r.c.outcomeNote}>{r.c.outcomeNote}</div>}
                  {hasActs && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:hidden" onClick={e => e.stopPropagation()}>
                      <RowButtons r={r} actions={actions} stop={stop} />
                    </div>
                  )}
                </td>
                <td className="hidden px-2.5 py-3.5 xl:table-cell">
                  {r.familyShort
                    ? <div className="min-w-[124px] max-w-[150px] text-[12.5px] leading-5 text-ink-200">{r.familyShort}</div>
                    : <div className="text-[12.5px] leading-5 text-ink-400">Not routed yet</div>}
                  {r.familyId && <div className="mt-1.5"><IdChip>{r.familyId}</IdChip></div>}
                </td>
                <td className="hidden px-2.5 py-3.5 text-right font-mono text-[12.5px] leading-5 tabular-nums text-ink-200 sm:table-cell">{r.amount ? usd(r.amount) : <span className="text-ink-400">—</span>}</td>
                <td className="hidden px-2.5 py-3.5 md:table-cell"><DeadlineCell r={r} /></td>
                <td className="hidden px-2.5 py-3.5 sm:table-cell">
                  <StatusBadge status={r.c.status} note={r.c.outcomeNote} />
                  {r.c.status === 'lost' && r.c.outcomeNote && <div className="mt-1 max-w-[104px] truncate text-[11.5px] text-ink-400" title={r.c.outcomeNote}>{r.c.outcomeNote}</div>}
                </td>
                <td className="hidden px-2.5 py-3.5 lg:table-cell"><OddsCell r={r} /></td>
                <td className="py-3.5 pl-2.5 pr-4 sm:pr-2.5">
                  <ValueCell r={r} />
                  {!r.closed && <div className="mt-1 whitespace-nowrap text-right font-mono text-[10.5px] tabular-nums text-ink-400 lg:hidden">{pct(r.odds.rate)} odds</div>}
                </td>
                <td className="hidden py-3 pl-2.5 pr-4 sm:table-cell sm:pr-5">
                  <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                    <RowButtons r={r} actions={actions} stop={stop} />
                    <Act tone="ghost" icon={<ArrowUpRight className="size-4" />} onClick={stop(actions.open, r)} aria-label={`Open ${r.name}`} title="Open case"
                      className="group-hover:border-line group-hover:bg-paper-high group-hover:text-ink-100" />
                  </div>
                </td>
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
