// Append-only, SHA-256 hash-chained audit log. Every biller decision and every
// AI step is recorded; "Verify chain" recomputes every hash and pinpoints tampering.

export interface AuditEntry {
  seq: number
  ts: number
  actor: string // "gemini-4-hydrogen", "verifier", "biller:Dana"
  action: string // "extract", "match", "row.confirm", "letter.sign", ...
  caseId: string | null
  payload: Record<string, unknown>
  prevHash: string
  hash: string
}

const LS = 'overturn_audit_v1'
const GENESIS = '0'.repeat(64)

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function body(e: Omit<AuditEntry, 'hash'>): string {
  return JSON.stringify([e.seq, e.ts, e.actor, e.action, e.caseId, e.payload, e.prevHash])
}

export function loadAudit(): AuditEntry[] {
  try { return JSON.parse(localStorage.getItem(LS) || '[]') } catch { return [] }
}
function saveAudit(entries: AuditEntry[]) {
  try { localStorage.setItem(LS, JSON.stringify(entries.slice(-2000))) } catch { /* quota */ }
}

type Listener = () => void
const listeners = new Set<Listener>()
export function onAudit(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn) } }

let queue: Promise<unknown> = Promise.resolve()

export function audit(actor: string, action: string, caseId: string | null, payload: Record<string, unknown> = {}): Promise<AuditEntry> {
  const p = queue.then(async () => {
    const entries = loadAudit()
    const prev = entries[entries.length - 1]
    const base = { seq: (prev?.seq ?? 0) + 1, ts: Date.now(), actor, action, caseId, payload, prevHash: prev?.hash ?? GENESIS }
    const entry: AuditEntry = { ...base, hash: await sha256(body(base)) }
    entries.push(entry)
    saveAudit(entries)
    listeners.forEach(l => l())
    return entry
  })
  queue = p.catch(() => undefined)
  return p
}

export interface ChainReport { ok: boolean; checked: number; brokenAt: number | null; reason?: string }

export async function verifyChain(entries = loadAudit()): Promise<ChainReport> {
  let prevHash = entries[0]?.prevHash ?? GENESIS
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.prevHash !== prevHash) return { ok: false, checked: i, brokenAt: e.seq, reason: 'prevHash does not match previous entry' }
    const h = await sha256(body(e))
    if (h !== e.hash) return { ok: false, checked: i, brokenAt: e.seq, reason: 'entry contents were modified after signing' }
    prevHash = e.hash
  }
  return { ok: true, checked: entries.length, brokenAt: null }
}

/** Demo helper: silently edit one historical entry to prove verifyChain catches it. */
export function simulateTamper(): number | null {
  const entries = loadAudit()
  if (entries.length < 2) return null
  const idx = Math.max(0, Math.floor(entries.length / 2) - 1)
  entries[idx] = { ...entries[idx], payload: { ...entries[idx].payload, tampered: 'value changed by an attacker' } }
  saveAudit(entries)
  listeners.forEach(l => l())
  return entries[idx].seq
}

/** Repair a tampered demo chain by re-signing from the first broken entry. */
export function resealChain(): Promise<void> {
  const p = queue.then(resealNow)
  queue = p.catch(() => undefined)
  return p
}
async function resealNow(): Promise<void> {
  const entries = loadAudit()
  let prevHash = GENESIS
  for (const e of entries) {
    const { tampered: _t, ...rest } = e.payload as Record<string, unknown>
    e.payload = rest
    e.prevHash = prevHash
    e.hash = await sha256(body(e))
    prevHash = e.hash
  }
  saveAudit(entries)
  listeners.forEach(l => l())
}

export function clearAudit() { localStorage.removeItem(LS); listeners.forEach(l => l()) }
