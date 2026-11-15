// Audit trail: the append-only, SHA-256 hash-chained record of every AI step and human decision.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown, Clock, Download, FilterX, FlaskConical, Fingerprint, History, RotateCcw, ShieldAlert, ShieldCheck,
  ShieldQuestion, Trash2,
} from 'lucide-react'
import { clearAudit, loadAudit, onAudit, resealChain, simulateTamper, verifyChain, type AuditEntry } from '../lib/audit'
import { navigate } from '../lib/router'
import { useCases } from '../lib/store'
import { Button, Card, EmptyState, cx, toast } from '../ui/kit'
import { AuditRow, GenesisNode, KIND, type Below } from './audit/AuditRow'
import { AnimatedNumber, ConfirmDialog, CopyButton, useNow } from './audit/bits'
import { VerifyBanner, type BannerState } from './audit/VerifyBanner'
import {
  GENESIS, absTime, actionPrefix, actorKind, downloadJson, fingerprint, linkState, loadVerify, relTime, rowState,
  saveVerify, shortHash, sortPrefixes, type ActorKind, type ChainView, type VerifyRecord,
} from './audit/utils'

const PAGE = 60
const NO_CASE = '__none__'

function useAuditLog(): AuditEntry[] {
  const [entries, setEntries] = useState<AuditEntry[]>(() => loadAudit())
  useEffect(() => {
    const refresh = () => setEntries(loadAudit())
    const off = onAudit(refresh)
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith('overturn_audit')) refresh() }
    window.addEventListener('storage', onStorage)
    return () => { off(); window.removeEventListener('storage', onStorage) }
  }, [])
  return entries
}

export default function Audit(_props: { id?: string }) {
  const entries = useAuditLog()
  const cases = useCases()
  const now = useNow(15_000)

  const [record, setRecord] = useState<VerifyRecord | null>(() => loadVerify())
  const [scan, setScan] = useState<{ upTo: number; done: number; total: number } | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [tamperedSeq, setTamperedSeq] = useState<number | null>(null)
  const [prefix, setPrefix] = useState<string>('all')
  const [caseFilter, setCaseFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [limit, setLimit] = useState(PAGE)
  const [confirmClear, setConfirmClear] = useState(false)
  const [resealing, setResealing] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const fp = useMemo(() => fingerprint(entries), [entries])
  const fresh = !!record && record.fp === fp
  const contentsBreak = !!record && !record.ok && !(record.reason || '').startsWith('prevHash')
  const view: ChainView = scan ? { mode: 'scan', upTo: scan.upTo }
    : fresh && record ? { mode: 'report', ok: record.ok, brokenAt: record.brokenAt, contents: contentsBreak }
    : { mode: 'idle' }

  const newest = useMemo(() => [...entries].reverse(), [entries])
  const caseTitles = useMemo(() => new Map(cases.map(c => [c.id, c.title])), [cases])

  const prefixes = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) { const p = actionPrefix(e.action); m.set(p, (m.get(p) || 0) + 1) }
    return sortPrefixes([...m.keys()]).map(p => ({ p, n: m.get(p)! }))
  }, [entries])
  const caseOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) { const k = e.caseId ?? NO_CASE; m.set(k, (m.get(k) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [entries])
  const kinds = useMemo(() => {
    const c: Record<ActorKind, number> = { ai: 0, verifier: 0, human: 0, rules: 0, system: 0 }
    for (const e of entries) c[actorKind(e.actor)]++
    return c
  }, [entries])

  const filtered = useMemo(() => newest.filter(e =>
    (prefix === 'all' || actionPrefix(e.action) === prefix) &&
    (caseFilter === 'all' || (caseFilter === NO_CASE ? e.caseId == null : e.caseId === caseFilter))), [newest, prefix, caseFilter])
  const visible = filtered.slice(0, limit)
  const filtersOn = prefix !== 'all' || caseFilter !== 'all'
  const head = entries[entries.length - 1]

  const onToggle = useCallback((seq: number) => {
    setExpanded(s => { const n = new Set(s); if (n.has(seq)) n.delete(seq); else n.add(seq); return n })
  }, [])

  const reveal = useCallback((seq: number, scroll = true) => {
    setPrefix('all'); setCaseFilter('all')
    const pos = newest.findIndex(e => e.seq === seq)
    if (pos >= 0) setLimit(l => Math.max(l, pos + 10))
    setExpanded(s => new Set(s).add(seq))
    if (scroll) setTimeout(() => document.getElementById(`audit-row-${seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }, [newest])
  const bannerRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------- actions
  const verify = async () => {
    const snap = loadAudit()
    if (!snap.length || scan) return
    setShowBanner(true)
    setScan({ upTo: snap[0].seq, done: 0, total: snap.length })
    setTimeout(() => bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30)
    const t0 = performance.now()
    const rep = await verifyChain(snap)
    const ms = performance.now() - t0
    // Visual sweep up the rail, oldest → newest, stopping at the break.
    const stop = rep.ok ? snap.length - 1 : Math.max(0, snap.findIndex(e => e.seq === rep.brokenAt))
    const duration = Math.min(1800, Math.max(700, 400 + (stop + 1) * 22))
    // Timer-driven (not rAF) so it still finishes if the tab is in the background.
    await new Promise<void>(resolve => {
      const start = performance.now()
      let lastIdx = -1
      const tick = () => {
        if (!alive.current) return resolve()
        const p = Math.min(1, (performance.now() - start) / duration)
        const idx = Math.round((1 - Math.pow(1 - p, 2)) * stop)
        if (idx !== lastIdx) { lastIdx = idx; setScan({ upTo: snap[idx].seq, done: idx + 1, total: snap.length }) }
        if (p < 1) setTimeout(tick, 16); else resolve()
      }
      tick()
    })
    if (!alive.current) return
    const rec: VerifyRecord = { ...rep, at: Date.now(), ms, total: snap.length, fp: fingerprint(snap) }
    saveVerify(rec)
    setRecord(rec)
    setScan(null)
    setTamperedSeq(null)
    if (!rep.ok && rep.brokenAt != null) reveal(rep.brokenAt, false)
  }

  const tamper = () => {
    const k = simulateTamper()
    if (k == null) { toast('Need at least two entries before there is history to tamper with.', 'amber'); return }
    setTamperedSeq(k)
    setShowBanner(true)
    toast(`Entry #${k} was silently edited in browser storage. Now click Verify chain.`, 'amber')
  }

  const reseal = async () => {
    setResealing(true)
    try {
      await resealChain()
      saveVerify(null); setRecord(null); setTamperedSeq(null); setShowBanner(false)
      toast('Chain re-signed from genesis. Run Verify chain to confirm it is intact.', 'green')
    } catch { toast('Could not reseal the chain in this browser.', 'red') }
    finally { setResealing(false) }
  }

  const exportJson = () => {
    const all = loadAudit()
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
    downloadJson(`overturn-audit-${stamp}.json`, all)
    toast(`Exported ${all.length.toLocaleString()} entries with their hashes.`, 'green')
  }

  const clearLog = () => {
    clearAudit()
    saveVerify(null); setRecord(null); setTamperedSeq(null); setShowBanner(false); setExpanded(new Set()); setLimit(PAGE)
    setConfirmClear(false)
    toast('Audit log cleared from this browser.', 'gray')
  }

  // ---------------------------------------------------------------- banner
  let banner: BannerState | null = null
  if (scan) banner = { kind: 'scan', done: scan.done, total: scan.total }
  else if (tamperedSeq != null && !fresh) banner = { kind: 'tamper', seq: tamperedSeq }
  else if (showBanner && fresh && record) banner = record.ok ? { kind: 'ok', record, head: head?.hash || GENESIS } : { kind: 'broken', record }

  // ---------------------------------------------------------------- status
  type Status = { label: string; tone: string; icon: typeof ShieldCheck; sub: string }
  const status: Status = !entries.length ? { label: 'No entries', tone: 'text-ink-300', icon: ShieldQuestion, sub: 'Nothing to verify yet' }
    : scan ? { label: 'Verifying…', tone: 'text-teal-800', icon: ShieldCheck, sub: `${scan.done} of ${scan.total} checked` }
    : fresh && record?.ok ? { label: 'Intact', tone: 'text-emerald-700', icon: ShieldCheck, sub: `All ${record.checked.toLocaleString()} hashes match` }
    : fresh && record ? { label: 'Tampered', tone: 'text-rose-700', icon: ShieldAlert, sub: `Break at entry #${record.brokenAt}` }
    : record ? { label: 'Unverified', tone: 'text-amber-800', icon: ShieldQuestion, sub: entries.length > record.total && tamperedSeq == null ? `${(entries.length - record.total).toLocaleString()} new since last check` : 'Log changed since last check' }
    : { label: 'Unverified', tone: 'text-amber-800', icon: ShieldQuestion, sub: 'Run Verify chain' }

  const lastIdx = filtered.length - 1
  const hasMore = filtered.length > visible.length
  const showGenesis = !hasMore && visible.length > 0 && visible[visible.length - 1].prevHash === GENESIS && !filtersOn

  return (
    <div className="space-y-6">
      {/* header */}
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-4xl">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Audit trail</div>
        <h1 className="text-[28px] font-semibold leading-[1.12] tracking-tight text-ink-100 sm:text-[36px]">
          Every AI step and every human decision, <span className="font-display text-[1.12em] font-normal italic text-gradient">hash-chained</span>
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-300">
          Each entry is sealed with a SHA-256 hash that covers its own contents plus the previous entry's hash. Change one word in any past entry and its hash stops matching, which breaks every link after it, so edited history is detectable. That record of what the AI proposed, what a person approved, and when is your False Claims Act defense for every appeal you file.
        </p>
        <div className="mt-3 inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-lg border border-line/70 bg-black/[0.02] px-3 py-1.5 font-mono text-[11.5px] text-ink-300 scrollbar-thin">
          <Fingerprint className="size-3.5 shrink-0 text-ink-200" />
          <span className="whitespace-nowrap">hash<sub>n</sub> = SHA-256( seq, time, actor, action, case, payload, <span className="text-ink-200">hash<sub>n−1</sub></span> )</span>
        </div>
      </motion.header>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat delay={0} label="Entries" icon={<History className="size-4 text-ink-200" />}
          value={<AnimatedNumber value={entries.length} />}
          sub={entries.length ? `${kinds.ai} AI · ${kinds.verifier} verifier · ${kinds.human} human · ${kinds.rules + kinds.system} system` : 'Nothing recorded yet'} />
        <Stat delay={0.05} label="Head hash" icon={<Fingerprint className="size-4 text-teal-700" />}
          value={<span className="flex items-center gap-1 font-mono text-[17px] sm:text-[19px]">{head ? shortHash(head.hash, 6, 4) : '—'}{head && <CopyButton text={head.hash} label="Copy head hash" />}</span>}
          sub={head ? `Latest entry #${head.seq} · anchor this to prove the past` : 'Appears with the first entry'} />
        <Stat delay={0.1} label="Last verified" icon={<Clock className="size-4 text-emerald-700" />}
          value={<span title={record ? absTime(record.at) : undefined}>{record ? relTime(record.at, now) : 'Never'}</span>}
          sub={record ? `${record.total.toLocaleString()} entries · ${record.ms < 1 ? '<1' : record.ms.toFixed(0)} ms` : 'Run Verify chain to check'} />
        <Stat delay={0.15} label="Chain status" icon={<status.icon className={cx('size-4', status.tone)} />}
          value={<span className={status.tone}>{status.label}</span>} sub={status.sub}
          className={fresh && record && !record.ok && !scan ? 'border-rose-600/40 bg-rose-500/[0.07]' : fresh && record?.ok && !scan ? 'border-emerald-600/25' : undefined} />
      </div>

      {/* toolbar */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative inline-flex">
            {tamperedSeq != null && !scan && !fresh && (
              <motion.span aria-hidden className="pointer-events-none absolute -inset-1 rounded-[14px] border-2 border-line-strong"
                animate={{ opacity: [0.9, 0], scale: [1, 1.08] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }} />
            )}
            <Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={verify} loading={!!scan} disabled={!entries.length}>Verify chain</Button>
          </span>
          <Button variant="outline" icon={<FlaskConical className="size-4 text-amber-700" />} onClick={tamper} disabled={entries.length < 2 || !!scan}
            title="Silently edit one past entry in browser storage, without updating its hash">Simulate tamper</Button>
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reseal} loading={resealing} disabled={!entries.length || !!scan}
            title="Demo only: re-sign every entry from genesis">Reseal (demo reset)</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Button variant="subtle" icon={<Download className="size-4" />} onClick={exportJson} disabled={!entries.length}>Export JSON</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmClear(true)} disabled={!entries.length || !!scan}>Clear log</Button>
        </div>
      </Card>

      <div ref={bannerRef} className="scroll-mt-24 empty:hidden">
      <AnimatePresence mode="wait">
        {banner && (
          <VerifyBanner key={banner.kind} state={banner} resealing={resealing}
            onClose={() => { setShowBanner(false); setTamperedSeq(null) }}
            onJump={seq => reveal(seq)} onReseal={reseal} onVerify={verify} />
        )}
      </AnimatePresence>
      </div>

      {/* list */}
      {!entries.length ? (
        <EmptyState icon={<History className="size-6" />} title="Run a case to start the trail"
          body="Every Gemini step, verifier check, rules flag, and human sign-off on a case is appended here and sealed into the chain the moment it happens."
          action={<Button variant="primary" onClick={() => navigate('/cases')}>Open the denial worklist</Button>} />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <div className="text-[15px] font-semibold text-ink-100">Live log</div>
              <div className="text-[13px] text-ink-400">
                {filtersOn ? `${filtered.length.toLocaleString()} of ${entries.length.toLocaleString()} entries` : `${entries.length.toLocaleString()} entries`} · newest first
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select value={caseFilter} onChange={e => { setCaseFilter(e.target.value); setLimit(PAGE) }} aria-label="Filter by case"
                  className="h-8 max-w-[240px] cursor-pointer appearance-none truncate rounded-lg border border-line bg-black/[0.045] pl-3 pr-8 text-[13px] text-ink-100 outline-none transition-colors hover:bg-black/[0.06] focus:border-line-strong">
                  <option value="all" className="bg-ink-900">All cases</option>
                  {caseOptions.map(([id, n]) => (
                    <option key={id} value={id} className="bg-ink-900">{id === NO_CASE ? 'No case (global)' : caseTitles.get(id) || id} ({n})</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
              </div>
              {filtersOn && <Button size="sm" variant="ghost" icon={<FilterX className="size-3.5" />} onClick={() => { setPrefix('all'); setCaseFilter('all') }}>Clear filters</Button>}
            </div>
          </div>

          <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by action">
            {[{ p: 'all', n: entries.length }, ...prefixes].map(({ p, n }) => {
              const active = prefix === p
              return (
                <button key={p} role="tab" aria-selected={active} onClick={() => { setPrefix(p); setLimit(PAGE) }}
                  className={cx('relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] transition-colors cursor-pointer', active ? 'text-ink-100' : 'text-ink-400 hover:bg-black/[0.03] hover:text-ink-100')}>
                  {active && <motion.span layoutId="audit-prefix" className="absolute inset-0 rounded-lg border border-line bg-black/[0.045]" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
                  <span className={cx('relative', p !== 'all' && 'font-mono')}>{p === 'all' ? 'All actions' : p}</span>
                  <span className="relative rounded bg-black/[0.045] px-1 font-mono text-[10.5px] text-ink-400">{n}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink-400">
            {(['ai', 'verifier', 'human', 'rules', 'system'] as ActorKind[]).filter(k => kinds[k] > 0).map(k => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cx('grid size-4 place-items-center rounded border', KIND[k].node)}>{KIND[k].icon('size-2.5')}</span>{KIND[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-emerald-500" />verified link</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-rose-500" />broken link</span>
          </div>

          {!filtered.length ? (
            <EmptyState icon={<FilterX className="size-6" />} title="No entries match these filters" body="Try another action or case, or clear the filters to see the whole chain."
              action={<Button size="sm" onClick={() => { setPrefix('all'); setCaseFilter('all') }}>Clear filters</Button>} />
          ) : (
            <ol className="relative">
              <AnimatePresence initial={false}>
                {visible.map((e, i) => {
                  const older = visible[i + 1]
                  let below: Below
                  if (older) below = older.seq === e.seq - 1
                    ? { kind: 'link', state: linkState(e.seq, view), olderSeq: older.seq, contents: contentsBreak }
                    : { kind: 'gap', hidden: e.seq - older.seq - 1 }
                  else if (i < lastIdx) below = { kind: 'more' }
                  else if (e.prevHash === GENESIS && !filtersOn) below = { kind: 'genesis', state: linkState(e.seq, view) }
                  else below = { kind: 'end' }
                  return (
                    <motion.div key={e.seq} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.28, delay: Math.min(i, 10) * 0.02 }}>
                      <AuditRow entry={e} state={rowState(e.seq, view)} below={below} expanded={expanded.has(e.seq)} onToggle={onToggle}
                        caseTitle={e.caseId ? caseTitles.get(e.caseId) || null : null} now={now} contentsBreak={contentsBreak} />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {showGenesis && <GenesisNode ok={view.mode === 'report' ? view.ok : false} />}
            </ol>
          )}

          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" icon={<ChevronDown className="size-3.5" />} onClick={() => setLimit(l => l + PAGE * 2)}>
                Show {Math.min(PAGE * 2, filtered.length - visible.length).toLocaleString()} older ({(filtered.length - visible.length).toLocaleString()} remaining)
              </Button>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={clearLog} title="Clear the audit log?" confirmLabel="Delete all entries"
        icon={<Trash2 className="size-5" />}
        extra={<Button variant="subtle" icon={<Download className="size-4" />} onClick={exportJson}>Export first</Button>}>
        <p>This permanently deletes all <span className="font-semibold text-ink-100">{entries.length.toLocaleString()}</span> entries from this browser. It cannot be undone.</p>
        <p className="text-ink-400">In production an audit log is never cleared; this exists so you can restart the demo. Export a JSON copy first if you want to keep it.</p>
      </ConfirmDialog>
    </div>
  )
}

function Stat({ label, value, sub, icon, delay, className }: { label: string; value: ReactNode; sub: string; icon: ReactNode; delay: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}
      className={cx('glass min-w-0 rounded-lg p-4 transition-colors duration-300', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</div>
        {icon}
      </div>
      <div className="mt-2 truncate text-[22px] font-semibold tracking-tight text-ink-100 sm:text-[26px]">{value}</div>
      <div className="mt-1 truncate text-[12px] text-ink-400" title={sub}>{sub}</div>
    </motion.div>
  )
}
