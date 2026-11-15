import { useRef, useState } from 'react'
import { Camera, FileText, Printer, Stethoscope, Upload, X } from 'lucide-react'
import { caseStore } from '../../lib/store'
import { compressImage, pdfText, readDataUrl } from '../../lib/files'
import { transcribeDocument } from '../../lib/pipeline'
import { dataUrlToPart } from '../../lib/engine'
import { friendlyError } from '../../lib/gemini'
import { audit } from '../../lib/audit'
import type { CaseFile } from '../../lib/types'
import { Badge, Button, Card, Spinner, cx, toast } from '../../ui/kit'
import { printSampleLetter } from './exportLetter'

function DropZone({ label, icon, onFile, busy, accept }: { label: string; icon: React.ReactNode; onFile: (f: File) => void; busy?: boolean; accept: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={cx('flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2.5 transition-colors', over ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/12 bg-white/[0.02]')}>
      <div className="flex items-center gap-2 text-[12.5px] text-ink-300">{busy ? <Spinner /> : icon}{busy ? 'Reading with Gemini…' : label}</div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" icon={<Camera className="size-3.5" />} onClick={() => cam.current?.click()} disabled={busy}>Photo</Button>
        <Button size="sm" variant="outline" icon={<Upload className="size-3.5" />} onClick={() => ref.current?.click()} disabled={busy}>Upload</Button>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

const RESET = { denial: null, extractedText: undefined, familyId: null, match: null, entailments: null, confirmed: {}, letter: null, signedBy: null, patientExplainer: null, versionLabel: null, status: 'new' as const }

export function InputsPanel({ c, onRun, running }: { c: CaseFile; onRun: () => void; running: boolean }) {
  const [busy, setBusy] = useState<'denial' | 'chart' | null>(null)

  async function intake(kind: 'denial' | 'chart', f: File) {
    const okType = f.type === 'application/pdf' || f.type.startsWith('image/') || f.type.startsWith('text/') || /\.(pdf|txt|md|png|jpe?g|webp|heic)$/i.test(f.name)
    if (!okType) { toast('Use a PDF, a photo (JPG/PNG), or a .txt file — or paste the text.', 'amber'); return }
    setBusy(kind)
    try {
      let text = ''
      let method = ''
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        text = await pdfText(f)
        method = 'pdf.js text layer (exact)'
      } else if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
        text = await f.text()
        method = 'plain text'
      }
      if (!text || text.length < 40) {
        let dataUrl = await readDataUrl(f)
        if (f.type.startsWith('image/')) dataUrl = await compressImage(dataUrl)
        if (kind === 'denial') {
          caseStore.update(c.id, { denialFile: { name: f.name, mimeType: f.type || 'image/jpeg', dataUrl }, denialText: '', ...RESET })
          toast('Letter attached — Gemini will read it when you run Overturn.', 'violet')
          await audit('biller', 'intake.denial', c.id, { file: f.name, method: 'gemini multimodal' })
          return
        }
        const r = await transcribeDocument(dataUrlToPart(dataUrl), 'clinical chart notes')
        text = r.value
        method = `${r.model} verbatim transcription`
      }
      if (kind === 'denial') caseStore.update(c.id, { denialText: text, denialFile: null, ...RESET })
      else caseStore.update(c.id, { chartText: text, chartTitle: f.name, ...RESET, denial: c.denial, extractedText: c.extractedText })
      toast(`${kind === 'denial' ? 'Denial letter' : 'Chart'} loaded via ${method}.`, 'green')
      await audit('biller', `intake.${kind}`, c.id, { file: f.name, method, chars: text.length })
    } catch (e) {
      toast(friendlyError(e), 'red')
    } finally { setBusy(null) }
  }

  const ready = (c.denialText.trim().length > 40 || !!c.denialFile) && c.chartText.trim().length > 40
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col p-4">
        <div className="mb-2 flex h-8 items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-rose-300" /> Denial letter</div>
          <div className="flex items-center gap-1.5">
            {c.denialFile && <Badge tone="violet">{c.denialFile.name}</Badge>}
            {c.denialText && <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => printSampleLetter(c)}>Print letter</Button>}
          </div>
        </div>
        <DropZone label="Drop a PDF, photo, or scan of the denial" icon={<Upload className="size-4" />} onFile={f => intake('denial', f)} busy={busy === 'denial'} accept=".pdf,image/*,.txt" />
        {c.denialFile && !c.denialText ? (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10">
            {c.denialFile.mimeType.startsWith('image/')
              ? <img src={c.denialFile.dataUrl} alt="Uploaded denial letter" className="max-h-[340px] w-full object-contain bg-black/30" />
              : <div className="p-6 text-sm text-ink-300">{c.denialFile.name}</div>}
            <button onClick={() => caseStore.update(c.id, { denialFile: null })} className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 cursor-pointer" aria-label="Remove file"><X className="size-4" /></button>
          </div>
        ) : (
          <textarea value={c.denialText} onChange={e => caseStore.update(c.id, { denialText: e.target.value })} spellCheck={false}
            placeholder="…or paste the denial letter text here"
            className="scrollbar-thin mt-3 min-h-[300px] flex-1 resize-y rounded-xl border border-white/8 bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-ink-300 outline-none focus:border-violet-400/40" />
        )}
      </Card>
      <Card className="flex flex-col p-4">
        <div className="mb-2 flex h-8 items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Stethoscope className="size-4 text-emerald-300" /> Chart notes</div>
          <span className="text-[11px] text-ink-400">{c.chartText ? `${c.chartText.split('\n').length} lines` : ''}</span>
        </div>
        <DropZone label="Drop chart notes (PDF, photo, or text)" icon={<Upload className="size-4" />} onFile={f => intake('chart', f)} busy={busy === 'chart'} accept=".pdf,image/*,.txt" />
        <textarea value={c.chartText} onChange={e => caseStore.update(c.id, { chartText: e.target.value })} spellCheck={false}
          placeholder="…or paste the relevant progress notes, test results and orders"
          className="scrollbar-thin mt-3 min-h-[300px] flex-1 resize-y rounded-xl border border-white/8 bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-ink-300 outline-none focus:border-emerald-400/40" />
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <p className="text-[12px] text-ink-400">Use synthetic or de-identified documents only. PDFs with a text layer are read exactly; photos are transcribed verbatim by Gemini.</p>
        <Button variant="primary" size="lg" onClick={onRun} loading={running} disabled={!ready}>{c.match ? 'Re-run live' : 'Run Overturn'}</Button>
      </div>
    </div>
  )
}
