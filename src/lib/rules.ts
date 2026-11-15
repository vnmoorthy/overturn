// Deterministic compliance engine. Gemini supplies features (mappings, quotes);
// these rules — not the model — decide every flag. Each flag is a "possible
// issue — biller confirms", never a legal conclusion.

import type { Denial, DenialMapping, Flag, MatchRow, PolicyFamily, PolicyVersion } from './types'
import { verifyQuote } from './verifier'
import { policyText } from './pipeline'
import { removedOn } from './policies'

export function addDays(iso: string, days: number): Date {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d
}
export function fmtDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d + 'T12:00:00') : d
  if (isNaN(x.getTime())) return String(d)
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
export function daysBetween(a: Date, b: Date) { return Math.ceil((b.getTime() - a.getTime()) / 86_400_000) }

export function appealDeadline(denial: Denial): { due: Date; days: number; rule: string; window: string } {
  const ma = denial.plan_type === 'Medicare Advantage'
  const windowDays = ma ? 65 : 180
  const base = denial.notice_date || denial.date_of_service
  const due = addDays(base, windowDays)
  return {
    due,
    days: daysBetween(new Date(), due),
    rule: ma ? '42 CFR § 422.582' : 'ERISA 29 CFR § 2560.503-1(h)',
    window: ma ? '65 calendar days from the notice date' : '180 days from the notice date (typical commercial plan)',
  }
}

export interface RuleInput {
  denial: Denial
  denialText: string
  family: PolicyFamily
  effective: PolicyVersion
  mappings: DenialMapping[]
  rows: MatchRow[]
  rowVerified: (row: MatchRow) => boolean
}

export function evaluate(inp: RuleInput): Flag[] {
  const { denial, family, effective, mappings, rows, denialText } = inp
  const flags: Flag[] = []
  const effText = policyText(effective)
  const isMA = denial.plan_type === 'Medicare Advantage'

  const rowFor = (cid: string | null) => rows.find(r => r.criterion_id === cid)
  const metOk = (r?: MatchRow) => !!r && r.status === 'met' && inp.rowVerified(r)
  const groupOf = (cid: string) => (family.groups || []).find(g => g.includes(cid))
  const groupSatisfied = (cid: string) => (groupOf(cid) || []).some(id => id !== cid && metOk(rowFor(id)))

  // 1. Retired-rule / phantom-criterion / contradicted-by-record detection.
  for (const m of mappings) {
    const quoteOk = verifyQuote(m.requirement_quote, denialText).status === 'verified'
    if (!quoteOk) continue // the model's quote of the letter must itself be verified
    const version = family.versions.find(v => v.version_label === m.maps_to_version)
    const crit = version?.criteria.find(c => c.id === m.maps_to_criterion)
    const inEffective = crit ? verifyQuote(crit.quote, effText).status === 'verified' : false
    if (version && crit && version.version_label !== effective.version_label && !inEffective) {
      const next = family.versions.find(v => v.effective_date > version.effective_date)
      const removed = removedOn(crit.label) || version.retired_date || next?.effective_date || effective.effective_date
      flags.push({
        id: `retired-${version.version_label}-${crit.id}`,
        severity: 'violation',
        title: 'Denial relies on a retired requirement',
        detail: `The letter applies "${crit.label.replace(/\s*\(removed[^)]*\)/i, '')}", which CMS removed from ${family.id} on ${fmtDate(removed)}. It is not in the version in effect on the date of service (effective ${fmtDate(effective.effective_date)}).`,
        citation: `${family.id} revision history · 42 CFR § 422.101(b)(3)`,
        evidence: [
          { label: 'Denial letter', text: m.requirement_quote },
          { label: `${family.id} · ${version.version_label} version (no longer in effect)`, text: crit.quote },
        ],
      })
    } else if (crit && inEffective && version?.version_label === effective.version_label) {
      const row = rowFor(crit.id)
      if (metOk(row)) {
        flags.push({
          id: `contradicted-${crit.id}`,
          severity: 'violation',
          title: 'The record documents what the denial says is missing',
          detail: `The denial says "${crit.label}" is not met, but chart line ${row!.chart_line} documents it — verified verbatim.`,
          evidence: [{ label: 'Denial letter', text: m.requirement_quote }, { label: `Chart, line ${row!.chart_line}`, text: row!.chart_quote || '' }],
        })
      } else if (groupSatisfied(crit.id)) {
        const alt = (groupOf(crit.id) || []).map(id => rowFor(id)).find(r => r && r.criterion_id !== crit.id && metOk(r))!
        flags.push({
          id: `alternative-${crit.id}`,
          severity: 'violation',
          title: 'Denial ignores an alternative way to qualify',
          detail: `The policy can be met by either "${crit.label}" or "${alt.criterion_label}". The denial applied only the first; the chart verifiably meets the second.`,
          citation: `${family.id}`,
          evidence: [{ label: 'Denial letter', text: m.requirement_quote }, { label: `${family.id} (in effect)`, text: alt.policy_quote }, { label: `Chart, line ${alt.chart_line}`, text: alt.chart_quote || '' }],
        })
      }
    } else if (!crit && isMA && /LCD|NCD/.test(effective.type)) {
      flags.push({
        id: `phantom-${flags.length}`,
        severity: 'violation',
        title: 'Denial applies criteria not found in the governing LCD',
        detail: `"${m.requirement_quote}" does not appear in any version of ${family.id}. MA plans may use internal coverage criteria only when Medicare criteria are not fully established — and must publish them with their evidence.`,
        citation: '42 CFR § 422.101(b)(6)',
        evidence: [{ label: 'Denial letter', text: m.requirement_quote }],
      })
    }
  }

  // 2. MA plans are bound by Traditional Medicare NCD/LCD criteria.
  if (isMA && /LCD|NCD/.test(effective.type)) {
    flags.push({
      id: 'ma-bound',
      severity: 'info',
      title: `Plan must follow ${family.id}`,
      detail: `Medicare Advantage organizations must comply with Traditional Medicare NCDs and LCDs, and may not use internal criteria that are more restrictive where Medicare coverage criteria are fully established.`,
      citation: '42 CFR § 422.101(b)(1), (b)(3) & (b)(6)',
    })
  }

  // 3. Specific reason requirement.
  if (!denial.specific_criterion_cited) {
    flags.push({
      id: 'no-specific',
      severity: 'warning',
      title: 'Denial does not cite a specific coverage policy',
      detail: 'The notice does not identify the specific policy or criterion relied on. Denial notices must state the specific reasons for the denial.',
      citation: isMA ? '42 CFR § 422.568(e) · CMS-0057-F' : 'ERISA 29 CFR § 2560.503-1(g)',
    })
  }

  // 4. Reviewer credentials.
  if (!denial.reviewer_credentials_stated && isMA) {
    flags.push({
      id: 'reviewer',
      severity: 'warning',
      title: 'Request the reviewer’s credentials',
      detail: 'An adverse medical-necessity decision must be reviewed by a physician or other appropriate health care professional with expertise in the field of medicine appropriate for the service. The letter does not state who reviewed it or their specialty.',
      citation: '42 CFR § 422.566(d)',
    })
  }

  // 5. Deadline.
  const dl = appealDeadline(denial)
  flags.push({
    id: 'deadline',
    severity: dl.days < 14 ? 'warning' : 'info',
    title: dl.days >= 0 ? `Appeal deadline: ${fmtDate(dl.due)} (${dl.days} days left)` : `Appeal window closed ${fmtDate(dl.due)}`,
    detail: `Reconsideration must be requested within ${dl.window}.${denial.expedited ? ' Expedited review: decision within 72 hours.' : ''}`,
    citation: dl.rule,
  })

  // 6. Strength: every criterion documented and verified.
  const verifiedMet = rows.filter(r => metOk(r) || (r.status !== 'met' && groupSatisfied(r.criterion_id)))
  if (rows.length && verifiedMet.length === rows.length) {
    flags.push({
      id: 'all-met',
      severity: 'strength',
      title: `Chart documents all ${rows.length} criteria of the effective policy`,
      detail: 'Every criterion is supported by a verbatim, machine-verified chart quote.',
    })
  }
  const missing = rows.filter(r => r.status !== 'met' && !groupSatisfied(r.criterion_id))
  if (missing.length) {
    flags.push({
      id: 'gaps',
      severity: 'warning',
      title: `${missing.length} criterion${missing.length > 1 ? 'a' : ''} need${missing.length > 1 ? '' : 's'} more documentation`,
      detail: missing.map(r => `${r.criterion_label}${r.missing_document ? ` — attach: ${r.missing_document}` : ''}`).join('; '),
    })
  }
  return flags
}

export const SEVERITY_ORDER: Record<Flag['severity'], number> = { violation: 0, warning: 1, strength: 2, info: 3 }
