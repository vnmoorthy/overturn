// Settings: Gemini key, model quality, reliability, local data, privacy & safety, about.
import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, HardDrive, Info, LifeBuoy, Lock, Scale, ShieldCheck, Sparkles, TriangleAlert, UserCheck, Users,
} from 'lucide-react'
import { version } from '../../package.json'
import { getUseCache, setUseCache } from '../lib/gemini'
import { imr } from '../lib/imr'
import { Badge, Logo, ModelChip, Toggle, cx, toast } from '../ui/kit'
import { ApiKeyCard } from './settings/ApiKeyCard'
import { DataCard } from './settings/DataCard'
import { ModelsCard } from './settings/ModelsCard'
import { ExtLink, Note, SettingsCard } from './settings/parts'

export default function Settings(_props: { id?: string }) {
  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-3xl">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Settings</div>
        <h1 className="text-[28px] font-semibold leading-[1.12] tracking-tight text-ink-100 sm:text-[36px]">
          Keys, models &amp; <span className="font-display text-[1.12em] font-normal italic text-gradient">your data</span>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-300">
          Overturn runs entirely in this browser. The only thing that leaves it is the request your browser sends to the Gemini API.
        </p>
      </motion.header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <ApiKeyCard delay={0.03} />
          <ModelsCard delay={0.08} />
          <ReliabilityCard delay={0.12} />
          <DataCard delay={0.16} />
        </div>
        <div className="min-w-0 space-y-5">
          <PrivacyCard delay={0.1} />
          <AboutCard delay={0.15} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- reliability
function ReliabilityCard({ delay }: { delay?: number }) {
  const [on, setOn] = useState(getUseCache())
  const flip = (v: boolean) => {
    setUseCache(v); setOn(v)
    toast(v ? 'Saved runs will stand in for demo cases when every Gemini model is busy.' : 'Live only: demo cases will show an error if Gemini is busy.', v ? 'green' : 'gray')
  }
  return (
    <SettingsCard delay={delay} icon={<LifeBuoy className="size-4 text-amber-200" />} title="Reliability"
      sub="Free-tier quotas are shared, so a live demo can hit a busy minute.">
      <div className="flex flex-col gap-4">
        <Toggle checked={on} onChange={flip} label={<span className="text-[14px] font-medium text-ink-100">Use saved genuine runs for demo cases when Gemini is busy</span>} />
        <p className="text-[13px] leading-relaxed text-ink-400">
          When every model in a step's chain is rate-limited or down, a demo case replays the output Gemini actually produced for that same case earlier, instead of failing. Only the built-in demo cases have saved runs. Cases you add always run live. Replayed steps are never passed off as live: they are labeled <span className="text-amber-200">cached run</span> in the UI and in the Agent trace.
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <span className="text-[11.5px] text-ink-400">How it looks:</span>
          <ModelChip model="gemini-4-hydrogen" cached />
          <Badge tone="amber">cached run</Badge>
          <span className="text-[11.5px] text-ink-400">vs. live</span>
          <ModelChip model="gemini-4-hydrogen" ms={8400} />
        </div>
      </div>
    </SettingsCard>
  )
}

// ---------------------------------------------------------------- privacy & safety
function PrivacyCard({ delay }: { delay?: number }) {
  const items: { icon: ReactNode; title: string; body: ReactNode; tone?: 'amber' }[] = [
    { icon: <HardDrive className="size-4 text-emerald-300" />, title: 'All data stays in this browser', body: 'Cases, the audit log, and settings live in localStorage. There is no Overturn server or database.' },
    { icon: <Users className="size-4 text-cyan-300" />, title: 'Synthetic patients only', body: 'Every demo patient, chart, and denial letter is made up. The policy text and outcome data are real public records.' },
    { icon: <TriangleAlert className="size-4 text-amber-300" />, tone: 'amber', title: 'No real PHI on the free tier', body: <>Do not upload real patient information here. Data sent to the free tier of the Gemini API may be used to improve Google products (<ExtLink href="https://ai.google.dev/gemini-api/terms">terms</ExtLink>).</> },
    { icon: <Lock className="size-4 text-violet-300" />, title: 'Production path', body: 'Vertex AI or Gemini Enterprise Agent Platform, under a Google Cloud Business Associate Agreement (BAA).' },
    { icon: <UserCheck className="size-4 text-emerald-300" />, title: 'A human signs every appeal', body: 'Overturn drafts and verifies. A biller or provider reviews each finding and signs before anything is sent, and the sign-off is recorded in the audit trail.' },
    { icon: <Scale className="size-4 text-ink-300" />, title: 'Not legal or medical advice', body: 'Overturn is a drafting and research tool. Coverage decisions and appeal strategy remain with qualified people.' },
  ]
  return (
    <SettingsCard delay={delay} icon={<ShieldCheck className="size-4 text-emerald-300" />} title="Privacy & safety">
      <ul className="space-y-3.5">
        {items.map(it => (
          <li key={it.title} className={cx('flex gap-3', it.tone === 'amber' && '-mx-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-2 py-2.5')}>
            <span className="mt-0.5 shrink-0">{it.icon}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-ink-100">{it.title}</div>
              <div className="text-[12.5px] leading-relaxed text-ink-400">{it.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}

// ---------------------------------------------------------------- about
const BUILT_WITH: { model: string; role: string }[] = [
  { model: 'Gemini 4 Hydrogen', role: 'Criteria matching and appeal drafting' },
  { model: 'Gemini 3.8 Flash · 3.5 Flash', role: 'Extraction, quote verification, coaching, patient explainer' },
  { model: 'Gemini 3.8 Live', role: 'Real-time peer-to-peer rehearsal' },
  { model: 'Gemini 3.8 Flash TTS', role: 'Patient explainer read aloud' },
  { model: 'Gemini Embedding 2', role: 'Similar independent-review decisions' },
]
const LCDS: { id: string; title: string; url: string }[] = [
  { id: 'L33822', title: 'Glucose Monitors', url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33822' },
  { id: 'L33718', title: 'Positive Airway Pressure (PAP) Devices for Obstructive Sleep Apnea', url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33718' },
  { id: 'L38801', title: 'Facet Joint Interventions for Pain Management', url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=38801' },
]

function AboutCard({ delay }: { delay?: number }) {
  const d = imr()
  return (
    <SettingsCard delay={delay} icon={<Info className="size-4 text-ink-300" />} title="About">
      <div className="flex items-center gap-3">
        <Logo size={40} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-semibold tracking-tight text-ink-100">Overturn</span>
            <Badge tone="violet" className="font-mono">v{version}</Badge>
          </div>
          <div className="text-[12.5px] text-ink-400">Berkeley × Google DeepMind hackathon build</div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
        Finds the sentence in the governing CMS coverage policy that contradicts a Medicare Advantage denial, verifies every quote against the source, and drafts the appeal for a human to sign.
      </p>

      <div className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">Built with</div>
      <ul className="mt-2 space-y-2">
        {BUILT_WITH.map(b => (
          <li key={b.model} className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
            <div className="min-w-0 text-[12.5px] leading-snug">
              <span className="font-medium text-ink-100">{b.model}</span>
              <span className="text-ink-400"> · {b.role}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">Data sources</div>
      <ul className="mt-2 space-y-3 text-[12.5px] leading-relaxed">
        <li className="flex gap-2.5">
          <BookOpen className="mt-0.5 size-3.5 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <ExtLink href="https://www.cms.gov/medicare-coverage-database/">CMS Medicare Coverage Database</ExtLink>
            <span className="text-ink-400">, verbatim Local Coverage Determination text and version history:</span>
            <ul className="mt-1.5 space-y-1">
              {LCDS.map(l => (
                <li key={l.id} className="flex min-w-0 gap-2">
                  <ExtLink href={l.url} className="shrink-0 font-mono text-[11.5px]">{l.id}</ExtLink>
                  <span className="min-w-0 text-ink-400">{l.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
        <li className="flex gap-2.5">
          <BookOpen className="mt-0.5 size-3.5 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <ExtLink href={d?.source_url || 'https://data.ca.gov/dataset/independent-medical-review-imr-determinations-trend'}>California DMHC Independent Medical Review open data</ExtLink>
            <span className="text-ink-400">
              {d ? `, ${d.total_cases.toLocaleString()} decisions from ${d.year_range[0]} to ${d.year_range[1]}, used for historical overturn rates.` : ', used for historical overturn rates.'}
            </span>
          </div>
        </li>
        <li className="flex gap-2.5">
          <BookOpen className="mt-0.5 size-3.5 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <ExtLink href="https://www.kff.org/medicare/nearly-50-million-prior-authorization-requests-were-sent-to-medicare-advantage-insurers-in-2023/">KFF analysis of Medicare Advantage prior authorization</ExtLink>
            <span className="text-ink-400">: in 2024, 4.1 million requests were denied, 11.5% of denials were appealed, and 80.7% of appeals were partly or fully overturned.</span>
          </div>
        </li>
      </ul>

      <div className="mt-5">
        <Note icon={<Scale className="size-3.5 text-ink-400" />}>
          LCD text is public-domain CMS content. All patient data in this demo is synthetic. Not legal or medical advice.
        </Note>
      </div>
    </SettingsCard>
  )
}
