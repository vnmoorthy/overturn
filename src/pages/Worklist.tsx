// Denial worklist — the billing team's command center. Every open Medicare Advantage
// denial ranked by expected recovery (billed amount x public IMR overturn rate),
// with appeal clocks, outcome tracking, and a payer playbook that learns from results.
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, Plus, RotateCcw, Search, SearchX, X } from 'lucide-react'
import type { CaseFile } from '../lib/types'
import { SEEDS, caseStore, newBlankCase, seedById, useCases } from '../lib/store'
import { navigate } from '../lib/router'
import { audit } from '../lib/audit'
import { imr } from '../lib/imr'
import { Button, Card, cx, toast, type Tone } from '../ui/kit'
import {
  DEFAULT_DIR, FILTERS, buildPlaybook, computeKpis, deriveRow, playbookInsights, sortRows, usd,
  type FilterKey, type Row, type SortDir, type SortKey,
} from './worklist/model'
import { CaseTable, type RowActions } from './worklist/CaseTable'
import { KpiStrip, LostModal, Playbook, ResetModal } from './worklist/parts'

const LAST_CASE = 'overturn_last_case'
const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: 'ev', dir: 'desc' }

function logAudit(action: string, caseId: string | null, payload: Record<string, unknown>) {
  audit('biller', action, caseId, payload).catch(() => undefined)
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function Worklist(_props: { id?: string }) {
  const cases = useCases()
  const rows = useMemo(() => cases.map(deriveRow), [cases])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [resetOpen, setResetOpen] = useState(false)
  const [lostRow, setLostRow] = useState<Row | null>(null)
  const [lostOpen, setLostOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  // "/" focuses search, like every serious ops tool.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const kpis = useMemo(() => computeKpis(rows), [rows])
  const counts = useMemo(() => FILTERS.map(f => rows.filter(r => f.match(r.c.status)).length), [rows])
  const shown = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter) || FILTERS[0]
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const list = rows.filter(r => {
      if (!f.match(r.c.status)) return false
      if (!terms.length) return true
      const hay = [r.name, r.service, r.plan, r.brand, r.familyShort, r.familyId, r.c.denial?.member_name, r.c.denial?.payer].filter(Boolean).join(' ').toLowerCase()
      return terms.every(t => hay.includes(t))
    })
    return sortRows(list, sort.key, sort.dir)
  }, [rows, filter, q, sort])
  const playbook = useMemo(() => buildPlaybook(rows), [rows])
  const insights = useMemo(() => playbookInsights(playbook), [playbook])

  const shownBilled = shown.reduce((s, r) => s + (r.closed ? 0 : r.amount), 0)
  const shownEv = shown.reduce((s, r) => s + r.ev, 0)
  const data = imr()

  const onSort = (k: SortKey) => setSort(s => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: DEFAULT_DIR[k] }))
  const clearFilters = () => { setFilter('all'); setQ('') }
  const scrollToTable = () => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // ------------------------------------------------------------ actions
  const openCase = (id: string) => {
    try { localStorage.setItem(LAST_CASE, id) } catch { /* private mode */ }
    navigate(`/case/${id}`)
  }

  const newDenial = () => {
    const c = newBlankCase()
    caseStore.create(c)
    logAudit('case.create', c.id, { source: 'worklist' })
    toast('New denial created — add the letter and chart to start the analysis.', 'violet')
    openCase(c.id)
  }

  const doReset = () => {
    caseStore.resetAll()
    try {
      const last = localStorage.getItem(LAST_CASE)
      if (last && !seedById(last)) localStorage.removeItem(LAST_CASE)
    } catch { /* ignore */ }
    logAudit('worklist.reset', null, { cases: SEEDS.length })
    setResetOpen(false)
    clearFilters()
    setSort(DEFAULT_SORT)
    toast(`Demo data restored — ${SEEDS.length} denials back in the queue.`, 'violet')
  }

  const setOutcome = (r: Row, patch: Partial<CaseFile>, msg: string, tone: Tone) => {
    caseStore.update(r.id, patch)
    logAudit('case.outcome', r.id, {
      status: patch.status, outcome: patch.outcome ?? null, outcomeNote: patch.outcomeNote ?? null,
      previous: r.c.status, payer: r.brand, plan: r.plan, policy: r.familyId, amount: r.amount,
    })
    toast(msg, tone)
  }

  const actions: RowActions = {
    open: r => openCase(r.id),
    submit: r => setOutcome(r, { status: 'submitted', outcome: null },
      r.days !== null && r.days >= 0
        ? `Filed with ${r.brand} — ${plural(r.days, 'day')} ahead of the deadline.`
        : `Marked submitted with ${r.brand}.`, 'cyan'),
    won: r => setOutcome(r, { status: 'won', outcome: 'won', outcomeNote: undefined },
      `Overturned — ${usd(r.amount)} recovered from ${r.brand}.`, 'green'),
    lost: r => { setLostRow(r); setLostOpen(true) },
    reopen: r => setOutcome(r, { status: 'submitted', outcome: null, outcomeNote: undefined },
      `Outcome cleared — ${r.name} is back to awaiting a decision.`, 'gray'),
  }

  const confirmLost = (reason: string) => {
    if (!lostRow) return
    setOutcome(lostRow, { status: 'lost', outcome: 'lost', outcomeNote: reason },
      `Loss recorded — the ${lostRow.brand} playbook now knows why.`, 'red')
    setLostOpen(false)
  }

  const focusPayer = (brand: string) => { setFilter('all'); setQ(brand); scrollToTable() }

  // Empty-playbook call to action: point at whatever gets an outcome recorded fastest.
  const awaiting = counts[FILTERS.findIndex(f => f.key === 'filed')]
  const demo = rows.find(r => r.c.hero && !r.filed) || rows.find(r => r.c.hero)
  const playbookAction = awaiting > 0
    ? <Button size="sm" variant="outline" onClick={() => { setQ(''); setFilter('filed'); scrollToTable() }}>Show {plural(awaiting, 'case')} awaiting a decision</Button>
    : demo
      ? <Button size="sm" variant="outline" icon={<ArrowUpRight className="size-3.5" />} onClick={() => openCase(demo.id)}>Work {demo.name.split(' ')[0]}’s demo case</Button>
      : null

  return (
    <div className="space-y-7">
      {/* ---------------------------------------------------------- header */}
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col gap-6 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="eyebrow mb-4 flex items-center gap-2.5">
            <span aria-hidden className="size-[7px] bg-mint" />
            <span>Denial worklist</span>
            <span aria-hidden className="h-px w-8 bg-line-strong" />
            <span className="tabular-nums">{plural(rows.length, 'case')}</span>
          </div>
          <h1 className="font-serif text-[34px] font-medium leading-[1.04] tracking-[-0.035em] text-ink-100 sm:text-[46px]">
            Every denial, <span className="text-gradient">ranked by what it’s worth.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-300">
            Medicare Advantage medical-necessity denials, prioritized by expected recovery — billed amount × how often independent reviewers
            overturn that service — with every 65-day reconsideration clock (<span className="whitespace-nowrap font-mono text-[13px] text-ink-200">42 CFR § 422.582</span>) in view.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>Reset demo data</Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={newDenial}>New denial</Button>
        </div>
      </motion.header>

      {/* ------------------------------------------------------------- KPIs */}
      <KpiStrip k={kpis} />

      {/* ------------------------------------------------------------ table */}
      <motion.div ref={tableRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35 }} className="scroll-mt-20">
        <Card className="overflow-hidden">
          <div className="flex flex-col border-b border-line md:flex-row md:items-stretch md:justify-between">
            <div role="group" aria-label="Filter by status" className="scrollbar-thin flex overflow-x-auto px-2 sm:px-3">
              {FILTERS.map((f, i) => {
                const active = filter === f.key
                return (
                  <button key={f.key} type="button" aria-pressed={active} onClick={() => setFilter(f.key)}
                    className={cx('relative flex h-12 shrink-0 items-center gap-2 px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors cursor-pointer sm:px-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-mint-deep',
                      active ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100')}>
                    <span>{f.label}</span>
                    <span className={cx('min-w-[20px] rounded-[3px] border px-1 text-center text-[10.5px] leading-[16px] tabular-nums tracking-normal transition-colors',
                      active ? 'border-ink-100 bg-ink-100 text-paper' : 'border-line text-ink-400')}>{counts[i]}</span>
                    {active && <motion.span layoutId="wl-filter" className="absolute inset-x-2.5 bottom-0 h-[2px] bg-ink-100 sm:inset-x-3" transition={{ type: 'spring', damping: 32, stiffness: 420 }} />}
                  </button>
                )
              })}
            </div>
            <div className="border-t border-line px-4 py-2.5 md:flex md:w-80 md:shrink-0 md:items-center md:border-t-0 md:py-0 md:pl-3 md:pr-4 lg:w-[22rem]">
              <label className="relative flex w-full items-center">
                <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-400" />
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQ(''); e.currentTarget.blur() } }}
                  type="text" placeholder="Search patient, payer or policy" aria-label="Search cases by patient, payer or policy"
                  className="h-8 w-full rounded-[4px] border border-line bg-paper pl-8 pr-9 text-[13px] text-ink-100 placeholder:text-ink-400 outline-none transition-[border-color,box-shadow,background-color] hover:border-line-strong focus:border-ink-100 focus:bg-paper-high focus:shadow-[0_0_0_3px_rgba(47,206,150,0.2)]" />
                {q
                  ? <button type="button" onClick={() => { setQ(''); searchRef.current?.focus() }} aria-label="Clear search" className="absolute right-1.5 rounded-[3px] p-1 text-ink-400 hover:bg-paper-low hover:text-ink-100 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-deep"><X className="size-3.5" /></button>
                  : <kbd className="pointer-events-none absolute right-2 rounded-[3px] border border-line bg-paper-high px-1.5 font-mono text-[10.5px] leading-[16px] text-ink-400">/</kbd>}
              </label>
            </div>
          </div>

          <CaseTable rows={shown} sort={sort} onSort={onSort} actions={actions}
            empty={
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-md border border-line bg-paper p-3 text-ink-300"><SearchX className="size-5" /></div>
                <div className="font-serif text-[18px] font-medium tracking-[-0.015em] text-ink-100">No denials match {q ? `“${q}”` : 'this filter'}</div>
                <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-400">Try another payer or patient name, or clear the filters to see the full queue.</p>
                <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
              </div>
            } />

          <div className="flex flex-col gap-2 border-t border-line bg-paper px-4 py-3.5 sm:px-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <span className="shrink-0 font-mono text-[11px] uppercase leading-5 tracking-[0.08em] text-ink-400">
              Showing <span className="text-ink-100 tabular-nums">{shown.length}</span> of <span className="tabular-nums">{rows.length}</span> denials
              {shownBilled > 0 && <> · <span className="tabular-nums">{usd(shownBilled)}</span> open · <span className="text-ink-100 tabular-nums">{usd(shownEv)} expected</span></>}
            </span>
            {data && (
              <p className="text-[12px] leading-relaxed text-ink-400 lg:max-w-[58%] lg:text-right">
                Historical odds = share of {data.total_cases.toLocaleString('en-US')} California DMHC independent medical reviews ({data.year_range[0]}–{data.year_range[1]}) that overturned the plan for that service. A directional signal, not a prediction.{' '}
                <a href={data.source_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-0.5 font-medium text-ink-200 underline decoration-line-strong underline-offset-[3px] hover:text-ink-100 hover:decoration-ink-100">Source<ArrowUpRight className="size-3" /></a>
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* --------------------------------------------------------- playbook */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.35 }}>
        <Playbook cells={playbook} insights={insights} emptyAction={playbookAction} onFocusPayer={focusPayer} />
      </motion.div>

      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={doReset} count={SEEDS.length} />
      <LostModal row={lostRow} open={lostOpen} onClose={() => setLostOpen(false)} onConfirm={confirmLost} />
    </div>
  )
}
