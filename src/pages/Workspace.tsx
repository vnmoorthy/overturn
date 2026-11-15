import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Clock, FileStack, Gavel, HeartPulse, History, Inbox, Mic, PenLine, Play, RotateCcw, ScanSearch, ShieldCheck, Zap } from 'lucide-react'
import { useCase, caseStore, seedById } from '../lib/store'
import { navigate, useRoute } from '../lib/router'
import { caseContext, computeFlags, docsMatchSeed, resetSteps, rowIsVerified, runCase, savedRun, useSteps } from '../lib/engine'
import { draftLetter, policyText } from '../lib/pipeline'
import { appealDeadline, fmtDate } from '../lib/rules'
import { verifyQuote } from '../lib/verifier'
import { friendlyError } from '../lib/gemini'
import { audit } from '../lib/audit'
import { Badge, Button, Card, EmptyState, cx, toast, type Tone } from '../ui/kit'
import { PipelineRail } from './workspace/Rail'
import { InputsPanel } from './workspace/Inputs'
import { EvidenceBoard } from './workspace/Evidence'
import { FlagsPanel } from './workspace/Flags'
import { LetterPanel } from './workspace/Letter'
import { PatientPanel } from './workspace/Patient'
import { OddsCard } from './workspace/Odds'
import { TimeTravelModal } from './workspace/TimeTravel'
import { PolicyScout } from './workspace/Scout'

type Tab = 'evidence' | 'findings' | 'letter' | 'patient' | 'inputs'

// A raised sheet of paper. Used instead of the kit Card where a status left-rule is needed
// (the .glass class sets the border shorthand, which would override a border-l-* utility).
const SHEET = 'rounded-lg border border-line bg-paper-high shadow-[0_1px_0_rgba(20,20,20,0.02),0_1px_2px_rgba(20,20,20,0.03)]'
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep'

/** One cell of the case ledger: mono label over a value, hairline on the left. */
function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 border-l border-t border-line px-4 py-3 sm:px-5 sm:py-3.5">
      <dt className="eyebrow !text-[10px]">{label}</dt>
      <dd className={cx('mt-1.5 truncate text-ink-100', mono ? 'font-mono text-[13px]' : 'text-[14px]')}>{children}</dd>
    </div>
  )
}

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
      const nv = fl.filter(f => f.severity === 'violation').length
      toast(`Appeal drafted · ${nv} possible violation${nv === 1 ? '' : 's'} found`, 'green')
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

  const statusTone: Tone = c.status === 'ready' ? 'violet' : c.status === 'signed' ? 'amber' : c.status === 'won' ? 'green' : c.status === 'lost' ? 'red' : 'gray'

  return (
    <div className="space-y-6">
      {/* header */}
      <header>
        <button onClick={() => navigate('/cases')} className={cx('group mb-5 inline-flex items-center gap-1.5 rounded-[3px] font-mono text-[10.5px] font-medium uppercase tracking-[0.13em] text-ink-400 transition-colors hover:text-ink-100 cursor-pointer', FOCUS)}>
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" /> Worklist
        </button>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1.5">Case · {c.id}</span>
          {c.hero && <Badge tone="gray">Demo case</Badge>}
          <Badge tone={statusTone} icon={<span className={cx('size-1.5 rounded-full bg-current', c.status === 'analyzing' && 'animate-pulse')} />}>{c.status}</Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <h1 className="order-1 min-w-0 font-serif text-[30px] font-medium leading-[1.05] tracking-[-0.03em] text-ink-100 sm:text-[34px]">{d?.member_name || c.title.split(' — ')[0]}</h1>
          <p className="order-2 line-clamp-2 basis-full text-[14.5px] leading-relaxed text-ink-300 xl:order-3 xl:-mt-1">{d?.service_description || c.title.split(' — ')[1] || 'Upload a denial to begin'}{d ? ` · ${d.plan_name}` : seed ? ` · ${seed.payer}` : ''}</p>
          <div className="order-3 mt-2 grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center xl:order-2 xl:mt-0 xl:justify-end">
            {hasSaved && <Button variant="outline" icon={<Zap className="size-4 text-ink-300" />} onClick={() => go(true)} disabled={running} title="Replays a genuine recorded Gemini run instantly (labeled cached)">Instant replay</Button>}
            <Button variant="primary" icon={running ? undefined : <Play className="size-4" />} loading={running} onClick={() => go(false)} disabled={running || (!c.denialText && !c.denialFile) || !c.chartText}>{c.match ? 'Re-run live' : 'Run Overturn'}</Button>
            <Button variant="outline" icon={<Mic className="size-4" />} onClick={() => navigate(`/rehearse/${c.id}`)}>Rehearse P2P</Button>
            {seed && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { caseStore.resetCase(c.id); resetSteps(c.id); setRunError(null); setTab('inputs'); toast('Case reset to the original documents.', 'gray') }} disabled={running}>Reset</Button>}
          </div>
        </div>

        {/* key facts — a single ledger row */}
        {d && (
          <div className="mt-6 overflow-hidden border-y border-line">
            <dl className="-ml-px -mt-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[1.15fr_0.9fr_1fr_0.75fr_1.25fr_1.25fr]">
              <Fact label="Plan type">{d.plan_type}</Fact>
              <Fact label="Codes" mono>{d.codes.filter(x => x.system !== 'ICD-10' && x.system !== 'CARC').map(x => x.code).join(', ') || '—'}</Fact>
              <Fact label="Date of service">{fmtDate(d.date_of_service)}</Fact>
              <Fact label="Amount"><span className="tabular-nums">{d.billed_amount ? `$${d.billed_amount.toLocaleString()}` : seed ? `$${seed.amount.toLocaleString()}` : '—'}</span></Fact>
              <Fact label="Governing policy">
                {family && effective
                  ? <button onClick={() => setTT(true)} title="Open policy time-travel" className={cx('group inline-flex max-w-full items-center gap-1.5 rounded-[2px] font-mono text-[13px] text-ink-100 cursor-pointer', FOCUS)}>
                    <History className="size-3.5 shrink-0 text-mint-deep" /><span className="truncate underline decoration-mint-deep/60 decoration-1 underline-offset-[5px] transition-colors group-hover:decoration-ink-100">{family.id} · {effective.version_label}</span>
                  </button>
                  : '—'}
              </Fact>
              <Fact label="Appeal deadline">
                {dl && <span className={cx('inline-flex items-center gap-1.5', dl.days < 14 ? 'text-amber-800' : 'text-ink-100')}><Clock className="size-3.5 shrink-0" /> {fmtDate(dl.due)} <span className="font-mono text-[12px] tabular-nums text-ink-400">· {dl.days}d</span></span>}
              </Fact>
            </dl>
          </div>
        )}
      </header>

      <PipelineRail steps={steps} />

      {d && !family && !running && <PolicyScout c={c} onUse={() => go(false)} />}

      {runError && !running && (
        <div role="alert" className={cx(SHEET, 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-l-[3px] border-l-rose-600 px-5 py-3.5')}>
          <div className="min-w-0 flex-1 basis-[20rem]">
            <div className="eyebrow !text-rose-700">Run stopped</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-200">{runError}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedRun(c.id) && <Button size="sm" variant="outline" onClick={() => go(true)}>Instant replay instead</Button>}
            <Button size="sm" variant="subtle" onClick={() => go(false)}>Retry</Button>
            <Button size="sm" variant="ghost" onClick={() => setRunError(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* appeal-ready banner */}
      <AnimatePresence>
        {c.letter && c.match && !running && (
          <motion.section aria-label="Appeal status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cx(SHEET, 'border-l-[3px] border-l-mint')}>
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0 flex-1 basis-[26rem]">
                <div className="eyebrow flex items-center gap-1.5 !text-mint-deep"><ShieldCheck className="size-3.5" /> Draft complete</div>
                <h2 className="mt-1.5 font-serif text-[22px] font-medium leading-tight tracking-[-0.02em] text-ink-100">Appeal ready for review</h2>
                <div className="mt-2.5 flex flex-col gap-1 font-mono text-[11.5px] text-ink-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                  <span><span className="font-medium text-ink-100 tabular-nums">{verifiedCount}/{rows.length}</span> criteria met &amp; verified</span>
                  <span aria-hidden className="hidden h-3 w-px bg-line-strong sm:block" />
                  <span><span className="font-medium text-ink-100 tabular-nums">{quoteCount}</span> quotes verified</span>
                  <span aria-hidden className="hidden h-3 w-px bg-line-strong sm:block" />
                  <span className="text-rose-700"><span className="font-medium tabular-nums">{violations}</span> possible violation{violations === 1 ? '' : 's'}</span>
                </div>
                {c.match.summary && <p className="mt-2.5 line-clamp-2 max-w-4xl text-[13.5px] leading-relaxed text-ink-300">{`${c.match.summary.slice(0, 120)}${c.match.summary.length > 120 ? '…' : ''}`}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setTab('findings')}>See findings</Button>
                <Button size="sm" variant="primary" onClick={() => setTab('letter')}>Review letter <ArrowRight className="size-3.5" /></Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* tabs */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-full min-w-max gap-6 border-b border-line sm:gap-7">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button key={t.key} disabled={t.disabled} onClick={() => setTab(t.key)} aria-current={active ? 'page' : undefined}
                className={cx('relative -mb-px flex shrink-0 items-center gap-2 rounded-t-[2px] pb-3 pt-1 text-[13.5px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40', FOCUS,
                  active ? 'font-medium text-ink-100' : 'text-ink-400 hover:text-ink-100')}>
                <Icon className={cx('size-3.5', active ? 'text-ink-100' : 'text-ink-400')} />
                <span>{t.label}</span>
                {t.badge && <span className={cx('rounded-[3px] px-1 py-px font-mono text-[10.5px] font-medium tabular-nums', t.key === 'findings' ? 'bg-rose-50 text-rose-700' : 'bg-mint-pale text-[#0b6b4a]')}>{t.badge}</span>}
                {active && <motion.span layoutId="ws-tab" className="absolute inset-x-0 -bottom-px h-[2px] bg-ink-100" transition={{ type: 'spring', damping: 32, stiffness: 420 }} />}
              </button>
            )
          })}
        </div>
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
          <motion.div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 2.2, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', damping: 14, stiffness: 190 }}
              className="rounded-md border-[3px] border-mint-deep bg-paper-high/95 p-1.5 shadow-[0_30px_70px_-28px_rgba(20,20,20,0.45)]">
              <div className="rounded-[3px] border border-mint-deep/50 px-8 py-5 text-center sm:px-12 sm:py-7">
                <div className="eyebrow !text-mint-deep">Overturn · verified draft</div>
                <div className="mt-2 font-serif text-[46px] font-medium italic leading-none tracking-[-0.035em] text-mint-deep sm:text-[64px]">Overturn it</div>
                <div className="mt-4 border-t border-mint-deep/30 pt-3 font-mono text-[12px] tracking-[0.14em] text-mint-ink sm:text-[13px]">{quoteCount} QUOTES VERIFIED · {violations} VIOLATION{violations === 1 ? '' : 'S'} FOUND</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RunningPlaceholder({ running }: { running: boolean }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2.5">
        {running
          ? <span className="relative flex size-2 shrink-0"><span className="absolute -inset-[3px] animate-ping rounded-full bg-ink-100/25 motion-reduce:animate-none" /><span className="relative size-2 rounded-full bg-ink-100" /></span>
          : <ScanSearch className="size-4 shrink-0 text-ink-400" />}
        <span className="text-[13.5px] text-ink-300">{running ? 'Gemini is reading the denial, the policy and the chart…' : 'Run Overturn to build the evidence board.'}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-md border border-line/70 bg-paper-low/50 p-3.5">
            <div className={cx('h-2 w-10 rounded-[2px]', running ? 'shimmer' : 'bg-line/70')} />
            <div className={cx('mt-3 h-2.5 w-4/5 rounded-[2px]', running ? 'shimmer' : 'bg-line/50')} />
            <div className={cx('mt-2 h-2.5 w-3/5 rounded-[2px]', running ? 'shimmer' : 'bg-line/50')} />
          </div>
        ))}
      </div>
    </Card>
  )
}

function DenialCard({ c, familyId, onTimeTravel }: { c: NonNullable<ReturnType<typeof useCase>>; familyId: string; onTimeTravel: () => void }) {
  const d = c.denial!
  const maps = c.match?.denial_mappings || []
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <div className="eyebrow !text-[10px]">Denial reason · as written</div>
          <h3 className="mt-0.5 font-serif text-[18px] font-medium tracking-[-0.015em] text-ink-100">What the plan said</h3>
        </div>
        <Button size="sm" variant="outline" icon={<History className="size-3.5 text-ink-300" />} onClick={onTimeTravel}>Policy time-travel</Button>
      </div>
      <div className="p-5">
        <blockquote className="border-l-2 border-rose-400 pl-4 font-serif text-[15px] italic leading-[1.65] text-ink-200">“{d.denial_reason_text}”</blockquote>
        {maps.length > 0 && (
          <div className="mt-5">
            <div className="eyebrow mb-1.5 !text-[10px]">Cited requirement → where it lives in {familyId}</div>
            <ul className="divide-y divide-line border-y border-line">
              {maps.map((m, i) => {
                const retired = m.maps_to_version && m.maps_to_version !== c.versionLabel
                const none = !m.maps_to_criterion
                return (
                  <li key={i} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5">
                    <span className="min-w-0 flex-1 basis-[16rem] text-[13px] leading-relaxed text-ink-300">“{m.requirement_quote}”</span>
                    {retired ? <Badge tone="red">only in {familyId} {m.maps_to_version} — retired</Badge> : none ? <Badge tone="red">not in any version of {familyId}</Badge> : <Badge tone="amber">in current {familyId} · {m.maps_to_criterion}</Badge>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {!d.specific_criterion_cited && <Badge tone="amber">no specific policy cited</Badge>}
          {!d.reviewer_credentials_stated && <Badge tone="amber">reviewer credentials not stated</Badge>}
          {d.codes.map(x => <Badge key={x.system + x.code} tone="gray">{x.system} {x.code}</Badge>)}
        </div>
      </div>
    </Card>
  )
}
