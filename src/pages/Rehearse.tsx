// Peer-to-peer rehearsal: the provider practices the P2P call with the plan's medical
// director, played live by Gemini over real-time voice (Gemini Live API).

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ChevronDown, FileText, Headphones, Mic, MicOff, PhoneCall, PhoneOff, Quote, Settings as Cog, ShieldCheck, Sparkles, TriangleAlert,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Modal, ModelChip, Toggle, cx, type Tone } from '../ui/kit'
import { useCases } from '../lib/store'
import { navigate } from '../lib/router'
import { LIVE_MODEL } from '../lib/gemini'
import type { MicError } from '../lib/liveAudio'
import type { CaseFile } from '../lib/types'
import { DIRECTOR, buildContext, directorInstruction, scoreCall, transcriptText } from './rehearse/context'
import { useLiveCall, type CallActivity, type CallPhase, type MicState } from './rehearse/useLiveCall'
import { CallOrb } from './rehearse/CallOrb'
import { Transcript } from './rehearse/Transcript'
import { CoachPanel } from './rehearse/CoachPanel'

const VOICES = [
  { id: 'Charon', note: 'informative' },
  { id: 'Orus', note: 'firm' },
  { id: 'Kore', note: 'firm' },
  { id: 'Fenrir', note: 'excitable' },
  { id: 'Puck', note: 'upbeat' },
  { id: 'Aoede', note: 'breezy' },
]
const LS_VOICE = 'overturn_p2p_voice'
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Rehearse({ id }: { id?: string }) {
  const all = useCases()
  const c = id ? all.find(x => x.id === id) || null : null
  if (!c) {
    return (
      <div className="space-y-6">
        <Header all={all} current={null} disabled={false} />
        <EmptyState icon={<Mic className="size-5" />} title="That case isn't in this browser"
          body="Pick a case above, or open the denial worklist to choose one to rehearse."
          action={<Button variant="primary" onClick={() => navigate('/cases')}>Open the denial worklist</Button>} />
      </div>
    )
  }
  return <RehearseCase key={c.id} c={c} all={all} />
}

// ------------------------------------------------------------------ header
function Header({ all, current, disabled }: { all: CaseFile[]; current: CaseFile | null; disabled: boolean }) {
  const hero = all.filter(x => x.hero)
  const analyzed = all.filter(x => !x.hero && x.match)
  const extra = current && !hero.some(h => h.id === current.id) && !analyzed.some(a => a.id === current.id) ? [current] : []
  const pick = (id: string) => {
    try { localStorage.setItem('overturn_last_case', id) } catch { /* ignore */ }
    navigate(`/rehearse/${id}`)
  }
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400/60" /><span className="relative inline-flex size-2 rounded-full bg-violet-400" /></span>
          Peer-to-peer rehearsal
        </div>
        <h1 className="font-display text-[34px] leading-[1.05] tracking-tight text-ink-100 sm:text-[42px]">
          Practice the call with the plan’s <span className="text-gradient italic">medical director</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-300">
          Gemini plays the reviewer live, by voice. It defends the denial until you cite the governing criterion and the chart line that meets it.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex min-w-0 items-center" title={disabled ? 'End the call to switch cases' : 'Switch case'}>
          <span className="sr-only">Case to rehearse</span>
          <select value={current?.id || ''} disabled={disabled} onChange={e => pick(e.target.value)}
            className="h-10 w-full max-w-[300px] cursor-pointer appearance-none truncate rounded-xl border border-white/10 bg-white/[0.06] pl-3 pr-9 text-sm text-ink-100 outline-none transition hover:bg-white/[0.1] focus:border-violet-300/40 disabled:cursor-not-allowed disabled:opacity-50">
            {!current && <option value="" disabled>Choose a case</option>}
            <optgroup label="Demo cases" className="bg-ink-900">
              {hero.map(h => <option key={h.id} value={h.id} className="bg-ink-900 text-ink-100">{h.title}</option>)}
            </optgroup>
            {analyzed.length > 0 && (
              <optgroup label="Analyzed cases" className="bg-ink-900">
                {analyzed.map(a => <option key={a.id} value={a.id} className="bg-ink-900 text-ink-100">{a.title}</option>)}
              </optgroup>
            )}
            {extra.map(x => <option key={x.id} value={x.id} className="bg-ink-900 text-ink-100">{x.title}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-ink-400" />
        </label>
        {current && (
          <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/case/${current.id}`)}>Case workspace</Button>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ status
function statusOf(phase: CallPhase, activity: CallActivity, mic: MicState): { label: string; tone: Tone; dot: string; pulse: boolean } {
  if (phase === 'connecting') return { label: mic === 'requesting' ? 'Connecting · allow the microphone' : 'Connecting', tone: 'cyan', dot: 'bg-cyan-300', pulse: true }
  if (phase === 'live') {
    if (activity === 'speaking') return { label: 'Medical director speaking', tone: 'violet', dot: 'bg-violet-300', pulse: true }
    if (activity === 'listening') return { label: 'Listening', tone: 'green', dot: 'bg-emerald-300', pulse: true }
    if (activity === 'thinking') return { label: 'Director is thinking', tone: 'violet', dot: 'bg-violet-300', pulse: true }
    return { label: 'Live', tone: 'green', dot: 'bg-emerald-300', pulse: true }
  }
  if (phase === 'ended') return { label: 'Call ended', tone: 'gray', dot: 'bg-ink-400', pulse: false }
  return { label: 'Ready to call', tone: 'gray', dot: 'bg-ink-300', pulse: false }
}

function micHelp(e: MicError): { title: string; body: string } {
  switch (e.kind) {
    case 'denied': return { title: 'Microphone access is blocked', body: 'Click the site-settings icon at the left of the address bar, set Microphone to Allow, then start the call again. Until then, type your replies below and the director will answer out loud.' }
    case 'notfound': return { title: 'No microphone detected', body: 'Connect a microphone or headset and call again, or keep going by typing your replies below.' }
    case 'busy': return { title: 'The microphone is busy', body: 'Another app is using it. Close that app and call again, or type your replies below.' }
    case 'insecure': return { title: 'Microphone needs a secure page', body: 'Browsers only allow the microphone on HTTPS or localhost. Type your replies below instead.' }
    default: return { title: 'Microphone unavailable', body: `${e.message} You can still type your replies below.` }
  }
}

// ------------------------------------------------------------------ page
function RehearseCase({ c, all }: { c: CaseFile; all: CaseFile[] }) {
  const x = useMemo(() => buildContext(c), [c])
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem(LS_VOICE) || 'Charon' } catch { return 'Charon' } })
  const [tough, setTough] = useState(false)
  const [letterOpen, setLetterOpen] = useState(false)
  const instruction = useMemo(() => directorInstruction(x, c, { tough }), [x, c, tough])
  const call = useLiveCall({ caseId: c.id, systemInstruction: instruction, voice })
  const inCall = call.phase === 'live' || call.phase === 'connecting'
  const score = useMemo(() => (call.phase === 'ended' ? scoreCall(call.entries, call.seconds, x) : null), [call.phase, call.entries, call.seconds, x])
  const transcript = useMemo(() => transcriptText(call.entries, x), [call.entries, x])
  const st = statusOf(call.phase, call.activity, call.micState)
  const verifiedCount = x.rows.filter(r => r.verified).length

  const chooseVoice = (v: string) => { setVoice(v); try { localStorage.setItem(LS_VOICE, v) } catch { /* ignore */ } }

  return (
    <div className="space-y-6">
      <Header all={all} current={c} disabled={inCall} />

      <AnimatePresence>
        {!x.analyzed && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-200" />
              <div>
                <div className="text-[14px] font-medium text-amber-100">Run Overturn on this case first for verified coach cards</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">You can still rehearse now. The director argues from the denial letter and the chart as submitted.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate(`/case/${c.id}`)}>Run Overturn</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------------------------------------------------------------- call */}
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <Card glow={call.phase === 'live'} className="relative overflow-hidden lg:flex lg:max-h-[calc(100vh-3rem)] lg:flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-3 lg:shrink-0">
              <div className="flex items-center gap-2.5">
                <Badge tone={st.tone} className="h-6 gap-1.5 px-2.5" icon={
                  <span className="relative flex size-1.5">{st.pulse && <span className={cx('absolute inline-flex size-full animate-ping rounded-full opacity-70', st.dot)} />}<span className={cx('relative inline-flex size-1.5 rounded-full', st.dot)} /></span>
                }>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={st.label} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }}>{st.label}</motion.span>
                  </AnimatePresence>
                </Badge>
                <span className={cx('font-mono text-[13px] tabular-nums', call.phase === 'live' ? 'text-ink-100' : 'text-ink-400')}>{clock(call.seconds)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <ModelChip model={LIVE_MODEL} />
                <label className="relative inline-flex items-center" title={inCall ? 'Voice is fixed for this call' : 'Director voice'}>
                  <span className="sr-only">Director voice</span>
                  <select value={voice} disabled={inCall} onChange={e => chooseVoice(e.target.value)}
                    className="h-7 cursor-pointer appearance-none rounded-md border border-white/10 bg-white/[0.04] pl-2 pr-6 font-mono text-[11px] text-ink-300 outline-none hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
                    {VOICES.map(v => <option key={v.id} value={v.id} className="bg-ink-900">{v.id} · {v.note}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-ink-400" />
                </label>
              </div>
            </div>

            <div className="relative lg:shrink-0">
              <div className="relative mx-auto h-[260px] w-full max-w-[520px] sm:h-[300px] lg:h-[270px]">
                <CallOrb phase={call.phase} activity={call.activity} muted={call.muted} levels={call.levels} />
                <AnimatePresence>
                  {call.muted && call.phase === 'live' && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="absolute left-1/2 top-4 -translate-x-1/2">
                      <Badge tone="red" icon={<MicOff className="size-3" />}>You are muted</Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="-mt-3 text-center">
                <div className="text-[15px] font-semibold tracking-tight">{DIRECTOR.name}</div>
                <div className="text-[12.5px] text-ink-400">{DIRECTOR.title} · {x.payer}</div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 px-4 pb-5 pt-4 lg:shrink-0">
              <AnimatePresence mode="wait" initial={false}>
                {call.phase === 'live' ? (
                  <motion.div key="live" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-3">
                    <Button size="lg" variant={call.muted ? 'danger' : 'subtle'} className="min-w-[132px]" disabled={call.micState !== 'on'}
                      icon={call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />} onClick={call.toggleMute}>
                      {call.muted ? 'Unmute' : 'Mute'}
                    </Button>
                    <button onClick={call.end}
                      className="inline-flex h-12 min-w-[132px] cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-rose-300/30 bg-gradient-to-b from-rose-500 to-rose-600 px-6 text-[15px] font-medium text-white shadow-[0_8px_30px_-8px_rgba(244,63,94,.7)] transition hover:brightness-110 active:scale-[0.98]">
                      <PhoneOff className="size-4" /> End call
                    </button>
                  </motion.div>
                ) : call.phase === 'connecting' ? (
                  <motion.div key="connecting" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-3">
                    <Button size="lg" variant="subtle" loading className="min-w-[160px]">Connecting</Button>
                    <Button size="lg" variant="danger" icon={<PhoneOff className="size-4" />} onClick={call.end}>Cancel</Button>
                  </motion.div>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-col items-center gap-3">
                    <Button size="lg" variant="primary" className="min-w-[190px]" icon={<PhoneCall className="size-4" />} onClick={() => void call.start()}>
                      {call.phase === 'ended' ? 'Call again' : 'Start call'}
                    </Button>
                    <Toggle checked={tough} onChange={setTough} label={<span className="text-[12.5px] text-ink-300">Tough reviewer</span>} />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {call.micError ? (
                  <motion.div key="mic" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="w-full max-w-xl overflow-hidden">
                    <div className="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3.5 py-3">
                      <MicOff className="mt-0.5 size-4 shrink-0 text-amber-200" />
                      <div>
                        <div className="text-[13px] font-medium text-amber-100">{micHelp(call.micError).title}</div>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">{micHelp(call.micError).body}</p>
                      </div>
                    </div>
                  </motion.div>
                ) : call.error && !inCall ? (
                  <motion.div key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="w-full max-w-xl overflow-hidden">
                    <div className="flex flex-col gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-3">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-300" />
                        <p className="text-[12.5px] leading-relaxed text-rose-100">{call.error}</p>
                      </div>
                      {/key|Settings/i.test(call.error) && <Button size="sm" variant="outline" className="shrink-0" icon={<Cog className="size-3.5" />} onClick={() => navigate('/settings')}>Settings</Button>}
                    </div>
                  </motion.div>
                ) : !inCall && call.phase !== 'ended' ? (
                  <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[12px] text-ink-400">
                    <Headphones className="size-3.5" /> Headphones recommended. Talk naturally; you can interrupt the director.
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="border-t border-white/8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <Transcript entries={call.entries} phase={call.phase} payer={x.payer} micAvailable={call.micState === 'on'} onSend={call.sendText} />
            </div>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- coach */}
        <div className="min-w-0">
          <CoachPanel c={c} x={x} score={score} onAgain={() => void call.start()} transcript={transcript}>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">The denial</div>
                <div className="mt-0.5 truncate text-[14.5px] font-semibold">{c.title}</div>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0" icon={<FileText className="size-3.5" />} onClick={() => setLetterOpen(true)}>Letter</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {x.family && <Badge tone="violet">{x.family.id} · {x.family.short}</Badge>}
              {x.analyzed
                ? <Badge tone="cyan" icon={<ShieldCheck className="size-3" />}>{verifiedCount} verified citation{verifiedCount === 1 ? '' : 's'}</Badge>
                : <Badge tone="amber">Not analyzed yet</Badge>}
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <Field label="Plan">{x.plan || x.payer}</Field>
              <Field label="Billed">{x.amount || '—'}</Field>
              <Field label="Service" className="col-span-2">{x.service || '—'}</Field>
              {x.dos && <Field label="Date of service">{x.dos}</Field>}
              {x.providerName && <Field label="You are">{x.providerName}</Field>}
            </div>
            <div className="mt-3.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400"><Quote className="size-3" /> Why they denied it</div>
              <p className="text-[12.5px] leading-relaxed text-ink-300">{x.reason}</p>
            </div>
            {x.summary && (
              <div className="mt-2.5 flex gap-2 text-[12px] leading-relaxed text-ink-400" title={x.summary}>
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-300" /><span className="line-clamp-3">{x.summary}</span>
              </div>
            )}
          </Card>

          </CoachPanel>
        </div>
      </div>

      <Modal open={letterOpen} onClose={() => setLetterOpen(false)} title="Denial letter" wide>
        <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink-300">{c.denialText || 'No denial letter text on file for this case.'}</pre>
      </Modal>
    </div>
  )
}
