// Peer-to-peer rehearsal: the provider practices the P2P call with the plan's medical
// director, played live by Gemini over real-time voice (Gemini Live API).

import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ChevronDown, FileText, Headphones, Mic, MicOff, PhoneCall, PhoneOff, Settings as Cog, ShieldCheck, TriangleAlert,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Eyebrow, Modal, ModelChip, Toggle, cx, type Tone } from '../ui/kit'
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
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/** One ledger line: mono label, value that wraps instead of truncating. */
function Ledger({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0">
      <dt className="eyebrow !text-[10px]">{label}</dt>
      <dd className="text-[13px] leading-snug text-ink-100 tabular-nums">{children}</dd>
    </div>
  )
}

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
    <div className="flex flex-col gap-6 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
      <div className="min-w-0 max-w-[760px]">
        <Eyebrow className="mb-3 flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-mint" aria-hidden />
          Peer-to-peer rehearsal
        </Eyebrow>
        <h1 className="font-serif text-[34px] font-medium leading-[1.04] tracking-[-0.035em] text-ink-100 sm:text-[46px]">
          Practice the call with the plan’s <span className="text-gradient">medical director</span>
        </h1>
        <p className="mt-3 max-w-[600px] text-[14.5px] leading-relaxed text-ink-300">
          Gemini plays the reviewer live, by voice. It defends the denial until you cite the governing criterion and the chart line that meets it.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 lg:shrink-0 lg:flex-nowrap">
        <label className="flex w-full min-w-0 flex-col gap-1.5 sm:w-[300px]" title={disabled ? 'End the call to switch cases' : 'Switch case'}>
          <span className="eyebrow">Case to rehearse</span>
          <span className="relative flex items-center">
            <select value={current?.id || ''} disabled={disabled} onChange={e => pick(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none truncate rounded-[4px] border border-line bg-paper-high pl-3 pr-9 text-[13.5px] text-ink-100 outline-none transition-colors hover:border-line-strong focus-visible:border-ink-100 disabled:cursor-not-allowed disabled:opacity-50">
              {!current && <option value="" disabled>Choose a case</option>}
              <optgroup label="Demo cases">
                {hero.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
              </optgroup>
              {analyzed.length > 0 && (
                <optgroup label="Analyzed cases">
                  {analyzed.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </optgroup>
              )}
              {extra.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-4 text-ink-400" />
          </span>
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
  if (phase === 'connecting') return { label: mic === 'requesting' ? 'Connecting · allow the microphone' : 'Connecting', tone: 'cyan', dot: 'bg-teal-500', pulse: true }
  if (phase === 'live') {
    if (activity === 'speaking') return { label: 'Medical director speaking', tone: 'violet', dot: 'bg-ink-300', pulse: true }
    if (activity === 'listening') return { label: 'Listening', tone: 'green', dot: 'bg-emerald-500', pulse: true }
    if (activity === 'thinking') return { label: 'Director is thinking', tone: 'violet', dot: 'bg-ink-300', pulse: true }
    return { label: 'Live', tone: 'green', dot: 'bg-emerald-500', pulse: true }
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

  const phaseWord = call.phase === 'live' ? 'Live' : call.phase === 'connecting' ? 'Connecting' : call.phase === 'ended' ? 'Ended' : 'Ready to call'
  const consoleNote = call.phase === 'live' ? st.label : call.phase === 'connecting' && call.micState === 'requesting' ? 'Allow the microphone' : `Voice · ${voice}`

  return (
    <div className="space-y-6">
      <Header all={all} current={c} disabled={inCall} />

      <AnimatePresence>
        {!x.analyzed && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="relative flex flex-col gap-3 overflow-hidden rounded-lg border border-line bg-paper-high py-3.5 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber-500" />
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div>
                <div className="text-[14px] font-medium text-ink-100">Run Overturn on this case first for verified coach cards</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-300">You can still rehearse now. The director argues from the denial letter and the chart as submitted.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 self-start sm:self-center" onClick={() => navigate(`/case/${c.id}`)}>Run Overturn</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------------------------------------------------------------- call */}
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <Card glow={call.phase === 'live'} className="relative overflow-hidden lg:flex lg:max-h-[calc(100vh-3rem)] lg:flex-col">
            {/* header strip */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 lg:shrink-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex shrink-0 gap-1" aria-hidden>{[0, 1, 2].map(i => <span key={i} className="size-[7px] rounded-full bg-line-strong" />)}</span>
                <span className="truncate font-mono text-[11.5px] text-ink-400">p2p-call <span className="text-faint">/</span> {c.id}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <ModelChip model={LIVE_MODEL} />
                <label className="relative inline-flex items-center" title={inCall ? 'Voice is fixed for this call' : 'Director voice'}>
                  <span className="sr-only">Director voice</span>
                  <select value={voice} disabled={inCall} onChange={e => chooseVoice(e.target.value)}
                    className="h-[22px] cursor-pointer appearance-none rounded-[3px] border border-line bg-paper-high pl-1.5 pr-5 font-mono text-[10.5px] text-ink-300 outline-none transition-colors hover:border-line-strong focus-visible:border-ink-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {VOICES.map(v => <option key={v.id} value={v.id}>{v.id} · {v.note}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1 size-3 text-ink-400" />
                </label>
              </div>
            </div>

            {/* lab console: the page's one dark surface */}
            <div className="p-3 lg:shrink-0">
              <div className="grid-lab relative overflow-hidden rounded-md border border-lab-line bg-lab text-[#e9e7e0]">
                <div className="flex items-center justify-between gap-3 border-b border-lab-line px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.13em]">
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="relative flex size-1.5" aria-hidden>
                      {st.pulse && <span className={cx('absolute inline-flex size-full animate-ping rounded-full opacity-70', call.phase === 'live' ? 'bg-mint' : 'bg-amber-400')} />}
                      <span className={cx('relative inline-flex size-1.5 rounded-full', call.phase === 'live' ? 'bg-mint' : call.phase === 'connecting' ? 'bg-amber-400' : call.phase === 'ended' ? 'bg-[#6e6a5e]' : 'bg-[#8f8c84]')} />
                    </span>
                    <span className={call.phase === 'live' ? 'text-[#f7f5f0]' : 'text-[#b9b6ad]'}>{phaseWord}</span>
                    <span className={cx('tabular-nums', call.phase === 'live' ? 'text-mint' : 'text-[#8f8c84]')}>{clock(call.seconds)}</span>
                  </div>
                  <div className="min-w-0 text-right" role="status">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={consoleNote} className="block truncate text-[#8f8c84]" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }}>{consoleNote}</motion.span>
                    </AnimatePresence>
                  </div>
                </div>

                <div className="px-5 pt-8 text-center sm:pt-10">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8f8c84]">On the line</div>
                  <div className="mt-3 font-serif text-[28px] font-medium leading-none tracking-[-0.03em] text-[#f7f5f0] sm:text-[34px]">{DIRECTOR.name}</div>
                  <div className="mt-3 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.13em] text-[#a8a59c]">
                    <span>{DIRECTOR.title}</span><span className="hidden sm:inline"> · </span><span className="block sm:inline">{x.payer}</span>
                  </div>
                </div>

                <div className="relative mx-auto h-[150px] w-full max-w-[560px] px-4 pb-4 pt-5 sm:h-[168px] sm:px-6">
                  <CallOrb phase={call.phase} activity={call.activity} muted={call.muted} levels={call.levels} />
                  <AnimatePresence>
                    {call.muted && call.phase === 'live' && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="absolute left-1/2 top-1 -translate-x-1/2">
                        <Badge tone="red" icon={<MicOff className="size-3" />}>You are muted</Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* controls */}
            <div className="flex flex-col items-center gap-3 px-4 pb-5 pt-2 lg:shrink-0">
              <AnimatePresence mode="wait" initial={false}>
                {call.phase === 'live' ? (
                  <motion.div key="live" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-wrap items-center justify-center gap-2.5">
                    <Button size="lg" variant={call.muted ? 'danger' : 'subtle'} className="min-w-[132px]" disabled={call.micState !== 'on'}
                      icon={call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />} onClick={call.toggleMute}>
                      {call.muted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button size="lg" variant="danger" className="min-w-[132px] border-rose-700! bg-rose-700! text-white! hover:border-rose-800! hover:bg-rose-800!"
                      icon={<PhoneOff className="size-4" />} onClick={call.end}>
                      End call
                    </Button>
                  </motion.div>
                ) : call.phase === 'connecting' ? (
                  <motion.div key="connecting" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-wrap items-center justify-center gap-2.5">
                    <Button size="lg" variant="subtle" loading className="min-w-[160px]">Connecting</Button>
                    <Button size="lg" variant="danger" icon={<PhoneOff className="size-4" />} onClick={call.end}>Cancel</Button>
                  </motion.div>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                    <Button size="lg" variant="success" className="min-w-[180px]" icon={<PhoneCall className="size-4" />} onClick={() => void call.start()}>
                      {call.phase === 'ended' ? 'Call again' : 'Start call'}
                    </Button>
                    <Toggle checked={tough} onChange={setTough} label={<span className="text-[13px] text-ink-300">Tough reviewer</span>} />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {call.micError ? (
                  <motion.div key="mic" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="w-full max-w-xl overflow-hidden">
                    <div className="relative flex gap-3 overflow-hidden rounded-md border border-line bg-paper-high py-3 pl-4 pr-3.5">
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber-500" />
                      <MicOff className="mt-0.5 size-4 shrink-0 text-amber-700" />
                      <div>
                        <div className="text-[13px] font-medium text-amber-800">{micHelp(call.micError).title}</div>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">{micHelp(call.micError).body}</p>
                      </div>
                    </div>
                  </motion.div>
                ) : call.error && !inCall ? (
                  <motion.div key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="w-full max-w-xl overflow-hidden">
                    <div className="relative flex flex-col gap-2 overflow-hidden rounded-md border border-line bg-paper-high py-3 pl-4 pr-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-600" />
                      <div className="flex gap-3">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-700" />
                        <p className="text-[12.5px] leading-relaxed text-rose-800">{call.error}</p>
                      </div>
                      {/key|Settings/i.test(call.error) && <Button size="sm" variant="outline" className="shrink-0" icon={<Cog className="size-3.5" />} onClick={() => navigate('/settings')}>Settings</Button>}
                    </div>
                  </motion.div>
                ) : !inCall && call.phase !== 'ended' ? (
                  <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex max-w-md items-start gap-2 text-[12.5px] leading-snug text-ink-400 sm:items-center">
                    <Headphones className="mt-px size-3.5 shrink-0 sm:mt-0" /><span>Headphones recommended. Talk naturally; you can interrupt the director.</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="border-t border-line lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <Transcript entries={call.entries} phase={call.phase} payer={x.payer} micAvailable={call.micState === 'on'} onSend={call.sendText} />
            </div>
          </Card>
        </div>

        {/* ---------------------------------------------------------------- coach */}
        <div className="min-w-0">
          <CoachPanel c={c} x={x} score={score} onAgain={() => void call.start()} transcript={transcript}>
            <Card className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
                <div className="min-w-0">
                  <Eyebrow>The denial</Eyebrow>
                  <div className="mt-1.5 font-serif text-[20px] font-medium leading-snug tracking-[-0.02em] text-ink-100">{c.title}</div>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" icon={<FileText className="size-3.5" />} onClick={() => setLetterOpen(true)}>Letter</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                {x.family && <Badge tone="violet">{x.family.id} · {x.family.short}</Badge>}
                {x.analyzed
                  ? <Badge tone="green" icon={<ShieldCheck className="size-3" />}>{verifiedCount} verified citation{verifiedCount === 1 ? '' : 's'}</Badge>
                  : <Badge tone="amber">Not analyzed yet</Badge>}
              </div>
              <dl className="border-t border-line">
                <Ledger label="Plan">{x.plan || x.payer}</Ledger>
                <Ledger label="Billed">{x.amount || '—'}</Ledger>
                <Ledger label="Service">{x.service || '—'}</Ledger>
                {x.dos && <Ledger label="Date of service">{x.dos}</Ledger>}
                {x.providerName && <Ledger label="You are">{x.providerName}</Ledger>}
              </dl>
              <div className="border-t border-line px-4 py-3.5">
                <div className="eyebrow !text-[10px]">Why they denied it</div>
                <p className="mt-2 border-l-2 border-rose-400 pl-3 text-[13px] leading-relaxed text-ink-300">{x.reason}</p>
              </div>
              {x.summary && (
                <div className="border-t border-line bg-paper-low/70 px-4 py-3.5" title={x.summary}>
                  <div className="eyebrow !text-[10px]">Overturn analysis</div>
                  <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-ink-300">{x.summary}</p>
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
