import { useId, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Eye, Lock, LockOpen, PenLine, Printer, RefreshCw } from 'lucide-react'
import type { CaseFile, PolicyVersion } from '../../lib/types'
import { buildLetter, type Inline } from '../../lib/letter'
import { policyText } from '../../lib/pipeline'
import { rowIsVerified, rowKeys } from '../../lib/engine'
import { caseStore } from '../../lib/store'
import { audit } from '../../lib/audit'
import { fmtDate } from '../../lib/rules'
import { Badge, Button, Card, Eyebrow, cx, toast } from '../../ui/kit'
import { exportAppeal } from './exportLetter'

function InlineView({ i }: { i: Inline }) {
  if (i.kind === 'bold') return <strong className="font-semibold text-ink-100">{i.text}</strong>
  if (i.kind === 'quote' || i.kind === 'freequote') return (
    <span title={i.ok ? 'Verified verbatim against source' : 'NOT verified — export blocked'}>
      <span className={cx('rounded-[2px] px-[3px] transition-colors [box-decoration-break:clone] [-webkit-box-decoration-break:clone]',
        i.ok
          ? 'bg-mint-pale text-ink-100 underline decoration-mint decoration-1 underline-offset-[5px]'
          : 'bg-rose-50 text-rose-800 underline decoration-rose-500 decoration-wavy underline-offset-4')}>
        “{i.text}”
      </span>
      {i.cite && <span className="ml-1 whitespace-nowrap font-mono text-[11px] text-ink-400">({i.cite})</span>}
    </span>
  )
  return <>{i.text}</>
}

/** Small mono key/value row for the letterhead's RE block. */
function Re({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-[3px] sm:grid-cols-[112px_minmax(0,1fr)]">
      <dt className="eyebrow pt-[3px] !text-[9.5px]">{k}</dt>
      <dd className="text-[13px] leading-snug text-ink-200">{children}</dd>
    </div>
  )
}

export function LetterPanel({ c, effective, onRedraft, redrafting }: { c: CaseFile; effective: PolicyVersion; onRedraft: () => void; redrafting: boolean }) {
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(c.signedBy || '')
  const [attest, setAttest] = useState(!!c.signedBy)
  const nameId = useId()
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
  const allConfirmed = metRows.length > 0 && metRows.every(r => c.confirmed[r.id])
  const quotesOk = built.unverified.length === 0 && built.total > 0
  const signed = !!c.signedBy
  const gaps = rows.filter(r => r.status === 'missing' || (r.status === 'unmet' && !!r.missing_document))
  const [ackGaps, setAckGaps] = useState(false)
  const gates = [
    { ok: quotesOk, label: `${built.verified}/${built.total} quotes verified (provenance + support)` },
    { ok: allMetVerified, label: 'Every “met” criterion passes both keys' },
    { ok: allConfirmed, label: 'Biller confirmed each met criterion' },
    ...(gaps.length ? [{ ok: ackGaps, label: `Missing documentation will be attached (${gaps.length})` }] : []),
    { ok: signed, label: 'Human sign-off' },
  ]
  const canExport = gates.every(g => g.ok)
  const passed = gates.filter(g => g.ok).length

  async function sign() {
    if (!name.trim() || !attest) { toast('Type your name and tick the attestation.', 'amber'); return }
    caseStore.update(c.id, { signedBy: name.trim(), status: 'signed' })
    await audit(`biller:${name.trim()}`, 'letter.sign', c.id, { quotes: built.total, verified: built.verified })
    toast('Signed. Export unlocked when every gate is green.', 'green')
  }
  async function doExport() {
    exportAppeal(c, built.blocks, effective, rows, r => rowIsVerified(c, r, effective))
    await audit(`biller:${c.signedBy}`, 'letter.export', c.id, { format: 'pdf' })
  }
  async function copyText() {
    const text = built.blocks.map(b => (b.kind === 'li' ? '• ' : '') + b.inlines.map(i => (i.kind === 'quote' || i.kind === 'freequote') ? `“${i.text}”${i.cite ? ` (${i.cite})` : ''}` : i.text).join('')).join('\n\n')
    await navigator.clipboard.writeText(text)
    toast('Letter copied.', 'green')
  }

  const d = c.denial
  const svcCodes = d?.codes.filter(x => x.system !== 'ICD-10').map(x => x.code).join(', ')

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        {/* document toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <PenLine className="size-4 shrink-0 text-ink-400" aria-hidden />
            <div className="min-w-0">
              <div className="font-serif text-[15.5px] font-medium leading-tight tracking-[-0.01em] text-ink-100">Request for reconsideration</div>
              <div className="font-mono text-[10.5px] text-ink-400">
                <span className={quotesOk ? 'text-[#0b6b4a]' : 'text-rose-700'}>{built.verified}/{built.total} quotes verified</span>
                <span className="text-faint"> · </span>{edit ? 'editing source' : 'print preview'}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={edit ? <Eye className="size-3.5" /> : <PenLine className="size-3.5" />} onClick={() => setEdit(v => !v)}>{edit ? 'Preview' : 'Edit'}</Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRedraft} loading={redrafting}>Redraft</Button>
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={copyText}>Copy</Button>
          </div>
        </div>

        {edit ? (
          <div className="bg-paper-low/60 p-4 sm:p-5">
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-400">Quotes are inserted with tokens like <code className="rounded-[3px] border border-line bg-paper-high px-1 font-mono text-[11.5px] text-ink-200">[[Q:r2:policy]]</code> and <code className="rounded-[3px] border border-line bg-paper-high px-1 font-mono text-[11.5px] text-ink-200">[[Q:r2:chart]]</code>. Anything you type in quotation marks is re-verified against the sources on every keystroke.</p>
            <textarea aria-label="Letter source" value={c.letter || ''} onChange={e => caseStore.update(c.id, { letter: e.target.value, signedBy: null, status: 'ready' })} spellCheck
              className="scrollbar-thin min-h-[520px] w-full resize-y rounded-md border border-line bg-paper-high p-4 font-mono text-[12.5px] leading-[1.75] text-ink-200 outline-none transition-[border-color,box-shadow] focus:border-mint-deep focus:shadow-[0_0_0_3px_rgba(47,206,150,0.18)]" />
          </div>
        ) : (
          /* the desk, with the printed sheet on it */
          <div className="bg-paper-low/70 px-3 py-5 sm:px-8 sm:py-9">
            <article className="mx-auto max-w-[720px] rounded-[3px] border border-line bg-[#fffefa] px-5 py-8 shadow-[0_1px_2px_rgba(20,20,20,0.05),0_18px_40px_-28px_rgba(20,20,20,0.35)] sm:px-14 sm:py-14">
              {/* letterhead */}
              <header className="border-b-2 border-ink-100 pb-4">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div className="font-serif text-[21px] font-medium leading-tight tracking-[-0.02em] text-ink-100">{d?.provider_name}</div>
                  <div className="eyebrow !text-[9.5px]">Appeal · {effective.id}</div>
                </div>
              </header>
              <div className="mt-5 text-[13px] leading-snug text-ink-200">
                <div className="eyebrow mb-1 !text-[9.5px]">To</div>
                {d?.plan_name}<br />{d?.payer && d.payer !== d.plan_name ? `${d.payer} — ` : ''}Appeals &amp; Grievances
              </div>
              <dl className="mt-5 border-y border-line py-2.5">
                <Re k="RE">Request for reconsideration</Re>
                <Re k="Enrollee">{d?.member_name}{d?.member_id && <span className="font-mono text-[11.5px] text-ink-400"> · ID {d.member_id}</span>}</Re>
                <Re k="Service">{d?.service_description}{svcCodes && <span className="font-mono text-[11.5px] text-ink-400"> · {svcCodes}</span>}</Re>
                {d?.date_of_service && <Re k="Date of service">{fmtDate(d.date_of_service)}</Re>}
                <Re k="Policy">{effective.id} {effective.title} <span className="font-mono text-[11.5px] text-ink-400">· eff. {fmtDate(effective.effective_date)}</span></Re>
              </dl>

              {/* body */}
              <div className="mt-7 font-serif text-[15px] leading-[1.8] text-ink-200 [hanging-punctuation:first]">
                {built.blocks.map((b, i) => b.kind === 'h'
                  ? <h3 key={i} className="mb-2 mt-8 font-serif text-[16px] font-semibold tracking-[-0.01em] text-ink-100">{b.inlines.map((x, j) => <InlineView key={j} i={x} />)}</h3>
                  : b.kind === 'li'
                    ? <div key={i} className="mb-2.5 flex gap-3 pl-1"><span aria-hidden className="mt-[13px] h-px w-2.5 shrink-0 bg-ink-400" /><div className="min-w-0">{b.inlines.map((x, j) => <InlineView key={j} i={x} />)}</div></div>
                    : <p key={i} className="mb-4">{b.inlines.map((x, j) => <InlineView key={j} i={x} />)}</p>)}
              </div>

              {signed ? (
                <div className="mt-10 font-serif text-[15px] text-ink-200">
                  Sincerely,
                  <div className="mt-4 font-serif text-[28px] italic leading-none tracking-[-0.01em] text-ink-100">{c.signedBy}</div>
                  <div className="mt-2 max-w-[260px] border-t border-ink-300 pt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">on behalf of {d?.provider_name}</div>
                </div>
              ) : (
                <div className="mt-10" aria-hidden>
                  <div className="font-serif text-[15px] text-ink-300">Sincerely,</div>
                  <div className="mt-10 max-w-[260px] border-t border-dashed border-line-strong pt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">awaiting human sign-off</div>
                </div>
              )}
            </article>
          </div>
        )}
      </Card>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card className="p-5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <Eyebrow>Checks before export</Eyebrow>
              <h3 className="mt-1 font-serif text-[18px] font-medium leading-tight tracking-[-0.015em] text-ink-100">Export gate</h3>
            </div>
            <span className="font-mono text-[11px] text-ink-400"><span className={canExport ? 'text-[#0b6b4a]' : 'text-ink-100'}>{passed}</span>/{gates.length} passed</span>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {gates.map(g => <span key={g.label} className={cx('h-[3px] flex-1 rounded-[1px] transition-colors', g.ok ? 'bg-mint' : 'bg-line')} />)}
          </div>
          <ul className="mt-3 divide-y divide-line/70">
            {gates.map(g => (
              <li key={g.label} className="flex items-start gap-2.5 py-2">
                <span className={cx('mt-px flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border transition-colors',
                  g.ok ? 'border-mint-deep bg-mint text-mint-ink' : 'border-line-strong bg-paper-high')}>
                  {g.ok && <Check className="size-3" strokeWidth={3} aria-hidden />}
                </span>
                <span className={cx('min-w-0 font-mono text-[11.5px] leading-[1.55]', g.ok ? 'text-ink-200' : 'text-ink-400')}>
                  <span className="sr-only">{g.ok ? 'Passed: ' : 'Pending: '}</span>{g.label}
                </span>
              </li>
            ))}
          </ul>
          {gaps.length > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-md border border-line/70 border-l-2 border-l-amber-500 bg-paper-low p-3 text-[12.5px] leading-snug text-ink-200">
              <input type="checkbox" className="mt-0.5 size-3.5 shrink-0 accent-amber-600" checked={ackGaps} onChange={e => setAckGaps(e.target.checked)} />
              <span>I’ll attach: {gaps.map(g => g.missing_document || g.criterion_label).join('; ')}</span>
            </label>
          )}
          {built.unverified.length > 0 && (
            <div className="mt-3 rounded-md border border-line/70 border-l-2 border-l-rose-500 bg-paper-low p-3 text-[12.5px] leading-snug text-rose-800">
              <div className="eyebrow mb-1 !text-rose-700">Export blocked</div>
              {built.unverified.length} unverified quote{built.unverified.length > 1 ? 's' : ''}: “{built.unverified[0].text.slice(0, 90)}{built.unverified[0].text.length > 90 ? '…' : ''}”
            </div>
          )}
          <motion.div layout className="mt-4">
            <Button variant={canExport ? 'success' : 'subtle'} className="w-full" icon={canExport ? <LockOpen className="size-4" /> : <Lock className="size-4" />} disabled={!canExport} onClick={doExport}>
              <Printer className="size-4" /> Export fax-ready PDF
            </Button>
          </motion.div>
        </Card>

        <Card className="p-5">
          <Eyebrow>Human sign-off</Eyebrow>
          <h3 className="mt-1 font-serif text-[18px] font-medium leading-tight tracking-[-0.015em] text-ink-100">{signed ? 'Signed' : 'Sign the appeal'}</h3>
          {signed ? (
            <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink-300">
              <Badge tone="green" icon={<Check className="size-3" strokeWidth={3} />}>Signed by {c.signedBy}</Badge>
              <p>Any edit to the letter clears the signature and re-runs verification.</p>
              <Button size="sm" variant="outline" onClick={() => { caseStore.update(c.id, { signedBy: null, status: 'ready' }); audit('biller', 'letter.unsign', c.id, {}) }}>Revoke signature</Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor={nameId} className="eyebrow mb-1.5 block">Full name</label>
                <input id={nameId} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" autoComplete="name"
                  className="h-10 w-full rounded-[4px] border border-line bg-paper-low px-3 font-serif text-[15px] text-ink-100 outline-none transition-[border-color,box-shadow] placeholder:font-sans placeholder:text-[13.5px] placeholder:text-faint focus:border-mint-deep focus:bg-paper-high focus:shadow-[0_0_0_3px_rgba(47,206,150,0.18)]" />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-snug text-ink-300">
                <input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} className="mt-0.5 size-3.5 shrink-0 accent-[#0c8a5f]" />
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
