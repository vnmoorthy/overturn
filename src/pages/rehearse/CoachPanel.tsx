// Coach panel: post-call scorecard, the strongest verified issues, verified citation
// cards (copyable), and Gemini-predicted objections with best responses.

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Check, CircleAlert, Copy, FileText, MessagesSquare, RotateCcw } from 'lucide-react'
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
    <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" icon={done ? <Check className="size-3.5 text-mint-deep" /> : <Copy className="size-3.5" />}
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

/** Card header strip: mono label left, optional meta right, hairline below. */
function PanelHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <h3 className="eyebrow">{children}</h3>
      {right}
    </div>
  )
}

/** Status rule: the 3px left bar the system uses instead of tinted cards. */
function Rule({ className }: { className: string }) {
  return <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[3px]', className)} />
}

const monoLabel = 'font-mono text-[10px] font-medium uppercase tracking-[0.12em]'

// --------------------------------------------------------------- scorecard
function Scorecard({ score, onAgain, transcript }: { score: CallScore; onAgain: () => void; transcript: string }) {
  const stats = [
    { k: 'Duration', v: clock(score.seconds) },
    { k: 'Your turns', v: String(score.providerTurns) },
    { k: 'Director turns', v: String(score.directorTurns) },
    { k: 'Evidence cited', v: score.evidenceTotal ? `${score.evidenceCited.length}/${score.evidenceTotal}` : '—' },
  ]
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}>
      <Card glow={score.conceded} className="relative overflow-hidden">
        <Rule className={score.conceded ? 'bg-mint' : 'bg-amber-500'} />
        <div className="flex items-start justify-between gap-3 border-b border-line py-4 pl-5 pr-4">
          <div className="min-w-0">
            <div className="eyebrow">Scorecard</div>
            <div className="mt-1.5 font-serif text-[22px] font-medium leading-[1.1] tracking-[-0.025em] text-ink-100">
              {score.conceded ? <>The director <span className="text-gradient">conceded</span></> : 'The denial still stands'}
            </div>
          </div>
          <Badge tone={score.conceded ? 'green' : 'amber'} className="mt-0.5 shrink-0">{score.conceded ? 'Overturn won' : 'No concession'}</Badge>
        </div>
        <div className="space-y-3.5 py-4 pl-5 pr-4">
          {score.concession && (
            <blockquote className="border-l-2 border-mint bg-mint-pale px-3 py-2.5 font-serif text-[14px] italic leading-relaxed text-mint-ink">“{score.concession}”</blockquote>
          )}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line min-[420px]:grid-cols-4">
            {stats.map(s => (
              <div key={s.k} className="bg-paper-high px-2.5 py-3">
                <div className="font-serif text-[22px] font-medium leading-none tracking-[-0.02em] text-ink-100 tabular-nums">{s.v}</div>
                <div className="mt-1.5 font-mono text-[9.5px] uppercase leading-tight tracking-[0.1em] text-ink-400">{s.k}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={score.policyCited ? 'green' : 'gray'} icon={score.policyCited ? <Check className="size-3" /> : <CircleAlert className="size-3" />}>Named the policy</Badge>
            <Badge tone={score.chartCited ? 'green' : 'gray'} icon={score.chartCited ? <Check className="size-3" /> : <CircleAlert className="size-3" />}>Cited chart evidence</Badge>
          </div>
          <div className="rounded-md border border-line/70 bg-paper-low px-3 py-2.5">
            <div className={cx(monoLabel, 'text-ink-400')}>Coach note</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{score.tip}</p>
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
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
      animate={flash ? { boxShadow: ['0 0 0 0 rgba(47,206,150,0)', '0 0 0 2px rgba(47,206,150,.85)', '0 0 0 0 rgba(47,206,150,0)'] } : undefined}
      transition={{ duration: 1.4 }}
      className="rounded-md border border-line bg-paper-high">
      <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-[10.5px] text-ink-400">{r.id}</span>
          <span className="text-[13.5px] font-medium leading-snug text-ink-100">{r.criterion_label}</span>
        </div>
        <Badge tone={st.tone} className="shrink-0">{st.label}</Badge>
      </div>
      <div className="space-y-2 px-3 pb-3">
        <div className="border-l-2 border-line-strong py-0.5 pl-3">
          <div className={cx(monoLabel, 'text-ink-400')}>{familyId ? `${familyId} · policy` : 'Policy'}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">“{r.policy_quote}”</p>
        </div>
        {r.chart_quote ? (
          <div className="border-l-2 border-mint bg-mint-pale/70 px-3 py-2">
            <div className={cx(monoLabel, 'text-mint-deep')}>Chart · line {r.chart_line}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-200">“{r.chart_quote}”</p>
          </div>
        ) : r.missing_document ? (
          <div className="border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2">
            <div className={cx(monoLabel, 'text-amber-800')}>Attach</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-amber-900">{r.missing_document}</p>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line/70 py-1.5 pl-3 pr-1.5">
        {quoteMissing
          ? <Badge tone="red" icon={<CircleAlert className="size-3" />}>Quote not found in source</Badge>
          : r.verified
            ? <Badge tone="green" icon={<BadgeCheck className="size-3" />}>{r.status === 'met' ? 'Verified · quotes + entailment' : 'Policy quote verified'}</Badge>
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
  const verified = x.rows.filter(r => r.verified).length

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
        <Card className="overflow-hidden">
          <PanelHead right={<span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-rose-700">{violations.length} violation{violations.length === 1 ? '' : 's'}</span>}>Lead with</PanelHead>
          <div className="space-y-2 p-3">
            {violations.map((f, i) => (
              <div key={f.id} className="relative overflow-hidden rounded-md border border-line bg-paper-high py-3 pl-4 pr-3">
                <Rule className="bg-rose-600" />
                <div className="flex items-baseline gap-2.5">
                  <span className="shrink-0 font-mono text-[10.5px] text-rose-700 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium leading-snug text-ink-100">{f.title}</div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{f.detail}</p>
                    {f.citation && <div className="mt-2 font-mono text-[10.5px] leading-relaxed text-ink-400">{f.citation}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <PanelHead right={x.rows.length > 0 && <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400 tabular-nums">{verified}/{x.rows.length} verified</span>}>Verified citations</PanelHead>
        {x.rows.length ? (
          <div className="scrollbar-thin max-h-[520px] space-y-2 overflow-y-auto p-3">
            {x.rows.map(r => <CitationCard key={r.id} r={r} familyId={familyId} flash={flash === r.id} />)}
          </div>
        ) : (
          <div className="p-3">
            <EmptyState icon={<FileText className="size-5" />} title="No verified citations yet"
              body="Run Overturn on this case to pull the exact policy criterion and chart line for every requirement, verified word for word."
              action={<Button size="sm" variant="outline" onClick={() => navigate(`/case/${c.id}`)}>Open case workspace</Button>} />
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <PanelHead right={obj && <ModelChip model={obj.model} ms={obj.cached ? undefined : obj.ms} cached={obj.cached} />}>Predicted objections</PanelHead>
        <div className="p-3">
          {!obj && (
            <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-ink-400">
              {canPredict ? 'Gemini predicts the three pushbacks the director is most likely to raise, with the best answer to each, using only the verified findings.' : 'Available after Overturn has analyzed this case, so every answer is backed by verified findings.'}
            </p>
          )}
          <AnimatePresence initial={false}>
            {obj?.items.map((o, i) => (
              <motion.div key={`${o.objection}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.2 }}
                className="mb-2 overflow-hidden rounded-md border border-line bg-paper-high">
                <div className="border-l-2 border-rose-400 bg-rose-50/70 px-3 py-2.5">
                  <div className={cx(monoLabel, 'text-rose-800')}>They may say</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-100">{o.objection}</p>
                </div>
                <div className="border-l-2 border-mint px-3 py-2.5">
                  <div className={cx(monoLabel, 'text-mint-deep')}>You answer</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-300">{o.response}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {o.row_ids.map(id => (
                      <button key={id} onClick={() => focusRow(id)} title={`Show citation ${id}`}
                        className="cursor-pointer rounded-[3px] border border-line bg-paper-low px-1.5 py-0.5 font-mono text-[10.5px] text-ink-300 transition-colors hover:border-ink-100 hover:text-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint-deep">{id}</button>
                    ))}
                    <span className="ml-auto"><CopyButton text={o.response} /></span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className={cx(obj && 'mt-1')}>
            {canPredict ? (
              <Button size="sm" variant={obj ? 'ghost' : 'primary'} loading={loading} icon={obj ? <RotateCcw className="size-3.5" /> : <MessagesSquare className="size-3.5" />} onClick={predict}>
                {obj ? 'Predict again' : 'Predict objections'}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate(`/case/${c.id}`)}>Run Overturn first</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
