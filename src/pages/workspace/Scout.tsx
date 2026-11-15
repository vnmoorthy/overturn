// Policy scout: when a denied service isn't in the local CMS library, send Google's
// Antigravity managed agent to research the governing LCD/NCD, then continue the case on it.
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, ExternalLink, Play, Square } from 'lucide-react'
import type { CaseFile, PolicyVersion } from '../../lib/types'
import { scoutPolicy, type ScoutResult } from '../../lib/pipeline'
import { registerCustomVersion } from '../../lib/policies'
import { caseStore } from '../../lib/store'
import { audit } from '../../lib/audit'
import { friendlyError, ANTIGRAVITY_AGENT } from '../../lib/gemini'
import { pushTrace } from '../../ui/TracePanel'
import { Badge, Button, Card, ModelChip, Spinner, toast } from '../../ui/kit'

function toVersion(r: ScoutResult): PolicyVersion {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(r.effective_date) ? r.effective_date : '2000-01-01'
  return {
    id: r.policy_id.trim(), title: r.title || r.policy_id, type: /ncd/i.test(r.type) ? 'NCD' : 'LCD', contractor: r.contractor,
    version_label: 'agent-sourced', effective_date: iso, retired_date: null, source_url: r.source_url, retrieved: new Date().toISOString().slice(0, 10),
    sections: [{ id: 's1', heading: 'Coverage criteria — sourced by the Antigravity agent (verify against CMS before filing)', text: r.criteria.map((c, i) => `${i + 1}. ${c.quote}`).join('\n\n') }],
    criteria: r.criteria.map((c, i) => ({ id: `c${i + 1}`, label: c.label || `Criterion ${i + 1}`, quote: c.quote, section: 's1' })),
    verbatim: false,
  }
}

export function PolicyScout({ c, onUse }: { c: CaseFile; onUse: () => void }) {
  const __pv = window.location.hash.match(/scoutpv=(\w+)/)?.[1] // TEMP-PREVIEW
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>((__pv as 'idle') || 'idle') // TEMP-PREVIEW
  const [secs, setSecs] = useState(0)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<ScoutResult | null>(__pv === 'done' ? { policy_id: 'L33718', title: 'Positive Airway Pressure (PAP) Devices for the Treatment of Obstructive Sleep Apnea', type: 'LCD', contractor: 'Noridian', effective_date: '2024-01-01', source_url: 'https://www.cms.gov/', criteria: [{ label: 'Face-to-face evaluation', quote: 'The beneficiary has a face-to-face clinical evaluation by the treating practitioner prior to the sleep test to assess the beneficiary for obstructive sleep apnea.' }, { label: 'Qualifying sleep test', quote: 'The beneficiary has a sleep test that meets either of the following criteria: the AHI or RDI is greater than or equal to 15 events per hour.' }, { label: 'Education', quote: 'The beneficiary and/or their caregiver has received instruction from the supplier of the device in the proper use and care of the equipment.' }], notes: 'Preview data.' } as unknown as ScoutResult : null) // TEMP-PREVIEW
  const [err, setErr] = useState(__pv === 'error' ? 'The agent timed out before returning a policy. Try again in a minute.' : '') // TEMP-PREVIEW
  const cancel = useRef({ cancelled: false })
  useEffect(() => () => { cancel.current.cancelled = true }, [])

  async function start() {
    if (!c.denial) return
    cancel.current = { cancelled: false }
    setState('running'); setErr(''); setResult(null); setSecs(0)
    const t0 = Date.now()
    try {
      const r = await scoutPolicy(c.denial, (s, sec) => { setStatus(s); setSecs(sec) }, cancel.current)
      pushTrace({ task: 'scout', model: ANTIGRAVITY_AGENT, ms: r.ms, ok: true, at: Date.now() })
      await audit(ANTIGRAVITY_AGENT, 'scout.policy', c.id, { policy: r.value.policy_id, criteria: r.value.criteria.length, interaction: r.id })
      setResult(r.value); setState('done')
    } catch (e) {
      pushTrace({ task: 'scout', model: ANTIGRAVITY_AGENT, ms: Date.now() - t0, ok: false, error: friendlyError(e).slice(0, 80), at: Date.now() })
      setErr(friendlyError(e)); setState('error')
    }
  }
  async function use() {
    if (!result) return
    const v = toVersion(result)
    registerCustomVersion(v)
    caseStore.update(c.id, { familyId: v.id, versionLabel: null })
    await audit('biller', 'scout.use_policy', c.id, { policy: v.id })
    toast(`Continuing on ${v.id} (agent-sourced). Verify the policy text before filing.`, 'violet')
    onUse()
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
        <div className="flex min-w-0 flex-1 basis-[28rem] items-start gap-4">
          <div className="hidden size-10 shrink-0 items-center justify-center rounded-md border border-line bg-paper-low text-ink-200 sm:flex"><Bot className="size-5" /></div>
          <div className="min-w-0">
            <div className="eyebrow !text-amber-800">Policy scout · not in library</div>
            <h3 className="mt-1 font-serif text-[20px] font-medium leading-snug tracking-[-0.02em] text-ink-100">Not in the policy library — <span className="text-gradient">send the Antigravity agent</span></h3>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-300">
              Google’s Antigravity managed agent researches the CMS Medicare Coverage Database for the LCD or NCD that governs <b className="font-medium text-ink-100">{c.denial?.service_description}</b>, and returns its coverage criteria. Overturn can then continue the appeal on that policy — labeled agent-sourced until you verify it.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModelChip model={ANTIGRAVITY_AGENT} />
          {state === 'running'
            ? <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={() => { cancel.current.cancelled = true; setState('idle') }}>Cancel</Button>
            : <Button size="sm" variant={state === 'done' ? 'outline' : 'primary'} icon={<Bot className="size-4" />} onClick={start} disabled={!c.denial}>{state === 'done' ? 'Research again' : 'Research with Antigravity'}</Button>}
        </div>
      </div>

      {state === 'running' && (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {/* the one "machine at work" surface on this page */}
          <div className="overflow-hidden rounded-md border border-lab-line bg-lab text-[#e9e7e0]" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3 border-b border-lab-line px-3.5 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {[0, 1, 2].map(i => <span key={i} className="size-[7px] shrink-0 rounded-full bg-white/15" />)}
                <span className="ml-2 truncate font-mono text-[10.5px] uppercase tracking-[0.13em] text-[#a8a59b]">antigravity · policy scout</span>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] tabular-nums text-mint">
                <span className="size-1.5 animate-pulse rounded-full bg-mint motion-reduce:animate-none" />live · {secs}s
              </span>
            </div>
            <div className="grid-lab space-y-1 px-4 py-3.5 font-mono text-[12.5px] leading-relaxed">
              <div className="break-words"><span className="text-mint">$</span> find the LCD/NCD governing “{c.denial?.service_description}”</div>
              <div className="flex items-center gap-2 text-mint"><Spinner className="!size-3.5" /> Agent {status || 'starting'} · {secs}s</div>
              <div className="text-[#8f8c83]">  browsing the Medicare Coverage Database and reading the policy</div>
              <div className="text-[#8f8c83]">  usually 1–3 minutes <span className="caret text-mint">▍</span></div>
            </div>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <div role="alert" className="rounded-md border border-line border-l-[3px] border-l-rose-600 bg-paper px-4 py-3">
            <div className="eyebrow !text-rose-700">Agent stopped</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-200">{err}</p>
          </div>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border-t border-line px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <Badge tone="violet">{result.policy_id}</Badge>
            <span className="font-serif text-[17px] font-medium tracking-[-0.015em] text-ink-100">{result.title}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {result.effective_date && <Badge tone="gray">effective {result.effective_date}</Badge>}
            <Badge tone="amber">agent-sourced · verify before filing</Badge>
            {result.source_url && <a href={result.source_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 rounded-[2px] font-mono text-[11.5px] text-ink-100 underline decoration-mint-deep/50 underline-offset-4 hover:decoration-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep">source <ExternalLink className="size-3" /></a>}
          </div>
          <div className="mt-4">
            <div className="eyebrow mb-1.5 !text-[10px]">Coverage criteria · {result.criteria.length}</div>
            <ol className="divide-y divide-line border-y border-line">
              {result.criteria.map((cr, i) => (
                <li key={i} className="grid gap-1 py-3 sm:grid-cols-[2.75rem_minmax(0,13rem)_minmax(0,1fr)] sm:gap-4">
                  <span className="font-mono text-[11px] tabular-nums text-ink-400">C{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[13px] font-medium leading-snug text-ink-100">{cr.label}</span>
                  <span className="line-clamp-4 font-serif text-[13.5px] italic leading-relaxed text-ink-300">“{cr.quote}”</span>
                </li>
              ))}
            </ol>
          </div>
          {result.notes && <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400"><span className="eyebrow mr-2 inline !text-[10px]">Agent notes</span>{result.notes}</p>}
          <Button className="mt-4" variant="success" icon={<Play className="size-4" />} onClick={use} disabled={!result.criteria.length}>Use this policy and continue</Button>
        </motion.div>
      )}
    </Card>
  )
}
