import { useState } from 'react'
import { Scale, Search } from 'lucide-react'
import type { CaseFile, PolicyFamily } from '../../lib/types'
import { imr, segment, type ImrExample } from '../../lib/imr'
import { cosine, embed } from '../../lib/pipeline'
import { friendlyError } from '../../lib/gemini'
import { Badge, Button, Card, Eyebrow, ModelChip, toast } from '../../ui/kit'

export function OddsCard({ c, family }: { c: CaseFile; family: PolicyFamily }) {
  const seg = segment(family.segment)
  const data = imr()
  const [similar, setSimilar] = useState<(ImrExample & { score: number })[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState('')
  if (!seg || !data) return null

  async function findSimilar() {
    setBusy(true)
    try {
      const q = `${c.denial?.service_description}. Denial: ${c.denial?.denial_reason_text}`
      const r = await embed([q, ...seg!.examples.map(e => e.findings)])
      const [qv, ...ev] = r.value
      if (!qv || ev.length !== seg!.examples.length) throw new Error('Embedding service returned an incomplete result — try again.')
      setSimilar(seg!.examples.map((e, i) => ({ ...e, score: cosine(qv, ev[i]) })).sort((a, b) => b.score - a.score).slice(0, 3))
      setModel(r.model)
    } catch (e) { toast(friendlyError(e), 'red') } finally { setBusy(false) }
  }

  const pct = Math.round(seg.rate * 100)
  const years = data.year_range ? `${data.year_range[0]}–${data.year_range[1]}` : ''
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Eyebrow className="flex items-center gap-1.5"><Scale className="size-3.5" aria-hidden /> Overturn rate</Eyebrow>
          <h3 className="mt-1 font-serif text-[19px] font-medium leading-tight tracking-[-0.02em] text-ink-100">Honest odds</h3>
        </div>
        <Badge tone="gray">public data, not a model guess</Badge>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <div className="relative size-[104px] shrink-0" role="img" aria-label={`${pct}% of similar reviews overturned`}>
          <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-line)" strokeWidth="2.4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-mint)" strokeWidth="2.4" strokeLinecap="butt" strokeDasharray={`${seg.rate * 97.4} 97.4`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-serif text-[28px] font-medium leading-none tracking-[-0.03em] text-ink-100">{pct}<span className="text-[17px] text-ink-300">%</span></span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-400">overturned</span>
          </div>
        </div>
        <p className="min-w-0 text-[13.5px] leading-relaxed text-ink-300">
          Similar independent medical reviews were <b className="font-semibold text-ink-100">overturned {pct}% of the time</b>.
        </p>
      </div>

      <dl className="mt-4 divide-y divide-line/70 border-y border-line/70 text-[12px]">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2">
          <dt className="eyebrow pt-px">n</dt>
          <dd className="font-mono text-ink-100">{seg.n.toLocaleString()}</dd>
        </div>
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2">
          <dt className="eyebrow pt-px">Segment</dt>
          <dd className="text-ink-300">{seg.label}</dd>
        </div>
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2">
          <dt className="eyebrow pt-px">Source</dt>
          <dd className="font-mono text-[11.5px] leading-relaxed text-ink-300">{data.source}{years && `, ${years}`}</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-400">California plans, used as a prior until your own outcomes replace it.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" icon={<Search className="size-3.5" />} loading={busy} onClick={findSimilar}>Find most similar real cases</Button>
        {model && <ModelChip model={model} />}
      </div>
      {similar && (
        <ol className="mt-3 divide-y divide-line/70 overflow-hidden rounded-md border border-line/70 bg-paper-low">
          {similar.map(s => {
            const won = /overturn/i.test(s.determination)
            return (
              <li key={s.id} className="px-3 py-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={won ? 'green' : 'red'}>{won ? 'Overturned' : 'Upheld'}</Badge>
                  <span className="font-mono text-[10.5px] text-ink-400">{s.id} · {s.year} · similarity {(s.score * 100).toFixed(0)}</span>
                </div>
                <div className="line-clamp-3 text-[12px] leading-relaxed text-ink-300">{s.findings}</div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
