import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Eye, FileCheck2, Lock, LockOpen, PenLine, Printer, RefreshCw, Signature } from 'lucide-react'
import type { CaseFile, PolicyVersion } from '../../lib/types'
import { buildLetter, type Inline } from '../../lib/letter'
import { policyText } from '../../lib/pipeline'
import { rowIsVerified, rowKeys } from '../../lib/engine'
import { caseStore } from '../../lib/store'
import { audit } from '../../lib/audit'
import { Badge, Button, Card, cx, toast } from '../../ui/kit'
import { exportAppeal } from './exportLetter'

function InlineView({ i }: { i: Inline }) {
  if (i.kind === 'bold') return <strong className="text-ink-100">{i.text}</strong>
  if (i.kind === 'quote' || i.kind === 'freequote') return (
    <span className={cx('rounded px-0.5 transition-colors', i.ok ? 'bg-emerald-400/10 text-emerald-100 underline decoration-emerald-400/50 decoration-dotted underline-offset-4' : 'bg-rose-500/20 text-rose-100 underline decoration-rose-400 decoration-wavy underline-offset-4')}
      title={i.ok ? 'Verified verbatim against source' : 'NOT verified — export blocked'}>
      “{i.text}”{i.cite && <span className="ml-1 text-[11px] text-ink-400 no-underline">({i.cite})</span>}
    </span>
  )
  return <>{i.text}</>
}

export function LetterPanel({ c, effective, onRedraft, redrafting }: { c: CaseFile; effective: PolicyVersion; onRedraft: () => void; redrafting: boolean }) {
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(c.signedBy || '')
  const [attest, setAttest] = useState(!!c.signedBy)
  const rows = c.match?.rows || []
  const ptext = useMemo(() => policyText(effective), [effective])
  const built = useMemo(() => buildLetter(c.letter || '', {
    rows, effective, policyText: ptext, chartText: c.chartText, denialText: c.denialText,
    rowOk: (r, field) => {
      const k = rowKeys(r, effective, c.chartText)
      return field === 'policy' ? k.k1p.status === 'verified' : (k.k1c?.status === 'verified' && rowIsVerified(c, r, effective))
    },
  }), [c.letter, rows, effective, ptext, c.chartText, c.denialText, c.entailments])

  const metRows = rows.filter(r => r.status === 'met')
  const allMetVerified = metRows.every(r => rowIsVerified(c, r, effective))
  const allConfirmed = rows.filter(r => rowIsVerified(c, r, effective)).every(r => c.confirmed[r.id])
  const quotesOk = built.unverified.length === 0 && built.total > 0
  const signed = !!c.signedBy
  const gates = [
    { ok: quotesOk, label: `${built.verified}/${built.total} quotes verified verbatim` },
    { ok: allMetVerified, label: 'Every “met” criterion passes both keys' },
    { ok: allConfirmed, label: 'Biller confirmed each verified criterion' },
    { ok: signed, label: 'Human sign-off' },
  ]
  const canExport = gates.every(g => g.ok)

  async function sign() {
    if (!name.trim() || !attest) { toast('Type your name and tick the attestation.', 'amber'); return }
    caseStore.update(c.id, { signedBy: name.trim(), status: 'signed' })
    await audit(`biller:${name.trim()}`, 'letter.sign', c.id, { quotes: built.total, verified: built.verified })
    toast('Signed. Export unlocked when every gate is green.', 'green')
  }
  async function doExport() {
    exportAppeal(c, built.blocks, effective, rows)
    await audit(`biller:${c.signedBy}`, 'letter.export', c.id, { format: 'pdf' })
  }
  async function copyText() {
    const text = built.blocks.map(b => (b.kind === 'li' ? '• ' : '') + b.inlines.map(i => (i.kind === 'quote' || i.kind === 'freequote') ? `“${i.text}”${i.cite ? ` (${i.cite})` : ''}` : i.text).join('')).join('\n\n')
    await navigator.clipboard.writeText(text)
    toast('Letter copied.', 'green')
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><PenLine className="size-4 text-violet-300" /> Request for reconsideration</div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" icon={edit ? <Eye className="size-3.5" /> : <PenLine className="size-3.5" />} onClick={() => setEdit(v => !v)}>{edit ? 'Preview' : 'Edit'}</Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRedraft} loading={redrafting}>Redraft</Button>
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={copyText}>Copy</Button>
          </div>
        </div>
        {edit ? (
          <div className="p-4">
            <p className="mb-2 text-[12px] text-ink-400">Quotes are inserted with tokens like <code className="rounded bg-white/10 px-1">[[Q:r2:policy]]</code> and <code className="rounded bg-white/10 px-1">[[Q:r2:chart]]</code>. Anything you type in quotation marks is re-verified against the sources on every keystroke.</p>
            <textarea value={c.letter || ''} onChange={e => caseStore.update(c.id, { letter: e.target.value, signedBy: null, status: 'ready' })} spellCheck
              className="scrollbar-thin min-h-[520px] w-full resize-y rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[12.5px] leading-relaxed text-ink-200 outline-none focus:border-violet-400/40" />
          </div>
        ) : (
          <div className="scrollbar-thin max-h-[680px] overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent)] px-6 py-6 sm:px-10">
            <div className="mx-auto max-w-[680px] font-[450] text-[14px] leading-[1.8] text-ink-300">
              <div className="mb-5 text-[12px] text-ink-400">{c.denial?.provider_name} → {c.denial?.plan_name}, Appeals &amp; Grievances · RE: {c.denial?.member_name}, {c.denial?.service_description}</div>
              {built.blocks.map((b, i) => b.kind === 'h'
                ? <h3 key={i} className="mb-2 mt-6 text-[15px] font-semibold text-ink-100">{b.inlines.map((x, j) => <InlineView key={j} i={x} />)}</h3>
                : b.kind === 'li'
                  ? <div key={i} className="mb-2 flex gap-2.5 pl-1"><span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-violet-300/70" /><div>{b.inlines.map((x, j) => <InlineView key={j} i={x} />)}</div></div>
                  : <p key={i} className="mb-3.5">{b.inlines.map((x, j) => <InlineView key={j} i={x} />)}</p>)}
              {signed && <div className="mt-8 border-t border-white/10 pt-4 text-ink-200">Sincerely,<div className="mt-3 font-display text-2xl italic text-ink-100">{c.signedBy}</div><div className="text-[12px] text-ink-400">on behalf of {c.denial?.provider_name}</div></div>}
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="size-4 text-emerald-300" /> Export gate</div>
          <div className="space-y-2">
            {gates.map(g => (
              <div key={g.label} className="flex items-center gap-2.5 text-[12.5px]">
                <span className={cx('flex size-5 items-center justify-center rounded-full border', g.ok ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300' : 'border-white/15 text-ink-400')}>{g.ok ? '✓' : ''}</span>
                <span className={g.ok ? 'text-ink-200' : 'text-ink-400'}>{g.label}</span>
              </div>
            ))}
          </div>
          {built.unverified.length > 0 && (
            <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-[12px] text-rose-200">
              {built.unverified.length} unverified quote{built.unverified.length > 1 ? 's' : ''}: “{built.unverified[0].text.slice(0, 90)}{built.unverified[0].text.length > 90 ? '…' : ''}”
            </div>
          )}
          <motion.div layout className="mt-4">
            <Button variant={canExport ? 'success' : 'subtle'} className="w-full" icon={canExport ? <LockOpen className="size-4" /> : <Lock className="size-4" />} disabled={!canExport} onClick={doExport}>
              <Printer className="size-4" /> Export fax-ready PDF
            </Button>
          </motion.div>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Signature className="size-4 text-amber-200" /> Human sign-off</div>
          {signed ? (
            <div className="space-y-2 text-[12.5px] text-ink-300">
              <Badge tone="green">Signed by {c.signedBy}</Badge>
              <p>Any edit to the letter clears the signature and re-runs verification.</p>
              <Button size="sm" variant="ghost" onClick={() => { caseStore.update(c.id, { signedBy: null, status: 'ready' }); audit('biller', 'letter.unsign', c.id, {}) }}>Revoke signature</Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-amber-300/40" />
              <label className="flex items-start gap-2 text-[12px] leading-snug text-ink-300">
                <input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} className="mt-0.5 accent-emerald-400" />
                I reviewed every criterion and quotation, and this appeal is accurate to the best of my knowledge.
              </label>
              <Button variant="primary" size="sm" className="w-full" onClick={sign}>Sign appeal</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
