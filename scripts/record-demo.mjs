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
await sleep(4200) // hero animation
mark('hero_done')
await page.goto(`${BASE}/#/case/maria-cgm?autorun=${MODE}`)
mark('run_start')
await page.waitForFunction(() => document.body.innerText.includes('Appeal ready for review'), { timeout: 240000, polling: 500 })
mark('run_done')
await sleep(3800) // stamp
mark('stamp_done')
await btn('Policy time-travel')
await sleep(3500)
await page.keyboard.press('Escape'); await sleep(600)
mark('tt_done')
await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => d.textContent?.startsWith('Evidence board')); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
await sleep(1500)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Insulin-treated'))?.click())
await sleep(2500)
await btn('Tamper a quote'); await sleep(3200)
mark('tamper_done')
await btn('Restore'); await sleep(1200)
await btn('Confirm all verified'); await sleep(800)
await smoothTo(0); await sleep(900)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.startsWith('Findings'))?.click())
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
await sleep(800); await smoothTo(420); await sleep(3200)
mark('letter_done')
await page.goto(`${BASE}/#/`); await sleep(400); await smoothTo(820); await sleep(3000)
mark('end')
await rec.stop()
await browser.close()
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ mode: MODE, ...marks }, null, 1))
console.log('done', marks)
