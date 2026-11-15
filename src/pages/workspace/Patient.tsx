import { useEffect, useRef, useState } from 'react'
import { HeartPulse, Languages, LoaderCircle, Pause, Volume2 } from 'lucide-react'
import type { CaseFile, Flag } from '../../lib/types'
import { explainForPatient, speak } from '../../lib/pipeline'
import { appealDeadline, fmtDate } from '../../lib/rules'
import { caseStore } from '../../lib/store'
import { savedRun } from '../../lib/engine'
import { friendlyError, getUseCache } from '../../lib/gemini'
import { audit } from '../../lib/audit'
import { Badge, Button, Card, Eyebrow, ModelChip, cx, toast } from '../../ui/kit'

const ttsCache = new Map<string, string>()
const ttsModel = new Map<string, string>()
let currentAudio: HTMLAudioElement | null = null

function stopBrowserVoice() { try { window.speechSynthesis?.cancel() } catch { /* unsupported */ } }
/** Fallback narration with the browser's built-in voice. Returns false if the browser has none. */
function browserVoice(text: string, lang: 'English' | 'Spanish', onEnd: () => void): boolean {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'Spanish' ? 'es-US' : 'en-US'
  const v = synth.getVoices().find(x => x.lang.toLowerCase().startsWith(lang === 'Spanish' ? 'es' : 'en'))
  if (v) u.voice = v
  u.rate = 0.95
  u.onend = onEnd; u.onerror = onEnd
  currentAudio?.pause(); synth.cancel(); synth.speak(u)
  return true
}

export function PatientPanel({ c, flags }: { c: CaseFile; flags: Flag[] }) {
  const [lang, setLang] = useState<'English' | 'Spanish'>((c.patientExplainer?.lang as 'English' | 'Spanish') || 'English')
  const [busy, setBusy] = useState<'text' | 'audio' | null>(null)
  const [model, setModel] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const [voice, setVoice] = useState('gemini-3.8-flash-tts')
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { audio.current?.pause(); audio.current = null; stopBrowserVoice() }, [])
  const d = c.denial!
  const dl = appealDeadline(d)

  async function generate(l = lang) {
    setBusy('text')
    try {
      const r = await explainForPatient({ denial: d, summary: c.match?.summary || '', flags: flags.filter(f => f.severity === 'violation'), deadline: fmtDate(dl.due), lang: l })
      caseStore.update(c.id, { patientExplainer: { lang: l, text: r.value } })
      setModel(r.model)
      await audit(r.model, 'patient.explain', c.id, { lang: l })
    } catch (e) {
      const sv = savedRun(c.id)?.explain?.[l]
      if (sv && getUseCache()) { caseStore.update(c.id, { patientExplainer: { lang: l, text: sv } }); setModel('saved run'); toast('Gemini is busy — showing a saved genuine run.', 'amber') }
      else toast(friendlyError(e), 'red')
    } finally { setBusy(null) }
  }
  async function listen() {
    const text = c.patientExplainer?.text
    if (!text) return
    if (playing) { audio.current?.pause(); stopBrowserVoice(); setPlaying(false); return }
    setBusy('audio')
    try {
      const key = `${c.id}:${lang}:${text.slice(0, 60)}`
      let url = ttsCache.get(key)
      if (!url) {
        const r = await speak(lang === 'Spanish' ? `Lee con calidez y calma: ${text}` : `Read warmly and calmly: ${text}`)
        url = r.value; ttsCache.set(key, url); ttsModel.set(key, r.model)
        await audit(r.model, 'patient.tts', c.id, { lang })
      }
      audio.current?.pause(); currentAudio?.pause()
      audio.current = new Audio(url)
      currentAudio = audio.current
      audio.current.onended = () => setPlaying(false)
      await audio.current.play()
      setPlaying(true); setVoice(ttsModel.get(key) || 'gemini-3.8-flash-tts')
    } catch (e) {
      // Gemini TTS has a small free daily quota; never leave the patient without audio.
      if (browserVoice(text, lang, () => setPlaying(false))) {
        setPlaying(true); setVoice('browser voice')
        toast('Gemini TTS is busy or over its free daily quota, so your browser’s voice is reading it instead.', 'amber')
        await audit('browser-speech', 'patient.tts_fallback', c.id, { lang, reason: friendlyError(e).slice(0, 80) })
      } else toast(friendlyError(e), 'red')
    } finally { setBusy(null) }
  }

  const first = d.member_name.split(' ')[0]
  const showing = !!c.patientExplainer?.text && c.patientExplainer.lang === lang
  const tips = [
    'Your care team is filing the appeal — you don’t need to do anything to start it.',
    'You can ask your plan who reviewed your case and their medical specialty.',
    'If waiting could seriously harm your health, ask for a fast (expedited) appeal — a decision within 72 hours.',
  ]

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex flex-col p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Eyebrow className="flex items-center gap-1.5"><HeartPulse className="size-3.5" aria-hidden /> Patient view · plain language</Eyebrow>
            <h2 className="mt-1.5 font-serif text-[24px] font-medium leading-[1.1] tracking-[-0.025em] text-ink-100">What this means for <span className="text-gradient">{first}</span></h2>
          </div>
          <div role="group" aria-label="Language" className="flex shrink-0 items-center rounded-[4px] border border-line bg-paper-low p-[3px]">
            {(['English', 'Spanish'] as const).map(l => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => { audio.current?.pause(); stopBrowserVoice(); setPlaying(false); setLang(l); if (c.patientExplainer && c.patientExplainer.lang !== l) generate(l) }}
                className={cx('cursor-pointer rounded-[3px] px-3 py-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-deep',
                  lang === l ? 'bg-paper-high text-ink-100 shadow-[0_0_0_1px_var(--color-line-strong),0_1px_2px_rgba(20,20,20,0.06)]' : 'text-ink-400 hover:text-ink-100')}>
                {l === 'English' ? 'English' : 'Español'}
              </button>
            ))}
          </div>
        </div>

        {showing ? (
          <div className="mt-6 border-t border-line pt-6">
            <p className="max-w-[36em] whitespace-pre-wrap font-serif text-[22px] leading-[1.55] tracking-[-0.01em] text-ink-100">{c.patientExplainer!.text}</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="mx-auto mb-5 max-w-md font-serif text-[17px] leading-relaxed text-ink-300">Generate a plain-language explanation the patient can actually understand — at a 6th-grade reading level, in English or Spanish, read aloud by Gemini.</p>
            <Button variant="primary" icon={<Languages className="size-4" />} loading={busy === 'text'} onClick={() => generate()}>Explain in {lang === 'English' ? 'English' : 'Spanish'}</Button>
          </div>
        )}
        {showing && (
          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="primary" icon={busy === 'audio' ? <LoaderCircle className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Volume2 className="size-4" />} onClick={listen} disabled={busy === 'audio'}>{playing ? 'Pause' : 'Listen'}</Button>
            <Button variant="ghost" onClick={() => generate()} loading={busy === 'text'}>Regenerate</Button>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {model && <ModelChip model={model} />}
              <ModelChip model={voice} />
            </span>
          </div>
        )}
      </Card>

      <Card className="flex flex-col p-5">
        <Eyebrow>For {first}</Eyebrow>
        <h3 className="mt-1 font-serif text-[18px] font-medium leading-tight tracking-[-0.015em] text-ink-100">Patient checklist</h3>
        <div className="relative mt-4 overflow-hidden rounded-md border border-line/70 bg-paper-low py-3.5 pl-4 pr-3.5">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber-500" />
          <div className="eyebrow !text-amber-800">Appeal deadline</div>
          <div className="mt-1.5 font-serif text-[28px] font-medium leading-none tracking-[-0.025em] text-ink-100">{fmtDate(dl.due)}</div>
          <div className="mt-2 font-mono text-[11px] text-ink-400"><span className="text-ink-200">{dl.days >= 0 ? `${dl.days} days left` : 'window closed'}</span> · {dl.rule}</div>
        </div>
        <ol className="mt-4 divide-y divide-line/70 border-t border-line/70">
          {tips.map((t, i) => (
            <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 py-3 text-[13px] leading-relaxed text-ink-300">
              <span className="pt-[3px] font-mono text-[10.5px] text-faint">{String(i + 1).padStart(2, '0')}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-auto pt-3"><Badge tone="gray">Not legal or medical advice</Badge></div>
      </Card>
    </div>
  )
}
