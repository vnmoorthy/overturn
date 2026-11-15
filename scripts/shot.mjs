// Screenshot helper for design QA against the running dev server.
// Usage:
//   node scripts/shot.mjs <route> <out.png> [--width 1440] [--height 900] [--full]
//        [--replay <caseId>] [--click "Button text"]... [--scroll <px>] [--wait <ms>] [--mobile]
// Examples:
//   node scripts/shot.mjs / /tmp/home.png --full
//   node scripts/shot.mjs /case/maria-cgm /tmp/case.png --replay maria-cgm --click Findings --scroll 500
//   node scripts/shot.mjs /cases /tmp/wl-m.png --mobile --full
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const route = args[0] || '/'
const out = args[1] || 'shot.png'
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const flag = k => args.includes(k)
const clicks = args.flatMap((a, i) => (a === '--click' ? [args[i + 1]] : []))
const BASE = process.env.BASE || 'http://127.0.0.1:5300'
const mobile = flag('--mobile')
const width = Number(opt('--width', mobile ? 390 : 1440))
const height = Number(opt('--height', mobile ? 844 : 900))
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'overturn-shot-')),
  defaultViewport: { width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile },
  args: ['--hide-scrollbars', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
const replay = opt('--replay')
await page.goto(`${BASE}/#${replay ? `/case/${replay}?autorun=replay` : route}`, { waitUntil: 'networkidle0' })
if (replay) {
  await page.waitForFunction(() => document.body.innerText.includes('Appeal ready for review'), { timeout: 60000, polling: 300 }).catch(() => errors.push('replay did not reach "Appeal ready for review"'))
  await sleep(2500)
} else await sleep(Number(opt('--wait', 1500)))
for (const t of clicks) {
  const ok = await page.evaluate(t => {
    const el = [...document.querySelectorAll('button, a, [role=tab], [role=button], summary, label')].find(x => (x.textContent || '').trim().startsWith(t))
    if (el) { el.scrollIntoView({ block: 'center' }); el.click() }
    return !!el
  }, t)
  if (!ok) errors.push(`click target not found: ${t}`)
  await sleep(900)
}
const sc = opt('--scroll')
if (sc) { await page.evaluate(y => window.scrollTo(0, y), Number(sc)); await sleep(600) } else if (!clicks.length) await page.evaluate(() => window.scrollTo(0, 0))
await sleep(Number(opt('--settle', 500)))
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
await page.screenshot({ path: out, fullPage: flag('--full') })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
console.log(JSON.stringify({ saved: out, width, overflowX: overflow, errors }))
await browser.close()
