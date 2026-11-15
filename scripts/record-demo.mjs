// Records a real product walkthrough (live Gemini run) to docs/demo/raw.webm and writes
// event timestamps so ffmpeg can speed up the waiting and keep the reveals at 1x.
// Usage: node scripts/record-demo.mjs [baseUrl] [replay]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:5300'
const MODE = process.argv[3] === 'replay' ? 'replay' : 'live'
const OUT = path.resolve('docs/demo')
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const t0 = Date.now()
const marks = {}
const mark = k => { marks[k] = (Date.now() - t0) / 1000; console.log(k, marks[k]) }

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'overturn-rec-')),
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  args: ['--hide-scrollbars'],
})
const page = await browser.newPage()
const btn = (text) => page.evaluate(t => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().startsWith(t)); b?.click(); return !!b }, text)
const smoothTo = (y) => page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), y)
// Burned-in captions and title cards, rendered inside the page so the screencast captures them.
const caption = (text) => page.evaluate(t => {
  let el = document.getElementById('rec-caption')
  if (!el) {
    el = document.createElement('div'); el.id = 'rec-caption'
    el.style.cssText = 'position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;max-width:1100px;padding:14px 26px;border-radius:16px;background:rgba(5,6,10,.86);border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.6);color:#fff;font:600 30px/1.25 Inter,system-ui,sans-serif;letter-spacing:-.01em;text-align:center;transition:opacity .25s'
    document.body.appendChild(el)
  }
  el.style.opacity = t ? '1' : '0'
  if (t) el.innerHTML = t
}, text)
const card = (html) => page.evaluate(h => {
  let el = document.getElementById('rec-card')
  if (!el) {
    el = document.createElement('div'); el.id = 'rec-card'
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:22px;background:radial-gradient(ellipse at 30% 20%,rgba(124,92,255,.35),transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(52,211,153,.22),transparent 60%),#05060a;color:#e6e9f2;font-family:Inter,system-ui,sans-serif;text-align:center;padding:60px;transition:opacity .4s'
    document.body.appendChild(el)
  }
  el.style.opacity = h ? '1' : '0'; el.style.pointerEvents = h ? 'auto' : 'none'
  if (h) el.innerHTML = h
}, html)

await page.goto(`${BASE}/#/`, { waitUntil: 'load' }); await sleep(1500)
// CDP screencast → timestamped JPEG frames → ffmpeg (concat demuxer with real durations)
const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR)
const cdp = await page.createCDPSession()
const frames = []
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const f = path.join(FR, `f${String(frames.length).padStart(6, '0')}.jpg`)
  fs.writeFileSync(f, Buffer.from(data, 'base64'))
  frames.push({ f, t: metadata.timestamp })
  try { await cdp.send('Page.screencastFrameAck', { sessionId }) } catch { /* closing */ }
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 1000, everyNthFrame: 1 })
const rec = { stop: async () => {
  await cdp.send('Page.stopScreencast')
  const lines = []
  frames.forEach((fr, i) => { const next = frames[i + 1]?.t ?? fr.t + 0.5; lines.push(`file '${fr.f}'`, `duration ${Math.max(0.016, next - fr.t).toFixed(4)}`) })
  lines.push(`file '${frames[frames.length - 1].f}'`)
  fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'frame-times.json'), JSON.stringify({ first: frames[0]?.t, count: frames.length }))
} }
mark('start')
await card(`<div style="font:700 64px/1.05 Inter;letter-spacing:-.03em;max-width:1200px">Her insurer denied this using a rule <span style="font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;color:#67e8f9">Medicare deleted in 2021.</span></div><div style="font:500 26px Inter;color:#9aa2bd">Watch AI overturn it — live, in about a minute.</div>`)
await sleep(3600)
await card('')
await caption('3.2M Medicare Advantage denials a year. Only 11.7% get appealed.')
await sleep(4200) // hero animation
mark('hero_done')
await page.goto(`${BASE}/#/case/maria-cgm?autorun=${MODE}`)
await sleep(600)
await caption('Six Gemini agents read the denial, the Medicare policy and her chart')
mark('run_start')
await page.waitForFunction(() => document.body.innerText.includes('Appeal ready for review'), { timeout: 240000, polling: 500 })
mark('run_done')
await caption('2 retired rules · 1 rule that exists nowhere · 12 quotes verified')
await sleep(3800) // stamp
mark('stamp_done')
await btn('Policy time-travel')
await caption('The receipt: CMS removed that rule on July 18, 2021')
await sleep(3800)
await page.keyboard.press('Escape'); await sleep(600)
mark('tt_done')
await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => d.textContent?.startsWith('Evidence board')); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
await sleep(1500)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Insulin-treated'))?.click())
await caption('Every claim, side by side with its source')
await sleep(2800)
await btn('Tamper a quote')
await caption('Change one word? It refuses to send.')
await sleep(3400)
mark('tamper_done')
await btn('Restore'); await sleep(1200)
await btn('Confirm all verified'); await sleep(800)
await smoothTo(0); await sleep(900)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.startsWith('Findings'))?.click())
await caption('Code — not the model — decides every violation')
await sleep(800); await smoothTo(520); await sleep(3000)
mark('findings_done')
await smoothTo(0); await sleep(700)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.startsWith('Appeal letter'))?.click())
await sleep(900)
const input = await page.$('input[placeholder="Your full name"]')
if (input) {
  await input.type('Dana Whitfield', { delay: 45 })
  await page.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent?.includes('I reviewed every criterion'))?.querySelector('input')?.click())
  await sleep(400); await btn('Sign appeal')
}
await caption('A signed, fax-ready appeal in about two minutes')
await sleep(800); await smoothTo(420); await sleep(3200)
mark('letter_done')
await caption('')
await card(`<div style="display:flex;align-items:center;gap:18px;font:700 54px Inter;letter-spacing:-.02em"><svg width="64" height="64" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#a78bfa"/><stop offset=".55" stop-color="#22d3ee"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="#0b0d14" stroke="url(#g)" stroke-width="1.6"/><path d="M22.5 11.2A8 8 0 1 0 24 16" stroke="url(#g)" stroke-width="2.6" stroke-linecap="round"/><path d="M24.6 7.6v4.6H20" stroke="url(#g)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.2 16.2l2.6 2.6 5-5.2" stroke="#34d399" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Overturn</div><div style="font:600 34px Inter;max-width:1100px">2.8 million denials a year go unfought. <span style="color:#6ee7b7">Overturn them.</span></div><div style="font:500 24px 'JetBrains Mono',monospace;color:#67e8f9">vnmoorthy.github.io/overturn</div>`)
await sleep(4000)
mark('end')
await rec.stop()
await browser.close()
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ mode: MODE, ...marks }, null, 1))
console.log('done', marks)
