// Local data controls: reset demo cases, clear the audit log, or wipe everything Overturn stored.
import { useEffect, useState, type ReactNode } from 'react'
import { Database, Eraser, History, RotateCcw, Trash2 } from 'lucide-react'
import { clearAudit, loadAudit, onAudit } from '../../lib/audit'
import { SEEDS, caseStore, useCases } from '../../lib/store'
import { Button, toast } from '../../ui/kit'
import { ConfirmDialog } from '../audit/bits'
import { SettingsCard } from './parts'

const isOurs = (k: string) => k.startsWith('overturn_') || k === 'gemini_user_key'

function scanStorage(): { keys: string[]; bytes: number } {
  const keys: string[] = []
  let bytes = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && isOurs(k)) { keys.push(k); bytes += (k.length + (localStorage.getItem(k) || '').length) * 2 }
    }
  } catch { /* storage blocked */ }
  return { keys, bytes }
}
const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`)

type Confirm = null | 'cases' | 'audit' | 'all'

export function DataCard({ delay }: { delay?: number }) {
  const cases = useCases()
  const [auditCount, setAuditCount] = useState(() => loadAudit().length)
  const [usage, setUsage] = useState(scanStorage)
  const [confirm, setConfirm] = useState<Confirm>(null)

  useEffect(() => onAudit(() => { setAuditCount(loadAudit().length); setUsage(scanStorage()) }), [])
  useEffect(() => { setUsage(scanStorage()) }, [cases])

  const added = cases.filter(c => !SEEDS.some(s => s.id === c.id)).length

  const resetCases = () => {
    caseStore.resetAll()
    try {
      const last = localStorage.getItem('overturn_last_case')
      if (last && !SEEDS.some(s => s.id === last)) localStorage.removeItem('overturn_last_case')
    } catch { /* ignore */ }
    setConfirm(null)
    toast(`Restored ${SEEDS.length} demo cases to their original state.`, 'green')
  }
  const clearLog = () => {
    clearAudit()
    try { localStorage.removeItem('overturn_audit_lastverify_v1') } catch { /* ignore */ }
    setConfirm(null)
    toast('Audit log cleared from this browser.', 'gray')
  }
  const clearAll = () => {
    const { keys } = scanStorage()
    for (const k of keys) { try { localStorage.removeItem(k) } catch { /* ignore */ } }
    location.reload()
  }

  return (
    <SettingsCard delay={delay} icon={<Database className="size-4 text-emerald-700" />} title="Data"
      sub={<>Overturn keeps <span className="text-ink-200">{fmtBytes(usage.bytes)}</span> in this browser across {usage.keys.length} {usage.keys.length === 1 ? 'key' : 'keys'}. Nothing is stored anywhere else.</>}>
      <div className="divide-y divide-line/70 overflow-hidden rounded-md border border-line/70">
        <Row icon={<RotateCcw className="size-4 text-ink-300" />} title="Reset demo cases"
          body={`Put all ${SEEDS.length} demo cases back to their original state, discarding analyses, letters, and sign-offs${added ? `, and remove the ${added} ${added === 1 ? 'case' : 'cases'} you added` : ''}.`}
          action={<Button variant="subtle" onClick={() => setConfirm('cases')}>Reset cases</Button>} />
        <Row icon={<History className="size-4 text-ink-300" />} title="Clear audit log"
          body={`Delete all ${auditCount.toLocaleString()} hash-chained ${auditCount === 1 ? 'entry' : 'entries'}. Export them from the Audit trail first if you need a copy.`}
          action={<Button variant="subtle" disabled={!auditCount} onClick={() => setConfirm('audit')}>Clear log</Button>} />
        <Row icon={<Eraser className="size-4 text-rose-700" />} title="Clear everything"
          body="Remove every Overturn key from this browser, including cases, audit log, settings, and your API key, then reload."
          action={<Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('all')}>Clear everything</Button>} />
      </div>

      <ConfirmDialog open={confirm === 'cases'} onClose={() => setConfirm(null)} onConfirm={resetCases} title="Reset demo cases?" confirmLabel="Reset cases" icon={<RotateCcw className="size-5" />}>
        <p>All {SEEDS.length} demo cases go back to their original state. Analyses, letters, and sign-offs on them are discarded{added ? `, and the ${added} ${added === 1 ? 'case' : 'cases'} you added will be removed` : ''}.</p>
        <p className="text-ink-400">Your API key, settings, and audit log are kept.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'audit'} onClose={() => setConfirm(null)} onConfirm={clearLog} title="Clear the audit log?" confirmLabel="Delete all entries" icon={<History className="size-5" />}>
        <p>This permanently deletes all <span className="font-semibold text-ink-100">{auditCount.toLocaleString()}</span> audit entries from this browser. It cannot be undone.</p>
        <p className="text-ink-400">A production audit log is never cleared. This exists so you can restart the demo.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'all'} onClose={() => setConfirm(null)} onConfirm={clearAll} title="Clear everything?" confirmLabel="Clear and reload" icon={<Eraser className="size-5" />}>
        <p>This removes {usage.keys.length} {usage.keys.length === 1 ? 'key' : 'keys'} ({fmtBytes(usage.bytes)}) from this browser and reloads the app. It cannot be undone.</p>
        {usage.keys.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...usage.keys].sort().map(k => <code key={k} className="rounded-md border border-line bg-black/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-ink-300">{k}</code>)}
          </div>
        )}
      </ConfirmDialog>
    </SettingsCard>
  )
}

function Row({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-ink-100">{title}</div>
          <div className="text-[12.5px] leading-relaxed text-ink-400">{body}</div>
        </div>
      </div>
      <div className="shrink-0 pl-7 sm:pl-0">{action}</div>
    </div>
  )
}
