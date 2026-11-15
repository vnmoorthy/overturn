import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, CircleX, Send, Sparkles, Trophy, Undo2 } from 'lucide-react'
import { Badge, cx } from '../../ui/kit'
import { DeadlineCell, OddsCell, StatusBadge, ValueCell } from './parts'
import { usd, type Row, type SortDir, type SortKey } from './model'

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
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx('px-2.5 py-2.5 align-bottom', right && 'text-right', className)}>
      <button type="button" onClick={() => onSort(k)}
        className={cx('-mx-1 inline-flex items-end gap-1 rounded-md px-1 py-0.5 text-[10.5px] font-semibold uppercase leading-tight tracking-[0.12em] transition-colors cursor-pointer hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-violet-400/60',
          wrap ? 'max-w-[92px]' : 'whitespace-nowrap', right ? 'flex-row-reverse text-right' : 'text-left', active ? 'text-ink-100' : 'text-ink-400')}>
        <span>{label}</span><Icon className={cx('mb-px size-3 shrink-0', !active && 'opacity-40')} />
      </button>
    </th>
  )
}

const ACT: Record<'subtle' | 'success' | 'danger' | 'ghost', string> = {
  subtle: 'bg-white/[0.06] text-ink-100 border border-white/10 hover:bg-white/[0.1]',
  success: 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-ink-950 font-semibold shadow-[0_6px_20px_-8px_rgba(52,211,153,.6)] hover:brightness-110',
  danger: 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-white/[0.08]',
}
/** Compact row-action button (same palette as kit Button, tighter metrics for dense tables). */
function Act({ tone, icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone: keyof typeof ACT; icon: ReactNode }) {
  return (
    <button type="button" {...rest}
      className={cx('inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-lg text-[12px] font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-400/60',
        children ? 'px-2' : 'w-7', ACT[tone], className)}>
      {icon}{children}
    </button>
  )
}

export function CaseTable({ rows, sort, onSort, actions, empty }: {
  rows: Row[]; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void; actions: RowActions; empty: ReactNode
}) {
  const stop = (fn: (r: Row) => void, r: Row) => (e: MouseEvent) => { e.stopPropagation(); fn(r) }
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/8 bg-white/[0.015]">
            <Th k="patient" label="Patient & service" sort={sort} onSort={onSort} className="pl-4 sm:pl-5" />
            <Th k="policy" label="Policy" sort={sort} onSort={onSort} />
            <Th k="amount" label="Amount" sort={sort} onSort={onSort} right />
            <Th k="deadline" label="Deadline" sort={sort} onSort={onSort} />
            <Th k="status" label="Status" sort={sort} onSort={onSort} />
            <Th k="odds" label="Historical odds" sort={sort} onSort={onSort} wrap />
            <Th k="ev" label="Expected value" sort={sort} onSort={onSort} right wrap />
            <th scope="col" className="py-2.5 pl-2.5 pr-4 text-right sm:pr-5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-5 py-14">{empty}</td></tr>
          )}
          {rows.map((r, i) => (
            <motion.tr key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + Math.min(i, 16) * 0.025, duration: 0.3, ease: 'easeOut' }}
              tabIndex={0}
              onClick={() => actions.open(r)}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); actions.open(r) } }}
              className={cx('group cursor-pointer border-b border-white/[0.05] align-top transition-colors last:border-0 hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none',
                r.closed && 'opacity-80 hover:opacity-100')}>
              <td className="relative py-3 pl-4 pr-2.5 sm:pl-5">
                {r.c.hero && <span aria-hidden className="absolute inset-y-3 left-0 w-[2px] rounded-full bg-gradient-to-b from-violet-400 to-cyan-300" />}
                <div className="flex max-w-[232px] items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-ink-100 transition-colors group-hover:text-white">{r.name}</span>
                  {r.c.hero && <Badge tone="violet">Demo</Badge>}
                </div>
                <div className="mt-0.5 max-w-[232px] truncate text-[12.5px] text-ink-300" title={[r.service, r.plan].filter(Boolean).join(' · ')}>
                  {r.service || <span className="text-ink-400">Add the denial letter to begin</span>}
                  {r.plan && <span className="text-ink-400"> · {r.plan}</span>}
                </div>
                {r.hook && <div className="mt-1 flex max-w-[232px] items-center gap-1 text-[11.5px] text-violet-200/85" title={r.hook}><Sparkles className="size-3 shrink-0" /><span className="truncate">{r.hook}</span></div>}
              </td>
              <td className="px-2.5 py-3">
                {r.familyShort
                  ? <div className="max-w-[150px] text-[12.5px] leading-snug text-ink-200">{r.familyShort}</div>
                  : <div className="text-[13px] text-ink-400">Not routed yet</div>}
                {r.familyId && <div className="mt-1"><Badge className="font-mono">{r.familyId}</Badge></div>}
              </td>
              <td className="px-2.5 py-3 text-right text-[13.5px] tabular-nums text-ink-100">{r.amount ? usd(r.amount) : <span className="text-ink-400">—</span>}</td>
              <td className="px-2.5 py-3"><DeadlineCell r={r} /></td>
              <td className="px-2.5 py-3">
                <StatusBadge status={r.c.status} note={r.c.outcomeNote} />
                {r.c.status === 'lost' && r.c.outcomeNote && <div className="mt-1 max-w-[130px] truncate text-[11.5px] text-ink-400" title={r.c.outcomeNote}>{r.c.outcomeNote}</div>}
              </td>
              <td className="px-2.5 py-3"><OddsCell r={r} /></td>
              <td className="px-2.5 py-3"><ValueCell r={r} /></td>
              <td className="py-2.5 pl-2.5 pr-4 sm:pr-5">
                <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                  {r.c.status === 'signed' && (
                    <Act tone="subtle" icon={<Send className="size-3.5" />} onClick={stop(actions.submit, r)}>Mark submitted</Act>
                  )}
                  {r.c.status === 'submitted' && (<>
                    <Act tone="success" icon={<Trophy className="size-3.5" />} onClick={stop(actions.won, r)} aria-label={`Mark ${r.name} won`}>Won</Act>
                    <Act tone="danger" icon={<CircleX className="size-3.5" />} onClick={stop(actions.lost, r)} aria-label={`Mark ${r.name} lost`}>Lost</Act>
                  </>)}
                  {r.closed && (
                    <Act tone="ghost" icon={<Undo2 className="size-3.5" />} onClick={stop(actions.reopen, r)} title="Clear the outcome and return to awaiting a decision">Reopen</Act>
                  )}
                  <Act tone="ghost" icon={<ArrowUpRight className="size-4" />} onClick={stop(actions.open, r)} aria-label={`Open ${r.name}`} title="Open case"
                    className="group-hover:bg-white/[0.08] group-hover:text-ink-100" />
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
