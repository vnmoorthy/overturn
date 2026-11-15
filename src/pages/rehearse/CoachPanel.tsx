// Coach panel: post-call scorecard, the strongest verified issues, verified citation
// cards (copyable), and Gemini-predicted objections with best responses.

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck, Check, CircleAlert, Copy, FileText, Gavel, Lightbulb, MessageSquareQuote, RotateCcw, ShieldCheck, Swords, Trophy, WandSparkles,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, ModelChip, cx, toast, type Tone } from '../../ui/kit'
import { objections } from '../../lib/pipeline'
import { friendlyError, getUseCache } from '../../lib/gemini'
import { savedRun } from '../../lib/engine'
import { navigate } from '../../lib/router'
import type { CaseFile, RowStatus } from '../../lib/types'
import type { CallScore, CitationRow, RehearsalContext } from './context'

type Objection = { objection: string; response: string; row_ids: string[] }
const objectionCache = new Map<string, { items: Objection[]; model: string; ms: number; cached?: boolean }>()

const STATUS: Record<RowStatus, { tone: Tone; label: string }> = {
  met: { tone: 'green', label: 'Met' },
  unmet: { tone: 'red', label: 'Unmet' },
  missing: { tone: 'amber', label: 'Missing' },
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy'); ta.remove(); return ok
    } catch { return false }
  }
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" icon={done ? <Check className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        if (await copy(text)) { setDone(true); setTimeout(() => setDone(false), 1400) } else toast('Could not access the clipboard.', 'red')
      }}>{done ? 'Copied' : label}</Button>
  )
}

function speakable(r: CitationRow, familyId: string | null) {
  const pol = `${familyId ? `${familyId} ` : 'The governing policy '}requires: "${r.policy_quote}"`
  const chart = r.chart_quote ? ` The chart documents this at line ${r.chart_line}: "${r.chart_quote}"` : ''
  return `${r.criterion_label}. ${pol}.${chart}`.replace(/\.\./g, '.')
}

// --------------------------------------------------------------- scorecard
function Scorecard({ score, onAgain, transcript }: { score: CallScore; onAgain: () => void; transcript: string }) {
  const stats = [
    { k: 'Duration', v: clock(score.seconds) },
    { k: 'Your turns', v: String(score.providerTurns) },
    { k: 'Director turns', v: String(score.directorTurns) },
    { k: 'Evidence cited', v: score.evidenceTotal ? `${score.evidenceCited.length}/${score.evidenceTotal}` : '—' },
  ]
  return (
    <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', damping: 24, stiffness: 300 }}>
      <Card glow={score.conceded} className="overflow-hidden">
        <div className={cx('flex items-center gap-3 border-b border-line/70 px-4 py-3.5', score.conceded ? 'bg-emerald-500/[0.07]' : 'bg-amber-500/[0.07]')}>
          <div className={cx('grid size-10 place-items-center rounded-md', score.conceded ? 'bg-emerald-500/[0.135] text-emerald-700' : 'bg-amber-500/[0.108] text-amber-800')}>
            {score.conceded ? <Trophy className="size-5" /> : <Gavel className="size-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Scorecard</div>
            <div className="text-[15px] font-semibold">{score.conceded ? 'The director conceded' : 'The denial still stands'}</div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {score.concession && (
            <blockquote className="rounded-md border border-emerald-600/25 bg-emerald-500/[0.07] px-3 py-2 text-[13px] italic leading-relaxed text-emerald-800">“{score.concession}”</blockquote>
          )}
          <div className="grid grid-cols-4 gap-2">
            {stats.map(s => (
              <div key={s.k} className="rounded-md border border-line/70 bg-black/[0.02] px-2 py-2 text-center">
                <div className="font-mono text-[15px] font-semibold text-ink-100">{s.v}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-ink-400">{s.k}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={score.policyCited ? 'green' : 'gray'} icon={score.policyCited ? <Check className="size-3" /> : <CircleAlert className="size-3" />}>Named the policy</Badge>
            <Badge tone={score.chartCited ? 'green' : 'gray'} icon={score.chartCited ? <Check className="size-3" /> : <CircleAlert className="size-3" />}>Cited chart evidence</Badge>
            <Badge tone={score.conceded ? 'green' : 'amber'}>{score.conceded ? 'Overturn won' : 'No concession'}</Badge>
          </div>
          <div className="flex gap-2 rounded-md border border-line/70 bg-black/[0.02] px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-300">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-800" />{score.tip}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="primary" icon={<RotateCcw className="size-3.5" />} onClick={onAgain}>Rehearse again</Button>
            <CopyButton text={transcript} label="Copy transcript" />
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// --------------------------------------------------------------- citations
function CitationCard({ r, familyId, flash }: { r: CitationRow; familyId: string | null; flash: boolean }) {
  const st = STATUS[r.status] || STATUS.missing
  const quoteMissing = r.policyVerified === false || r.chartVerified === false
  return (
    <motion.div id={`cite-${r.id}`} layout
      animate={flash ? { boxShadow: ['0 0 0 0 rgba(124,92,255,0)', '0 0 0 2px rgba(124,92,255,.7)', '0 0 0 0 rgba(124,92,255,0)'] } : undefined}
      transition={{ duration: 1.4 }}
      className="rounded-md border border-line/70 bg-black/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-black/[0.045] px-1.5 font-mono text-[10.5px] text-ink-300">{r.id}</span>
            <span className="text-[13px] font-medium leading-snug text-ink-100">{r.criterion_label}</span>
          </div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-2.5 space-y-2">
        <div className="border-l-2 border-line-strong pl-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-200">{familyId ? `${familyId} · policy` : 'Policy'}</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">“{r.policy_quote}”</p>
        </div>
        {r.chart_quote ? (
          <div className="border-l-2 border-emerald-600/50 pl-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Chart · line {r.chart_line}</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">“{r.chart_quote}”</p>
          </div>
        ) : r.missing_document ? (
          <div className="border-l-2 border-amber-600/50 pl-2.5 text-[12.5px] leading-relaxed text-amber-800">Attach: {r.missing_document}</div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {quoteMissing
          ? <Badge tone="red" icon={<CircleAlert className="size-3" />}>Quote not found in source</Badge>
          : r.verified
            ? <Badge tone="cyan" icon={<BadgeCheck className="size-3" />}>{r.status === 'met' ? 'Verified · quotes + entailment' : 'Policy quote verified'}</Badge>
            : r.chart_quote
              ? <Badge tone="amber" icon={<CircleAlert className="size-3" />}>{r.entailment === 'contradicts' ? 'Chart contradicts' : 'Quotes verified · needs review'}</Badge>
              : <Badge tone="gray">No chart quote</Badge>}
        <CopyButton text={speakable(r, familyId)} />
      </div>
    </motion.div>
  )
}

// --------------------------------------------------------------- panel
export function CoachPanel({ c, x, score, onAgain, transcript, children }: { c: CaseFile; x: RehearsalContext; score: CallScore | null; onAgain: () => void; transcript: string; children?: ReactNode }) {
  const cached = objectionCache.get(c.id)
  const [obj, setObj] = useState(cached || null)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const familyId = x.family?.id || null
  const violations = x.flags.filter(f => f.severity === 'violation').slice(0, 3)
  const canPredict = !!c.denial && x.rows.length > 0

  const focusRow = (id: string) => {
    const el = document.getElementById(`cite-${id}`)
    if (!el) { toast(`Row ${id} is not in the verified citations.`, 'gray'); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(id)
    setTimeout(() => setFlash(f => (f === id ? null : f)), 1500)
  }

  const predict = async () => {
    if (!c.denial) return
    setLoading(true)
    try {
      const r = await objections({ denial: c.denial, rows: c.match?.rows || [], flags: x.flags.filter(f => f.severity !== 'info').map(f => ({ title: f.title, citation: f.citation })) })
      const v = { items: r.value, model: r.model, ms: r.ms }
      objectionCache.set(c.id, v)
      setObj(v)
    } catch (e) {
      const saved = getUseCache() ? savedRun(c.id) : null
      if (saved?.objections?.length) {
        const v = { items: saved.objections, model: saved.models?.objections || 'saved run', ms: 0, cached: true }
        objectionCache.set(c.id, v)
        setObj(v)
        toast('Gemini is busy, so these come from a saved genuine run for this case.', 'amber')
      } else toast(friendlyError(e), 'red')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="popLayout">{score && <Scorecard key="score" score={score} onAgain={onAgain} transcript={transcript} />}</AnimatePresence>
      {children}

      {violations.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400"><Swords className="size-3.5 text-rose-700" /> Lead with</div>
          <div className="space-y-2.5">
            {violations.map(f => (
              <div key={f.id} className="rounded-md border border-rose-600/25 bg-rose-500/[0.07] px-3 py-2.5">
                <div className="text-[13px] font-medium text-rose-800">{f.title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{f.detail}</p>
                {f.citation && <div className="mt-1.5 font-mono text-[10.5px] text-ink-400">{f.citation}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400"><ShieldCheck className="size-3.5 text-teal-700" /> Verified citations</div>
          {x.rows.length > 0 && <span className="font-mono text-[11px] text-ink-400">{x.rows.filter(r => r.verified).length}/{x.rows.length} verified</span>}
        </div>
        {x.rows.length ? (
          <div className="scrollbar-thin -mr-2 max-h-[520px] space-y-2.5 overflow-y-auto pr-2">
            {x.rows.map(r => <CitationCard key={r.id} r={r} familyId={familyId} flash={flash === r.id} />)}
          </div>
        ) : (
          <EmptyState icon={<FileText className="size-5" />} title="No verified citations yet"
            body="Run Overturn on this case to pull the exact policy criterion and chart line for every requirement, verified word for word."
            action={<Button size="sm" variant="outline" onClick={() => navigate(`/case/${c.id}`)}>Open case workspace</Button>} />
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400"><MessageSquareQuote className="size-3.5 text-ink-200" /> Predicted objections</div>
          {obj && <ModelChip model={obj.model} ms={obj.cached ? undefined : obj.ms} cached={obj.cached} />}
        </div>
        {!obj && (
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-400">
            {canPredict ? 'Gemini predicts the three pushbacks the director is most likely to raise, with the best answer to each, using only the verified findings.' : 'Available after Overturn has analyzed this case, so every answer is backed by verified findings.'}
          </p>
        )}
        <AnimatePresence initial={false}>
          {obj?.items.map((o, i) => (
            <motion.div key={`${o.objection}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="mb-2.5 overflow-hidden rounded-md border border-line/70 bg-black/[0.02]">
              <div className="border-b border-line/70 bg-rose-500/[0.07] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800">They may say</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-100">{o.objection}</p>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">You answer</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-300">{o.response}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {o.row_ids.map(id => (
                    <button key={id} onClick={() => focusRow(id)} className="rounded-md border border-teal-600/25 bg-teal-500/[0.09] px-1.5 py-0.5 font-mono text-[10.5px] text-teal-800 hover:bg-teal-500/[0.16] cursor-pointer">{id}</button>
                  ))}
                  <span className="ml-auto"><CopyButton text={o.response} /></span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {canPredict ? (
          <Button size="sm" variant={obj ? 'ghost' : 'primary'} loading={loading} icon={obj ? <RotateCcw className="size-3.5" /> : <WandSparkles className="size-3.5" />} onClick={predict}>
            {obj ? 'Predict again' : 'Predict objections'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => navigate(`/case/${c.id}`)}>Run Overturn first</Button>
        )}
      </Card>
    </div>
  )
}
