import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Clock, FileStack, Gavel, HeartPulse, History, Inbox, Mic, PenLine, Play, RotateCcw, ScanSearch, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useCase, caseStore, seedById } from '../lib/store'
import { navigate, useRoute } from '../lib/router'
import { caseContext, computeFlags, docsMatchSeed, resetSteps, rowIsVerified, runCase, savedRun, useSteps } from '../lib/engine'
import { draftLetter, policyText } from '../lib/pipeline'
import { appealDeadline, fmtDate } from '../lib/rules'
import { verifyQuote } from '../lib/verifier'
import { friendlyError } from '../lib/gemini'
import { audit } from '../lib/audit'
import { Badge, Button, Card, EmptyState, Field, cx, toast } from '../ui/kit'
import { PipelineRail } from './workspace/Rail'
import { InputsPanel } from './workspace/Inputs'
import { EvidenceBoard } from './workspace/Evidence'
import { FlagsPanel } from './workspace/Flags'
import { LetterPanel } from './workspace/Letter'
import { PatientPanel } from './workspace/Patient'
import { OddsCard } from './workspace/Odds'
import { TimeTravelModal } from './workspace/TimeTravel'

type Tab = 'evidence' | 'findings' | 'letter' | 'patient' | 'inputs'

export default function Workspace({ id }: { id?: string }) {
  const caseId = id || 'maria-cgm'
  const c = useCase(caseId)
  const route = useRoute()
  const { steps, running } = useSteps(caseId)
  const [tab, setTab] = useState<Tab>('inputs')
  const [tt, setTT] = useState(false)
  const [stamp, setStamp] = useState(false)
  const [redrafting, setRedrafting] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const autoRan = useRef('')

  useEffect(() => { try { localStorage.setItem('overturn_last_case', caseId) } catch { /* ignore */ } }, [caseId])
  useEffect(() => { if (c) setTab(c.match ? 'evidence' : 'inputs') }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps
  const hadMatch = useRef(!!c?.match)
  useEffect(() => {
    if (c?.match && !hadMatch.current) setTab('evidence')
    hadMatch.current = !!c?.match
  }, [c?.match])

  const { family, effective } = useMemo(() => (c ? caseContext(c) : { family: null, effective: null }), [c])
  const flags = useMemo(() => (c ? computeFlags(c) : []), [c])

  async function go(replay = false) {
    if (!c) return
    setStamp(false)
    setRunError(null)
    setTab('evidence')
    try {
      await runCase(c.id, { replay })
      const fresh = caseStore.get(c.id)!
      setStamp(true)
      setTimeout(() => setStamp(false), 3600)
      const fl = computeFlags(fresh)
      toast(`Appeal drafted · ${fl.filter(f => f.severity === 'violation').length} possible violations found`, 'green')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRunError(msg)
      toast(msg, 'red')
      if (!caseStore.get(c.id)?.match) setTab('inputs')
    }
  }

  useEffect(() => {
    const q = route.query.get('autorun')
    if (!c || !q || autoRan.current === c.id + q) return
    autoRan.current = c.id + q
    navigate(`/case/${c.id}`, { replace: true }) // drop ?autorun from history so Back never re-runs a case
    go(q === 'replay')
  }, [route.query, c]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <EmptyState icon={<Inbox className="size-6" />} title="Case not found" body="It may have been deleted. Open the worklist to pick another denial." action={<Button onClick={() => navigate('/cases')}>Open worklist</Button>} />

  const d = c.denial
  const seed = seedById(c.id)
  const dl = d ? appealDeadline(d) : null
  const rows = c.match?.rows || []
  const verifiedCount = effective ? rows.filter(r => r.status === 'met' && rowIsVerified(c, r, effective)).length : 0
  const violations = flags.filter(f => f.severity === 'violation').length
  const quoteCount = effective ? rows.filter(r => rowIsVerified(c, r, effective)).reduce((n, r) => n + 1 + (r.status === 'met' && r.chart_quote ? 1 : 0), 0) : 0
  const hasSaved = docsMatchSeed(c)

  async function redraft() {
    if (!c || !d || !effective) return
    setRedrafting(true)
    try {
      const r = await draftLetter({ denial: d, effective, rows: rows.filter(x => verifyQuote(x.policy_quote, policyText(effective)).status === 'verified'), flags: flags.filter(f => f.severity !== 'info' || f.id === 'ma-bound'), providerName: d.provider_name })
      caseStore.update(c.id, { letter: r.value, signedBy: null, status: 'ready' })
      await audit(r.model, 'letter.draft', c.id, { redraft: true })
      toast('New draft ready — verification re-ran.', 'green')
    } catch (e) { toast(friendlyError(e), 'red') } finally { setRedrafting(false) }
  }

  const TABS: { key: Tab; label: string; icon: typeof ScanSearch; badge?: string; disabled?: boolean }[] = [
    { key: 'evidence', label: 'Evidence', icon: ScanSearch, badge: rows.length ? `${verifiedCount}/${rows.length}` : undefined, disabled: !c.match && !running },
    { key: 'findings', label: 'Findings', icon: Gavel, badge: violations ? String(violations) : undefined, disabled: !c.match },
    { key: 'letter', label: 'Appeal letter', icon: PenLine, disabled: !c.letter },
    { key: 'patient', label: 'Patient view', icon: HeartPulse, disabled: !c.match },
    { key: 'inputs', label: 'Documents', icon: FileStack },
  ]

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[22rem]">
          <button onClick={() => navigate('/cases')} className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100 cursor-pointer"><ArrowLeft className="size-3.5" /> Worklist</button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{d?.member_name || c.title.split(' — ')[0]}</h1>
            {c.hero && <Badge tone="violet">Demo case</Badge>}
            <Badge tone={c.status === 'ready' ? 'violet' : c.status === 'signed' ? 'amber' : c.status === 'won' ? 'green' : c.status === 'lost' ? 'red' : c.status === 'analyzing' ? 'cyan' : 'gray'}>{c.status}</Badge>
          </div>
          <div className="mt-1 line-clamp-2 text-[14px] text-ink-300">{d?.service_description || c.title.split(' — ')[1] || 'Upload a denial to begin'}{d ? ` · ${d.plan_name}` : seed ? ` · ${seed.payer}` : ''}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {hasSaved && <Button variant="outline" icon={<Zap className="size-4 text-amber-300" />} onClick={() => go(true)} disabled={running} title="Replays a genuine recorded Gemini run instantly (labeled cached)">Instant replay</Button>}
          <Button variant="primary" icon={running ? undefined : <Play className="size-4" />} loading={running} onClick={() => go(false)} disabled={running || (!c.denialText && !c.denialFile) || !c.chartText}>{c.match ? 'Re-run live' : 'Run Overturn'}</Button>
          <Button variant="subtle" icon={<Mic className="size-4" />} onClick={() => navigate(`/rehearse/${c.id}`)}>Rehearse P2P</Button>
          {seed && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { caseStore.resetCase(c.id); resetSteps(c.id); setRunError(null); setTab('inputs'); toast('Case reset to the original documents.', 'gray') }} disabled={running}>Reset</Button>}
        </div>
      </div>

      {/* key facts */}
      {d && (
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Plan type">{d.plan_type}</Field>
          <Field label="Codes">{d.codes.filter(x => x.system !== 'ICD-10' && x.system !== 'CARC').map(x => x.code).join(', ') || '—'}</Field>
          <Field label="Date of service">{fmtDate(d.date_of_service)}</Field>
          <Field label="Amount">{d.billed_amount ? `$${d.billed_amount.toLocaleString()}` : seed ? `$${seed.amount.toLocaleString()}` : '—'}</Field>
          <Field label="Governing policy">
            {family && effective ? <button onClick={() => setTT(true)} className="flex items-center gap-1 text-cyan-200 hover:underline cursor-pointer"><History className="size-3.5" /> {family.id} · {effective.version_label}</button> : '—'}
          </Field>
          <Field label="Appeal deadline">
            {dl && <span className={cx('flex items-center gap-1', dl.days < 14 ? 'text-amber-200' : 'text-ink-100')}><Clock className="size-3.5" /> {fmtDate(dl.due)} · {dl.days}d</span>}
          </Field>
        </Card>
      )}

      <PipelineRail steps={steps} />

      {runError && !running && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-100">
          <span><b>Run stopped:</b> {runError}</span>
          <div className="flex gap-2">
            {savedRun(c.id) && <Button size="sm" variant="outline" onClick={() => go(true)}>Instant replay instead</Button>}
            <Button size="sm" variant="subtle" onClick={() => go(false)}>Retry</Button>
            <Button size="sm" variant="ghost" onClick={() => setRunError(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* appeal-ready banner */}
      <AnimatePresence>
        {c.letter && c.match && !running && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/[0.12] via-cyan-500/[0.06] to-violet-500/[0.1] px-5 py-3.5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-6 shrink-0 text-emerald-300" />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink-100">Appeal ready for review</div>
                <div className="text-[12.5px] text-ink-300">{verifiedCount}/{rows.length} criteria met &amp; verified · {quoteCount} quotes verified · <span className="text-rose-200">{violations} possible violation{violations === 1 ? '' : 's'}</span>{c.match.summary ? ` · ${c.match.summary.slice(0, 120)}${c.match.summary.length > 120 ? '…' : ''}` : ''}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTab('findings')}>See findings</Button>
              <Button size="sm" variant="success" onClick={() => setTab('letter')}>Review letter</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* tabs */}
      <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.02] p-1">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} disabled={t.disabled} onClick={() => setTab(t.key)}
              className={cx('relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35', tab === t.key ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100')}>
              {tab === t.key && <motion.span layoutId="ws-tab" className="absolute inset-0 rounded-xl bg-white/[0.08]" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
              <Icon className="relative size-4" /><span className="relative">{t.label}</span>
              {t.badge && <span className={cx('relative rounded-md px-1.5 text-[11px] font-mono', t.key === 'findings' ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-400/15 text-emerald-200')}>{t.badge}</span>}
            </button>
          )
        })}
      </div>

      <div>
        {running && !c.match && <RunningPlaceholder running />}
        {tab === 'inputs' && !(running && !c.match) && <InputsPanel c={c} onRun={() => go(false)} running={running} />}
        {tab === 'evidence' && (c.match && effective && family ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <DenialCard c={c} familyId={family.id} onTimeTravel={() => setTT(true)} />
              <OddsCard c={c} family={family} />
            </div>
            <EvidenceBoard c={c} effective={effective} />
          </div>
        ) : !running && <RunningPlaceholder running={false} />)}
        {tab === 'findings' && c.match && <FlagsPanel flags={flags} />}
        {tab === 'letter' && c.letter && effective && <LetterPanel c={c} effective={effective} onRedraft={redraft} redrafting={redrafting} />}
        {tab === 'patient' && c.match && d && <PatientPanel c={c} flags={flags} />}
      </div>

      {family && <TimeTravelModal open={tt} onClose={() => setTT(false)} family={family} effectiveLabel={c.versionLabel}
        citedIds={(c.match?.denial_mappings || []).filter(m => m.maps_to_version && m.maps_to_criterion).map(m => `${m.maps_to_version}/${m.maps_to_criterion}`)} />}

      <AnimatePresence>
        {stamp && (
          <motion.div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 2.4, rotate: -18, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', damping: 13, stiffness: 180 }}
              className="rounded-3xl border-[5px] border-emerald-300 bg-ink-950/70 px-10 py-6 text-center shadow-[0_0_120px_rgba(52,211,153,.45)] backdrop-blur">
              <div className="text-[44px] font-black uppercase leading-none tracking-[0.12em] text-emerald-300 sm:text-[60px]">Overturn it</div>
              <div className="mt-3 font-mono text-[14px] tracking-wider text-emerald-100">{quoteCount} QUOTES VERIFIED · {violations} VIOLATIONS FOUND</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RunningPlaceholder({ running }: { running: boolean }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-ink-300"><Sparkles className="size-4 text-violet-300" />{running ? 'Gemini is reading the denial, the policy and the chart…' : 'Run Overturn to build the evidence board.'}</div>
      <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className={cx('h-20 rounded-xl', running ? 'shimmer' : 'bg-white/[0.03]')} />)}</div>
    </Card>
  )
}

function DenialCard({ c, familyId, onTimeTravel }: { c: NonNullable<ReturnType<typeof useCase>>; familyId: string; onTimeTravel: () => void }) {
  const d = c.denial!
  const maps = c.match?.denial_mappings || []
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">What the plan said</div>
        <Button size="sm" variant="outline" icon={<History className="size-3.5 text-violet-300" />} onClick={onTimeTravel}>Policy time-travel</Button>
      </div>
      <blockquote className="border-l-2 border-rose-400/60 pl-3 text-[13.5px] italic leading-relaxed text-ink-200">“{d.denial_reason_text}”</blockquote>
      <div className="mt-3 space-y-1.5">
        {maps.map((m, i) => {
          const retired = m.maps_to_version && m.maps_to_version !== c.versionLabel
          const none = !m.maps_to_criterion
          return (
            <div key={i} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-white/6 bg-black/20 px-3 py-2">
              <span className="min-w-0 flex-1 basis-[16rem] text-[12.5px] text-ink-300">“{m.requirement_quote}”</span>
              {retired ? <Badge tone="red">only in {familyId} {m.maps_to_version} — retired</Badge> : none ? <Badge tone="red">not in any version of {familyId}</Badge> : <Badge tone="amber">in current {familyId} · {m.maps_to_criterion}</Badge>}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {!d.specific_criterion_cited && <Badge tone="amber">no specific policy cited</Badge>}
        {!d.reviewer_credentials_stated && <Badge tone="amber">reviewer credentials not stated</Badge>}
        {d.codes.map(x => <Badge key={x.system + x.code} tone="gray">{x.system} {x.code}</Badge>)}
      </div>
    </Card>
  )
}
