// Policy library: real public CMS LCD text (src/data/policies/*.json), grouped into
// families with every historical version — powers version pinning and "time travel".
import type { PolicyFamily, PolicyVersion } from './types'

const META: Record<string, Omit<PolicyFamily, 'versions' | 'title' | 'type'>> = {
  L33822: {
    id: 'L33822', short: 'Glucose Monitors', segment: 'cgm',
    codes: ['E2103', 'A4239', 'E2102', 'A4238', 'K0553', 'K0554'],
    keywords: ['continuous glucose', 'cgm', 'dexcom', 'libre', 'glucose monitor'],
    core: ['c1', 'c2', 'c3', 'c4a', 'c4b2', 'c5'], groups: [['c4a', 'c4b', 'c4b1', 'c4b2']],
  },
  L33718: {
    id: 'L33718', short: 'PAP for OSA', segment: 'pap',
    codes: ['E0601', 'E0470', 'E0471', 'E0562', 'A7030', 'A7034'],
    keywords: ['cpap', 'bipap', 'positive airway pressure', 'sleep apnea', 'pap device'],
    core: ['c1', 'c3', 'c4', 'c4a', 'c4b', 'c8', 'c5'], groups: [['c3', 'c4'], ['c4a', 'c4b']],
  },
  L38801: {
    id: 'L38801', short: 'Facet Joint Interventions', segment: 'facet',
    codes: ['64490', '64491', '64492', '64493', '64494', '64495', '64633', '64634', '64635', '64636'],
    keywords: ['facet', 'medial branch', 'radiofrequency ablation'],
    core: ['c1', 'c2', 'c3', 'c4', 'c5', 'c17'], groups: [],
  },
}

let versions: PolicyVersion[] = []
try {
  const mods = import.meta.glob('../data/policies/*.json', { eager: true, import: 'default' }) as Record<string, PolicyVersion>
  versions = Object.values(mods)
} catch { /* non-vite runtime: use setPolicyVersions */ }

const LS_CUSTOM = 'overturn_custom_policies'
function loadCustom(): PolicyVersion[] { try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]') } catch { return [] } }
versions = versions.concat(loadCustom())
let families: PolicyFamily[] = build(versions)

/** Add a policy version sourced by the Antigravity research agent (labeled; not CMS-verbatim). */
export function registerCustomVersion(v: PolicyVersion) {
  versions = versions.filter(x => !(x.id === v.id && x.version_label === v.version_label)).concat(v)
  families = build(versions)
  try { localStorage.setItem(LS_CUSTOM, JSON.stringify(loadCustom().filter(x => !(x.id === v.id && x.version_label === v.version_label)).concat(v))) } catch { /* ignore */ }
}

function build(list: PolicyVersion[]): PolicyFamily[] {
  const byId = new Map<string, PolicyVersion[]>()
  for (const v of list) {
    if (!v?.id || !Array.isArray(v.sections)) continue
    byId.set(v.id, [...(byId.get(v.id) || []), v])
  }
  return [...byId.entries()].map(([id, vs]) => {
    const sorted = vs.sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    const latest = sorted[sorted.length - 1]
    const meta = META[id] || { id, short: latest.title, codes: [], keywords: [latest.title.toLowerCase()], segment: 'all', core: latest.criteria.map(c => c.id), groups: [] }
    return { ...meta, title: latest.title, type: latest.type, versions: sorted }
  })
}

/** Node scripts call this with JSON loaded from disk. */
export function setPolicyVersions(list: PolicyVersion[]) { versions = list; families = build(list) }
export function getFamilies(): PolicyFamily[] { return families }
export function familyById(id: string | null | undefined): PolicyFamily | null { return families.find(f => f.id === id) || null }
export function versionOf(f: PolicyFamily, label: string | null | undefined): PolicyVersion | null { return f.versions.find(v => v.version_label === label) || null }

const normLabel = (l: string) => l.replace(/\s*\(removed[^)]*\)/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const flat = (v: PolicyVersion) => v.sections.map(s => s.text).join('\n').toLowerCase().replace(/\s+/g, ' ')

/** Criteria CMS removed after `older` (annotated in the verbatim data as "(removed MM/DD/YYYY)") and absent from `newer`. */
export function removedCriteria(older: PolicyVersion, newer: PolicyVersion) {
  const newText = flat(newer)
  const newLabels = new Set(newer.criteria.map(c => normLabel(c.label)))
  return older.criteria.filter(c => /\(removed/i.test(c.label) && !newLabels.has(normLabel(c.label)) && !newText.includes(c.quote.toLowerCase().replace(/\s+/g, ' ')))
}
/** Initial-coverage criteria that first appear in `newer`. */
export function addedCriteria(older: PolicyVersion, newer: PolicyVersion, family?: PolicyFamily) {
  const oldText = flat(older)
  const oldLabels = new Set(older.criteria.map(c => normLabel(c.label)))
  const core = family?.core
  return newer.criteria.filter(c => (!core || core.includes(c.id)) && !oldLabels.has(normLabel(c.label)) && !oldText.includes(c.quote.toLowerCase().replace(/\s+/g, ' ')))
}

/** Criteria that apply to an initial-coverage request (subset of the effective version). */
export function coreCriteria(f: PolicyFamily, v: PolicyVersion) {
  const ids = f.core?.length ? f.core : v.criteria.map(c => c.id)
  const list = v.criteria.filter(c => ids.includes(c.id))
  return list.length ? list : v.criteria
}
/** Date a criterion was removed, parsed from its label (e.g. "(removed 07/18/2021)"). */
export function removedOn(label: string): string | null {
  const m = label.match(/removed (\d{2})\/(\d{2})\/(\d{4})/i)
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null
}
