import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bug, Check, CircleAlert, CircleCheck, CircleX, ExternalLink, FileText, RotateCcw, ScanSearch, Shuffle, X } from 'lucide-react'
import type { CaseFile, MatchRow, PolicyVersion } from '../../lib/types'
import { caseStore } from '../../lib/store'
import { policyText } from '../../lib/pipeline'
import { tamper, toLines } from '../../lib/verifier'
import { entFor, reverifyRow, rowKeys } from '../../lib/engine'
import { audit } from '../../lib/audit'
import { friendlyError } from '../../lib/gemini'
import { fmtDate } from '../../lib/rules'
import { Badge, Button, Card, Eyebrow, ModelChip, Spinner, cx, toast } from '../../ui/kit'
import { ChartViewer, PolicyViewer, type Range } from './Highlight'

const REASON: Record<string, string> = {
  ok: 'supports', date_mismatch: 'wrong date / encounter', laterality: 'wrong side', negation: 'negated statement',
  patient_mismatch: 'different person', irrelevant: 'does not address criterion', other: 'does not support',
}

/** Real-but-wrong chart lines for the on-stage "Swap evidence" test. */
function decoyLine(c: CaseFile, row: MatchRow): { line: number; text: string } | null {
  const lines = toLines(c.chartText)
  const pref = [/family history|brother|mother|sister|father/i, /knee|unrelated|fall\b/i, /^(?!.*\b2026\b).*\b(20[01]\d|202[0-5])\b/, /\bnot\b|\bno\b|denies/i]
  for (const re of pref) {
    const i = lines.findIndex((l, idx) => idx + 1 !== row.chart_line && re.test(l) && l.trim().length > 12 && !/^---/.test(l.trim()))
    if (i >= 0) return { line: i + 1, text: lines[i].trim() }
  }
  const i = lines.findIndex((l, idx) => idx + 1 !== row.chart_line && l.trim().length > 20 && !/^---/.test(l.trim()))
  return i >= 0 ? { line: i + 1, text: lines[i].trim() } : null
}

/* ------------------------------------------------------------------ ledger primitives (local) */
const STATUS: Record<string, { label: string; cls: string }> = {
  met: { label: 'Met', cls: 'text-mint-deep' },
  unmet: { label: 'Not met', cls: 'text-rose-700' },
  missing: { label: 'Missing', cls: 'text-amber-800' },
}
type KeyRes = 'ok' | 'fail' | 'pending'

/** One ledger line: a mono key label, then its results as tiny mono badges (they wrap, never squeeze). */
function KeyLine({ k, children }: { k: 1 | 2; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <span className="w-[2.6rem] shrink-0 font-mono text-[10px] font-medium uppercase leading-[19px] tracking-[0.08em] text-ink-400">Key {k}</span>
      <span className="flex min-w-0 flex-wrap gap-1">{children}</span>
    </span>
  )
}
function KeyBadge({ res, children }: { res: KeyRes; children: ReactNode }) {
  return (
    <span className={cx('inline-flex h-[19px] max-w-full items-center gap-1 whitespace-nowrap rounded-[3px] border px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em]',
      res === 'fail' ? 'border-rose-200 bg-rose-50 text-rose-800' : res === 'ok' ? 'border-line bg-paper-high text-ink-200' : 'border-line bg-paper-low text-ink-400')}>
      {res === 'ok' ? <Check className="size-2.5 shrink-0 text-mint-deep" strokeWidth={3} aria-hidden /> : res === 'fail' ? <X className="size-2.5 shrink-0" strokeWidth={3} aria-hidden /> : <Spinner className="size-2.5 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function EvidenceBoard({ c, effective }: { c: CaseFile; effective: PolicyVersion }) {
  const rows = c.match?.rows || []
  const [sel, setSel] = useState<string>(rows[0]?.id || '')
  const [busy, setBusy] = useState<string | null>(null)
  const ptext = useMemo(() => policyText(effective), [effective])
  const keys = useMemo(() => Object.fromEntries(rows.map(r => [r.id, rowKeys(r, effective, c.chartText)])), [rows, effective, c.chartText])
  const ent = (id: string) => { const r = rows.find(x => x.id === id); return r ? entFor(c, r) : undefined }
  const row = rows.find(r => r.id === sel) || rows[0]

  const policyRanges: Range[] = rows.flatMap(r => {
    const k = keys[r.id]?.k1p
    return k && k.status === 'verified' ? [{ start: k.start, end: k.end, tone: 'green' as const, active: r.id === row?.id }] : []
  })
  const chartRanges: Range[] = rows.flatMap(r => {
    const k = keys[r.id]?.k1c
    if (!k || k.status !== 'verified') return []
    const e = ent(r.id)
    const tone = r.status !== 'met' ? 'amber' as const : e?.verdict === 'supports' ? 'green' as const : e ? 'red' as const : 'violet' as const
    return [{ start: k.start, end: k.end, tone, active: r.id === row?.id }]
  })

  async function doTamper() {
    if (!row) return
    const next = tamper(row.policy_quote)
    caseStore.update(c.id, cc => ({ match: cc.match && { ...cc.match, rows: cc.match.rows.map(r => r.id === row.id ? { ...r, policy_quote: next, tampered_from: r.tampered_from ?? r.policy_quote } : r) } }))
    await audit('biller', 'demo.tamper', c.id, { row: row.id, quote: next })
    toast('One word changed inside the policy quote. Watch Key 1.', 'amber')
  }
  async function doSwap() {
    if (!row || !row.chart_quote) { toast('Select a criterion that has chart evidence.', 'amber'); return }
    const d = decoyLine(c, row)
    if (!d) return
    // Swap the evidence AND drop its Key 2 verdict + biller confirmation: nothing stays green until re-verified.
    caseStore.update(c.id, cc => ({
      match: cc.match && { ...cc.match, rows: cc.match.rows.map(r => r.id === row.id ? { ...r, chart_quote: d.text, chart_line: d.line, swapped_from: r.swapped_from ?? { quote: r.chart_quote, line: r.chart_line, entailment: cc.entailments?.find(e => e.row_id === r.id) ?? null } } : r) },
      entailments: (cc.entailments || []).filter(e => e.row_id !== row.id),
      confirmed: { ...cc.confirmed, [row.id]: false },
    }))
    await audit('biller', 'demo.swap_evidence', c.id, { row: row.id, line: d.line })
    setBusy('swap')
    try {
      const r = await reverifyRow(c.id, row.id)
      if (r) toast(r.verdict === 'supports' ? 'Key 2 accepted the swapped line.' : `Key 2 caught it: ${REASON[r.reason_code] || r.reason_code}.`, r.verdict === 'supports' ? 'amber' : 'green')
    } catch (e) { toast(`${friendlyError(e)} The swapped line stays unverified.`, 'red') } finally { setBusy(null) }
  }
  async function restore() {
    const tampered = rows.filter(r => r.tampered_from || r.swapped_from)
    if (!tampered.length) return
    // The original quotes and their original verdicts come back exactly — no new model call needed.
    caseStore.update(c.id, cc => {
      const restoredEnts = rows.filter(r => r.swapped_from?.entailment).map(r => r.swapped_from!.entailment!)
      return {
        match: cc.match && { ...cc.match, rows: cc.match.rows.map(r => ({ ...r, policy_quote: r.tampered_from ?? r.policy_quote, chart_quote: r.swapped_from ? r.swapped_from.quote : r.chart_quote, chart_line: r.swapped_from ? r.swapped_from.line : r.chart_line, tampered_from: undefined, swapped_from: undefined })) },
        entailments: (cc.entailments || []).filter(e => !restoredEnts.some(x => x.row_id === e.row_id)).concat(restoredEnts),
      }
    })
    await audit('biller', 'demo.restore', c.id, { rows: tampered.map(r => r.id) })
    toast('Original verified evidence restored.', 'green')
  }
  function confirm(id: string, v: boolean) {
    caseStore.update(c.id, cc => ({ confirmed: { ...cc.confirmed, [id]: v } }))
    audit('biller', v ? 'row.confirm' : 'row.unconfirm', c.id, { row: id })
  }
  function confirmAll() {
    const ok = rows.filter(r => isGreen(r))
    caseStore.update(c.id, cc => ({ confirmed: { ...cc.confirmed, ...Object.fromEntries(ok.map(r => [r.id, true])) } }))
    audit('biller', 'row.confirm_all', c.id, { rows: ok.map(r => r.id) })
  }
  function isGreen(r: MatchRow) {
    const k = keys[r.id]
    if (!k || k.k1p.status !== 'verified') return false
    if (r.status !== 'met') return true
    return k.k1c?.status === 'verified' && ent(r.id)?.verdict === 'supports'
  }

  const k1Fail = row ? keys[row.id]?.k1p : null
  const greenCount = rows.filter(isGreen).length
  const confirmedCount = rows.filter(r => c.confirmed[r.id]).length
  const metVerified = rows.filter(r => r.status === 'met' && isGreen(r)).length
  const headings = useMemo(() => effective.sections.map(s => s.heading), [effective])
  const selEnt = row ? ent(row.id) : undefined

  return (
    <Card className="overflow-hidden">
      {/* header: title + stress-test toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line px-4 pb-3.5 pt-4 sm:px-5">
        <div className="min-w-0">
          <Eyebrow className="mb-1.5 flex items-center gap-1.5"><ScanSearch className="size-3.5" aria-hidden /> Two-key verification</Eyebrow>
          <h3 className="font-serif text-[21px] font-medium leading-tight tracking-[-0.02em] text-ink-100">Evidence board</h3>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-400">
            <span className="font-mono font-medium text-ink-100">{metVerified}/{rows.length}</span> criteria met &amp; verified by both keys · click a criterion to see both sources
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1 hidden md:inline">Stress test</span>
          <Button size="sm" variant="outline" icon={<Bug className="size-3.5 text-ink-400" />} onClick={doTamper} title="Change one word in the selected policy quote">Tamper a quote</Button>
          <Button size="sm" variant="outline" icon={<Shuffle className="size-3.5 text-ink-400" />} onClick={doSwap} loading={busy === 'swap'} title="Replace the chart evidence with a real but wrong line">Swap evidence</Button>
          <Button size="sm" variant="outline" icon={<RotateCcw className="size-3.5 text-ink-400" />} onClick={restore} loading={busy === 'restore'} disabled={!rows.some(r => r.tampered_from || r.swapped_from)}>Restore</Button>
          <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-line sm:block" />
          <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={confirmAll} disabled={!greenCount}>Confirm all verified</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.68fr)]">
        {/* criteria ledger */}
        <div className="flex min-w-0 flex-col border-b border-line bg-paper lg:max-h-[700px] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <span className="eyebrow">Criteria · {rows.length}</span>
            <span className="eyebrow">Confirmed <span className={cx(confirmedCount ? 'text-mint-deep' : 'text-ink-100')}>{confirmedCount}/{rows.length}</span></span>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 lg:overflow-y-auto">
            {rows.map((r, i) => {
              const k = keys[r.id]
              const e = ent(r.id)
              const green = isGreen(r)
              const active = r.id === row?.id
              const st = STATUS[r.status] || { label: r.status, cls: 'text-ink-300' }
              const k1pOk = k?.k1p.status === 'verified'
              const k1cOk = k?.k1c?.status === 'verified'
              const k2: { res: KeyRes; text: string } | null = !r.chart_quote ? null
                : e ? { res: e.verdict === 'supports' ? 'ok' : 'fail', text: REASON[e.reason_code] || e.verdict }
                : busy === 'swap' && active ? { res: 'pending', text: 'checking…' }
                : r.status === 'met' ? { res: 'fail', text: 'not verified' } : null
              return (
                <motion.li key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.22 }}
                  className={cx('relative border-b border-line/80 transition-colors duration-150 last:border-b-0', active ? 'bg-paper-high' : 'hover:bg-paper-high/60')}>
                  {active && <motion.span layoutId="evidence-row-rule" aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-mint" transition={{ type: 'spring', damping: 34, stiffness: 420 }} />}
                  <button type="button" onClick={() => setSel(r.id)} aria-pressed={active}
                    className="flex w-full cursor-pointer items-start gap-3 py-3 pl-4 pr-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep">
                    <span aria-hidden className={cx('mt-[2px] shrink-0', green && r.status === 'met' ? 'text-mint-deep' : r.status === 'met' ? 'text-rose-700' : 'text-amber-700')}>
                      {green && r.status === 'met' ? <CircleCheck className="size-4" strokeWidth={1.75} /> : r.status === 'met' ? <CircleX className="size-4" strokeWidth={1.75} /> : <CircleAlert className="size-4" strokeWidth={1.75} />}
                    </span>
                    <span className="block min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={cx('text-[13.5px] leading-snug text-ink-100', active && 'font-medium')}>{r.criterion_label}</span>
                        <span className="shrink-0 font-mono text-[11px] tracking-[0.02em] text-ink-400">{r.criterion_id}</span>
                      </span>
                      <span className="mt-2 grid grid-cols-[3.6rem_minmax(0,1fr)] items-start gap-x-1.5 gap-y-1">
                        <span className={cx('font-mono text-[10.5px] font-semibold uppercase leading-[19px] tracking-[0.09em]', st.cls)}>{st.label}</span>
                        <KeyLine k={1}>
                          <KeyBadge res={k1pOk ? 'ok' : 'fail'}>{k1pOk ? 'policy' : 'policy not found'}</KeyBadge>
                          {r.chart_quote && <KeyBadge res={k1cOk ? 'ok' : 'fail'}>{k1cOk ? `chart L${r.chart_line}` : 'chart not found'}</KeyBadge>}
                        </KeyLine>
                        {k2 && <span className="col-start-2"><KeyLine k={2}><KeyBadge res={k2.res}>{k2.text}</KeyBadge></KeyLine></span>}
                      </span>
                      {r.status !== 'met' && r.missing_document && (
                        <span className="mt-2 block border-l-2 border-amber-400 pl-2 text-[12px] leading-snug text-amber-800">
                          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em]">Attach</span> {r.missing_document}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3 pb-2.5 pl-11 pr-4">
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-300 has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-400">
                      <input type="checkbox" className="size-3.5 cursor-pointer accent-mint-deep disabled:cursor-not-allowed" checked={!!c.confirmed[r.id]} disabled={!green} onChange={ev => confirm(r.id, ev.target.checked)} />
                      Biller confirms
                    </label>
                    {(r.tampered_from || r.swapped_from) && <Badge tone="amber">{r.tampered_from ? 'tampered' : 'swapped'}</Badge>}
                  </div>
                </motion.li>
              )
            })}
          </ul>
        </div>

        {/* split sources */}
        <div className="grid min-w-0 xl:grid-cols-2">
          {/* policy: set like a legal document */}
          <section aria-label="Policy text" className="flex min-w-0 flex-col border-b border-line xl:h-[700px] xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                <FileText className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate"><span className="font-medium text-ink-100">{effective.id}</span> · {effective.type} · ver {effective.version_label}</span>
              </div>
              <a href={effective.source_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-[3px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-deep">CMS <ExternalLink className="size-3" aria-hidden /></a>
            </div>
            <div className="shrink-0 border-b border-line/70 px-4 pb-3 pt-4 sm:px-5">
              <div className="font-serif text-[17px] font-medium leading-snug tracking-[-0.015em] text-ink-100">{effective.title}</div>
              <div className="mt-1 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.08em] text-ink-400">
                Version in effect on DOS <span className="text-ink-200">{fmtDate(c.denial?.date_of_service || '')}</span> · effective <span className="text-ink-200">{fmtDate(effective.effective_date)}</span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {k1Fail && k1Fail.status !== 'verified' && row && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="shrink-0 overflow-hidden">
                  <div role="alert" className="mx-4 my-3 overflow-hidden rounded-md border border-rose-200 bg-paper-high sm:mx-5">
                    <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 font-mono text-[10.5px] font-medium uppercase leading-snug tracking-[0.08em] text-rose-800">
                      <CircleX className="mt-px size-3.5 shrink-0" aria-hidden /> Key 1: quote not found in the policy — export locked
                    </div>
                    {k1Fail.diff && (
                      <div className="font-mono text-[12px] leading-[1.65]">
                        <div className="relative flex gap-2 bg-rose-50/50 py-2 pl-3 pr-3">
                          <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-rose-400" />
                          <span aria-hidden className="w-3 shrink-0 select-none text-rose-700">−</span>
                          <div className="min-w-0">
                            <div className="eyebrow !text-[9.5px] !text-rose-700">Cited quote</div>
                            <div className="text-ink-300">{k1Fail.diff.filter(d => d.kind !== 'removed').map((d, i) => d.kind === 'added' && d.text.trim()
                              ? <del key={i} className="rounded-[2px] bg-rose-100 px-[1px] text-rose-800 decoration-rose-500">{d.text}</del>
                              : <span key={i}>{d.text}</span>)}</div>
                          </div>
                        </div>
                        <div className="relative flex gap-2 border-t border-line/70 bg-mint-pale/45 py-2 pl-3 pr-3">
                          <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-mint" />
                          <span aria-hidden className="w-3 shrink-0 select-none text-mint-deep">+</span>
                          <div className="min-w-0">
                            <div className="eyebrow !text-[9.5px] !text-mint-deep">Closest source sentence</div>
                            <div className="text-ink-300">{k1Fail.diff.filter(d => d.kind !== 'added').map((d, i) => d.kind === 'removed' && d.text.trim()
                              ? <ins key={i} className="rounded-[2px] bg-mint-pale px-[1px] text-mint-ink no-underline">{d.text}</ins>
                              : <span key={i}>{d.text}</span>)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <PolicyViewer text={ptext} ranges={policyRanges} headings={headings} activeKey={row?.id + (row?.policy_quote || '')} className="h-[460px] sm:h-[540px] xl:h-auto xl:min-h-0 xl:flex-1" />
          </section>

          {/* chart notes: numbered mono listing */}
          <section aria-label="Chart notes" className="flex min-w-0 flex-col xl:h-[700px]">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="flex shrink-0 gap-1">{[0, 1, 2].map(n => <span key={n} className="size-[7px] rounded-full bg-line-strong" />)}</span>
                <span className="truncate font-mono text-[11.5px] text-ink-200">{c.chartTitle}</span>
              </div>
              <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">{toLines(c.chartText).length} lines</span>
            </div>
            {row && (
              <div className="shrink-0 border-b border-line px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="eyebrow">Why</span>
                  <span className="font-mono text-[11px] tracking-[0.02em] text-ink-400">{row.criterion_id}{row.chart_line ? ` · L${row.chart_line}` : ''}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{row.reasoning}</p>
                {selEnt && row.chart_quote && (
                  <div className={cx('relative mt-2 py-0.5 pl-3 text-[12.5px] leading-relaxed', selEnt.verdict === 'supports' ? 'text-ink-200' : 'text-rose-800')}>
                    <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[2px]', selEnt.verdict === 'supports' ? 'bg-mint' : 'bg-rose-400')} />
                    <span className={cx('mr-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]', selEnt.verdict === 'supports' ? 'text-mint-deep' : 'text-rose-700')}>Key 2 ({selEnt.verdict})</span>
                    {selEnt.explanation}
                  </div>
                )}
              </div>
            )}
            <ChartViewer text={c.chartText} ranges={chartRanges} activeKey={row?.id + String(row?.chart_line)} activeLine={row?.chart_line} className="h-[460px] sm:h-[520px] xl:h-auto xl:min-h-0 xl:flex-1" />
          </section>
        </div>
      </div>

      {/* how the two keys work */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-t border-line bg-paper px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-400 sm:px-5">
        <div className="grid min-w-0 flex-1 gap-1.5 md:grid-cols-2 md:gap-6">
          <p><span className="font-medium uppercase tracking-[0.08em] text-ink-100">Key 1</span> is deterministic code: exact match after normalizing quotes, dashes and whitespace.</p>
          <p><span className="font-medium uppercase tracking-[0.08em] text-ink-100">Key 2</span> is a skeptical Gemini auditor checking the quote actually supports the criterion.</p>
        </div>
        {c.trace.length > 0 && <ModelChip model={c.trace[c.trace.length - 1].model} />}
      </div>
    </Card>
  )
}
