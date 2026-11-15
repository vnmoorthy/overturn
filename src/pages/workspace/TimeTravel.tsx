import type { ReactNode } from 'react'
import { ArrowUpRight, History } from 'lucide-react'
import type { PolicyFamily } from '../../lib/types'
import { addedCriteria, removedCriteria, removedOn } from '../../lib/policies'
import { fmtDate } from '../../lib/rules'
import { Badge, Modal, cx } from '../../ui/kit'

/** One line of a code-review style diff: a sign gutter, then the text. */
function DiffRow({ sign, children, tone }: { sign: '+' | '−'; children: ReactNode; tone: 'add' | 'del' | 'cited' }) {
  return (
    <div className={cx('grid grid-cols-[28px_minmax(0,1fr)] border-l-2 text-[13px] leading-relaxed',
      tone === 'add' && 'border-l-mint bg-mint-pale/45',
      tone === 'del' && 'border-l-rose-300 bg-paper-high',
      tone === 'cited' && 'border-l-rose-500 bg-rose-50')}>
      <span aria-hidden className={cx('select-none pt-2.5 text-center font-mono text-[12.5px] leading-none', tone === 'add' ? 'text-mint-deep' : 'text-rose-600')}>{sign}</span>
      <div className="min-w-0 py-2 pr-3.5">{children}</div>
    </div>
  )
}

export function TimeTravelModal({ open, onClose, family, effectiveLabel, citedIds }: { open: boolean; onClose: () => void; family: PolicyFamily; effectiveLabel: string | null; citedIds: string[] }) {
  const versions = family.versions
  return (
    <Modal open={open} onClose={onClose} wide title={<span className="flex items-center gap-2.5"><History className="size-4 shrink-0 text-ink-400" /><span>Policy time-travel <span className="font-mono text-[13px] font-normal tracking-normal text-ink-400">· {family.id} {family.title}</span></span></span>}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink-300">Every archived version of the LCD, oldest to newest, from the CMS Medicare Coverage Database. Criteria removed in each revision are struck through; the denial’s cited requirements are marked.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-mint" />added</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-rose-300" />removed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-rose-500" />cited by denial</span>
        </div>
      </div>

      <ol className="relative">
        {versions.map((v, i) => {
          const next = versions[i + 1]
          const removed = next ? removedCriteria(v, next) : []
          const added = i > 0 ? addedCriteria(versions[i - 1], v, family) : []
          const isEff = v.version_label === effectiveLabel
          const last = i === versions.length - 1
          return (
            <li key={v.version_label} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-4 pb-7 last:pb-1 sm:grid-cols-[112px_20px_minmax(0,1fr)]">
              {/* date column (ledger) */}
              <div className="hidden pt-[3px] text-right sm:block">
                <div className={cx('font-mono text-[11.5px] tracking-[0.04em]', isEff ? 'text-[#0b6b4a]' : 'text-ink-300')}>{fmtDate(v.effective_date).toUpperCase()}</div>
                <div className="eyebrow mt-1 !text-[9.5px] !text-faint">effective</div>
              </div>
              {/* rail + node */}
              <div className="relative flex justify-center">
                {!last && <span aria-hidden className="absolute bottom-[-4px] top-[18px] w-px bg-line" />}
                <span aria-hidden className={cx('relative mt-[3px] size-[13px] rounded-full border-2',
                  isEff ? 'border-mint-deep bg-mint shadow-[0_0_0_3px_var(--color-mint-pale)]' : 'border-line-strong bg-paper-high')} />
              </div>
              {/* content */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <h3 className="font-serif text-[17px] font-medium leading-tight tracking-[-0.015em] text-ink-100">Version “{v.version_label}”</h3>
                  <Badge tone={isEff ? 'green' : 'gray'} className="sm:hidden">effective {fmtDate(v.effective_date)}</Badge>
                  {isEff && <Badge tone="green">in effect on date of service</Badge>}
                  <a href={v.source_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-[3px] font-mono text-[11px] text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-deep">
                    source<ArrowUpRight className="size-3" aria-hidden />
                  </a>
                </div>

                {(added.length > 0 || removed.length > 0) && (
                  <div className="mt-3 overflow-hidden rounded-md border border-line bg-paper-high">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-paper-low px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                      <span>{family.id}@{v.version_label}</span>
                      {added.length > 0 && <span className="text-[#0b6b4a]">+{added.length} added</span>}
                      {removed.length > 0 && <span className="text-rose-700">−{removed.length} removed later</span>}
                    </div>
                    <div className="divide-y divide-line/70">
                      {added.slice(0, 4).map(c => (
                        <DiffRow key={c.id} sign="+" tone="add"><span className="text-ink-200">{c.quote}</span></DiffRow>
                      ))}
                      {added.length > 4 && (
                        <div className="py-1.5 pl-[30px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">+{added.length - 4} more added · see source</div>
                      )}
                      {removed.map(c => {
                        const cited = citedIds.includes(`${v.version_label}/${c.id}`)
                        return (
                          <DiffRow key={c.id} sign="−" tone={cited ? 'cited' : 'del'}>
                            <span className={cx('line-through decoration-rose-500 decoration-[1.5px]', cited ? 'text-ink-200' : 'text-ink-400')}>{c.quote}</span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Badge tone="red">removed {removedOn(c.label) ? fmtDate(removedOn(c.label)!) : `by ${fmtDate(next!.effective_date)}`}</Badge>
                              {cited && <Badge tone="red" className="!border-rose-600 !bg-rose-600 !text-white">← the denial still applies this</Badge>}
                            </div>
                          </DiffRow>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
