// Re-verifies every recorded demo run with the current verifier, rules and letter builder.
// Usage: npx tsx scripts/check-saved-runs.ts
import fs from 'node:fs'
import path from 'node:path'
import { setPolicyVersions, familyById } from '../src/lib/policies'
import { effectiveVersion, policyText } from '../src/lib/pipeline'
import { verifyQuote } from '../src/lib/verifier'
import { buildLetter } from '../src/lib/letter'
import { evaluate } from '../src/lib/rules'
import { HERO_CASES } from '../src/data/cases'
import type { PolicyVersion } from '../src/lib/types'

const root = path.resolve(import.meta.dirname, '..')
const pdir = path.join(root, 'src/data/policies')
setPolicyVersions(fs.readdirSync(pdir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8')) as PolicyVersion))
let bad = 0
for (const seed of HERO_CASES) {
  const run = JSON.parse(fs.readFileSync(path.join(root, 'src/data/cached', `${seed.id}.json`), 'utf8'))
  const fam = familyById(seed.familyId)!
  const eff = effectiveVersion(fam, run.extract.denial.date_of_service)
  const pt = policyText(eff)
  const rows = run.match.rows
  const ok = (r: any) => verifyQuote(r.policy_quote, pt).status === 'verified' && (r.status !== 'met' || (verifyQuote(r.chart_quote, seed.chartText).status === 'verified' && run.entail.find((e: any) => e.row_id === r.id)?.verdict === 'supports'))
  for (const r of rows) {
    const p = verifyQuote(r.policy_quote, pt).status, c = r.chart_quote ? verifyQuote(r.chart_quote, seed.chartText).status : '-'
    if (p !== 'verified' || (r.chart_quote && c !== 'verified')) { bad++; console.log(`  ✗ ${seed.id} ${r.id} policy:${p} chart:${c} | ${r.policy_quote.slice(0, 60)} | ${r.chart_quote?.slice(0, 50)}`) }
  }
  const flags = evaluate({ denial: run.extract.denial, denialText: seed.denialText, family: fam, effective: eff, mappings: run.match.denial_mappings, rows, rowVerified: ok })
  const letter = buildLetter(run.letter.replace(/\[\[Q:([a-z0-9]+):chart\]\]/gi, (m: string, id: string) => (rows.find((r: any) => r.id === id)?.chart_quote ? m : '')),
    { rows, effective: eff, policyText: pt, chartText: seed.chartText, denialText: seed.denialText, rowOk: (r, f) => f === 'policy' ? verifyQuote(r.policy_quote, pt).status === 'verified' : ok(r) })
  console.log(`${seed.id}: rows ${rows.filter(ok).length}/${rows.length} ok · flags ${flags.map(f => f.id).join(',')} · letter quotes ${letter.verified}/${letter.total}${letter.unverified.length ? ' UNVERIFIED: ' + letter.unverified.map(u => u.text.slice(0, 60)).join(' | ') : ''}`)
  if (letter.unverified.length) bad++
}
console.log(bad ? `${bad} problem(s)` : 'all saved runs verify')
