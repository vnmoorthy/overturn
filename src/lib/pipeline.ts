// The Overturn agent pipeline. Each step is a focused Gemini call with a strict
// JSON schema; deterministic code (verifier.ts, rules.ts) checks every output.

import { ai, run, parseJson, thinkingFor } from './gemini'
import type { Denial, DenialMapping, Entailment, MatchResult, MatchRow, PolicyFamily, PolicyVersion } from './types'
import { toLines } from './verifier'
import { coreCriteria } from './policies'

export interface FilePart { mimeType: string; base64: string }

// ---------------------------------------------------------------- extraction
const DENIAL_SCHEMA = {
  type: 'object',
  properties: {
    letter_transcript: { type: 'string', description: 'Verbatim transcription of the entire letter text, preserving wording and line breaks.' },
    denial: {
      type: 'object',
      properties: {
        payer: { type: 'string' },
        plan_name: { type: 'string' },
        plan_type: { type: 'string', enum: ['Medicare Advantage', 'Commercial', 'Medicaid managed care', 'Traditional Medicare', 'Other'] },
        member_name: { type: 'string' },
        member_id: { type: 'string' },
        provider_name: { type: 'string' },
        service_description: { type: 'string' },
        codes: { type: 'array', items: { type: 'object', properties: {
          system: { type: 'string', enum: ['CPT', 'HCPCS', 'ICD-10', 'CARC', 'RARC', 'Other'] }, code: { type: 'string' }, description: { type: 'string' } }, required: ['system', 'code', 'description'] } },
        date_of_service: { type: 'string', description: 'YYYY-MM-DD (requested/service date)' },
        notice_date: { type: 'string', description: 'YYYY-MM-DD date of the denial notice' },
        decision_type: { type: 'string', enum: ['pre-service', 'payment', 'unknown'] },
        denial_reason_text: { type: 'string', description: 'The denial reason, copied VERBATIM from the letter' },
        cited_requirements: { type: 'array', items: { type: 'string' }, description: 'Each requirement/criterion the letter says was not met, copied VERBATIM from the letter (exact substrings)' },
        reviewer: { type: 'string', description: 'Name of the reviewer if stated, else empty string' },
        reviewer_credentials_stated: { type: 'boolean', description: 'Does the letter state the reviewer’s medical credentials/specialty?' },
        specific_criterion_cited: { type: 'boolean', description: 'Does the letter cite a specific named coverage policy or criterion (e.g. an LCD number or policy section)?' },
        billed_amount: { type: 'number', description: 'Dollar amount if stated, else 0' },
        expedited: { type: 'boolean' },
      },
      required: ['payer', 'plan_name', 'plan_type', 'member_name', 'member_id', 'provider_name', 'service_description', 'codes', 'date_of_service', 'notice_date', 'decision_type', 'denial_reason_text', 'cited_requirements', 'reviewer', 'reviewer_credentials_stated', 'specific_criterion_cited', 'billed_amount', 'expedited'],
    },
  },
  required: ['letter_transcript', 'denial'],
}

export async function extractDenial(input: { text?: string; file?: FilePart }) {
  const prompt = `You are a medical billing expert. Extract structured data from this insurance denial letter (organization determination / claim denial).
Rules:
- Copy denial_reason_text and every cited_requirements item VERBATIM (character-for-character) from the letter — they will be machine-verified as exact substrings.
- letter_transcript must be the full letter text verbatim${input.text ? ' (the text is provided below; return it unchanged)' : ''}.
- Dates as YYYY-MM-DD. If a field is not present use an empty string, false, or 0.
- plan_type: "Medicare Advantage" if the letter mentions Medicare Advantage, an MA plan, HMO/PPO Medicare plan, or Medicare reconsideration rights.`
  const parts: unknown[] = [{ text: prompt }]
  if (input.file) parts.push({ inlineData: { mimeType: input.file.mimeType, data: input.file.base64 } })
  if (input.text) parts.push({ text: `DENIAL LETTER:\n"""\n${input.text}\n"""` })
  return run('extract', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: [{ role: 'user', parts: parts as never }],
      config: { responseMimeType: 'application/json', responseJsonSchema: DENIAL_SCHEMA, ...thinkingFor(model, 'low'), abortSignal: signal },
    })
    const out = parseJson<{ letter_transcript: string; denial: Denial }>(r.text)
    if (input.text) out.letter_transcript = input.text
    if (out.denial.reviewer === '') out.denial.reviewer = null
    if (!out.denial.billed_amount) out.denial.billed_amount = null
    return out
  })
}

// --------------------------------------------------------------- transcription
export async function transcribeDocument(file: FilePart, kind = 'clinical chart notes') {
  return run('transcribe', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [
        { text: `Transcribe these ${kind} VERBATIM as plain text. Preserve every word, number, date, and line break exactly. Do not summarize, correct, or add anything. Output only the transcription.` },
        { inlineData: { mimeType: file.mimeType, data: file.base64 } },
      ] }],
      config: { ...thinkingFor(model, 'low'), abortSignal: signal },
    })
    const t = (r.text || '').trim()
    if (!t) throw new Error('empty response')
    return t
  })
}

// ------------------------------------------------------------------- locate
export function locateByCode(denial: Denial, families: PolicyFamily[]): PolicyFamily | null {
  const codes = denial.codes.map(c => c.code.toUpperCase().trim())
  for (const f of families) if (f.codes.some(c => codes.includes(c))) return f
  const hay = `${denial.service_description} ${denial.denial_reason_text}`.toLowerCase()
  for (const f of families) if (f.keywords.some(k => hay.includes(k.toLowerCase()))) return f
  return null
}

export async function locateWithGemini(denial: Denial, families: PolicyFamily[]) {
  return run('locate', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: `Which Medicare coverage policy governs this denied service? Choose one id from the list, or "none".
Service: ${denial.service_description}
Codes: ${denial.codes.map(c => `${c.system} ${c.code} ${c.description}`).join('; ')}
Denial reason: ${denial.denial_reason_text}
Policies:
${families.map(f => `- ${f.id}: ${f.title} (${f.type}) — covers ${f.keywords.join(', ')}`).join('\n')}`,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', properties: { policy_id: { type: 'string' }, confidence: { type: 'number' }, rationale: { type: 'string' } }, required: ['policy_id', 'confidence', 'rationale'] },
        ...thinkingFor(model, 'low'), abortSignal: signal,
      },
    })
    return parseJson<{ policy_id: string; confidence: number; rationale: string }>(r.text)
  })
}

/** The version in effect on the date of service (latest version whose effective_date <= DOS). */
export function effectiveVersion(family: PolicyFamily, dos: string): PolicyVersion {
  const sorted = [...family.versions].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  let pick = sorted[sorted.length - 1]
  if (dos) {
    const eligible = sorted.filter(v => v.effective_date <= dos)
    if (eligible.length) pick = eligible[eligible.length - 1]
  }
  return pick
}

export function policyText(v: PolicyVersion): string {
  return v.sections.map(s => `${s.heading}\n${s.text}`).join('\n\n')
}

// -------------------------------------------------------------------- match
const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    rows: { type: 'array', items: { type: 'object', properties: {
      criterion_id: { type: 'string' },
      status: { type: 'string', enum: ['met', 'unmet', 'missing'] },
      policy_quote: { type: 'string', description: 'Exact verbatim excerpt from the EFFECTIVE policy text stating this criterion' },
      chart_quote: { type: 'string', description: 'Exact verbatim excerpt from ONE chart line that evidences the criterion (without the line-number prefix); empty string if none' },
      chart_line: { type: 'integer', description: 'Line number of chart_quote, or 0 if none' },
      reasoning: { type: 'string', description: '1-2 sentences' },
      missing_document: { type: 'string', description: 'If missing: the specific document the provider should attach; else empty string' },
    }, required: ['criterion_id', 'status', 'policy_quote', 'chart_quote', 'chart_line', 'reasoning', 'missing_document'] } },
    denial_mappings: { type: 'array', items: { type: 'object', properties: {
      requirement_quote: { type: 'string', description: 'Exact verbatim excerpt from the DENIAL LETTER' },
      maps_to_version: { type: 'string', description: 'version_label of the policy version containing this requirement, or "none"' },
      maps_to_criterion: { type: 'string', description: 'criterion id in that version, or "none"' },
      explanation: { type: 'string' },
    }, required: ['requirement_quote', 'maps_to_version', 'maps_to_criterion', 'explanation'] } },
    summary: { type: 'string', description: '2 sentences: is the denial consistent with the effective policy and the chart?' },
  },
  required: ['rows', 'denial_mappings', 'summary'],
}

export function numberedChart(chartText: string) {
  return toLines(chartText).map((l, i) => `L${i + 1}: ${l}`).join('\n')
}

export async function matchCriteria(args: { denial: Denial; denialText: string; family: PolicyFamily; effective: PolicyVersion; chartText: string }) {
  const { denial, denialText, family, effective, chartText } = args
  const others = family.versions.filter(v => v.version_label !== effective.version_label)
  const core = coreCriteria(family, effective)
  const prompt = `You are Overturn, an expert Medicare Advantage appeals analyst. Compare a denial against the governing coverage policy and the patient's chart.

DATE OF SERVICE: ${denial.date_of_service}
EFFECTIVE POLICY VERSION (in effect on the date of service): ${effective.id} "${effective.title}" version "${effective.version_label}", effective ${effective.effective_date}
Initial-coverage criteria to evaluate (from the effective version):
${core.map(c => `- ${c.id} [${c.label}]: "${c.quote}"`).join('\n')}${family.groups?.length ? `\nAlternative groups (meeting ANY one criterion in a group satisfies it): ${family.groups.map(g => g.join(' | ')).join('; ')}` : ''}

Full effective policy text:
"""
${policyText(effective)}
"""

${others.length ? `OTHER (NON-EFFECTIVE) VERSIONS OF THIS POLICY, for mapping the denial's cited requirements:\n${others.map(v => `Version "${v.version_label}" (effective ${v.effective_date}${v.retired_date ? `, retired ${v.retired_date}` : ''}):\n${v.criteria.map(c => `- ${c.id} [${c.label}]: "${c.quote}"`).join('\n')}`).join('\n\n')}` : ''}

DENIAL LETTER:
"""
${denialText}
"""

PATIENT CHART (line-numbered):
"""
${numberedChart(chartText)}
"""

Tasks:
1. rows: exactly one row for EACH criterion listed above (use its criterion_id), in the same order. status "met" if the chart documents it, "unmet" if the chart contradicts it, "missing" if the chart is silent. policy_quote MUST be copied character-for-character from the effective policy text (prefer the criterion quote). chart_quote MUST be copied character-for-character from a single chart line (no "Lnn:" prefix). Prefer evidence dated on or before the date of service and from the most relevant encounter.
2. denial_mappings: for each requirement the denial letter says was not met, quote it verbatim from the letter and map it to the policy version + criterion that contains it ("none" if it appears in no version). Be precise: if a requirement only exists in an older version, map it to that older version.
3. summary.
Never paraphrase inside quote fields. Short exact excerpts beat long inexact ones.`
  return run('match', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseJsonSchema: MATCH_SCHEMA, ...thinkingFor(model, 'medium'), abortSignal: signal },
    })
    const raw = parseJson<{ rows: Omit<MatchRow, 'id' | 'criterion_label'>[]; denial_mappings: DenialMapping[]; summary: string }>(r.text)
    if (!raw.rows?.length) throw new Error('empty response')
    const rows: MatchRow[] = raw.rows.map((row, i) => ({
      ...row,
      id: `r${i + 1}`,
      criterion_label: effective.criteria.find(c => c.id === row.criterion_id)?.label || row.criterion_id,
      chart_quote: row.chart_quote ? row.chart_quote : null,
      chart_line: row.chart_line ? row.chart_line : null,
      missing_document: row.missing_document ? row.missing_document : null,
    }))
    const denial_mappings = (raw.denial_mappings || []).map(m => ({
      ...m,
      maps_to_version: !m.maps_to_version || m.maps_to_version === 'none' ? null : m.maps_to_version,
      maps_to_criterion: !m.maps_to_criterion || m.maps_to_criterion === 'none' ? null : m.maps_to_criterion,
    }))
    return { rows, denial_mappings, summary: raw.summary } satisfies MatchResult
  })
}

// ------------------------------------------------------------------ entailment (key 2)
const ENTAIL_SCHEMA = {
  type: 'object',
  properties: { results: { type: 'array', items: { type: 'object', properties: {
    row_id: { type: 'string' },
    verdict: { type: 'string', enum: ['supports', 'contradicts', 'insufficient'] },
    reason_code: { type: 'string', enum: ['ok', 'date_mismatch', 'laterality', 'negation', 'patient_mismatch', 'irrelevant', 'other'] },
    explanation: { type: 'string', description: 'one sentence' },
  }, required: ['row_id', 'verdict', 'reason_code', 'explanation'] } } },
  required: ['results'],
}

export async function entail(args: { rows: MatchRow[]; chartText: string; denial: Denial }) {
  const lines = toLines(args.chartText)
  const ctx = (n: number | null) => {
    if (!n) return '(no chart evidence)'
    const a = Math.max(1, n - 3), b = Math.min(lines.length, n + 2)
    return lines.slice(a - 1, b).map((l, i) => `L${a + i}${a + i === n ? ' >>' : ''}: ${l}`).join('\n')
  }
  const items = args.rows.filter(r => r.chart_quote).map(r => `ROW ${r.id}
Criterion: ${r.policy_quote}
Evidence quote: "${r.chart_quote}" (line ${r.chart_line})
Context:
${ctx(r.chart_line)}`).join('\n\n')
  if (!items) return { value: [] as Entailment[], model: 'none', ms: 0, attempts: [] }
  return run('entail', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: `You are a skeptical medical-necessity auditor (the second key of a two-key verifier). For each row decide whether the evidence quote, read in context, genuinely SUPPORTS that the patient meets the criterion.
Patient: ${args.denial.member_name}. Date of service: ${args.denial.date_of_service}.
Flag problems precisely:
- date_mismatch: evidence is from an encounter outside the window the criterion requires, or long before the date of service, or after it.
- laterality: wrong side/body part.
- negation: the line actually says the opposite (e.g. "no", "denies", "not").
- patient_mismatch: refers to a different person (e.g. family history).
- irrelevant: true statement but does not address the criterion.
Use verdict "supports" with reason_code "ok" only if the evidence clearly establishes the criterion.

${items}`,
      config: { responseMimeType: 'application/json', responseJsonSchema: ENTAIL_SCHEMA, ...thinkingFor(model, 'low'), abortSignal: signal },
    })
    return parseJson<{ results: Entailment[] }>(r.text).results
  })
}

// --------------------------------------------------------------------- letter
export async function draftLetter(args: {
  denial: Denial; effective: PolicyVersion; rows: MatchRow[]; flags: { title: string; detail: string; citation?: string }[]; providerName: string
}) {
  const { denial, effective, rows, flags } = args
  const prompt = `Draft the BODY of a formal request for reconsideration (appeal) of a ${denial.plan_type} denial, written by the provider's billing team on behalf of the patient.

Facts:
- Patient: ${denial.member_name} (Member ID ${denial.member_id}); Plan: ${denial.plan_name} (${denial.payer}); Service: ${denial.service_description}; Codes: ${denial.codes.map(c => `${c.system} ${c.code}`).join(', ')}; Date of service: ${denial.date_of_service}; Notice date: ${denial.notice_date}.
- Denial reason (verbatim): "${denial.denial_reason_text}"
- Governing policy: ${effective.id} ${effective.title}, version effective ${effective.effective_date}.
- Criterion-by-criterion findings (only verified rows):
${rows.map(r => `  ${r.id} [${r.status}] ${r.criterion_label}: ${r.reasoning}`).join('\n')}
- Compliance issues found:
${flags.map(f => `  - ${f.title}: ${f.detail}${f.citation ? ` (${f.citation})` : ''}`).join('\n') || '  (none)'}

STRICT QUOTING RULES — the letter is machine-verified:
- NEVER type a quotation from the policy or the chart yourself. Instead insert tokens: [[Q:<rowId>:policy]] for the policy criterion quote and [[Q:<rowId>:chart]] for the chart evidence quote (e.g. [[Q:r2:policy]]). Only use row ids listed above, and only :chart for rows that have chart evidence.
- You may cite regulations by section number only (e.g. 42 CFR § 422.101(b)(6)); do not quote regulation text.
- Do not invent facts, dates, test results, or names.

Structure (markdown, no letter header/signature — those are added automatically):
1. Opening paragraph: request reconsideration, identify the service and the denial.
2. "## Governing coverage criteria" — explain the effective policy applies; if a cited requirement is not in the effective version, say so plainly.
3. "## The patient meets each criterion" — one short paragraph or bullet per criterion with both tokens.
4. "## Procedural issues" — only if compliance issues exist.
5. "## Request" — ask that the denial be overturned and the service covered; request reviewer credentials if not stated.
Tone: precise, professional, firm. 350-550 words.`
  return run('letter', async (model, signal) => {
    const r = await ai().models.generateContent({ model, contents: prompt, config: { ...thinkingFor(model, 'medium'), abortSignal: signal } })
    const t = (r.text || '').trim()
    if (t.length < 200) throw new Error('empty response')
    return t.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/, '')
  })
}

// ------------------------------------------------------------------ explainer
export async function explainForPatient(args: { denial: Denial; summary: string; flags: { title: string }[]; deadline: string; lang: 'English' | 'Spanish' }) {
  return run('explain', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: `Write a warm, plain-language explanation (6th-grade reading level, ${args.lang}, 110-160 words, no markdown) for the patient ${args.denial.member_name.split(' ')[0]} about their denied ${args.denial.service_description}.
Cover: what the insurer said; why the denial looks wrong (${args.summary}; issues: ${args.flags.map(f => f.title).join('; ') || 'none'}); that their care team is appealing; the appeal deadline ${args.deadline}; and that they can call their plan to ask for the reviewer's credentials. Do not give legal advice. Speak directly to them.`,
      config: { ...thinkingFor(model, 'low'), abortSignal: signal },
    })
    const t = (r.text || '').trim()
    if (!t) throw new Error('empty response')
    return t
  })
}

// ------------------------------------------------------------------------ TTS
export async function speak(text: string): Promise<{ value: string; model: string }> {
  const res = await run('tts', async (model, signal) => {
    const r = await ai().models.generateContent({ model, contents: text, config: { responseModalities: ['AUDIO'], abortSignal: signal } })
    const p = r.candidates?.[0]?.content?.parts?.find(x => x.inlineData)?.inlineData
    if (!p?.data) throw new Error('empty response')
    return `data:${p.mimeType || 'audio/wav'};base64,${p.data}`
  })
  return { value: res.value, model: res.model }
}

// ------------------------------------------------------------- objection coach
export async function objections(args: { denial: Denial; rows: MatchRow[]; flags: { title: string; citation?: string }[] }) {
  return run('coach', async (model, signal) => {
    const r = await ai().models.generateContent({
      model,
      contents: `A provider is about to do a peer-to-peer call with the ${args.denial.payer} medical director about a denied ${args.denial.service_description}. Predict the 3 strongest objections the medical director will raise and the best response to each, using ONLY these verified findings (refer to rows by id, e.g. r2):
${args.rows.map(r => `${r.id} [${r.status}] ${r.criterion_label}: ${r.reasoning}`).join('\n')}
Issues: ${args.flags.map(f => `${f.title}${f.citation ? ` (${f.citation})` : ''}`).join('; ')}`,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
          objection: { type: 'string' }, response: { type: 'string' }, row_ids: { type: 'array', items: { type: 'string' } } }, required: ['objection', 'response', 'row_ids'] } } }, required: ['items'] },
        ...thinkingFor(model, 'low'), abortSignal: signal,
      },
    })
    return parseJson<{ items: { objection: string; response: string; row_ids: string[] }[] }>(r.text).items
  })
}

// ------------------------------------------------------------- embeddings
export async function embed(texts: string[]) {
  return run('embed', async (model) => {
    const r = await ai().models.embedContent({ model, contents: texts })
    const v = r.embeddings?.map(e => e.values || [])
    if (!v?.length) throw new Error('empty response')
    return v
  })
}
export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}
