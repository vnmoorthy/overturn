// Renders docs/src/*.html into the README images (docs/banner.png, docs/architecture.png).
// Usage: node scripts/render-docs.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const jobs = [['banner', 1280, 640], ['architecture', 1600, 1060]]
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'overturn-docs-')) })
for (const [name, w, h] of jobs) {
  const page = await browser.newPage()
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
  await page.goto('file://' + path.resolve(`docs/src/${name}.html`), { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `docs/${name}.png` })
  console.log('rendered', name)
}
await browser.close()
