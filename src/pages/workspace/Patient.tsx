import { useEffect, useRef, useState } from 'react'
import { HeartPulse, Languages, LoaderCircle, Pause, Volume2 } from 'lucide-react'
import type { CaseFile, Flag } from '../../lib/types'
import { explainForPatient, speak } from '../../lib/pipeline'
import { appealDeadline, fmtDate } from '../../lib/rules'
import { caseStore } from '../../lib/store'
import { savedRun } from '../../lib/engine'
import { friendlyError, getUseCache } from '../../lib/gemini'
import { audit } from '../../lib/audit'
import { Badge, Button, Card, ModelChip, toast } from '../../ui/kit'

const ttsCache = new Map<string, string>()
let currentAudio: HTMLAudioElement | null = null

export function PatientPanel({ c, flags }: { c: CaseFile; flags: Flag[] }) {
  const [lang, setLang] = useState<'English' | 'Spanish'>((c.patientExplainer?.lang as 'English' | 'Spanish') || 'English')
  const [busy, setBusy] = useState<'text' | 'audio' | null>(null)
  const [model, setModel] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { audio.current?.pause(); audio.current = null }, [])
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
    if (playing && audio.current) { audio.current.pause(); setPlaying(false); return }
    setBusy('audio')
    try {
      const key = `${c.id}:${lang}:${text.slice(0, 60)}`
      let url = ttsCache.get(key)
      if (!url) {
        const r = await speak(lang === 'Spanish' ? `Lee con calidez y calma: ${text}` : `Read warmly and calmly: ${text}`)
        url = r.value; ttsCache.set(key, url)
        await audit(r.model, 'patient.tts', c.id, { lang })
      }
      audio.current?.pause(); currentAudio?.pause()
      audio.current = new Audio(url)
      currentAudio = audio.current
      audio.current.onended = () => setPlaying(false)
      await audio.current.play()
      setPlaying(true)
    } catch (e) { toast(friendlyError(e), 'red') } finally { setBusy(null) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><HeartPulse className="size-4 text-pink-300" /> What this means for {d.member_name.split(' ')[0]}</div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(['English', 'Spanish'] as const).map(l => (
              <button key={l} onClick={() => { audio.current?.pause(); setPlaying(false); setLang(l); if (c.patientExplainer && c.patientExplainer.lang !== l) generate(l) }}
                className={`rounded-lg px-3 py-1 text-[12.5px] cursor-pointer ${lang === l ? 'bg-white/10 text-ink-100' : 'text-ink-400'}`}>{l === 'English' ? 'English' : 'Español'}</button>
            ))}
          </div>
        </div>
        {c.patientExplainer?.text && c.patientExplainer.lang === lang ? (
          <p className="whitespace-pre-wrap font-display text-[22px] leading-[1.55] text-ink-100">{c.patientExplainer.text}</p>
        ) : (
          <div className="py-10 text-center">
            <p className="mx-auto mb-4 max-w-md text-sm text-ink-400">Generate a plain-language explanation the patient can actually understand — at a 6th-grade reading level, in English or Spanish, read aloud by Gemini.</p>
            <Button variant="primary" icon={<Languages className="size-4" />} loading={busy === 'text'} onClick={() => generate()}>Explain in {lang === 'English' ? 'English' : 'Spanish'}</Button>
          </div>
        )}
        {c.patientExplainer?.text && c.patientExplainer.lang === lang && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={busy === 'audio' ? <LoaderCircle className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Volume2 className="size-4" />} onClick={listen} disabled={busy === 'audio'}>{playing ? 'Pause' : 'Listen'}</Button>
            <Button variant="ghost" onClick={() => generate()} loading={busy === 'text'}>Regenerate</Button>
            {model && <ModelChip model={model} />}
            <ModelChip model="gemini-3.8-flash-tts" />
          </div>
        )}
      </Card>
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">Patient checklist</div>
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.05] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">Appeal deadline</div>
          <div className="mt-0.5 text-lg font-semibold">{fmtDate(dl.due)}</div>
          <div className="text-[12px] text-ink-400">{dl.days >= 0 ? `${dl.days} days left` : 'window closed'} · {dl.rule}</div>
        </div>
        <ul className="space-y-2 text-[12.5px] text-ink-300">
          <li>• Your care team is filing the appeal — you don’t need to do anything to start it.</li>
          <li>• You can ask your plan who reviewed your case and their medical specialty.</li>
          <li>• If waiting could seriously harm your health, ask for a fast (expedited) appeal — a decision within 72 hours.</li>
        </ul>
        <Badge tone="gray">Not legal or medical advice</Badge>
      </Card>
    </div>
  )
}
