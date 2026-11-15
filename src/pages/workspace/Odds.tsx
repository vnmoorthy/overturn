import { useState } from 'react'
import { Scale, Search } from 'lucide-react'
import type { CaseFile, PolicyFamily } from '../../lib/types'
import { imr, segment, type ImrExample } from '../../lib/imr'
import { cosine, embed } from '../../lib/pipeline'
import { friendlyError } from '../../lib/gemini'
import { Badge, Button, Card, ModelChip, toast } from '../../ui/kit'

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
      setSimilar(seg!.examples.map((e, i) => ({ ...e, score: cosine(qv, ev[i]) })).sort((a, b) => b.score - a.score).slice(0, 3))
      setModel(r.model)
    } catch (e) { toast(friendlyError(e), 'red') } finally { setBusy(false) }
  }

  const pct = Math.round(seg.rate * 100)
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Scale className="size-4 text-cyan-300" /> Honest odds</div>
        <Badge tone="cyan">public data, not a model guess</Badge>
      </div>
      <div className="flex items-end gap-4">
        <div className="relative size-24 shrink-0">
          <svg viewBox="0 0 36 36" className="size-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3.2" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#odds-g)" strokeWidth="3.2" strokeLinecap="round" strokeDasharray={`${seg.rate * 97.4} 97.4`} />
            <defs><linearGradient id="odds-g"><stop stopColor="#22d3ee" /><stop offset="1" stopColor="#34d399" /></linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold">{pct}%</div>
        </div>
        <div className="min-w-0 text-[12.5px] leading-relaxed text-ink-300">
          Similar independent medical reviews were <b className="text-ink-100">overturned {pct}% of the time</b> <span className="text-ink-400">(n = {seg.n.toLocaleString()}, {seg.label}).</span>
          <div className="mt-1 text-[11px] text-ink-400">Source: {data.source}, {data.year_range?.[0]}–{data.year_range?.[1]}. California plans, used as a prior until your own outcomes replace it.</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" icon={<Search className="size-3.5" />} loading={busy} onClick={findSimilar}>Find most similar real cases</Button>
        {model && <ModelChip model={model} />}
      </div>
      {similar && (
        <div className="mt-3 space-y-2">
          {similar.map(s => (
            <div key={s.id} className="rounded-lg border border-white/8 bg-black/20 p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={/overturn/i.test(s.determination) ? 'green' : 'red'}>{/overturn/i.test(s.determination) ? 'Overturned' : 'Upheld'}</Badge>
                <span className="font-mono text-[10.5px] text-ink-400">{s.id} · {s.year} · similarity {(s.score * 100).toFixed(0)}</span>
              </div>
              <div className="line-clamp-3 text-[11.5px] leading-relaxed text-ink-300">{s.findings}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
