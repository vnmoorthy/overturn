// Core domain types for Overturn.

export interface PolicySection { id: string; heading: string; text: string }
export interface PolicyCriterion { id: string; label: string; quote: string; section: string }

export interface PolicyVersion {
  id: string // e.g. L33822
  title: string
  type: 'LCD' | 'NCD' | 'CPB' | 'Custom' | string
  contractor?: string
  version_label: string // "current" | "2020" ...
  effective_date: string // YYYY-MM-DD
  retired_date?: string | null
  source_url: string
  retrieved?: string
  sections: PolicySection[]
  criteria: PolicyCriterion[]
  revision_notes?: string[]
  verbatim?: boolean
}

export interface PolicyFamily {
  id: string
  title: string
  type: string
  short: string
  codes: string[] // HCPCS/CPT codes that route here
  keywords: string[]
  segment: string // key into imr.json segments
  core?: string[] // criteria ids relevant to initial coverage
  groups?: string[][] // "any one of" alternative groups
  versions: PolicyVersion[] // sorted oldest -> newest
}

export type CodeSystem = 'CPT' | 'HCPCS' | 'ICD-10' | 'CARC' | 'RARC' | 'Other'
export interface CodeRef { system: CodeSystem; code: string; description: string }

export interface Denial {
  payer: string
  plan_name: string
  plan_type: 'Medicare Advantage' | 'Commercial' | 'Medicaid managed care' | 'Traditional Medicare' | 'Other'
  member_name: string
  member_id: string
  provider_name: string
  service_description: string
  codes: CodeRef[]
  date_of_service: string // YYYY-MM-DD
  notice_date: string // YYYY-MM-DD
  decision_type: 'pre-service' | 'payment' | 'unknown'
  denial_reason_text: string // verbatim from letter
  cited_requirements: string[] // verbatim snippets from letter
  reviewer: string | null
  reviewer_credentials_stated: boolean
  specific_criterion_cited: boolean
  billed_amount: number | null
  expedited: boolean
}

export type RowStatus = 'met' | 'unmet' | 'missing'
export interface MatchRow {
  id: string
  criterion_id: string
  criterion_label: string
  status: RowStatus
  policy_quote: string
  chart_quote: string | null
  chart_line: number | null
  reasoning: string
  missing_document: string | null
  tampered_from?: string // original policy quote before an on-stage "Tamper"
  swapped_from?: { quote: string | null; line: number | null; entailment?: Entailment | null } // original chart evidence before "Swap evidence"
}

export interface DenialMapping {
  requirement_quote: string // verbatim from the denial letter
  maps_to_version: string | null // version_label in the policy family, or null
  maps_to_criterion: string | null // criterion id
  explanation: string
}

export interface MatchResult {
  rows: MatchRow[]
  denial_mappings: DenialMapping[]
  summary: string
}

export type VerifyStatus = 'verified' | 'not_found'
export interface VerifyResult {
  status: VerifyStatus
  start: number
  end: number
  closest?: string
  diff?: DiffToken[]
}
export interface DiffToken { text: string; kind: 'same' | 'added' | 'removed' }

export type EntailVerdict = 'supports' | 'contradicts' | 'insufficient'
export type EntailReason = 'ok' | 'date_mismatch' | 'laterality' | 'negation' | 'patient_mismatch' | 'irrelevant' | 'other'
export interface Entailment { row_id: string; verdict: EntailVerdict; reason_code: EntailReason; explanation: string; chart_quote?: string | null }

export type FlagSeverity = 'violation' | 'warning' | 'info' | 'strength'
export interface Flag {
  id: string
  severity: FlagSeverity
  title: string
  detail: string
  citation?: string
  evidence?: { label: string; text: string }[]
}

export interface TraceEntry {
  task: string
  model: string
  ms: number
  ok: boolean
  cached?: boolean
  error?: string
  at: number
}

export type CaseStatus = 'new' | 'analyzing' | 'ready' | 'signed' | 'submitted' | 'won' | 'lost'

export interface CaseFile {
  id: string
  title: string
  hero?: boolean
  createdAt: number
  updatedAt: number
  status: CaseStatus
  denialText: string // raw letter text (verbatim source for denial quotes)
  denialFile?: { name: string; mimeType: string; dataUrl: string } | null
  chartText: string // raw chart text (verbatim source for chart quotes)
  chartTitle: string
  denial: Denial | null
  extractedText?: string // the letter text the current `denial` was extracted from
  familyId: string | null
  versionLabel: string | null
  match: MatchResult | null
  entailments: Entailment[] | null
  confirmed: Record<string, boolean>
  letter: string | null // markdown with [[Q:rowId:policy|chart]] tokens
  signedBy: string | null
  outcome: 'won' | 'lost' | null
  outcomeNote?: string
  trace: TraceEntry[]
  patientExplainer?: { lang: string; text: string } | null
}
