// Case context for the P2P rehearsal: who the director is, what the denial says,
// which verified evidence exists, the director's system instruction, and the
// deterministic post-call scorecard.

import type { CaseFile, Flag, MatchRow, PolicyFamily, PolicyVersion } from '../../lib/types'
import { coreCriteria, familyById, versionOf } from '../../lib/policies'
import { effectiveVersion, numberedChart, policyText } from '../../lib/pipeline'
import { verifyQuote } from '../../lib/verifier'
import { fmtDate } from '../../lib/rules'
import { seedById } from '../../lib/store'
import { computeFlags, rowIsVerified } from '../../lib/engine'

export const DIRECTOR = { name: 'Dr. Alex Reynolds', short: 'Dr. Reynolds', title: 'Medical Director', initials: 'AR' }

export interface CitationRow extends MatchRow {
  /** Two-key verification (verbatim quotes + entailment), same rule as the case workspace. */
  verified: boolean
  policyVerified: boolean | null
  chartVerified: boolean | null
  entailment: 'supports' | 'contradicts' | 'insufficient' | null
}

export interface RehearsalContext {
  payer: string
  plan: string
  providerName: string
  member: string
  service: string
  dos: string
  amount: string
  reason: string
  family: PolicyFamily | null
  effective: PolicyVersion | null
  analyzed: boolean
  rows: CitationRow[]
  flags: Flag[]
  summary: string | null
}

// ------------------------------------------------------------ letter parsing
function field(text: string, labels: string[]): string {
  for (const l of labels) {
    const m = text.match(new RegExp(`^\\s*${l}\\s*:\\s*(.+)$`, 'im'))
    if (m) return m[1].trim()
  }
  return ''
}
function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase())
}
function doctorName(s: string): string {
  return s.match(/Dr\.?\s+[A-Z][A-Za-z'-]*(?:\s+[A-Z]\.)?(?:\s+[A-Z][A-Za-z'-]+)+/)?.[0]?.replace(/^Dr\s/, 'Dr. ') || ''
}

/** The denial reason paragraph, from the structured extraction or straight from the letter. */
export function reasonFromText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const i = lines.findIndex(l => /^\s*(why we denied[^:]*|reason for (the )?(denial|decision)|reason for (our|this) decision|basis for (the )?denial|denial reason|reason)\s*:/i.test(l))
  if (i < 0) return ''
  const first = lines[i].split(':').slice(1).join(':').trim()
  const out = first ? [first] : []
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j].trim()
    if (!l) { if (out.length) break; continue }
    out.push(l)
  }
  return out.join(' ')
}

export function buildContext(c: CaseFile): RehearsalContext {
  const d = c.denial
  const text = c.denialText || ''
  const head = text.split('\n').map(l => l.trim()).filter(Boolean)
  const seed = seedById(c.id)
  const payer = titleCase(d?.payer || head[0] || seed?.payer || 'the plan')
  const plan = titleCase(d?.plan_name || (head[1] ? head[1].replace(/\s*-\s*a Medicare Advantage plan\s*$/i, '') : seed?.payer || ''))
  const providerRaw = d?.provider_name || field(text, ['Requesting provider', 'Ordering provider', 'Provider'])
  const providerName = doctorName(providerRaw) || providerRaw
  const member = d?.member_name || field(text, ['Member', 'Enrollee', 'Patient'])
  const service = d?.service_description || field(text, ['Service requested', 'Item requested', 'Service'])
  const dos = d?.date_of_service ? fmtDate(d.date_of_service) : field(text, ['Requested date of service', 'Date of service'])
  const amount = typeof d?.billed_amount === 'number'
    ? d.billed_amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : field(text, ['Amount']).replace(/\.00$/, '')
  const reason = d?.denial_reason_text || reasonFromText(text) || 'The plan determined the service was not medically necessary.'

  const family = familyById(c.familyId)
  const effective = family ? (versionOf(family, c.versionLabel) || effectiveVersion(family, d?.date_of_service || '')) : null
  const effText = effective ? policyText(effective) : null

  const rows: CitationRow[] = (c.match?.rows || []).map(r => {
    let verified = false
    try { verified = rowIsVerified(c, r, effective) } catch { verified = false }
    return {
      ...r,
      verified,
      policyVerified: effText && r.policy_quote ? verifyQuote(r.policy_quote, effText).status === 'verified' : null,
      chartVerified: r.chart_quote ? verifyQuote(r.chart_quote, c.chartText).status === 'verified' : null,
      entailment: c.entailments?.find(e => e.row_id === r.id)?.verdict || null,
    }
  })

  let flags: Flag[] = []
  try { flags = computeFlags(c) } catch { flags = [] }

  return {
    payer, plan, providerName, member, service, dos, amount, reason, family, effective,
    analyzed: !!c.match && rows.length > 0, rows, flags, summary: c.match?.summary || null,
  }
}

// ------------------------------------------------------- system instruction
function clip(s: string, n: number) { return s.length > n ? s.slice(0, n) + '\n[...truncated]' : s }

export function directorInstruction(x: RehearsalContext, c: CaseFile, opts: { tough?: boolean } = {}): string {
  const doc = x.providerName || 'the requesting physician'
  const policyName = x.family ? `${x.family.id} (${x.family.title})` : 'the governing Medicare coverage policy (LCD or NCD)'
  const L: string[] = []
  L.push(`You are ${DIRECTOR.name}, ${DIRECTOR.title} at ${x.payer}${x.plan && x.plan !== x.payer ? ` (${x.plan})` : ''}, a Medicare Advantage plan. You are on a scheduled peer-to-peer (P2P) phone call with ${doc}, who requested ${x.service || 'the denied service'} for ${x.member || 'the member'}. Your plan denied the request and you are the physician reviewer defending that decision.`)
  L.push('', 'HOW YOU SPEAK',
    '- This is a live phone call. Reply in 1 to 3 short spoken sentences. Never use lists, markdown, or stage directions.',
    '- Sound like a real, busy medical director: professional, skeptical, but fair. Plain clinical language.',
    '- Never read member IDs or long codes digit by digit.')
  L.push('', 'OPENING',
    `- When you receive "The call has connected. Begin.", greet ${doc} by name, introduce yourself and your plan, and state the denial reason in one or two sentences based on the letter below. Then ask what they would like to add.`)
  L.push('', 'DEFENDING THE DENIAL',
    `- Argue from the denial letter's reasoning: "${x.reason}"`,
    '- Push back on vague arguments such as "she really needs it", "it is medically necessary", or "the patient is high risk": ask which coverage criterion is met and where the chart documents it.',
    '- If the provider names a policy criterion but gives no chart evidence, ask for the specific documentation (the note and its date). If they cite chart evidence but no criterion, ask which criterion of the governing policy it satisfies.',
    '- If they claim something that is not in the record below, say you do not see that in the submitted documentation.',
    '- Never invent clinical facts, dates, lab values, policy text, or criteria. If asked about something that is not in these materials, say you would need to check the record.')
  if (opts.tough) L.push('- Be a tougher reviewer than usual: interrupt rambling, insist on the exact chart date and finding, and press on every gap before you concede.')
  L.push('', 'WHEN TO CONCEDE',
    `- Concede ONLY when the provider has (1) cited the specific governing coverage criterion, for example by naming ${policyName} or stating the criterion, AND (2) pointed to specific chart evidence that satisfies it, and that evidence matches the record below.`,
    '- Also concede if the provider shows, with the same specificity, that the denial relied on a requirement that is not in the governing policy and the chart meets the criteria that are.',
    '- Do not concede on a criterion the verified findings mark as unmet or missing; ask for the missing documentation instead.',
    '- When you concede, say clearly: "Based on that, I\'m going to overturn the denial and approve this request." Then briefly say what you will note in the file. Do not use the words "overturn" or "approve" in any other context.',
    '- Stay in character for the whole call. If the provider goes off topic, steer back to the case.')
  L.push('', 'GROUND TRUTH FOR JUDGING THE PROVIDER (the provider may not know all of this; do not volunteer it)')
  if (x.family && x.effective) L.push(`Governing policy: ${x.family.id}, ${x.family.title}, version effective ${fmtDate(x.effective.effective_date)}.`)
  if (x.rows.length) {
    L.push('Findings from the analysis (rows marked VERIFIED passed verbatim quote checks and an entailment check):')
    for (const r of x.rows) {
      L.push(`- ${r.id} [${r.status}${r.verified ? ', VERIFIED' : ', not verified'}] ${r.criterion_label}. Policy: "${r.policy_quote}".${r.chart_quote ? ` Chart line ${r.chart_line}: "${r.chart_quote}".` : ' No chart evidence.'}${r.missing_document ? ` Missing: ${r.missing_document}.` : ''}`)
    }
  } else if (x.family && x.effective) {
    L.push('Key criteria of the governing policy:')
    for (const cr of coreCriteria(x.family, x.effective)) L.push(`- ${cr.label}: "${cr.quote}"`)
  }
  const issues = x.flags.filter(f => f.severity === 'violation')
  if (issues.length) {
    L.push('Verified weaknesses in your denial (concede if the provider raises one specifically and backs it with the chart):')
    for (const f of issues) L.push(`- ${f.title}: ${f.detail}`)
  }
  L.push('', 'DENIAL LETTER (verbatim):', clip(c.denialText || '(not provided)', 5000))
  L.push('', 'CHART AS SUBMITTED (verbatim, numbered lines):', clip(numberedChart(c.chartText || '(not provided)'), 7000))
  return L.join('\n')
}

// ----------------------------------------------------------------- scoring
export interface TranscriptEntry {
  id: string
  role: 'provider' | 'director' | 'system'
  text: string
  at: number // seconds since the call connected
  typed?: boolean
  done: boolean
}

const POS = /\b(overturn(ing|ed)?|revers(e|ing) (the|this|our|my) (denial|decision)|approv(e|ing) (this|the|your) (request|authorization|order|claim|appeal|device|service|procedure|cgm|cpap))\b/i
const NEG = /\b(not|never|cannot|unable|unless|until|if you|if the|if we|would need|need to see|before i|no basis|uphold)\b|n['’]t\b/i

/** The director's conceding sentence, if any (negated or conditional mentions don't count). */
export function findConcession(directorText: string): string | null {
  const sentences = directorText.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)
  const scripted = /\bI['’]?m going to overturn\b|\bI (will|am going to) overturn\b/i
  return sentences.find(s => scripted.test(s) || (POS.test(s) && !NEG.test(s)))?.trim() || null
}

const STOP = new Set(['patient', 'which', 'there', 'their', 'about', 'after', 'with', 'from', 'that', 'this', 'have', 'been', 'were', 'times', 'other', 'daily', 'notes', 'visit', 'person'])
function tokens(s: string): string[] {
  const raw = s.toLowerCase().match(/[a-z0-9][a-z0-9/.-]*/g) || []
  return [...new Set(raw.map(w => w.replace(/[.-]+$/, '')).filter(w => (/\d/.test(w) && w.replace(/\D/g, '').length >= 2) || (w.length >= 5 && !STOP.has(w))))]
}
/** Heuristic: did the provider bring up this row's chart evidence? */
export function mentionsRow(providerText: string, r: MatchRow): boolean {
  if (!r.chart_quote) return false
  const p = providerText.toLowerCase()
  const chartHits = tokens(r.chart_quote).filter(t => p.includes(t))
  const labelHits = tokens(r.criterion_label).filter(t => p.includes(t))
  return chartHits.length >= 2 || (chartHits.length >= 1 && labelHits.length >= 1)
}

export interface CallScore {
  seconds: number
  concededAt: number | null
  chartCited: boolean
  providerTurns: number
  directorTurns: number
  conceded: boolean
  concession: string | null
  policyCited: boolean
  evidenceCited: string[]
  evidenceTotal: number
  tip: string
}

export function scoreCall(entries: TranscriptEntry[], seconds: number, x: RehearsalContext): CallScore {
  const prov = entries.filter(e => e.role === 'provider' && e.text.trim())
  const dir = entries.filter(e => e.role === 'director' && e.text.trim())
  const pText = prov.map(e => e.text).join(' ')
  const concession = findConcession(dir.map(e => e.text).join(' '))
  const concededAt = concession ? (dir.find(e => findConcession(e.text))?.at ?? null) : null
  const famDigits = x.family?.id.replace(/\D/g, '') || '@@'
  const policyCited = /\b(lcd|ncd|local coverage|national coverage|coverage determination|criteri(on|a)|coverage policy)\b/i.test(pText) || pText.replace(/\D/g, '').includes(famDigits)
  const evidenceRows = x.rows.filter(r => r.status === 'met' && r.chart_quote)
  const evidenceCited = evidenceRows.filter(r => mentionsRow(pText, r)).map(r => r.id)
  const chartCited = evidenceCited.length > 0 || (!evidenceRows.length && /\b(chart|line \d+|notes?|documented|documents|record|visit)\b/i.test(pText))
  const at = Math.round(concededAt ?? seconds)
  const mmss = `${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}`
  let tip: string
  if (concession) tip = `Concession in ${mmss}. Open the real call with the same citations, in the same order.`
  else {
    const next = evidenceRows.find(r => !evidenceCited.includes(r.id))
    if (!prov.length) tip = 'The director never heard from you. Start the call, then speak or type your argument.'
    else if (!policyCited) tip = `Name the governing policy${x.family ? ` (${x.family.id})` : ''} and the exact criterion before arguing clinical need.`
    else if (next) tip = `Cite chart line ${next.chart_line} for "${next.criterion_label}". Read the quote word for word.`
    else tip = 'Pair each criterion with its chart line in one sentence, then ask directly for the overturn.'
  }
  return {
    seconds, concededAt, chartCited, providerTurns: prov.length, directorTurns: dir.length, conceded: !!concession, concession,
    policyCited, evidenceCited, evidenceTotal: evidenceRows.length, tip,
  }
}

export function transcriptText(entries: TranscriptEntry[], x: RehearsalContext): string {
  const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  return entries.filter(e => e.text.trim()).map(e => {
    if (e.role === 'system') return `[${t(e.at)}] -- ${e.text} --`
    return `[${t(e.at)}] ${e.role === 'director' ? `${DIRECTOR.name} (${x.payer})` : 'Provider'}: ${e.text.trim()}`
  }).join('\n')
}
