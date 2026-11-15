// Helpers for the Audit trail page: actor classification, hash formatting,
// verification-state persistence and per-row / per-link chain status.
import type { AuditEntry, ChainReport } from '../../lib/audit'

export const GENESIS = '0'.repeat(64)

export type ActorKind = 'ai' | 'verifier' | 'human' | 'rules' | 'system'
export function actorKind(actor: string): ActorKind {
  const a = actor.toLowerCase()
  if (a.startsWith('gemini')) return 'ai'
  if (a === 'verifier' || a.startsWith('verifier')) return 'verifier'
  if (a.startsWith('biller') || a.startsWith('provider') || a.startsWith('human')) return 'human'
  if (a === 'rules' || a.startsWith('rules')) return 'rules'
  return 'system'
}
export function actorLabel(actor: string): string {
  const i = actor.indexOf(':')
  return i > 0 ? `${actor.slice(0, i)} · ${actor.slice(i + 1)}` : actor
}

export const shortHash = (h: string | undefined, head = 6, tail = 4) =>
  !h ? '—' : h.length <= head + tail + 1 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`

export function actionPrefix(action: string): string { return action.split(/[.:/]/)[0] || action }

const PREFIX_ORDER = ['case', 'intake', 'extract', 'transcribe', 'locate', 'match', 'verify', 'flags', 'row', 'letter', 'patient', 'p2p', 'outcome', 'demo']
export function sortPrefixes(p: string[]): string[] {
  return [...p].sort((a, b) => {
    const ia = PREFIX_ORDER.indexOf(a), ib = PREFIX_ORDER.indexOf(b)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return a.localeCompare(b)
  })
}

/** Cheap FNV-1a fingerprint of the stored log, used to tell if a verification is still current. */
export function fingerprint(entries: AuditEntry[]): string {
  const s = JSON.stringify(entries)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `${entries.length}:${(h >>> 0).toString(16)}`
}

export function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}
export const absTime = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

// ------------------------------------------------------------ verification state
export interface VerifyRecord extends ChainReport { at: number; ms: number; total: number; fp: string }
const LS_VERIFY = 'overturn_audit_lastverify_v1'
export function loadVerify(): VerifyRecord | null {
  try { const r = localStorage.getItem(LS_VERIFY); return r ? JSON.parse(r) as VerifyRecord : null } catch { return null }
}
export function saveVerify(r: VerifyRecord | null) {
  try { r ? localStorage.setItem(LS_VERIFY, JSON.stringify(r)) : localStorage.removeItem(LS_VERIFY) } catch { /* ignore */ }
}

/** What the rail should show: nothing yet, an in-progress sweep, or a finished report. */
export type ChainView =
  | { mode: 'idle' }
  | { mode: 'scan'; upTo: number }
  | { mode: 'report'; ok: boolean; brokenAt: number | null; contents: boolean }

export type LinkState = 'idle' | 'ok' | 'broken' | 'unchecked' | 'scanning'

export function rowState(seq: number, v: ChainView): LinkState {
  if (v.mode === 'idle') return 'idle'
  if (v.mode === 'scan') return seq < v.upTo ? 'ok' : seq === v.upTo ? 'scanning' : 'idle'
  if (v.ok || v.brokenAt == null) return 'ok'
  return seq < v.brokenAt ? 'ok' : seq === v.brokenAt ? 'broken' : 'unchecked'
}

/** State of the link from entry `newer` back to entry `newer - 1` (newer.prevHash === older.hash). */
export function linkState(newer: number, v: ChainView): LinkState {
  if (v.mode === 'idle') return 'idle'
  if (v.mode === 'scan') return newer <= v.upTo ? 'ok' : 'idle'
  if (v.ok || v.brokenAt == null) return 'ok'
  const k = v.brokenAt
  // Contents edited at k: k's own back-link still matches, but the link k+1 → k no longer certifies k.
  const bad = v.contents ? k + 1 : k
  return newer < bad ? 'ok' : newer === bad ? 'broken' : 'unchecked'
}

/** Short one-line summary of a payload for the collapsed row. */
export function summarize(payload: Record<string, unknown>, max = 4): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'cached') continue
    let s: string
    if (Array.isArray(v)) {
      const simple = v.every(x => typeof x === 'string' || typeof x === 'number')
      s = simple && v.length <= 4 ? v.join(', ') : `${v.length} item${v.length === 1 ? '' : 's'}`
    } else if (v && typeof v === 'object') s = '{…}'
    else s = String(v)
    if (s.length > 48) s = s.slice(0, 47) + '…'
    parts.push(`${k}: ${s}`)
    if (parts.length >= max) break
  }
  return parts.join('  ·  ')
}

/** Recompute an entry's hash the same way the log signs it (for the forensic view of a broken row). */
export async function recomputeHash(e: AuditEntry): Promise<string> {
  const body = JSON.stringify([e.seq, e.ts, e.actor, e.action, e.caseId, e.payload, e.prevHash])
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(s: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(s); return true } catch { return false }
}
