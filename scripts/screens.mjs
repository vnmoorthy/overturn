// Captures README / deck screenshots from a running dev server.
// Usage: node scripts/screens.mjs [baseUrl] [only,comma,list]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:5300'
const ONLY = (process.argv[3] || '').split(',').filter(Boolean)
const OUT = path.resolve('docs/screens')
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'overturn-shots-')),
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  args: ['--hide-scrollbars'],
})
const page = await browser.newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
const go = async (hash) => { await page.goto(`${BASE}/#${hash}`, { waitUntil: "networkidle0" }); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(900) }
const click = async (text, scope = '') => { const el = await page.waitForSelector(`${scope}::-p-text(${text})`, { timeout: 8000 }); await el.click(); await sleep(500) }
const shot = async (name, opts = {}) => { if (ONLY.length && !ONLY.includes(name)) return; await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }); console.log('saved', name) }
const scrollTo = async (sel) => { await page.evaluate(s => { const el = [...document.querySelectorAll('div')].find(d => d.textContent?.startsWith(s)); el?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24) }, sel); await sleep(700) }

await go('/')
await sleep(3800)
await shot('home')

await go('/case/maria-cgm?autorun=replay')
await sleep(9000)
await shot('case-ready')
await scrollTo('Evidence board')
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Insulin-treated')); b?.click() })
await sleep(1200)
await shot('evidence')

await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Tamper a quote'))?.click())
await sleep(1200)
await shot('tamper')
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Restore')?.click())
await sleep(800)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Confirm all verified'))?.click())
await sleep(400)

await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Findings' || x.textContent?.startsWith('Findings'))?.click())
await sleep(1000)
await page.evaluate(() => window.scrollTo(0, 560)); await sleep(600)
await shot('findings')

await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Policy time-travel') || x.textContent?.includes('L33822 ·'))?.click())
await sleep(1300)
await shot('time-travel')
await page.keyboard.press('Escape'); await sleep(500)

await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.startsWith('Appeal letter'))?.click())
await sleep(800)
const name = await page.$('input[placeholder="Your full name"]')
if (name) { await name.type('Dana Whitfield'); await page.evaluate(() => { const cb = [...document.querySelectorAll('label')].find(l => l.textContent?.includes('I reviewed every criterion'))?.querySelector('input'); cb?.click() }); await sleep(200); await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Sign appeal')?.click()); await sleep(800) }
await page.evaluate(() => window.scrollTo(0, 480)); await sleep(600)
await shot('letter')

await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.startsWith('Patient view'))?.click())
await sleep(800)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.startsWith('Explain in'))?.click())
await sleep(9000)
await page.evaluate(() => window.scrollTo(0, 480)); await sleep(600)
await shot('patient')

await go('/cases'); await sleep(1500)
await shot('worklist')
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(800)
await shot('playbook')

await go('/audit'); await sleep(1200)
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Verify chain'))?.click())
await sleep(1500)
await shot('audit')
await go('/settings'); await sleep(1000)
await shot('settings')
await go('/rehearse/maria-cgm'); await sleep(1500)
await shot('rehearse')
await browser.close()
