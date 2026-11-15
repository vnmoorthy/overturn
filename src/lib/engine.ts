// Orchestrates the Overturn agent pipeline for one case:
// extract → locate → match → verify (two keys) → flags → draft.
// Persists results, writes the audit trail, and falls back to genuine saved runs
// for the demo cases when Gemini is rate-limited (clearly labeled "cached").

import { useEffect, useState } from 'react'
import { AllModelsFailed, getUseCache, friendlyError } from './gemini'
import * as P from './pipeline'
import { caseStore } from './store'
import { audit } from './audit'
import { familyById, getFamilies, versionOf } from './policies'
import { evaluate } from './rules'
import { verifyQuote } from './verifier'
import type { CaseFile, Entailment, Flag, MatchRow, PolicyFamily, PolicyVersion, TraceEntry } from './types'
import { pushTrace } from '../ui/TracePanel'

export type StepKey = 'extract' | 'locate' | 'match' | 'verify' | 'flags' | 'draft'
export const STEPS: { key: StepKey; label: string; blurb: string }[] = [
  { key: 'extract', label: 'Read denial', blurb: 'Multimodal extraction' },
  { key: 'locate', label: 'Find rulebook', blurb: 'Pin policy version on DOS' },
  { key: 'match', label: 'Match evidence', blurb: 'Long-context criteria match' },
  { key: 'verify', label: 'Two-key verify', blurb: 'Provenance + support' },
  { key: 'flags', label: 'Compliance', blurb: 'Deterministic rules' },
  { key: 'draft', label: 'Draft appeal', blurb: 'Token-cited letter' },
]
export interface StepState { status: 'idle' | 'running' | 'done' | 'error' | 'cached'; model?: string; ms?: number; error?: string; note?: string }
type Steps = Record<StepKey, StepState>
const blank = (): Steps => ({ extract: { status: 'idle' }, locate: { status: 'idle' }, match: { status: 'idle' }, verify: { status: 'idle' }, flags: { status: 'idle' }, draft: { status: 'idle' } })

// ------------------------------------------------------------- step state bus
const stepState = new Map<string, Steps>()
const running = new Set<string>()
const subs = new Set<() => void>()
function setStep(caseId: string, k: StepKey, s: StepState) {
  const cur = stepState.get(caseId) || blank()
  stepState.set(caseId, { ...cur, [k]: s })
  subs.forEach(f => f())
}
export function useSteps(caseId: string) {
  const [, setN] = useState(0)
  useEffect(() => { const f = () => setN(n => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return { steps: stepState.get(caseId) || blank(), running: running.has(caseId) }
}

// ------------------------------------------------------------------ saved runs
export interface SavedRun {
  extract?: { letter_transcript: string; denial: CaseFile['denial'] }
  match?: CaseFile['match']
  entail?: Entailment[]
  letter?: string
  explain?: Record<string, string>
  objections?: { objection: string; response: string; row_ids: string[] }[]
  models?: Record<string, string>
}
let saved: Record<string, SavedRun> = {}
try {
  const mods = import.meta.glob('../data/cached/*.json', { eager: true, import: 'default' }) as Record<string, SavedRun>
  for (const [path, v] of Object.entries(mods)) saved[path.split('/').pop()!.replace('.json', '')] = v
} catch { /* node */ }
export function setSavedRuns(s: Record<string, SavedRun>) { saved = s }
export function savedRun(caseId: string): SavedRun | null { return saved[caseId] || null }

async function liveOrSaved<T>(caseId: string, step: StepKey, task: string, live: () => Promise<{ value: T; model: string; ms: number }>, fallback: () => T | undefined, forceSaved = false): Promise<{ value: T; model: string; ms: number; cached: boolean }> {
  setStep(caseId, step, { status: 'running' })
  const fb = fallback()
  if (forceSaved && fb !== undefined) {
    await new Promise(r => setTimeout(r, 450 + Math.random() * 500))
    const model = saved[caseId]?.models?.[task] || 'saved run'
    const t: TraceEntry = { task, model, ms: 0, ok: true, cached: true, at: Date.now() }
    pushTrace(t)
    return { value: fb, model, ms: 0, cached: true }
  }
  try {
    const r = await live()
    return { ...r, cached: false }
  } catch (e) {
    if (fb !== undefined && getUseCache()) {
      const model = saved[caseId]?.models?.[task] || 'saved run'
      pushTrace({ task, model, ms: 0, ok: true, cached: true, at: Date.now(), error: e instanceof AllModelsFailed ? 'all models busy — using saved genuine run' : undefined })
      return { value: fb, model, ms: 0, cached: true }
    }
    throw e
  }
}

// ---------------------------------------------------------------- verification
export function rowKeys(row: MatchRow, policy: PolicyVersion | null, chartText: string) {
  const ptext = policy ? P.policyText(policy) : ''
  const k1p = verifyQuote(row.policy_quote, ptext)
  const k1c = row.chart_quote ? verifyQuote(row.chart_quote, chartText) : null
  return { k1p, k1c }
}
export function rowIsVerified(c: CaseFile, row: MatchRow, policy: PolicyVersion | null): boolean {
  const { k1p, k1c } = rowKeys(row, policy, c.chartText)
  if (k1p.status !== 'verified') return false
  if (row.status !== 'met') return true // unmet/missing rows only need the policy quote
  if (!k1c || k1c.status !== 'verified') return false
  const e = c.entailments?.find(x => x.row_id === row.id)
  return !!e && e.verdict === 'supports'
}

export function caseContext(c: CaseFile): { family: PolicyFamily | null; effective: PolicyVersion | null } {
  const family = familyById(c.familyId)
  const effective = family ? versionOf(family, c.versionLabel) : null
  return { family, effective }
}

export function computeFlags(c: CaseFile): Flag[] {
  const { family, effective } = caseContext(c)
  if (!c.denial || !family || !effective || !c.match) return []
  return evaluate({
    denial: c.denial, denialText: c.denialText, family, effective,
    mappings: c.match.denial_mappings, rows: c.match.rows, rowVerified: r => rowIsVerified(c, r, effective),
  })
}

// ---------------------------------------------------------------------- run
export async function runCase(caseId: string, opts: { replay?: boolean; from?: StepKey } = {}): Promise<void> {
  if (running.has(caseId)) return
  running.add(caseId)
  stepState.set(caseId, blank())
  subs.forEach(f => f())
  const forceSaved = !!opts.replay
  const sv = () => saved[caseId]
  try {
    let c = caseStore.get(caseId)!
    caseStore.update(caseId, { status: 'analyzing' })
    await audit('overturn', 'case.run', caseId, { mode: forceSaved ? 'replay' : 'live' })

    // 1 — extract (reuse a previous extraction if the letter text hasn't changed — retries start where they failed)
    const reuse = !forceSaved && c.denial && c.extractedText === c.denialText && !!c.denialText
    const ex = reuse
      ? { value: { letter_transcript: c.denialText, denial: c.denial }, model: 'previous extraction', ms: 0, cached: false }
      : await liveOrSaved(caseId, 'extract', 'extract',
      () => P.extractDenial(c.denialText ? { text: c.denialText } : c.denialFile ? { file: dataUrlToPart(c.denialFile.dataUrl) } : { text: '' }),
      () => (sv()?.extract as { letter_transcript: string; denial: NonNullable<CaseFile['denial']> } | undefined), forceSaved)
    const denial = ex.value.denial!
    const denialText = c.denialText || ex.value.letter_transcript
    caseStore.update(caseId, { denial, denialText, extractedText: denialText, title: c.hero || c.id.startsWith('wl-') ? c.title : `${denial.member_name || 'Patient'} — ${denial.service_description}`.slice(0, 80) })
    setStep(caseId, 'extract', { status: ex.cached ? 'cached' : 'done', model: ex.model, ms: ex.ms, note: `${denial.codes.length} codes · ${denial.cited_requirements.length} cited requirements` })
    await audit(ex.model, 'extract', caseId, { payer: denial.payer, plan_type: denial.plan_type, codes: denial.codes.map(x => x.code), cached: ex.cached })

    // 2 — locate
    setStep(caseId, 'locate', { status: 'running' })
    const t0 = performance.now()
    let family = P.locateByCode(denial, getFamilies()) || (c.hero || c.id.startsWith('wl-') ? familyById(c.familyId) : null)
    let locModel = 'code router'
    if (!family) {
      try {
        const r = await P.locateWithGemini(denial, getFamilies())
        family = familyById(r.value.policy_id)
        locModel = r.model
      } catch { /* fall through */ }
    }
    if (!family) throw new Error('No matching coverage policy in the library for this service. Supported today: CGM (L33822), PAP for sleep apnea (L33718), facet joint interventions (L38801).')
    const effective = P.effectiveVersion(family, denial.date_of_service)
    caseStore.update(caseId, { familyId: family.id, versionLabel: effective.version_label })
    setStep(caseId, 'locate', { status: 'done', model: locModel, ms: Math.round(performance.now() - t0), note: `${family.id} · in effect ${effective.effective_date}` })
    await audit('overturn', 'locate', caseId, { policy: family.id, version: effective.version_label, effective_date: effective.effective_date, dos: denial.date_of_service })

    // 3 — match
    c = caseStore.get(caseId)!
    const mt = await liveOrSaved(caseId, 'match', 'match',
      () => P.matchCriteria({ denial, denialText, family: family!, effective, chartText: c.chartText }),
      () => sv()?.match || undefined, forceSaved)
    caseStore.update(caseId, { match: mt.value, confirmed: {}, entailments: null })
    setStep(caseId, 'match', { status: mt.cached ? 'cached' : 'done', model: mt.model, ms: mt.ms, note: `${mt.value!.rows.length} criteria` })
    await audit(mt.model, 'match', caseId, { rows: mt.value!.rows.map(r => ({ id: r.criterion_id, status: r.status })), cached: mt.cached })

    // 4 — verify: key 1 (deterministic) + key 2 (entailment)
    const rows = mt.value!.rows
    const k1 = rows.map(r => rowKeys(r, effective, c.chartText))
    const k1ok = k1.filter(k => k.k1p.status === 'verified' && (!k.k1c || k.k1c.status === 'verified')).length
    await audit('verifier', 'verify.provenance', caseId, { checked: rows.length, verified: k1ok })
    const en = await liveOrSaved(caseId, 'verify', 'entail',
      async () => { const r = await P.entail({ rows, chartText: c.chartText, denial }); return r },
      () => sv()?.entail, forceSaved)
    caseStore.update(caseId, { entailments: en.value })
    const supports = en.value.filter(e => e.verdict === 'supports').length
    setStep(caseId, 'verify', { status: en.cached ? 'cached' : 'done', model: en.model, ms: en.ms, note: `key 1: ${k1ok}/${rows.length} · key 2: ${supports}/${en.value.length}` })
    await audit(en.model, 'verify.support', caseId, { results: en.value.map(e => `${e.row_id}:${e.verdict}`), cached: en.cached })

    // 5 — flags
    setStep(caseId, 'flags', { status: 'running' })
    const flags = computeFlags(caseStore.get(caseId)!)
    await new Promise(r => setTimeout(r, 300))
    setStep(caseId, 'flags', { status: 'done', model: 'rules engine', ms: 3, note: `${flags.filter(f => f.severity === 'violation').length} violations` })
    await audit('rules', 'flags', caseId, { flags: flags.map(f => f.id) })

    // 6 — draft
    const verifiedRows = rows.filter(r => k1[rows.indexOf(r)].k1p.status === 'verified')
    const dr = await liveOrSaved(caseId, 'draft', 'letter',
      () => P.draftLetter({ denial, effective, rows: verifiedRows, flags: flags.filter(f => f.severity !== 'info' || f.id === 'ma-bound'), providerName: denial.provider_name }),
      () => sv()?.letter, forceSaved)
    caseStore.update(caseId, { letter: dr.value, status: 'ready' })
    setStep(caseId, 'draft', { status: dr.cached ? 'cached' : 'done', model: dr.model, ms: dr.ms, note: `${(dr.value.match(/\[\[Q:/g) || []).length} cited quotes` })
    await audit(dr.model, 'letter.draft', caseId, { tokens: (dr.value.match(/\[\[Q:[^\]]+\]\]/g) || []), cached: dr.cached })
  } catch (e) {
    const msg = friendlyError(e)
    const st = stepState.get(caseId) || blank()
    const k = (Object.keys(st) as StepKey[]).find(x => st[x].status === 'running')
    if (k) setStep(caseId, k, { status: 'error', error: msg })
    const cur = caseStore.get(caseId)
    if (cur) caseStore.update(caseId, { status: cur.letter ? 'ready' : 'new' })
    await audit('overturn', 'case.error', caseId, { error: msg })
    throw new Error(msg)
  } finally {
    running.delete(caseId)
    subs.forEach(f => f())
  }
}

/** Re-run key 2 for one row (after "Swap evidence"). */
export async function reverifyRow(caseId: string, rowId: string) {
  const c = caseStore.get(caseId)
  if (!c?.match || !c.denial) return
  const row = c.match.rows.find(r => r.id === rowId)
  if (!row) return
  const r = await P.entail({ rows: [row], chartText: c.chartText, denial: c.denial })
  const res = r.value.find(x => x.row_id === rowId) || r.value[0]
  if (!res) return
  const next = (c.entailments || []).filter(e => e.row_id !== rowId).concat({ ...res, row_id: rowId })
  caseStore.update(caseId, { entailments: next })
  await audit(r.model, 'verify.support', caseId, { row: rowId, verdict: res.verdict, reason: res.reason_code })
  return { ...res, model: r.model, ms: r.ms }
}

export function dataUrlToPart(dataUrl: string): P.FilePart {
  const [head, b64] = dataUrl.split(',')
  return { mimeType: head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream', base64: b64 }
}
