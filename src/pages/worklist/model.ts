// Derived, display-ready view of every case in the worklist, plus the payer
// playbook aggregation. Pure functions — no React, no side effects.
import type { CaseFile, CaseStatus } from '../../lib/types'
import type { Tone } from '../../ui/kit'
import { seedById } from '../../lib/store'
import { familyById } from '../../lib/policies'
import { overturnRate } from '../../lib/imr'
import { addDays, appealDeadline } from '../../lib/rules'

export const MA_WINDOW_DAYS = 65

export interface Row {
  c: CaseFile
  id: string
  name: string
  service: string
  plan: string // full plan name as written on the notice
  brand: string // normalized payer brand used for grouping
  hook: string | null // demo-case one-liner
  familyId: string | null
  familyShort: string | null
  amount: number
  due: Date | null
  days: number | null
  windowDays: number
  filed: boolean // submitted, won or lost
  closed: boolean // won or lost
  odds: { rate: number; n: number; label: string }
  ev: number // remaining expected value: amount x historical overturn rate (0 once closed)
}

export const STATUS_META: Record<CaseStatus, { label: string; tone: Tone; order: number }> = {
  new: { label: 'New', tone: 'gray', order: 0 },
  analyzing: { label: 'Analyzing', tone: 'cyan', order: 1 },
  ready: { label: 'Ready to sign', tone: 'violet', order: 2 },
  signed: { label: 'Signed', tone: 'amber', order: 3 },
  submitted: { label: 'Submitted', tone: 'cyan', order: 4 },
  won: { label: 'Won', tone: 'green', order: 5 },
  lost: { label: 'Lost', tone: 'red', order: 6 },
}

export type FilterKey = 'all' | 'new' | 'ready' | 'filed' | 'won' | 'lost'
export const FILTERS: { key: FilterKey; label: string; match: (s: CaseStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'new', label: 'New', match: s => s === 'new' || s === 'analyzing' },
  { key: 'ready', label: 'Ready', match: s => s === 'ready' },
  { key: 'filed', label: 'Signed / Submitted', match: s => s === 'signed' || s === 'submitted' },
  { key: 'won', label: 'Won', match: s => s === 'won' },
  { key: 'lost', label: 'Lost', match: s => s === 'lost' },
]

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
export const pct = (r: number) => `${Math.round(r * 100)}%`

function titleCase(s: string) { return s.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()) }

/** "Evergreen Medicare Advantage PPO" -> "Evergreen"; "SUNRISE HEALTH PLAN" -> "Sunrise". */
export function payerBrand(raw: string | null | undefined): string {
  const s = (raw || '').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return 'Unknown plan'
  const m = s.match(/^(.*?)\s+(?:Medicare|Senior|Healthcare|Health|Care)\b/i)
  const brand = (m?.[1] || s).trim()
  return brand === brand.toUpperCase() ? titleCase(brand) : brand
}

function noonToday() { const d = new Date(); d.setHours(12, 0, 0, 0); return d }

export function deriveRow(c: CaseFile): Row {
  const seed = seedById(c.id)
  const d = c.denial
  const [namePart, ...rest] = c.title.split(' — ')
  const rawService = rest.join(' — ') || d?.service_description || ''
  const service = rawService.charAt(0).toUpperCase() + rawService.slice(1)
  const plan = seed?.payer || d?.plan_name || d?.payer || ''
  const familyId = c.familyId || seed?.familyId || null
  const family = familyById(familyId)
  const amount = d?.billed_amount ?? seed?.amount ?? 0

  let due: Date | null = null
  let windowDays = MA_WINDOW_DAYS
  if (d && (d.notice_date || d.date_of_service)) {
    const dl = appealDeadline(d)
    due = dl.due
    windowDays = d.plan_type === 'Medicare Advantage' ? MA_WINDOW_DAYS : 180
  } else if (seed?.noticeDate) {
    due = addDays(seed.noticeDate, MA_WINDOW_DAYS)
  }
  if (due && isNaN(due.getTime())) due = null
  const days = due ? Math.round((due.getTime() - noonToday().getTime()) / 86_400_000) : null

  const closed = c.status === 'won' || c.status === 'lost'
  const filed = closed || c.status === 'submitted'
  const odds = overturnRate(family?.segment)

  return {
    c, id: c.id,
    name: namePart || 'New denial',
    service,
    plan,
    brand: payerBrand(plan),
    hook: c.hero && seed?.subtitle && seed.subtitle !== plan ? seed.subtitle : null,
    familyId,
    familyShort: family?.short || null,
    amount,
    due, days, windowDays,
    filed, closed,
    odds,
    ev: closed ? 0 : amount * odds.rate,
  }
}

// ------------------------------------------------------------------ sorting
export type SortKey = 'patient' | 'policy' | 'amount' | 'deadline' | 'status' | 'odds' | 'ev'
export type SortDir = 'asc' | 'desc'
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  patient: 'asc', policy: 'asc', amount: 'desc', deadline: 'asc', status: 'asc', odds: 'desc', ev: 'desc',
}

function sortValue(r: Row, k: SortKey): number | string {
  switch (k) {
    case 'patient': return r.name.toLowerCase()
    case 'policy': return (r.familyShort || '~').toLowerCase()
    case 'amount': return r.amount
    case 'deadline': return r.filed || r.days === null ? Number.MAX_SAFE_INTEGER : r.days
    case 'status': return STATUS_META[r.c.status]?.order ?? 99
    case 'odds': return r.odds.rate
    case 'ev': return r.closed ? -1 : r.ev
  }
}

export function sortRows(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key), vb = sortValue(b, key)
    const r = va < vb ? -1 : va > vb ? 1 : 0
    if (r !== 0) return r * sign
    return b.ev - a.ev || a.name.localeCompare(b.name)
  })
}

// ------------------------------------------------------------------- KPIs
export interface Kpis {
  appealable: number; openCount: number; urgent: number
  expected: number
  recovered: number; wonCount: number
  filed: number; awaiting: number
  winRate: number | null; lostCount: number
}

export function computeKpis(rows: Row[]): Kpis {
  const open = rows.filter(r => !r.closed)
  const won = rows.filter(r => r.c.status === 'won')
  const lost = rows.filter(r => r.c.status === 'lost')
  return {
    appealable: open.reduce((s, r) => s + r.amount, 0),
    openCount: open.length,
    urgent: open.filter(r => !r.filed && r.days !== null && r.days < 14).length,
    expected: open.reduce((s, r) => s + r.ev, 0),
    recovered: won.reduce((s, r) => s + r.amount, 0),
    wonCount: won.length,
    filed: rows.filter(r => r.filed).length,
    awaiting: rows.filter(r => r.c.status === 'submitted').length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    lostCount: lost.length,
  }
}

// -------------------------------------------------------------- playbook
export interface PlayCell {
  key: string
  brand: string
  plans: string[]
  familyId: string | null
  familyShort: string
  won: number
  lost: number
  total: number
  winRate: number
  lastLost: { reason: string; name: string; at: number } | null
  openCount: number
  openEv: number
}

export function buildPlaybook(rows: Row[]): PlayCell[] {
  const map = new Map<string, PlayCell>()
  const keyOf = (r: Row) => `${r.brand}|${r.familyId || 'none'}`
  for (const r of rows) {
    if (!r.closed) continue
    const k = keyOf(r)
    let cell = map.get(k)
    if (!cell) {
      cell = { key: k, brand: r.brand, plans: [], familyId: r.familyId, familyShort: r.familyShort || 'Unrouted policy', won: 0, lost: 0, total: 0, winRate: 0, lastLost: null, openCount: 0, openEv: 0 }
      map.set(k, cell)
    }
    if (r.plan && !cell.plans.includes(r.plan)) cell.plans.push(r.plan)
    if (r.c.status === 'won') cell.won++
    else {
      cell.lost++
      const at = r.c.updatedAt
      if (!cell.lastLost || at > cell.lastLost.at) cell.lastLost = { reason: (r.c.outcomeNote || '').trim(), name: r.name, at }
    }
  }
  for (const r of rows) {
    if (r.closed) continue
    const cell = map.get(keyOf(r))
    if (cell) { cell.openCount++; cell.openEv += r.ev }
  }
  return [...map.values()]
    .map(c => ({ ...c, total: c.won + c.lost, winRate: c.won / Math.max(1, c.won + c.lost) }))
    .sort((a, b) => b.total - a.total || b.lost - a.lost || a.brand.localeCompare(b.brand))
}

export interface Insight { tone: 'red' | 'green'; text: string; brand: string }

export function playbookInsights(cells: PlayCell[]): Insight[] {
  const out: Insight[] = []
  const worst = cells.filter(c => c.lost > 0).sort((a, b) => a.winRate - b.winRate || b.lost - a.lost)[0]
  if (worst) {
    const reason = worst.lastLost?.reason
    const open = worst.openCount ? ` ${worst.openCount} more ${worst.familyShort} ${worst.openCount === 1 ? 'case' : 'cases'} with ${worst.brand} still in queue — pre-empt it in the letter.` : ''
    out.push({
      tone: 'red', brand: worst.brand,
      text: `${worst.brand} upheld ${worst.lost} of ${worst.total} ${worst.familyShort} ${worst.total === 1 ? 'denial' : 'denials'} on appeal${reason ? ` — latest reason: “${reason}”.` : '.'}${open}`,
    })
  }
  const best = cells.filter(c => c.won > 0 && c.winRate >= 0.5 && c.key !== worst?.key).sort((a, b) => b.won - a.won || b.winRate - a.winRate)[0]
  if (best) {
    const open = best.openCount ? ` ${best.openCount} open ${best.familyShort} ${best.openCount === 1 ? 'case' : 'cases'} with ${best.brand} worth ${usd(best.openEv)} expected — work ${best.openCount === 1 ? 'it' : 'them'} next.` : ''
    out.push({
      tone: 'green', brand: best.brand,
      text: `${best.brand} reversed ${best.won} of ${best.total} ${best.familyShort} ${best.total === 1 ? 'denial' : 'denials'} on appeal.${open}`,
    })
  }
  return out
}

/** Quick-pick loss reasons, tuned to the policy family. */
export function lossSuggestions(familyId: string | null): string[] {
  const byFamily: Record<string, string[]> = {
    L33822: [
      'Plan still required 4+ daily fingersticks (criterion CMS retired in 2021)',
      'Plan still required 3+ daily insulin injections (criterion CMS retired in 2023)',
      'Reviewer found no documented problematic hypoglycemia',
    ],
    L33718: [
      'Plan applied AHI ≥ 15 and ignored the AHI 5–14 + symptoms pathway',
      'Reviewer said the face-to-face evaluation was not documented',
      'Reviewer rejected the home sleep test interpretation',
    ],
    L38801: [
      'Plan upheld its 6-month pain duration requirement',
      'Plan upheld its 12-week physical therapy requirement',
      'Reviewer said imaging did not support facet-mediated pain',
    ],
  }
  return [
    ...(familyId && byFamily[familyId] ? byFamily[familyId] : []),
    'Upheld without citing a specific policy criterion',
    'Dismissed: filed after the 65-day window',
  ]
}
