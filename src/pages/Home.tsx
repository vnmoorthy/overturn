import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Fingerprint, FileSearch, FileText, Gavel, History, Mic, PenLine, ScanSearch, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { navigate } from '../lib/router'
import { useCases } from '../lib/store'
import { HERO_CASES } from '../data/cases'
import { overturnRate } from '../lib/imr'
import { familyById } from '../lib/policies'
import { Badge, Button, Card, CountUp, ModelChip } from '../ui/kit'

const STEPS = [
  { icon: FileText, title: 'Read the denial', body: 'Snap, scan or drop the letter. Gemini extracts payer, codes, dates and every cited requirement — verbatim.', model: 'gemini-3.8-flash' },
  { icon: FileSearch, title: 'Find the rulebook', body: 'Routes to the governing Medicare LCD and pins the exact version in effect on the date of service.', model: 'policy library · 6 CMS versions' },
  { icon: ScanSearch, title: 'Match the evidence', body: 'Long-context read of policy + chart + denial: criterion-by-criterion, with line-level citations.', model: 'gemini-4-hydrogen' },
  { icon: Fingerprint, title: 'Verify twice', body: 'Key 1: deterministic exact-match provenance. Key 2: a skeptical Gemini auditor checks the quote truly supports the point.', model: 'code + gemini-3.5-flash' },
  { icon: Gavel, title: 'Catch the violations', body: 'A deterministic rules engine flags retired rules, phantom criteria and ignored pathways under 42 CFR § 422.', model: 'rules engine' },
  { icon: PenLine, title: 'Draft, sign, send', body: 'The model can only cite through verified tokens. A human signs; a fax-ready packet with exhibits exports.', model: 'gemini-4-hydrogen' },
]

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none">
      <motion.div initial={{ opacity: 0, y: 20, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: -3 }} transition={{ delay: 0.2, duration: 0.7 }}
        className="relative rounded-2xl border border-white/10 bg-[#f6f3ec] p-5 text-[11.5px] leading-relaxed text-[#2a2a2a] shadow-2xl">
        <div className="font-bold tracking-wide">SUNRISE SENIOR ADVANTAGE (HMO)</div>
        <div className="mb-2 text-[10px] text-[#666]">Notice of Denial of Medical Coverage · Oct 6, 2026</div>
        <div>Member: Maria Delgado · Dexcom G7 CGM (E2103, A4239)</div>
        <div className="mt-2">The member does not meet coverage criteria because the member is <motion.span className="rounded px-0.5" animate={{ backgroundColor: ['rgba(251,113,133,0)', 'rgba(251,113,133,.35)', 'rgba(251,113,133,.35)'] }} transition={{ delay: 1.2, duration: 0.6 }}>not performing blood glucose testing four or more times per day</motion.span>, and is <motion.span className="rounded px-0.5" animate={{ backgroundColor: ['rgba(251,113,133,0)', 'rgba(251,113,133,.35)'] }} transition={{ delay: 1.6, duration: 0.6 }}>not insulin-treated with multiple (three or more) daily administrations</motion.span>…</div>
        <motion.div initial={{ scale: 2, opacity: 0, rotate: 12 }} animate={{ scale: 1, opacity: 1, rotate: 12 }} transition={{ delay: 0.8, type: 'spring', damping: 12 }}
          className="absolute right-4 top-4 rounded-md border-[3px] border-rose-600 px-2 py-0.5 text-[15px] font-black tracking-widest text-rose-600">DENIED</motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.1, duration: 0.6 }}
        className="glass-strong relative z-10 -mt-6 ml-4 rounded-2xl p-4 shadow-2xl sm:ml-16">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5 truncate text-[12px] font-semibold"><History className="size-3.5 shrink-0 text-violet-300" /> CMS LCD L33822 · revision history</div>
          <Badge tone="red">retired</Badge>
        </div>
        <div className="text-[12px] leading-relaxed text-ink-300"><span className="line-through decoration-rose-400">“…performing frequent (four or more times a day) testing”</span></div>
        <div className="mt-1 text-[11px] text-rose-200">Removed 07/18/2021 — not in effect on the date of service.</div>
        <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] p-2.5 text-[12px] text-emerald-100">
          In effect: <motion.span animate={{ backgroundColor: ['rgba(52,211,153,0)', 'rgba(52,211,153,.3)'] }} transition={{ delay: 2.9, duration: 0.6 }} className="rounded px-0.5">“The beneficiary is insulin-treated; or,”</motion.span>
          <div className="mt-1 font-mono text-[10.5px] text-emerald-200/80">chart L18 · insulin glargine 22 units once daily ✓ ✓</div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.6, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} transition={{ delay: 3.4, type: 'spring', damping: 11 }}
        className="absolute -bottom-14 -left-1 z-20 rounded-xl border-[3px] border-emerald-300 bg-ink-950/80 px-4 py-2 text-center shadow-[0_0_60px_rgba(52,211,153,.4)] backdrop-blur">
        <div className="text-[20px] font-black uppercase tracking-[0.14em] text-emerald-300">Overturn it</div>
        <div className="font-mono text-[10px] tracking-wider text-emerald-100">12 QUOTES VERIFIED · 3 VIOLATIONS</div>
      </motion.div>
    </div>
  )
}

export default function Home() {
  const cases = useCases()
  return (
    <div className="space-y-20 pb-10">
      {/* hero */}
      <section className="grid items-center gap-12 overflow-x-clip pt-4 lg:grid-cols-[1.1fr_1fr] lg:overflow-visible lg:pt-10">
        <div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-ink-300">
            <Sparkles className="size-3.5 text-violet-300" /> Built on Gemini 4 · Berkeley × DeepMind 2026
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="text-[42px] font-semibold leading-[1.03] tracking-[-0.03em] sm:text-[60px]">
            Insurers deny care with rules <span className="font-display font-normal italic text-gradient">they’re not allowed to use.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-300">
            Overturn reads a Medicare Advantage denial, finds the exact sentence in Medicare’s own coverage policy that contradicts it, <b className="text-ink-100">verifies every quote twice</b>, and drafts a signed, fax-ready appeal — in about two minutes.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" icon={<Zap className="size-4" />} onClick={() => navigate('/case/maria-cgm?autorun=live')}>Overturn a denial live</Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/case/maria-cgm?autorun=replay')}>Instant replay</Button>
            <Button variant="ghost" size="lg" icon={<ArrowRight className="size-4" />} onClick={() => navigate('/cases')}>Worklist</Button>
          </motion.div>
          <div className="mt-6 flex flex-wrap gap-2">
            <ModelChip model="gemini-4-hydrogen" /><ModelChip model="gemini-3.8-flash" /><ModelChip model="gemini-3.8-live" /><ModelChip model="gemini-3.8-flash-tts" /><ModelChip model="gemini-embedding-2" /><ModelChip model="antigravity agent" />
          </div>
        </div>
        <div className="overflow-x-clip pb-12 pt-2"><HeroVisual /></div>
      </section>

      {/* stats */}
      <section>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { v: 3.2, d: 1, s: 'M', label: 'Medicare Advantage prior-authorization denials in 2023', tone: 'text-rose-300' },
            { v: 11.7, d: 1, s: '%', label: 'of those denials were ever appealed', tone: 'text-amber-200' },
            { v: 81.7, d: 1, s: '%', label: 'of appeals were partially or fully overturned', tone: 'text-emerald-300' },
          ].map((x, i) => (
            <motion.div key={i} className="h-full" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
              <Card className="h-full p-6">
                <div className={`text-[52px] font-semibold leading-none tracking-tight ${x.tone}`}><CountUp to={x.v} decimals={x.d} suffix={x.s} /></div>
                <div className="mt-3 text-[14px] text-ink-300">{x.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-center text-[13.5px] text-ink-300">That’s roughly <b className="text-ink-100">2.8 million denials a year nobody fought</b> — most of which would likely have been overturned. <span className="text-ink-400">Source: KFF analysis of CMS data, 2025.</span></p>
      </section>

      {/* how */}
      <section>
        <div className="mb-6 max-w-2xl">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">How it works</div>
          <h2 className="text-[32px] font-semibold leading-tight tracking-tight">Six agents. One rule: <span className="font-display italic text-gradient">no unverified sentence leaves the building.</span></h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div key={s.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <Card className="h-full p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="rounded-xl border border-white/10 bg-white/[0.05] p-2.5"><Icon className="size-5 text-cyan-200" /></div>
                    <span className="font-mono text-[12px] text-ink-400">0{i + 1}</span>
                  </div>
                  <div className="text-[16px] font-semibold">{s.title}</div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-300">{s.body}</p>
                  <div className="mt-3"><ModelChip model={s.model} /></div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* demo cases */}
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Try it</div>
            <h2 className="text-[28px] font-semibold tracking-tight">Three real denial patterns. Real CMS policy text.</h2>
          </div>
          <Button variant="outline" onClick={() => navigate('/cases')}>All 25 denials <ArrowRight className="size-4" /></Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {HERO_CASES.map((h, i) => {
            const c = cases.find(x => x.id === h.id)
            const fam = familyById(h.familyId)
            const odds = overturnRate(fam?.segment)
            return (
              <motion.div key={h.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                <Card className="group flex h-full flex-col p-5 transition-transform hover:-translate-y-0.5">
                  <div className="mb-3 flex items-center justify-between">
                    <Badge tone="violet">{h.familyId} · {fam?.short}</Badge>
                    <span className="text-[12px] text-ink-400">${h.amount.toLocaleString()}</span>
                  </div>
                  <div className="text-[17px] font-semibold">{h.title}</div>
                  <p className="mt-1 flex-1 text-[13.5px] text-ink-300">{h.subtitle}</p>
                  <div className="mt-4 flex items-center justify-between text-[12px] text-ink-400">
                    <span>Similar IMRs overturned: <b className="text-emerald-300">{Math.round(odds.rate * 100)}%</b> (n={odds.n})</span>
                    {c?.status && c.status !== 'new' && <Badge tone="green">{c.status}</Badge>}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => navigate(`/case/${h.id}?autorun=live`)}>Run live</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/case/${h.id}`)}>Open</Button>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* trust */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Fingerprint, t: 'Two-key verification', b: 'Every quote must exist verbatim in its source and genuinely support the point. Tamper with one word and export locks.' },
          { icon: Gavel, t: 'Deterministic compliance', b: 'The LLM supplies features; code decides every flag. Each one is a possible issue the biller confirms.' },
          { icon: ShieldCheck, t: 'Hash-chained audit', b: 'Every AI step and human decision is SHA-256 chained. Edit history and the chain breaks.' },
          { icon: Mic, t: 'Rehearse the P2P', b: 'Practice the peer-to-peer call against a skeptical medical director, live over Gemini voice.' },
        ].map(x => {
          const Icon = x.icon
          return (
            <Card key={x.t} className="p-5">
              <Icon className="mb-3 size-5 text-emerald-300" />
              <div className="font-semibold">{x.t}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">{x.b}</p>
            </Card>
          )
        })}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6 text-[12px] text-ink-400">
        <div className="flex items-center gap-2"><BadgeCheck className="size-4 text-emerald-300" /> Policy text: CMS Medicare Coverage Database (public domain). Outcomes: CA DMHC IMR open data. Synthetic patients only.</div>
        <div>Not legal or medical advice · Human sign-off required on every appeal.</div>
      </footer>
    </div>
  )
}
