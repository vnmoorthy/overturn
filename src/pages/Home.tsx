import { MotionConfig, motion, type Variants } from 'framer-motion'
import { ArrowRight, Fingerprint, Gavel, Mic, Play, ShieldCheck } from 'lucide-react'
import { navigate } from '../lib/router'
import { useCases } from '../lib/store'
import { HERO_CASES } from '../data/cases'
import { overturnRate } from '../lib/imr'
import { familyById } from '../lib/policies'
import { Badge, Button, Card, Eyebrow, ModelChip, cx } from '../ui/kit'

const STEPS = [
  { title: 'Read the denial', body: 'Snap, scan or drop the letter. Gemini extracts payer, codes, dates and every cited requirement — verbatim.', model: 'gemini-3.8-flash' },
  { title: 'Find the rulebook', body: 'Routes to the governing Medicare LCD and pins the exact version in effect on the date of service.', model: 'policy library · 6 CMS versions' },
  { title: 'Match the evidence', body: 'Long-context read of policy + chart + denial: criterion-by-criterion, with line-level citations.', model: 'gemini-4-hydrogen' },
  { title: 'Verify twice', body: 'Key 1: deterministic exact-match provenance. Key 2: a skeptical Gemini auditor checks the quote truly supports the point.', model: 'code + gemini-3.5-flash' },
  { title: 'Catch the violations', body: 'A deterministic rules engine flags retired rules, phantom criteria and ignored pathways under 42 CFR § 422.', model: 'rules engine' },
  { title: 'Draft, sign, send', body: 'The model can only cite through verified tokens. A human signs; a fax-ready packet with exhibits exports.', model: 'gemini-4-hydrogen' },
]

const MODELS = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.8-flash-tts', 'gemini-embedding-2', 'antigravity agent']

const STATS = [
  { value: '3.2M', label: 'Medicare Advantage prior-authorization denials in 2023', accent: false },
  { value: '11.7%', label: 'of those denials were ever appealed', accent: false },
  { value: '81.7%', label: 'of appeals were partially or fully overturned', accent: true },
]

const TRUST = [
  { icon: Fingerprint, t: 'Two-key verification', b: 'Every quote must exist verbatim in its source and genuinely support the point. Tamper with one word and export locks.' },
  { icon: Gavel, t: 'Deterministic compliance', b: 'The LLM supplies features; code decides every flag. Each one is a possible issue the biller confirms.' },
  { icon: ShieldCheck, t: 'Hash-chained audit', b: 'Every AI step and human decision is SHA-256 chained. Edit history and the chain breaks.' },
  { icon: Mic, t: 'Rehearse the P2P', b: 'Practice the peer-to-peer call against a skeptical medical director, live over Gemini voice.' },
]

// ------------------------------------------------------------------ hero terminal
// A narrated, recorded Overturn run on the maria-cgm demo case (facts taken from that run).
type TermLine =
  | { k: 'cmd'; t: string }
  | { k: 'step'; tag: string; t: string }
  | { k: 'flag'; t: string }
  | { k: 'diff' }
  | { k: 'ok'; t: string }
  | { k: 'result'; t: string }

const RUN: TermLine[] = [
  { k: 'cmd', t: 'overturn appeal --case maria-cgm' },
  { k: 'step', tag: 'denial', t: '3 cited requirements · quoted verbatim' },
  { k: 'step', tag: 'policy', t: 'LCD L33822 · version in effect 2026-09-29' },
  { k: 'step', tag: 'chart', t: '6/6 criteria met · insulin on line 18' },
  { k: 'flag', t: 'L33822 rev 2020 · requirement retired 2021-07-18' },
  { k: 'flag', t: 'L33822 rev 2023-01 · requirement retired 2023-04-16' },
  { k: 'flag', t: 'plan criterion · not in any version of L33822' },
  { k: 'diff' },
  { k: 'ok', t: '12/12 quotes verified · key 1 + key 2' },
  { k: 'ok', t: 'letter drafted · cites verified quotes only' },
  { k: 'result', t: 'appeal ready · human sign-off required' },
]

const termList: Variants = { hidden: {}, show: { transition: { delayChildren: 0.35, staggerChildren: 0.085 } } }
const termItem: Variants = { hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } }

const GRID_FADE = {
  maskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, black 35%, transparent 78%)',
  WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, black 35%, transparent 78%)',
}

function Dots() {
  return (
    <span className="flex shrink-0 items-center gap-[5px]" aria-hidden>
      <span className="size-[7px] rounded-full bg-line-strong" />
      <span className="size-[7px] rounded-full bg-line-strong" />
      <span className="size-[7px] rounded-full bg-line-strong" />
    </span>
  )
}

/** Splits "a · b · c" so lines wrap only at the separators (keeps dates and ids whole on phones). */
function Segs({ t }: { t: string }) {
  const parts = t.split(' · ')
  return <>{parts.map((p, i) => <span key={i}><span className="whitespace-nowrap">{p}</span>{i < parts.length - 1 && ' · '}</span>)}</>
}

function TermRow({ line }: { line: TermLine }) {
  const gutter = 'grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5'
  switch (line.k) {
    case 'cmd':
      return <div className={cx(gutter, 'font-medium text-mint-deep')}><span>$</span><span className="break-words">{line.t}</span></div>
    case 'step':
      return (
        <div className={cx(gutter, 'text-ink-400')}>
          <span className="text-faint" aria-hidden>·</span>
          <span className="break-words"><span className="inline-block w-[8ch] text-ink-400">{line.tag}</span><Segs t={line.t} /></span>
        </div>
      )
    case 'flag':
      return <div className={cx(gutter, 'text-ink-100')}><span className="text-rose-700" aria-hidden>×</span><span className="break-words"><span className="sr-only">Violation: </span><Segs t={line.t} /></span></div>
    case 'ok':
      return <div className={cx(gutter, 'text-ink-100')}><span className="text-mint-deep" aria-hidden>✓</span><span className="break-words"><span className="sr-only">Passed: </span><Segs t={line.t} /></span></div>
    case 'diff':
      return (
        <div className="my-2 overflow-hidden rounded-[4px] border border-line/80 bg-paper">
          <div className="flex items-center justify-between border-b border-line/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-ink-400">
            <span>denial vs. policy in effect</span><span className="hidden sm:inline">L33822</span>
          </div>
          <div className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 border-l-2 border-rose-400 bg-rose-50 px-2 py-1 text-rose-800">
            <span aria-hidden>-</span><span className="break-words">“…testing four or more times per day”</span>
          </div>
          <div className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 border-l-2 border-mint bg-mint-pale px-2 py-1 text-mint-ink">
            <span aria-hidden>+</span><span className="break-words">“The beneficiary is insulin-treated; or,”</span>
          </div>
        </div>
      )
    case 'result':
      return (
        <div className="mt-2 flex items-center gap-2.5 rounded-[4px] border border-[#a9e3cb] bg-mint-pale px-2.5 py-1.5 font-medium text-mint-ink">
          <span className="size-1.5 shrink-0 rounded-full bg-mint-deep" aria-hidden />
          <span className="min-w-0 break-words"><Segs t={line.t} /></span>
        </div>
      )
  }
}

function RunTerminal() {
  return (
    <figure className="relative w-full max-w-[680px] xl:max-w-none">
      <div className="pointer-events-none absolute -inset-x-4 -inset-y-10 grid-bg sm:-inset-x-10" style={GRID_FADE} aria-hidden />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-lg border border-line bg-paper-high shadow-[0_1px_0_rgba(20,20,20,.02),0_28px_60px_-34px_rgba(20,20,20,.35)]">
        <div className="flex items-center gap-3 border-b border-line bg-paper-low/60 px-4 py-2.5">
          <Dots />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-400">overturn · from denial to signed appeal</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-faint sm:inline">recorded run</span>
        </div>
        <motion.ol variants={termList} initial="hidden" animate="show" aria-label="Recorded Overturn run on demo case maria-cgm"
          className="space-y-[3px] px-4 py-4 font-mono text-[11px] leading-[1.7] sm:px-5 sm:py-5 sm:text-[12px]">
          {RUN.map((l, i) => <motion.li key={i} variants={termItem}><TermRow line={l} /></motion.li>)}
          <motion.li variants={termItem} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 pt-1.5 text-mint-deep">
            <span>$</span><span><span className="caret inline-block h-[13px] w-[7px] translate-y-[2px] bg-ink-100" aria-hidden /></span>
          </motion.li>
        </motion.ol>
      </motion.div>
      <figcaption className="relative mt-3 flex items-center justify-between gap-3 font-mono text-[10.5px] text-ink-400">
        <span>Fig. 1 — a recorded run on a synthetic demo case</span>
        <span className="hidden sm:inline">maria-cgm</span>
      </figcaption>
    </figure>
  )
}

// ------------------------------------------------------------------ lab: two keys
function KeyRow({ k, v, res, tone = 'ok' }: { k: string; v: string; res?: string; tone?: 'ok' | 'fail' | 'dim' }) {
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-[3px]">
      <span className="text-[#8f8b80]">{k}</span>
      <span className={cx('break-words', tone === 'dim' ? 'text-[#a9a59a]' : 'text-[#e9e7e0]')}>{v}</span>
      {res && <span className={cx('text-[10.5px] uppercase tracking-[0.1em]', tone === 'fail' ? 'text-rose-300' : 'text-mint')}>{res}</span>}
    </div>
  )
}

// 1 col on phones, 2x2 on tablets, 4 across on wide screens: hairlines only between cells.
const TRUST_BORDERS = ['', 'border-t sm:border-t-0 sm:border-l', 'border-t xl:border-t-0 xl:border-l', 'border-t sm:border-l xl:border-t-0']

function LabBand() {
  return (
    <section aria-labelledby="verify-h" className="relative overflow-hidden rounded-lg border border-lab-line bg-lab text-[#e9e7e0]">
      <div className="pointer-events-none absolute inset-0 grid-lab" aria-hidden />
      <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:p-12">
        <div>
          <div className="eyebrow !text-[#8f8b80]">Two-key verification</div>
          <h2 id="verify-h" className="mt-4 font-serif text-[34px] font-medium leading-[1.04] tracking-[-0.035em] text-[#f7f5f0] sm:text-[44px]">
            Every quote is verified <span className="font-serif font-normal italic text-mint">twice.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#b9b5aa]">
            Key 1 is code: the quote must exist verbatim in its source. Key 2 is a skeptical auditor model: the quote must genuinely support the point. Tamper with one word and export locks.
          </p>
        </div>

        <div className="overflow-hidden rounded-md border border-lab-line bg-[#141614]/80">
          <div className="flex items-center gap-3 border-b border-lab-line px-4 py-2.5">
            <span className="flex items-center gap-[5px]" aria-hidden>
              <span className="size-[7px] rounded-full bg-white/15" /><span className="size-[7px] rounded-full bg-white/15" /><span className="size-[7px] rounded-full bg-white/15" />
            </span>
            <span className="truncate font-mono text-[11px] text-[#8f8b80]">verifier · criterion c4a</span>
          </div>
          <div className="px-4 py-4 font-mono text-[11px] leading-[1.7] sm:px-5 sm:text-[12px]">
            <KeyRow k="quote" v="“insulin glargine 22 units subcutaneously once daily at bedtime”" tone="dim" />
            <KeyRow k="source" v="chart · line 18" tone="dim" />
            <KeyRow k="key 1" v="exact match in source" res="pass" />
            <KeyRow k="key 2" v="auditor: supports the criterion" res="pass" />
            <div className="my-3 border-t border-dashed border-lab-line" />
            <div className="py-[3px] text-mint"><span className="mr-2">$</span>edit “once daily” → “twice daily”</div>
            <KeyRow k="key 1" v="not found verbatim in source" res="fail" tone="fail" />
            <div className="mt-2 flex items-center gap-2.5 rounded-[4px] border border-rose-300/25 bg-rose-400/10 px-2.5 py-1.5 text-rose-200">
              <span className="size-1.5 shrink-0 rounded-full bg-rose-300" aria-hidden />export locked
            </div>
          </div>
        </div>
      </div>

      <div className="relative grid border-t border-lab-line sm:grid-cols-2 xl:grid-cols-4">
        {TRUST.map((x, i) => {
          const Icon = x.icon
          return (
            <div key={x.t} className={cx('border-lab-line p-6 sm:p-7', TRUST_BORDERS[i])}>
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 text-mint" strokeWidth={1.75} aria-hidden />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#8f8b80]">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-serif text-[18px] font-medium tracking-[-0.015em] text-[#f7f5f0]">{x.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#a9a59a]">{x.b}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ page
export default function Home() {
  const cases = useCases()
  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-24 pb-10 lg:space-y-32">
        {/* hero */}
        <section className="grid grid-cols-1 items-center gap-14 pt-2 lg:pt-10 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)] xl:gap-12 2xl:gap-16">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
              className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-line-strong px-3 py-[5px] font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-300 sm:text-[10.5px] sm:tracking-[0.13em]">
              <span className="h-[2px] w-3 shrink-0 rounded-full bg-mint" aria-hidden />
              <span className="truncate">Built on Gemini 4 · Berkeley × DeepMind 2026</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.3 }}
              className="mt-7 text-balance font-serif text-[clamp(40px,10.6vw,58px)] font-medium leading-[1.0] tracking-[-0.04em] text-ink-100 lg:text-[clamp(54px,5.4vw,66px)] xl:text-[clamp(58px,4.9vw,80px)]">
              Insurers deny care with rules <span className="text-gradient">they’re not allowed to use.</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}
              className="mt-7 max-w-[34rem] text-[16px] leading-relaxed text-ink-300 sm:text-[17px]">
              Overturn reads a Medicare Advantage denial, finds the exact sentence in Medicare’s own coverage policy that contradicts it, <span className="font-medium text-ink-100">verifies every quote twice</span>, and drafts a signed, fax-ready appeal — in about two minutes.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}
              className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-3">
              <Button variant="success" size="lg" className="w-full sm:w-auto" onClick={() => navigate('/case/maria-cgm?autorun=live')}>
                Overturn a denial live <ArrowRight className="size-4" strokeWidth={2} />
              </Button>
              <Button variant="outline" size="lg" icon={<Play className="size-3.5" strokeWidth={2} />} onClick={() => navigate('/case/maria-cgm?autorun=replay')}>Instant replay</Button>
              <button type="button" onClick={() => navigate('/cases')}
                className="group inline-flex h-12 cursor-pointer items-center gap-2 rounded-[4px] px-1 font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-ink-300 transition-colors hover:text-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep">
                <span className="border-b border-line-strong pb-px group-hover:border-ink-100">Denial worklist</span>
                <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
              </button>
            </motion.div>

            <div className="mt-10 border-t border-line pt-5">
              <Eyebrow className="mb-3">Models in the loop</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {MODELS.map(m => <ModelChip key={m} model={m} />)}
              </div>
            </div>
          </div>

          <RunTerminal />
        </section>

        {/* stats ledger */}
        <section aria-labelledby="gap-h">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink-100 pb-3">
            <h2 id="gap-h" className="eyebrow !text-ink-100">The appeal gap</h2>
            <span className="font-mono text-[10.5px] text-ink-400">Source: KFF analysis of CMS data, 2025</span>
          </div>
          <dl className="grid divide-y divide-line border-b border-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {STATS.map((x, i) => (
              <div key={x.value} className={cx('flex flex-col py-7 md:py-9', i === 0 ? 'md:pr-8' : 'md:px-8', i === STATS.length - 1 && 'md:pr-0')}>
                <dt className="order-2 mt-4 max-w-[38ch] font-mono text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-ink-400">{x.label}</dt>
                <dd className={cx('order-1 font-serif text-[56px] font-medium leading-none tracking-[-0.045em] tabular-nums lg:text-[68px]', x.accent ? 'text-mint-deep' : 'text-ink-100')}>{x.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 max-w-3xl font-serif text-[22px] leading-snug tracking-[-0.02em] text-ink-300 sm:text-[26px]">
            That’s roughly <span className="text-ink-100">2.8 million denials a year nobody fought</span> — most of which would likely have been overturned.
          </p>
        </section>

        {/* how it works */}
        <section aria-labelledby="how-h" className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Eyebrow>How it works</Eyebrow>
            <h2 id="how-h" className="mt-4 text-balance font-serif text-[34px] font-medium leading-[1.04] tracking-[-0.035em] text-ink-100 sm:text-[44px]">
              Six agents. One rule: <span className="text-gradient">no unverified sentence leaves the building.</span>
            </h2>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              <span>06 steps</span><span>2 keys per quote</span><span>1 human signature</span>
            </div>
          </div>
          <ol className="border-t border-ink-100">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 border-b border-line py-6 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:gap-x-6">
                <span className="pt-[5px] font-mono text-[11.5px] text-ink-400">0{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="font-serif text-[20px] font-medium leading-tight tracking-[-0.02em] text-ink-100">{s.title}</h3>
                  <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-ink-300">{s.body}</p>
                </div>
                <div className="col-start-2 mt-3 sm:col-start-3 sm:mt-[3px] sm:justify-self-end"><ModelChip model={s.model} /></div>
              </li>
            ))}
          </ol>
        </section>

        {/* verification lab band */}
        <LabBand />

        {/* demo cases */}
        <section aria-labelledby="try-h">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Try it</Eyebrow>
              <h2 id="try-h" className="mt-4 text-balance font-serif text-[30px] font-medium leading-[1.06] tracking-[-0.03em] text-ink-100 sm:text-[38px]">
                Three real denial patterns. <span className="text-gradient">Real CMS policy text.</span>
              </h2>
            </div>
            <Button variant="outline" onClick={() => navigate('/cases')}>All 25 denials <ArrowRight className="size-4" strokeWidth={2} /></Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {HERO_CASES.map(h => {
              const c = cases.find(x => x.id === h.id)
              const fam = familyById(h.familyId)
              const odds = overturnRate(fam?.segment)
              return (
                <Card key={h.id} className="flex h-full flex-col transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-[0_18px_40px_-28px_rgba(20,20,20,.35)]">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">{h.familyId} · {fam?.short}</span>
                    <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-300">${h.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-balance font-serif text-[20px] font-medium leading-snug tracking-[-0.02em] text-ink-100">{h.title}</h3>
                    <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-300">{h.subtitle}</p>
                    <div className="mt-6 flex items-end justify-between gap-3 border-t border-line pt-4">
                      <div>
                        <div className="font-serif text-[30px] font-medium leading-none tracking-[-0.035em] tabular-nums text-ink-100">{Math.round(odds.rate * 100)}%</div>
                        <div className="mt-2 font-mono text-[11px] text-ink-400">Similar IMRs overturned · n={odds.n}</div>
                      </div>
                      {c?.status && c.status !== 'new' && <Badge tone="green">{c.status}</Badge>}
                    </div>
                    <div className="mt-5 flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => navigate(`/case/${h.id}?autorun=live`)}>Run live</Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/case/${h.id}`)}>Open</Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>

        <footer className="grid gap-3 border-t border-line pt-6 font-mono text-[10.5px] leading-relaxed text-ink-400 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8">
          <div className="flex items-start gap-2.5">
            <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-mint" aria-hidden />
            <span>Policy text: CMS Medicare Coverage Database (public domain). Outcomes: CA DMHC IMR open data. Synthetic patients only.</span>
          </div>
          <div className="md:text-right">Not legal or medical advice · Human sign-off required on every appeal.</div>
        </footer>
      </div>
    </MotionConfig>
  )
}
