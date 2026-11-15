// Real-time voice call with the Gemini Live API.
//   mic  -> AudioWorklet -> PCM16 16 kHz -> session.sendRealtimeInput({ audio })
//   model audio (PCM16 24 kHz) -> PcmPlayer (gapless, barge-in aware)
//   input/output transcriptions -> merged transcript turns

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modality, type LiveServerMessage, type Session } from '@google/genai'
import { ai, friendlyError, LIVE_MODEL } from '../../lib/gemini'
import { MIC_MIME, MicCapture, MicError, PcmPlayer, rateOf } from '../../lib/liveAudio'
import { audit } from '../../lib/audit'
import { toast } from '../../ui/kit'
import { findConcession, type TranscriptEntry } from './context'

export type CallPhase = 'idle' | 'connecting' | 'live' | 'ended'
export type CallActivity = 'idle' | 'speaking' | 'listening' | 'thinking'
export type MicState = 'off' | 'requesting' | 'on' | 'error'

export interface Levels { mic: number; out: number; micAnalyser: AnalyserNode | null; outAnalyser: AnalyserNode | null }

const KICKOFF = 'The call has connected. Begin.'
let uidN = 0
const uid = () => `t${Date.now().toString(36)}${(uidN++).toString(36)}`

export function useLiveCall(opts: { caseId: string; systemInstruction: string; voice: string }) {
  const [phase, setPhase] = useState<CallPhase>('idle')
  const [activity, setActivity] = useState<CallActivity>('idle')
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [micState, setMicState] = useState<MicState>('off')
  const [micError, setMicError] = useState<MicError | null>(null)
  const [error, setError] = useState<string | null>(null)

  const optsRef = useRef(opts)
  optsRef.current = opts
  const phaseRef = useRef<CallPhase>('idle')
  const sessionRef = useRef<Session | null>(null)
  const micRef = useRef<MicCapture | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const mutedRef = useRef(false)
  const startedAt = useRef(0)
  const cur = useRef<{ p: string | null; d: string | null }>({ p: null, d: null })
  const entriesRef = useRef<TranscriptEntry[]>([])
  const userSpeaking = useRef(false)
  const lastUserVoice = useRef(0)
  const awaiting = useRef(false)
  const attempt = useRef(0) // bumps on every start/end so callbacks from an old socket are ignored

  const go = (p: CallPhase) => { phaseRef.current = p; setPhase(p) }
  const elapsed = () => (startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0)

  // ---- transcript bookkeeping (entriesRef is the source of truth)
  const commit = (fn: (es: TranscriptEntry[]) => TranscriptEntry[]) => { entriesRef.current = fn(entriesRef.current); setEntries(entriesRef.current) }
  const push = (role: TranscriptEntry['role'], text: string, extra: Partial<TranscriptEntry> = {}) => {
    const id = uid()
    commit(es => [...es, { id, role, text, at: elapsed(), done: false, ...extra }])
    return id
  }
  const append = (id: string, text: string, spacing = false) => commit(es => es.map(e => {
    if (e.id !== id) return e
    if (!e.text) return { ...e, text: text.trimStart() }
    // Input transcription chunks sometimes drop the space between words ("LCD" + "L33822").
    const glue = spacing && /[A-Za-z0-9.,]$/.test(e.text) && /^[A-Z]/.test(text) ? ' ' : ''
    return { ...e, text: e.text + glue + text }
  }))
  const closeTurn = (which: 'p' | 'd') => {
    const id = cur.current[which]
    if (!id) return
    cur.current[which] = null
    commit(es => {
      const e = es.find(x => x.id === id)
      if (e && !e.text.trim()) return es.filter(x => x.id !== id)
      return es.map(x => (x.id === id ? { ...x, done: true } : x))
    })
  }

  // ---- teardown without state updates (safe during unmount)
  const teardown = () => {
    const s = sessionRef.current
    sessionRef.current = null
    if (s) { try { s.close() } catch { /* already closed */ } }
    micRef.current?.stop(); micRef.current = null
    playerRef.current?.close(); playerRef.current = null
    userSpeaking.current = false
    awaiting.current = false
  }

  const finish = useCallback((by: 'user' | 'remote', detail?: string) => {
    const was = phaseRef.current
    if (was !== 'live' && was !== 'connecting') return
    attempt.current++
    teardown()
    closeTurn('d'); closeTurn('p')
    const secs = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0
    setSeconds(secs)
    setMicState('off')
    setActivity('idle')
    if (was === 'connecting') {
      go('idle')
      if (detail) { setError(detail); toast(detail, 'red') }
      return
    }
    push('system', by === 'user' ? 'You ended the call' : `Call ended${detail ? ` · ${detail}` : ''}`, { done: true })
    go('ended')
    const es = entriesRef.current
    const turns = es.filter(e => e.role !== 'system' && e.text.trim()).length
    const conceded = !!findConcession(es.filter(e => e.role === 'director').map(e => e.text).join(' '))
    void audit('provider', 'p2p.end', optsRef.current.caseId, { seconds: secs, turns, conceded, endedBy: by })
    if (by === 'remote' && detail) { setError(detail); toast(detail, 'amber') }
  }, [])

  // ---- server messages
  const onMessage = (m: LiveServerMessage, my: number) => {
    if (my !== attempt.current) return
    if (m.goAway) toast(`The live session will end soon${m.goAway.timeLeft ? ` (${m.goAway.timeLeft} left)` : ''}.`, 'amber')

    // The wire field is `type`; the SDK typings call it `voiceActivityType`. Accept both.
    const vaRaw = m.voiceActivity as { voiceActivityType?: string; type?: string } | undefined
    const va = vaRaw?.voiceActivityType || vaRaw?.type
    if (va === 'ACTIVITY_START') {
      userSpeaking.current = true
      awaiting.current = false
      if (cur.current.d) { closeTurn('d'); closeTurn('p') }
      if (!cur.current.p) cur.current.p = push('provider', '') // placeholder keeps turn order right
    } else if (va === 'ACTIVITY_END') {
      userSpeaking.current = false
      awaiting.current = true
    }

    const sc = m.serverContent
    if (!sc) return
    if (sc.interrupted) { playerRef.current?.interrupt(); closeTurn('d') }
    for (const part of sc.modelTurn?.parts || []) {
      const d = part.inlineData
      if (d?.data && (!d.mimeType || d.mimeType.startsWith('audio/'))) {
        playerRef.current?.enqueue(d.data, rateOf(d.mimeType))
        awaiting.current = false
      }
    }
    if (sc.inputTranscription?.text) {
      if (!cur.current.p) cur.current.p = push('provider', '')
      append(cur.current.p, sc.inputTranscription.text, true)
    }
    if (sc.outputTranscription?.text) {
      if (!cur.current.d) cur.current.d = push('director', '')
      append(cur.current.d, sc.outputTranscription.text)
      awaiting.current = false
    }
    if (sc.turnComplete) { closeTurn('d'); closeTurn('p'); awaiting.current = false }
  }

  const onClose = (e: CloseEvent, my: number) => {
    if (my !== attempt.current) return
    const reason = (e?.reason || '').trim()
    const detail = reason ? friendlyError(new Error(reason)) : e?.code && e.code !== 1000 ? `connection closed (code ${e.code})` : 'the director hung up'
    finish('remote', detail)
  }
  const onError = (e: ErrorEvent, my: number) => {
    if (my !== attempt.current) return
    finish('remote', friendlyError(new Error(e?.message || 'Live connection error')))
  }

  // ---- start
  const start = useCallback(async () => {
    if (phaseRef.current === 'connecting' || phaseRef.current === 'live') return
    const my = ++attempt.current
    const { caseId, systemInstruction, voice } = optsRef.current
    setError(null); setMicError(null)
    commit(() => [])
    cur.current = { p: null, d: null }
    startedAt.current = 0
    setSeconds(0)
    mutedRef.current = false; setMuted(false)
    go('connecting')

    // Created synchronously inside the click so autoplay policies allow playback.
    const player = new PcmPlayer()
    playerRef.current = player

    let client: ReturnType<typeof ai>
    try { client = ai() } catch (e) { finish('remote', friendlyError(e)); return }

    setMicState('requesting')
    const micP: Promise<MicCapture | null> = MicCapture.open().then(
      mic => {
        if (my !== attempt.current) { mic.stop(); return null }
        micRef.current = mic
        setMicState('on')
        return mic
      },
      (err: unknown) => {
        if (my === attempt.current) {
          setMicError(err instanceof MicError ? err : new MicError('other', String(err)))
          setMicState('error')
        }
        return null
      },
    )

    let session: Session
    try {
      session = await client.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          systemInstruction: { parts: [{ text: systemInstruction }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: m => onMessage(m, my),
          onerror: e => onError(e, my),
          onclose: e => onClose(e, my),
        },
      })
    } catch (e) {
      if (my === attempt.current) finish('remote', friendlyError(e))
      void micP.then(m => m?.stop())
      return
    }
    if (my !== attempt.current) { try { session.close() } catch { /* ignore */ } return }
    sessionRef.current = session

    const mic = await micP
    if (my !== attempt.current) return
    if (mic) {
      mic.start(b64 => {
        const s = sessionRef.current
        if (!s || mutedRef.current || my !== attempt.current) return
        try { s.sendRealtimeInput({ audio: { data: b64, mimeType: MIC_MIME } }) } catch { /* socket closing */ }
      })
    } else {
      toast('Microphone unavailable. You can type your replies to the director.', 'amber')
    }

    startedAt.current = Date.now()
    go('live')
    push('system', 'Call connected', { done: true })
    awaiting.current = true
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: KICKOFF }] }], turnComplete: true })
    void audit('provider', 'p2p.start', caseId, { model: LIVE_MODEL, voice, mic: !!mic })
  }, [finish])

  const end = useCallback(() => finish('user'), [finish])

  const toggleMute = useCallback(() => {
    if (phaseRef.current !== 'live') return
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    micRef.current?.setEnabled(!next)
    if (next) {
      userSpeaking.current = false
      try { sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true }) } catch { /* ignore */ }
    }
  }, [])

  /** Typed turn (text fallback when there is no mic, or by choice). */
  const sendText = useCallback((text: string) => {
    const s = sessionRef.current
    const t = text.trim()
    if (!s || phaseRef.current !== 'live' || !t) return false
    playerRef.current?.interrupt()
    closeTurn('d'); closeTurn('p')
    push('provider', t, { typed: true, done: true })
    try { s.sendRealtimeInput({ text: t }) } catch (e) { toast(friendlyError(e), 'red'); return false }
    awaiting.current = true
    return true
  }, [])

  const levels = useCallback((): Levels => ({
    mic: mutedRef.current ? 0 : micRef.current?.level() ?? 0,
    out: playerRef.current?.level() ?? 0,
    micAnalyser: mutedRef.current ? null : micRef.current?.analyser ?? null,
    outAnalyser: playerRef.current?.analyser ?? null,
  }), [])

  // ---- timer + speaking/listening status while live
  useEffect(() => {
    if (phase !== 'live') return
    const id = window.setInterval(() => {
      const now = performance.now()
      const mic = micRef.current
      if (mic && !mutedRef.current && mic.rms() > 0.03) lastUserVoice.current = now
      const speaking = !!playerRef.current?.playing
      const listening = !mutedRef.current && (userSpeaking.current || now - lastUserVoice.current < 450)
      const next: CallActivity = speaking ? 'speaking' : listening ? 'listening' : awaiting.current ? 'thinking' : 'idle'
      setActivity(a => (a === next ? a : next))
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 120)
    return () => window.clearInterval(id)
  }, [phase])

  // ---- clean teardown on unmount (route change, case switch)
  useEffect(() => () => {
    if (phaseRef.current === 'live') {
      const secs = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0
      void audit('provider', 'p2p.end', optsRef.current.caseId, { seconds: secs, endedBy: 'navigation' })
    }
    attempt.current++
    phaseRef.current = 'idle'
    teardown()
  }, [])

  return { phase, activity, entries, seconds, muted, micState, micError, error, start, end, toggleMute, sendText, levels }
}
