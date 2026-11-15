// File intake: PDFs with a text layer are read exactly with pdf.js (no model);
// scans and photos are sent to Gemini for verbatim transcription.
// pdf.js is ~1.3 MB, so it is loaded only when someone actually drops a PDF.
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export async function pdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let s = ''
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof it.str === 'string') s += it.str
      if (it.hasEOL) s += '\n'
    }
    pages.push(s.replace(/[ \t]+\n/g, '\n').trim())
  }
  return pages.join('\n\n').trim()
}

export function readDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(file)
  })
}

/** Downscale large photos so uploads stay fast and under request limits. */
export async function compressImage(dataUrl: string, maxDim = 2000): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale >= 1 && dataUrl.length < 3_000_000) return dataUrl
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.88)
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
