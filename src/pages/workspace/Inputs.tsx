import { useRef, useState } from 'react'
import { Camera, FileText, Play, Printer, Stethoscope, Upload, X } from 'lucide-react'
import { caseStore } from '../../lib/store'
import { compressImage, pdfText, readDataUrl } from '../../lib/files'
import { transcribeDocument } from '../../lib/pipeline'
import { dataUrlToPart } from '../../lib/engine'
import { friendlyError } from '../../lib/gemini'
import { audit } from '../../lib/audit'
import type { CaseFile } from '../../lib/types'
import { Badge, Button, Spinner, cx, toast } from '../../ui/kit'
import { printSampleLetter } from './exportLetter'

function DropZone({ label, icon, onFile, busy, accept }: { label: string; icon: React.ReactNode; onFile: (f: File) => void; busy?: boolean; accept: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={cx('flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 rounded-md border border-dashed px-3.5 py-3 transition-colors duration-150',
        over ? 'border-ink-100 bg-paper-high' : busy ? 'border-mint-deep/60 bg-mint-pale/40' : 'border-line-strong bg-paper-high/60 hover:border-ink-400')}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-[4px] border', busy ? 'border-mint-deep/40 bg-paper-high text-mint-deep' : 'border-line bg-paper-high text-ink-300')}>{busy ? <Spinner /> : icon}</span>
        <div className="min-w-0">
          <div className="text-[13px] leading-snug text-ink-200">{busy ? 'Reading with Gemini…' : over ? 'Drop to attach' : label}</div>
          <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">PDF · JPG · PNG · TXT</div>
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" icon={<Camera className="size-3.5" />} onClick={() => cam.current?.click()} disabled={busy}>Photo</Button>
        <Button size="sm" variant="outline" icon={<Upload className="size-3.5" />} onClick={() => ref.current?.click()} disabled={busy}>Upload</Button>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

/** A document pane: mono label + serif title over an inset desk that holds the drop zone and the sheet. */
function Pane({ index, source, title, meta, children }: { index: string; source: string; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-paper-high shadow-[0_1px_0_rgba(20,20,20,0.02),0_1px_2px_rgba(20,20,20,0.03)]">
      <header className="flex min-h-[64px] flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="eyebrow !text-[10px]">Doc {index} · {source}</div>
          <h3 className="mt-0.5 font-serif text-[18px] font-medium leading-tight tracking-[-0.015em] text-ink-100">{title}</h3>
        </div>
        {meta && <div className="flex min-w-0 items-center gap-1.5">{meta}</div>}
      </header>
      <div className="flex flex-1 flex-col gap-3 bg-paper-low/55 p-3 sm:p-4">{children}</div>
    </section>
  )
}

/** A sheet of paper: hairline file strip on top, mono body. */
function Sheet({ name, lines, children }: { name: string; lines?: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-[4px] border border-line bg-[#fffefb] shadow-[0_1px_2px_rgba(20,20,20,0.05),0_10px_28px_-18px_rgba(20,20,20,0.22)] transition-shadow focus-within:border-mint-deep/60 focus-within:shadow-[0_0_0_3px_rgba(47,206,150,0.16),0_10px_28px_-18px_rgba(20,20,20,0.22)]">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-1.5 font-mono text-[10.5px] text-ink-400">
        <span className="truncate">{name}</span>
        {typeof lines === 'number' && <span className="shrink-0 tabular-nums">{lines} lines</span>}
      </div>
      {children}
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
  const lineCount = (t: string) => (t ? t.split('\n').length : 0)
  const textareaCls = 'scrollbar-thin min-h-[300px] w-full flex-1 resize-y bg-transparent px-4 py-3.5 font-mono text-[12px] leading-[1.75] text-ink-200 outline-none placeholder:text-ink-400 sm:px-5'
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Pane index="01" source="from the plan" title="Denial letter"
        meta={<>
          {c.denialFile && <Badge tone="gray" className="max-w-[14rem] overflow-hidden">{c.denialFile.name}</Badge>}
          {c.denialText && <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => printSampleLetter(c)}>Print letter</Button>}
        </>}>
        <DropZone label="Drop a PDF, photo, or scan of the denial" icon={<FileText className="size-4" />} onFile={f => intake('denial', f)} busy={busy === 'denial'} accept=".pdf,image/*,.txt" />
        {c.denialFile && !c.denialText ? (
          <Sheet name={c.denialFile.name}>
            <div className="relative">
              {c.denialFile.mimeType.startsWith('image/')
                ? <img src={c.denialFile.dataUrl} alt="Uploaded denial letter" className="max-h-[340px] w-full bg-paper-low/60 object-contain" />
                : <div className="p-6 font-mono text-[12.5px] text-ink-300">{c.denialFile.name}</div>}
              <button onClick={() => caseStore.update(c.id, { denialFile: null })} className="absolute right-2 top-2 rounded-[4px] border border-line bg-paper-high/95 p-1.5 text-ink-300 shadow-sm transition-colors hover:border-line-strong hover:text-ink-100 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep" aria-label="Remove file"><X className="size-4" /></button>
            </div>
          </Sheet>
        ) : (
          <Sheet name="denial-letter.txt" lines={lineCount(c.denialText)}>
            <textarea value={c.denialText} onChange={e => caseStore.update(c.id, { denialText: e.target.value })} spellCheck={false}
              aria-label="Denial letter text"
              placeholder="…or paste the denial letter text here"
              className={textareaCls} />
          </Sheet>
        )}
      </Pane>
      <Pane index="02" source="from the provider" title="Chart notes">
        <DropZone label="Drop chart notes (PDF, photo, or text)" icon={<Stethoscope className="size-4" />} onFile={f => intake('chart', f)} busy={busy === 'chart'} accept=".pdf,image/*,.txt" />
        <Sheet name={c.chartTitle || 'chart-notes.txt'} lines={c.chartText ? lineCount(c.chartText) : undefined}>
          <textarea value={c.chartText} onChange={e => caseStore.update(c.id, { chartText: e.target.value })} spellCheck={false}
            aria-label="Chart notes text"
            placeholder="…or paste the relevant progress notes, test results and orders"
            className={textareaCls} />
        </Sheet>
      </Pane>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-4 lg:col-span-2">
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-ink-400"><span className="eyebrow mr-2 inline !text-[10px] !text-ink-300">Privacy</span>Use synthetic or de-identified documents only. PDFs with a text layer are read exactly; photos are transcribed verbatim by Gemini.</p>
        <Button variant="primary" size="lg" icon={<Play className="size-4" />} onClick={onRun} loading={running} disabled={!ready} className="w-full sm:w-auto">{c.match ? 'Re-run live' : 'Run Overturn'}</Button>
      </div>
    </div>
  )
}
