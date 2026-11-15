// Tiny persisted store (localStorage) with a React hook. All case data stays in the browser.

import { useSyncExternalStore } from 'react'
import type { CaseFile } from './types'
import { HERO_CASES, generateWorklist, type SeedCase } from '../data/cases'

const LS = 'overturn_cases_v2'

// Demo history so the worklist KPIs and payer playbook look like a team that has been using it.
const HISTORY: Record<string, { status: CaseFile['status']; outcome?: 'won' | 'lost'; outcomeNote?: string }> = {
  'wl-1': { status: 'won', outcome: 'won', outcomeNote: 'Overturned at reconsideration — plan withdrew the 4x/day testing requirement' },
  'wl-4': { status: 'won', outcome: 'won', outcomeNote: 'Overturned — LCD L33822 cited with chart evidence of insulin use' },
  'wl-2': { status: 'lost', outcome: 'lost', outcomeNote: 'Plan applied AHI ≥ 15 and ignored the AHI 5–14 + symptoms pathway' },
  'wl-5': { status: 'won', outcome: 'won', outcomeNote: 'Overturned after P2P — in-person evaluation note attached' },
  'wl-8': { status: 'lost', outcome: 'lost', outcomeNote: 'Missing supplier instruction documentation' },
  'wl-3': { status: 'won', outcome: 'won', outcomeNote: 'Overturned — 3-month pain criterion met per L38801' },
  'wl-6': { status: 'lost', outcome: 'lost', outcomeNote: 'No baseline disability scale documented' },
  'wl-7': { status: 'submitted' },
  'wl-10': { status: 'submitted' },
}

function fromSeed(s: SeedCase, i: number): CaseFile {
  const h = HISTORY[s.id]
  return {
    id: s.id, title: s.title, hero: s.hero, createdAt: Date.now() - i * 3_600_000, updatedAt: Date.now() - i * 3_600_000,
    status: 'new', denialText: s.denialText, denialFile: null, chartText: s.chartText, chartTitle: s.chartTitle,
    denial: null, familyId: s.familyId, versionLabel: null, match: null, entailments: null, confirmed: {},
    letter: null, signedBy: null, outcome: null, trace: [], patientExplainer: null,
    ...(h ? { status: h.status, outcome: h.outcome ?? null, outcomeNote: h.outcomeNote, signedBy: 'Dana Whitfield' } : {}),
  }
}

export const SEEDS: SeedCase[] = [...HERO_CASES, ...generateWorklist(22)]
export const seedById = (id: string) => SEEDS.find(s => s.id === id)

function load(): CaseFile[] {
  try {
    const raw = localStorage.getItem(LS)
    if (raw) return (JSON.parse(raw) as CaseFile[]).map(c => (c.status === 'analyzing' ? { ...c, status: c.letter ? 'ready' : 'new' } : c))
  } catch { /* ignore */ }
  return SEEDS.map(fromSeed)
}

let state: CaseFile[] = typeof localStorage !== 'undefined' ? load() : SEEDS.map(fromSeed)
const listeners = new Set<() => void>()
function persist() {
  try { localStorage.setItem(LS, JSON.stringify(state)) } catch { /* quota: drop file previews */
    try { localStorage.setItem(LS, JSON.stringify(state.map(c => ({ ...c, denialFile: null })))) } catch { /* give up */ }
  }
  listeners.forEach(l => l())
}

export const caseStore = {
  all: () => state,
  get: (id: string) => state.find(c => c.id === id) || null,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  update(id: string, patch: Partial<CaseFile> | ((c: CaseFile) => Partial<CaseFile>)) {
    state = state.map(c => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch), updatedAt: Date.now() } : c))
    persist()
  },
  create(c: CaseFile) { state = [c, ...state]; persist() },
  remove(id: string) { state = state.filter(c => c.id !== id); persist() },
  resetCase(id: string) {
    const seed = seedById(id)
    if (seed) { const i = SEEDS.indexOf(seed); state = state.map(c => (c.id === id ? fromSeed(seed, i) : c)); persist() }
  },
  resetAll() { state = SEEDS.map(fromSeed); persist() },
}

export function useCases(): CaseFile[] {
  return useSyncExternalStore(caseStore.subscribe, caseStore.all, caseStore.all)
}
export function useCase(id: string | null): CaseFile | null {
  const all = useCases()
  return id ? all.find(c => c.id === id) || null : null
}

export function newBlankCase(): CaseFile {
  const id = `case-${Date.now().toString(36)}`
  return {
    id, title: 'New denial', createdAt: Date.now(), updatedAt: Date.now(), status: 'new',
    denialText: '', denialFile: null, chartText: '', chartTitle: 'Chart notes', denial: null, familyId: null, versionLabel: null,
    match: null, entailments: null, confirmed: {}, letter: null, signedBy: null, outcome: null, trace: [], patientExplainer: null,
  }
}
