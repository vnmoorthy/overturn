// Records GENUINE Gemini outputs for the three demo cases into src/data/cached/*.json.
// The app uses them only as a labeled fallback ("cached run") when the free tier is busy.
// Usage: npx tsx scripts/record-runs.ts [caseId ...]
import fs from 'node:fs'
import path from 'node:path'
import { setRuntimeKey } from '../src/lib/gemini'
import { setPolicyVersions, familyById } from '../src/lib/policies'
import * as P from '../src/lib/pipeline'
import { evaluate } from '../src/lib/rules'
import { verifyQuote } from '../src/lib/verifier'
import { HERO_CASES } from '../src/data/cases'
import type { PolicyVersion } from '../src/lib/types'

const root = path.resolve(import.meta.dirname, '..')
setRuntimeKey((process.env.GEMINI_API_KEY || fs.readFileSync(path.join(root, '.env'), 'utf8').match(/GEMINI_API_KEY=(.*)/)?.[1] || '').trim())
const pdir = path.join(root, 'src/data/policies')
setPolicyVersions(fs.readdirSync(pdir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8')) as PolicyVersion))

const only = process.argv.slice(2)
for (const seed of HERO_CASES.filter(s => !only.length || only.includes(s.id))) {
  const t0 = Date.now()
  const models: Record<string, string> = {}
  console.log(`\n=== ${seed.id}`)
  const ex = await P.extractDenial({ text: seed.denialText }); models.extract = ex.model
  const denial = ex.value.denial
  console.log(' extract', ex.model, ex.ms + 'ms', denial.plan_type, denial.date_of_service, denial.cited_requirements)
  const family = familyById(seed.familyId)!
  const effective = P.effectiveVersion(family, denial.date_of_service)
  console.log(' policy', family.id, effective.version_label, effective.effective_date)
  const mt = await P.matchCriteria({ denial, denialText: seed.denialText, family, effective, chartText: seed.chartText }); models.match = mt.model
  console.log(' match', mt.model, mt.ms + 'ms')
  const ptext = P.policyText(effective)
  for (const r of mt.value.rows) {
    const a = verifyQuote(r.policy_quote, ptext).status, b = r.chart_quote ? verifyQuote(r.chart_quote, seed.chartText).status : '-'
    console.log(`   ${r.id} ${r.criterion_id} ${r.status} policy:${a} chart:${b} L${r.chart_line} | ${r.chart_quote?.slice(0, 70)}`)
  }
  for (const m of mt.value.denial_mappings) console.log(`   map "${m.requirement_quote.slice(0, 60)}" -> ${m.maps_to_version}/${m.maps_to_criterion} (${verifyQuote(m.requirement_quote, seed.denialText).status})`)
  const en = await P.entail({ rows: mt.value.rows, chartText: seed.chartText, denial }); models.entail = en.model
  console.log(' entail', en.model, en.value.map(e => `${e.row_id}:${e.verdict}/${e.reason_code}`).join(' '))
  const flags = evaluate({ denial, denialText: seed.denialText, family, effective, mappings: mt.value.denial_mappings, rows: mt.value.rows,
    rowVerified: r => verifyQuote(r.policy_quote, ptext).status === 'verified' && (r.status !== 'met' || (!!r.chart_quote && verifyQuote(r.chart_quote, seed.chartText).status === 'verified' && en.value.find(e => e.row_id === r.id)?.verdict === 'supports')) })
  console.log(' flags', flags.map(f => `${f.severity}:${f.id}`).join(', '))
  const vrows = mt.value.rows.filter(r => verifyQuote(r.policy_quote, ptext).status === 'verified')
  const lt = await P.draftLetter({ denial, effective, rows: vrows, flags: flags.filter(f => f.severity !== 'info' || f.id === 'ma-bound'), providerName: denial.provider_name }); models.letter = lt.model
  console.log(' letter', lt.model, lt.ms + 'ms', (lt.value.match(/\[\[Q:/g) || []).length, 'tokens')
  const deadline = new Date(new Date(denial.notice_date + 'T12:00:00').getTime() + 65 * 864e5).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const explain: Record<string, string> = {}
  for (const lang of ['English', 'Spanish'] as const) {
    const r = await P.explainForPatient({ denial, summary: mt.value.summary, flags, deadline, lang }); explain[lang] = r.value; models.explain = r.model
  }
  const ob = await P.objections({ denial, rows: vrows, flags }); models.coach = ob.model
  const out = { extract: ex.value, match: mt.value, entail: en.value, letter: lt.value, explain, objections: ob.value, models, recordedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(root, 'src/data/cached', `${seed.id}.json`), JSON.stringify(out, null, 1))
  console.log(` saved (${Math.round((Date.now() - t0) / 1000)}s)`)
}
process.exit(0)
