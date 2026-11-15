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
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [secs, setSecs] = useState(0)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<ScoutResult | null>(null)
  const [err, setErr] = useState('')
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
    <Card className="p-5" glow={state === 'running'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-violet-400/30 bg-violet-500/15 p-2.5"><Bot className="size-5 text-violet-200" /></div>
          <div>
            <div className="text-[15px] font-semibold">Not in the policy library — send the Antigravity agent</div>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-300">
              Google’s Antigravity managed agent researches the CMS Medicare Coverage Database for the LCD or NCD that governs <b className="text-ink-100">{c.denial?.service_description}</b>, and returns its coverage criteria. Overturn can then continue the appeal on that policy — labeled agent-sourced until you verify it.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelChip model={ANTIGRAVITY_AGENT} />
          {state === 'running'
            ? <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={() => { cancel.current.cancelled = true; setState('idle') }}>Cancel</Button>
            : <Button size="sm" variant="primary" icon={<Bot className="size-4" />} onClick={start} disabled={!c.denial}>{state === 'done' ? 'Research again' : 'Research with Antigravity'}</Button>}
        </div>
      </div>

      {state === 'running' && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-4 py-3 text-[13px] text-violet-100">
          <Spinner /> Agent {status || 'starting'} · {secs}s — browsing the Medicare Coverage Database and reading the policy (usually 1–3 minutes)
        </div>
      )}
      {state === 'error' && <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-100">{err}</div>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="violet">{result.policy_id}</Badge>
            <span className="text-[14px] font-semibold">{result.title}</span>
            {result.effective_date && <Badge tone="gray">effective {result.effective_date}</Badge>}
            <Badge tone="amber">agent-sourced · verify before filing</Badge>
            {result.source_url && <a href={result.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-cyan-200 hover:underline">source <ExternalLink className="size-3" /></a>}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {result.criteria.map((cr, i) => (
              <div key={i} className="rounded-lg border border-white/8 bg-black/20 p-3">
                <div className="text-[12.5px] font-semibold text-ink-100">{cr.label}</div>
                <div className="mt-1 line-clamp-4 text-[12px] italic leading-relaxed text-ink-300">“{cr.quote}”</div>
              </div>
            ))}
          </div>
          {result.notes && <p className="text-[12px] text-ink-400">Agent notes: {result.notes}</p>}
          <Button variant="success" icon={<Play className="size-4" />} onClick={use} disabled={!result.criteria.length}>Use this policy and continue</Button>
        </motion.div>
      )}
    </Card>
  )
}
