import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bug, Check, CircleAlert, CircleCheck, CircleX, ExternalLink, FileText, Fingerprint, RotateCcw, ScanSearch, Shuffle, Stethoscope } from 'lucide-react'
import type { CaseFile, MatchRow, PolicyVersion } from '../../lib/types'
import { caseStore } from '../../lib/store'
import { policyText } from '../../lib/pipeline'
import { tamper, toLines } from '../../lib/verifier'
import { entFor, reverifyRow, rowKeys } from '../../lib/engine'
import { audit } from '../../lib/audit'
import { friendlyError } from '../../lib/gemini'
import { fmtDate } from '../../lib/rules'
import { Badge, Button, Card, ModelChip, Spinner, cx, toast } from '../../ui/kit'
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

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <ScanSearch className="size-4 text-teal-700" />
          <div>
            <div className="text-sm font-semibold">Evidence board</div>
            <div className="text-[11.5px] text-ink-400">{rows.filter(r => r.status === 'met' && isGreen(r)).length}/{rows.length} criteria met &amp; verified by both keys · click a criterion to see both sources</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" icon={<Bug className="size-3.5 text-amber-700" />} onClick={doTamper} title="Change one word in the selected policy quote">Tamper a quote</Button>
          <Button size="sm" variant="outline" icon={<Shuffle className="size-3.5 text-amber-700" />} onClick={doSwap} loading={busy === 'swap'} title="Replace the chart evidence with a real but wrong line">Swap evidence</Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={restore} loading={busy === 'restore'} disabled={!rows.some(r => r.tampered_from || r.swapped_from)}>Restore</Button>
          <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={confirmAll} disabled={!greenCount}>Confirm all verified</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.6fr)]">
        {/* criteria list */}
        <div className="scrollbar-thin space-y-2 border-b lg:max-h-[640px] lg:overflow-y-auto border-line/70 p-3 lg:border-b-0 lg:border-r">
          {rows.map((r, i) => {
            const k = keys[r.id]
            const e = ent(r.id)
            const green = isGreen(r)
            const active = r.id === row?.id
            return (
              <motion.button key={r.id} onClick={() => setSel(r.id)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                className={cx('w-full rounded-md border p-3 text-left transition-all cursor-pointer', active ? 'border-line-strong bg-black/[0.045] ring-glow' : 'border-line/70 bg-black/[0.02] hover:bg-black/[0.03]')}>
                <div className="flex items-start gap-2.5">
                  <div className={cx('mt-0.5 shrink-0 rounded-full p-0.5', green && r.status === 'met' ? 'text-emerald-700' : r.status === 'met' ? 'text-rose-700' : 'text-amber-700')}>
                    {green && r.status === 'met' ? <CircleCheck className="size-4" /> : r.status === 'met' ? <CircleX className="size-4" /> : <CircleAlert className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-semibold leading-snug text-ink-100">{r.criterion_label}</div>
                      <span className="font-mono text-[10.5px] text-ink-400">{r.criterion_id}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={r.status === 'met' ? 'green' : r.status === 'unmet' ? 'red' : 'amber'}>{r.status}</Badge>
                      <Badge tone={k?.k1p.status === 'verified' ? 'cyan' : 'red'} icon={<Fingerprint className="size-3" />}>policy {k?.k1p.status === 'verified' ? 'in source' : 'NOT FOUND'}</Badge>
                      {r.chart_quote && <Badge tone={k?.k1c?.status === 'verified' ? 'cyan' : 'red'} icon={<Fingerprint className="size-3" />}>chart {k?.k1c?.status === 'verified' ? `L${r.chart_line}` : 'NOT FOUND'}</Badge>}
                      {r.chart_quote && (e ? <Badge tone={e.verdict === 'supports' ? 'green' : 'red'}>key 2 · {REASON[e.reason_code] || e.verdict}</Badge> : busy === 'swap' && active ? <Badge tone="violet" icon={<Spinner className="size-3" />}>key 2 checking…</Badge> : r.status === 'met' ? <Badge tone="red">key 2 · not verified</Badge> : null)}
                    </div>
                    {r.status !== 'met' && r.missing_document && <div className="mt-1.5 text-[11.5px] text-amber-800">Attach: {r.missing_document}</div>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line/70 pt-2">
                  <label className="flex items-center gap-2 text-[11.5px] text-ink-300" onClick={ev => ev.stopPropagation()}>
                    <input type="checkbox" className="size-3.5 accent-emerald-400" checked={!!c.confirmed[r.id]} disabled={!green} onChange={ev => confirm(r.id, ev.target.checked)} />
                    Biller confirms
                  </label>
                  {(r.tampered_from || r.swapped_from) && <Badge tone="amber">{r.tampered_from ? 'tampered' : 'swapped'}</Badge>}
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* split sources */}
        <div className="grid min-w-0 xl:grid-cols-2">
          <div className="min-w-0 border-b border-line/70 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-black/[0.02] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold"><FileText className="size-3.5 text-ink-200" /><span className="truncate">{effective.id} · {effective.title}</span></div>
              <a href={effective.source_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[11px] text-ink-400 hover:text-ink-100">CMS <ExternalLink className="size-3" /></a>
            </div>
            <div className="px-4 pt-2 text-[11px] text-ink-400">Version in effect on DOS {fmtDate(c.denial?.date_of_service || '')}: effective {fmtDate(effective.effective_date)}</div>
            <AnimatePresence>
              {k1Fail && k1Fail.status !== 'verified' && row && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mx-4 mt-2 rounded-md border border-rose-600/30 bg-rose-500/[0.09] p-3 text-[12px]">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-rose-800"><CircleX className="size-3.5" /> Key 1: quote not found in the policy — export locked</div>
                  {k1Fail.diff && <div className="leading-relaxed text-ink-300">Closest source sentence: {k1Fail.diff.map((d, i) => <span key={i} className={cx(d.kind === 'removed' && 'bg-emerald-500/[0.16] text-emerald-800', d.kind === 'added' && 'bg-rose-500/[0.16] text-rose-800 line-through')}>{d.text}</span>)}</div>}
                </motion.div>
              )}
            </AnimatePresence>
            <PolicyViewer text={ptext} ranges={policyRanges} activeKey={row?.id + (row?.policy_quote || '')} className="h-[560px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-black/[0.02] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold"><Stethoscope className="size-3.5 text-emerald-700" /><span className="truncate">{c.chartTitle}</span></div>
              <span className="text-[11px] text-ink-400">{toLines(c.chartText).length} lines</span>
            </div>
            {row && (
              <div className="border-b border-line/70 px-4 py-2.5 text-[12px] leading-relaxed text-ink-300">
                <span className="font-semibold text-ink-100">Why: </span>{row.reasoning}
                {ent(row.id) && row.chart_quote && <div className={cx('mt-1', ent(row.id)!.verdict === 'supports' ? 'text-emerald-800' : 'text-rose-800')}>Key 2 ({ent(row.id)!.verdict}): {ent(row.id)!.explanation}</div>}
              </div>
            )}
            <ChartViewer text={c.chartText} ranges={chartRanges} activeKey={row?.id + String(row?.chart_line)} activeLine={row?.chart_line} className="h-[520px]" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-4 py-2.5 text-[11.5px] text-ink-400">
        <span><b className="text-ink-300">Key 1</b> is deterministic code: exact match after normalizing quotes, dashes and whitespace. <b className="text-ink-300">Key 2</b> is a skeptical Gemini auditor checking the quote actually supports the criterion.</span>
        {c.trace.length > 0 && <ModelChip model={c.trace[c.trace.length - 1].model} />}
      </div>
    </Card>
  )
}
