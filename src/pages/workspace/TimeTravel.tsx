import { History, Minus, Plus } from 'lucide-react'
import type { PolicyFamily } from '../../lib/types'
import { addedCriteria, removedCriteria, removedOn } from '../../lib/policies'
import { fmtDate } from '../../lib/rules'
import { Badge, Modal } from '../../ui/kit'

export function TimeTravelModal({ open, onClose, family, effectiveLabel, citedIds }: { open: boolean; onClose: () => void; family: PolicyFamily; effectiveLabel: string | null; citedIds: string[] }) {
  const versions = family.versions
  return (
    <Modal open={open} onClose={onClose} wide title={<span className="flex items-center gap-2"><History className="size-4 text-ink-200" /> Policy time-travel · {family.id} {family.title}</span>}>
      <p className="mb-4 text-[13px] text-ink-300">Every archived version of the LCD, oldest to newest, from the CMS Medicare Coverage Database. Criteria removed in each revision are struck through; the denial’s cited requirements are marked.</p>
      <div className="relative space-y-4">
        <div className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-emerald-600/50 via-teal-400/30 to-emerald-400/50" />
        {versions.map((v, i) => {
          const next = versions[i + 1]
          const removed = next ? removedCriteria(v, next) : []
          const added = i > 0 ? addedCriteria(versions[i - 1], v, family) : []
          const isEff = v.version_label === effectiveLabel
          return (
            <div key={v.version_label} className="relative pl-8">
              <div className={`absolute left-1 top-1.5 size-[15px] rounded-full border-2 ${isEff ? 'border-emerald-600 bg-emerald-500/[0.16]' : 'border-line-strong bg-ink-900'}`} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">Version “{v.version_label}”</span>
                <Badge tone={isEff ? 'green' : 'gray'}>effective {fmtDate(v.effective_date)}</Badge>
                {isEff && <Badge tone="green">in effect on date of service</Badge>}
                <a href={v.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline">source</a>
              </div>
              {added.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {added.slice(0, 4).map(c => (
                    <div key={c.id} className="flex gap-2 rounded-lg border border-emerald-600/25 bg-emerald-500/[0.07] px-3 py-2 text-[12.5px]">
                      <Plus className="mt-0.5 size-3.5 shrink-0 text-emerald-700" /><span className="text-ink-200">{c.quote}</span>
                    </div>
                  ))}
                </div>
              )}
              {removed.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {removed.map(c => {
                    const cited = citedIds.includes(`${v.version_label}/${c.id}`)
                    return (
                      <div key={c.id} className={`flex gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${cited ? 'border-rose-600/40 bg-rose-500/[0.09]' : 'border-line/70 bg-black/[0.02]'}`}>
                        <Minus className="mt-0.5 size-3.5 shrink-0 text-rose-700" />
                        <div>
                          <span className="text-ink-400 line-through decoration-rose-400/70">{c.quote}</span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge tone="red">removed {removedOn(c.label) ? fmtDate(removedOn(c.label)!) : `by ${fmtDate(next!.effective_date)}`}</Badge>
                            {cited && <Badge tone="red">← the denial still applies this</Badge>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
