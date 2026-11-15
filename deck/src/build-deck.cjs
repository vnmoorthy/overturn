// Builds deck/Overturn-pitch-deck.pptx — 10 slides, dark theme, real product screenshots,
// then injects Morph transitions + staggered entrance animations (see animate.py).
// Run from a folder where pptxgenjs, sharp, react, react-dom, react-icons are installed:
//   node build-deck.cjs <repoRoot>
const path = require('path')
const fs = require('fs')
const pptxgen = require('pptxgenjs')
const sharp = require('sharp')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const Lu = require('react-icons/lu')

const ROOT = path.resolve(process.argv[2] || '.')
const OUT = path.join(ROOT, 'deck')
const SHOTS = path.join(ROOT, 'docs/screens')
const TMP = path.join(OUT, '.build')
fs.mkdirSync(TMP, { recursive: true })

const COL = { bg: '05060A', ink: 'E6E9F2', mute: '9AA2BD', dim: '6B7390', card: '11141D', line: '262C3C', violet: '8B6DFF', cyan: '22D3EE', green: '34D399', rose: 'FB7185', amber: 'FBBF24' }
const HEAD = 'Calibri', BODY = 'Calibri', SERIF = 'Cambria'

async function png(svg, w, h, file) { const out = path.join(TMP, file); await sharp(Buffer.from(svg)).resize(w, h).png().toFile(out); return out }
async function icon(name, color, file) {
  const svg = renderToStaticMarkup(React.createElement(Lu[name], { color: '#' + color, size: 256, strokeWidth: 1.75 }))
  return png(svg, 256, 256, file)
}
async function crop(name, left, top, width, height, file) {
  const out = path.join(TMP, file)
  await sharp(path.join(SHOTS, name)).extract({ left, top, width, height }).png().toFile(out)
  return out
}

async function assets() {
  const bg = await png(`<svg xmlns="http://www.w3.org/2000/svg" width="2666" height="1500">
    <defs>
      <radialGradient id="a" cx="18%" cy="8%" r="45%"><stop offset="0" stop-color="#7c5cff" stop-opacity=".42"/><stop offset="1" stop-color="#7c5cff" stop-opacity="0"/></radialGradient>
      <radialGradient id="b" cx="92%" cy="45%" r="40%"><stop offset="0" stop-color="#22d3ee" stop-opacity=".16"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
      <radialGradient id="c" cx="45%" cy="112%" r="45%"><stop offset="0" stop-color="#34d399" stop-opacity=".2"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></radialGradient>
      <pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#ffffff" stroke-opacity=".035" stroke-width="2"/></pattern>
    </defs>
    <rect width="100%" height="100%" fill="#05060a"/><rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/><rect width="100%" height="100%" fill="url(#c)"/></svg>`, 2666, 1500, 'bg.png')
  const logo = await png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset=".55" stop-color="#22d3ee"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="#0b0d14" stroke="url(#g)" stroke-width="1.6"/><path d="M22.5 11.2A8 8 0 1 0 24 16" stroke="url(#g)" stroke-width="2.6" stroke-linecap="round"/><path d="M24.6 7.6v4.6H20" stroke="url(#g)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.2 16.2l2.6 2.6 5-5.2" stroke="#34d399" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, 512, 512, 'logo.png')
  const heroArt = path.join(TMP, 'hero-art.png')
  await sharp(path.join(ROOT, 'docs/banner.png')).extract({ left: 690, top: 70, width: 560, height: 500 }).png().toFile(heroArt)
  const I = {}
  const icons = [['LuFileText', 'cyan'], ['LuFileSearch', 'cyan'], ['LuScanSearch', 'violet'], ['LuFingerprint', 'cyan'], ['LuGavel', 'rose'], ['LuPenLine', 'violet'],
    ['LuShieldCheck', 'green'], ['LuLink', 'green'], ['LuSignature', 'amber'], ['LuBug', 'amber'], ['LuMic', 'violet'], ['LuHeartPulse', 'rose'],
    ['LuScale', 'cyan'], ['LuHistory', 'violet'], ['LuClock', 'amber'], ['LuBookOpen', 'cyan'], ['LuSparkles', 'violet'], ['LuCheck', 'green'], ['LuX', 'rose'], ['LuMinus', 'dim']]
  for (const [n, c] of icons) I[n] = await icon(n, COL[c], `${n}.png`)
  const shots = {
    findings: await crop('findings.png', 540, 0, 2340, 1520, 'findings.png'),
    evidence: await crop('evidence.png', 560, 280, 2320, 1500, 'evidence.png'),
    tamper: await crop('tamper.png', 560, 280, 2320, 1500, 'tamper.png'),
    tt: await crop('time-travel.png', 400, 100, 2080, 1465, 'tt.png'),
    ready: await crop('case-ready.png', 540, 0, 2340, 1150, 'ready.png'),
    letter: await crop('letter.png', 540, 0, 2340, 1520, 'letter.png'),
    worklist: await crop('worklist.png', 540, 0, 2340, 1500, 'worklist.png'),
  }
  const QR = require(path.join(ROOT, 'node_modules/qrcode'))
  const qr = path.join(TMP, 'qr.png')
  await QR.toFile(qr, 'https://vnmoorthy.github.io/overturn/', { width: 600, margin: 1, color: { dark: '#05060aff', light: '#e6e9f2ff' } })
  return { bg, logo, heroArt, I, shots, qr }
}

;(async () => {
  const A = await assets()
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.333 x 7.5
  pres.title = 'Overturn — pitch deck'
  pres.author = 'Overturn team'
  pres.company = 'Overturn'
  pres.subject = 'Berkeley x DeepMind Hackathon 2026'
  pres.theme = { headFontFace: HEAD, bodyFontFace: BODY }

  pres.defineSlideMaster({
    title: 'OVERTURN_DARK',
    background: { path: A.bg },
    objects: [
      { image: { x: 0.55, y: 6.86, w: 0.32, h: 0.32, path: A.logo } },
      { text: { text: 'Overturn · Berkeley × DeepMind 2026', options: { x: 0.95, y: 6.84, w: 6, h: 0.36, fontFace: BODY, fontSize: 10, color: COL.dim, margin: 0, valign: 'middle' } } },
    ],
    slideNumber: { x: 12.3, y: 6.84, w: 0.5, h: 0.36, fontFace: BODY, fontSize: 10, color: COL.dim, align: 'right' },
  })

  let n = 0
  const add = (notes) => { const s = pres.addSlide({ masterName: 'OVERTURN_DARK' }); s.addNotes(notes); s._n = ++n; s._k = 0; return s }
  const name = (s, label) => `anim${String(++s._k).padStart(2, '0')} ${label}`
  const T = (s, text, o, label) => s.addText(text, { isTextBox: true, fontFace: BODY, color: COL.ink, margin: 0, ...o, objectName: label === false ? undefined : name(s, label || 'text') })
  const title = (s, text, accent) => T(s, accent ? [{ text: text + ' ', options: {} }, { text: accent, options: { italic: true, fontFace: SERIF, color: COL.cyan } }] : text,
    { x: 0.6, y: 0.5, w: 12.1, h: 1.0, fontFace: HEAD, fontSize: 36, bold: true, valign: 'top' }, 'title')
  const eyebrow = (s, text) => T(s, text.toUpperCase(), { x: 0.6, y: 0.22, w: 8, h: 0.3, fontSize: 11, bold: true, color: COL.dim, charSpacing: 3 }, 'eyebrow')
  const card = (s, x, y, w, h, label, fill = COL.card, line = COL.line) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.14, fill: { color: fill, transparency: 8 }, line: { color: line, width: 1 }, objectName: name(s, label) })
  const img = (s, p, o, label) => s.addImage({ path: p, ...o, objectName: name(s, label) })
  const iconDot = (s, ic, x, y, d = 0.62, fill = '161A26') => { s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: COL.line, width: 1 }, objectName: name(s, 'icon-bg') }); s.addImage({ path: A.I[ic], x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56, objectName: name(s, 'icon') }) }
  const shot = (s, p, x, y, w, h, label = 'screenshot') => { s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.12, fill: { color: '0B0D14' }, line: { color: '343B52', width: 1 }, shadow: { type: 'outer', color: '000000', blur: 18, offset: 6, angle: 90, opacity: 0.55 }, objectName: name(s, label + '-frame') }); s.addImage({ path: p, x, y, w, h, objectName: name(s, label) }) }

  // 1 — Title
  {
    const s = add(`0:00 – 0:15 — Title\n\nSAY: In 2023, Medicare Advantage plans denied 3.2 million requests for care. Insurers are denying care with rules they’re not even allowed to use. We built Overturn to quote their own rulebook back at them.\n\nMOTION: Logo morphs in; headline fades up; denial-letter art zooms in with the green OVERTURN IT stamp; model chips cascade.`)
    s.addImage({ path: A.logo, x: 0.6, y: 0.62, w: 0.62, h: 0.62, objectName: '!!logo' })
    T(s, 'Overturn', { x: 1.38, y: 0.62, w: 4, h: 0.62, fontFace: HEAD, fontSize: 28, bold: true, valign: 'middle' }, 'brand')
    T(s, [{ text: 'Insurers deny care with rules ', options: {} }, { text: 'they’re not allowed to use.', options: { italic: true, fontFace: SERIF, color: COL.cyan } }],
      { x: 0.6, y: 1.75, w: 6.9, h: 2.5, fontFace: HEAD, fontSize: 46, bold: true, valign: 'top', lineSpacingMultiple: 0.95 }, 'headline')
    T(s, 'An AI appeals agent that finds the exact sentence in Medicare’s own coverage policy that contradicts a denial, verifies every quote twice, and drafts a signed appeal in about two minutes.',
      { x: 0.6, y: 4.35, w: 6.4, h: 1.2, fontSize: 17, color: COL.mute, valign: 'top' }, 'sub')
    const chips = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.8-flash-tts', 'gemini-embedding-2']
    let cx0 = 0.6
    chips.forEach((c, i) => { const w = 0.13 + c.length * 0.083; s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx0, y: 5.75, w, h: 0.36, rectRadius: 0.08, fill: { color: '161A26' }, line: { color: COL.line, width: 1 }, objectName: name(s, 'chip-bg') }); T(s, c, { x: cx0, y: 5.75, w, h: 0.36, fontFace: 'Courier New', fontSize: 10.5, color: COL.mute, align: 'center', valign: 'middle' }, 'chip'); cx0 += w + 0.12 })
    s.addImage({ path: A.heroArt, x: 7.45, y: 1.0, w: 5.4, h: 4.82, objectName: name(s, 'hero-art') })
  }

  // 2 — Problem
  {
    const s = add(`0:15 – 0:35 — The problem\n\nSAY: Only 11.7% of those denials were ever appealed — and when people did appeal, 82% won. That’s about 2.8 million denials a year nobody fought. Meet Maria: 67, ambulance ride, blood sugar of 41 — and her plan denied her glucose monitor because she didn’t test four times a day. Medicare deleted that rule in 2021.\n\nMOTION: The three stats zoom in one by one (red → amber → green), then Maria’s story card fades up.`)
    eyebrow(s, 'The problem'); title(s, '2.8 million denials a year', 'nobody fights')
    const stats = [['3.2M', 'Medicare Advantage prior-auth denials in 2023', COL.rose], ['11.7%', 'of those denials were ever appealed', COL.amber], ['81.7%', 'of appeals were partially or fully overturned', COL.green]]
    stats.forEach(([v, l, c], i) => {
      const x = 0.6 + i * 4.1
      card(s, x, 1.75, 3.85, 2.45, 'stat-card')
      T(s, v, { x: x + 0.35, y: 1.95, w: 3.3, h: 1.2, fontSize: 64, bold: true, color: c, fontFace: HEAD, valign: 'middle' }, 'stat')
      T(s, l, { x: x + 0.35, y: 3.2, w: 3.2, h: 0.8, fontSize: 15, color: COL.mute, valign: 'top' }, 'stat-label')
    })
    card(s, 0.6, 4.5, 12.05, 1.75, 'story-card', '141019', '3A2230')
    s.addImage({ path: A.I.LuHeartPulse, x: 0.95, y: 4.95, w: 0.7, h: 0.7, objectName: name(s, 'story-icon') })
    T(s, [{ text: 'Maria, 67, ', options: { bold: true, color: COL.ink } }, { text: 'arrived by ambulance with a blood sugar of 41 mg/dL. Her Medicare Advantage plan then denied her continuous glucose monitor — because she didn’t test “four or more times per day,” a rule CMS removed in July 2021.', options: { color: COL.mute } }],
      { x: 1.95, y: 4.72, w: 10.4, h: 1.3, fontSize: 17, valign: 'middle' }, 'story')
    T(s, 'Source: KFF analysis of CMS data on Medicare Advantage prior authorization, 2023 (published 2025). Maria is a synthetic composite patient.', { x: 0.6, y: 6.38, w: 12, h: 0.3, fontSize: 10, color: COL.dim }, 'source')
  }

  // 3 — Insight
  {
    const s = add(`0:35 – 0:52 — The insight\n\nSAY: Here’s the thing: the rules are public. Medicare Advantage plans are legally bound to Medicare’s coverage policies. But proving it means finding the right policy, the right version for the date of service, and quoting it against the chart. That’s an hour per appeal. Nobody has it.\n\nMOTION: Three icon rows cascade; the policy time-travel screenshot slides in with the struck-through rule.`)
    eyebrow(s, 'The insight'); title(s, 'The rulebook is public.', 'Nobody has time to read it.')
    const rows = [
      ['LuBookOpen', 'Plans are bound to Medicare’s own criteria', 'MA plans must follow Traditional Medicare NCDs and LCDs, and may use internal criteria only when Medicare’s are not fully established — 42 CFR § 422.101(b).'],
      ['LuHistory', 'Denials cite retired or invented rules', 'Policies change version by version. Denials lag behind — or add requirements that appear in no version at all.'],
      ['LuClock', 'An appeal is a research project', 'Find the policy, pin the version in effect on the date of service, match each criterion to the chart, quote both exactly. We estimate 45–60 minutes per appeal.'],
    ]
    rows.forEach(([ic, h, b], i) => {
      const y = 1.75 + i * 1.6
      iconDot(s, ic, 0.6, y + 0.05)
      T(s, h, { x: 1.45, y, w: 5.2, h: 0.45, fontSize: 19, bold: true }, 'row-head')
      T(s, b, { x: 1.45, y: y + 0.45, w: 5.2, h: 1.0, fontSize: 14.5, color: COL.mute, valign: 'top' }, 'row-body')
    })
    shot(s, A.shots.tt, 7.05, 1.7, 5.65, 3.98, 'time-travel')
    T(s, 'Overturn’s policy time-travel: every archived version of CMS LCD L33822, with the requirements the denial still applies struck through.', { x: 7.05, y: 5.85, w: 5.65, h: 0.6, fontSize: 11.5, color: COL.dim }, 'caption')
  }

  // 4 — Solution
  {
    const s = add(`0:52 – 1:10 — The product\n\nSAY: Overturn is six agents on Gemini. It reads the denial, finds the governing policy version, matches every criterion to a line in the chart, verifies every quote twice, checks the plan’s compliance, and drafts a signed appeal — in about two minutes.\n\nMOTION: Six cards fade up left-to-right, top-to-bottom, each with its Gemini model.`)
    eyebrow(s, 'The product'); title(s, 'Six agents. Two minutes.', 'One verified appeal.')
    const steps = [
      ['LuFileText', 'Read the denial', 'PDF, scan or phone photo → structured, verbatim', 'gemini-3.8-flash'],
      ['LuFileSearch', 'Find the rulebook', 'Route to the LCD, pin the version on the date of service', 'policy library'],
      ['LuScanSearch', 'Match evidence', 'Policy + every version + chart in one long-context pass', 'gemini-4-hydrogen'],
      ['LuFingerprint', 'Verify twice', 'Exact-match provenance + skeptical support auditor', 'code + gemini-3.5-flash'],
      ['LuGavel', 'Catch violations', 'Retired rules, phantom criteria, ignored pathways', 'deterministic rules'],
      ['LuPenLine', 'Draft & sign', 'Token-cited letter, human sign-off, fax-ready PDF', 'gemini-4-hydrogen'],
    ]
    steps.forEach(([ic, h, b, m], i) => {
      const col = i % 3, row = Math.floor(i / 3)
      const x = 0.6 + col * 4.1, y = 1.7 + row * 2.42
      card(s, x, y, 3.85, 2.2, 'step-card')
      iconDot(s, ic, x + 0.3, y + 0.3, 0.6)
      T(s, String(i + 1).padStart(2, '0'), { x: x + 3.0, y: y + 0.32, w: 0.6, h: 0.35, fontSize: 12, color: COL.dim, align: 'right', fontFace: 'Courier New' }, 'step-num')
      T(s, h, { x: x + 0.3, y: y + 0.98, w: 3.3, h: 0.4, fontSize: 18, bold: true }, 'step-head')
      T(s, b, { x: x + 0.3, y: y + 1.36, w: 3.35, h: 0.46, fontSize: 12, color: COL.mute, valign: 'top' }, 'step-body')
      T(s, m, { x: x + 0.3, y: y + 1.86, w: 3.35, h: 0.24, fontSize: 10.5, color: 'C4B5FD', fontFace: 'Courier New' }, 'step-model')
    })
  }

  // 5 — Demo
  {
    const s = add(`1:10 – 1:40 — Live demo\n\nSAY: This is Maria’s real run. Gemini 4 read the policy, all three of its historical versions, and her chart in one pass. Two of the plan’s requirements were retired by CMS — in 2021 and 2023. The third appears in no version of the policy at all. And her chart meets all six criteria that actually apply — every quote verified verbatim.” (Optional: switch to the app tab and click Policy time-travel.)\n\nMOTION: The recorded live run (embedded video — click it to play) frames in; the three callouts zoom: 3 violations · 12/12 quotes verified · 6/6 criteria met.`)
    eyebrow(s, 'Live demo · Maria’s CGM denial'); title(s, 'They denied her with a rule', 'CMS retired in 2021')
    // Real product footage: the recorded live run plays on click (poster = findings screenshot)
    const vid = path.join(ROOT, 'docs/demo/overturn-demo.mp4')
    if (fs.existsSync(vid)) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.54, y: 1.64, w: 7.52, h: 4.75, rectRadius: 0.12, fill: { color: '0B0D14' }, line: { color: '343B52', width: 1 }, objectName: name(s, 'video-frame') })
      const cover = fs.readFileSync(path.join(ROOT, 'docs/demo/poster.jpg')).toString('base64')
      s.addMedia({ type: 'video', path: vid, x: 0.6, y: 1.7, w: 7.4, h: 4.625, cover: 'data:image/jpeg;base64,' + cover, objectName: 'demo-video' })
    } else shot(s, A.shots.findings, 0.6, 1.7, 7.4, 4.81, 'findings')
    const callouts = [
      ['3', 'possible violations', 'Two retired requirements + one found in no version of LCD L33822', COL.rose],
      ['12/12', 'quotes verified verbatim', 'Every policy and chart quote exists in its source', COL.green],
      ['6/6', 'criteria met', 'Chart verifiably satisfies the version in effect', COL.cyan],
    ]
    callouts.forEach(([v, h, b, c], i) => {
      const y = 1.7 + i * 1.63
      card(s, 8.35, y, 4.3, 1.45, 'callout')
      T(s, v, { x: 8.6, y: y + 0.12, w: 1.6, h: 0.75, fontSize: 34, bold: true, color: c, valign: 'middle' }, 'callout-num')
      T(s, h, { x: 10.15, y: y + 0.2, w: 2.4, h: 0.6, fontSize: 15, bold: true, valign: 'middle' }, 'callout-head')
      T(s, b, { x: 8.6, y: y + 0.85, w: 3.9, h: 0.5, fontSize: 11.5, color: COL.mute }, 'callout-body')
    })
  }

  // 6 — Trust
  {
    const s = add(`1:40 – 2:02 — Trust\n\nSAY: Healthcare can’t run on hallucinations. Key one is plain code: every quote must exist word-for-word in its source — change one word and the export locks. Key two is a skeptical Gemini auditor that catches real-but-wrong evidence, like her mother’s diabetes. Code decides every flag, a human signs, and everything is hash-chained.\n\nMOTION: Four trust rows cascade; the tamper screenshot slides in with the red “Key 1 failed” banner.`)
    eyebrow(s, 'Trust'); title(s, 'No unverified sentence', 'leaves the building')
    shot(s, A.shots.tamper, 6.2, 1.7, 6.45, 4.17, 'tamper')
    T(s, 'Tamper test: one word changed (“or” → “and”). Key 1 fails, the closest source sentence appears, export locks.', { x: 6.2, y: 6.0, w: 6.45, h: 0.5, fontSize: 11.5, color: COL.dim }, 'caption')
    const items = [
      ['LuFingerprint', 'Key 1 · provenance', 'Deterministic exact match after normalization. Not found → row red, export locked.'],
      ['LuShieldCheck', 'Key 2 · support', 'A skeptical Gemini auditor flags wrong date, wrong side, negation, wrong person.'],
      ['LuGavel', 'Code decides every flag', 'The model supplies features; a rules engine decides. “Possible issue — biller confirms.”'],
      ['LuLink', 'Hash-chained audit + human sign-off', 'Every AI step and decision SHA-256 chained. Nothing is sent without a signature.'],
    ]
    items.forEach(([ic, h, b], i) => {
      const y = 1.72 + i * 1.18
      iconDot(s, ic, 0.6, y, 0.56)
      T(s, h, { x: 1.35, y: y - 0.04, w: 4.6, h: 0.4, fontSize: 16.5, bold: true }, 'trust-head')
      T(s, b, { x: 1.35, y: y + 0.36, w: 4.6, h: 0.7, fontSize: 12.5, color: COL.mute, valign: 'top' }, 'trust-body')
    })
  }

  // 7 — Gemini
  {
    const s = add(`2:02 – 2:15 — Built on Gemini, end to end\n\nSAY: It’s Gemini end to end — 4 Hydrogen for long context, 3.8 Flash for multimodal intake, 3.8 Live to rehearse the peer-to-peer call with the plan’s medical director, TTS for patients in English and Spanish, and Google’s Antigravity agent researches policies we haven’t loaded yet — with fallback chains so it never breaks on stage.\n\nMOTION: Model table fades in row by row; architecture diagram zooms; “Never breaks on stage” card.`)
    eyebrow(s, 'Under the hood'); title(s, 'Built on Gemini,', 'end to end')
    const rows = [
      ['Read the denial', 'gemini-3.8-flash', 'multimodal → JSON schema'],
      ['Match criteria', 'gemini-4-hydrogen', 'long context, thinking'],
      ['Support auditor', 'gemini-3.5-flash', 'independent second key'],
      ['Draft the appeal', 'gemini-4-hydrogen', 'token-cited prose'],
      ['P2P rehearsal', 'gemini-3.8-live', 'real-time voice'],
      ['Patient view', 'gemini-3.8-flash-tts', 'EN / ES narration'],
      ['Similar cases', 'gemini-embedding-2', '42,710 real IMRs'],
      ['Policy scout', 'Antigravity agent', 'researches new LCDs'],
    ]
    const tbl = [[{ text: 'Task', options: { bold: true, color: COL.dim } }, { text: 'Model', options: { bold: true, color: COL.dim } }, { text: 'How', options: { bold: true, color: COL.dim } }]]
      .concat(rows.map(r => [{ text: r[0], options: { color: COL.ink } }, { text: r[1], options: { color: 'C4B5FD', fontFace: 'Courier New' } }, { text: r[2], options: { color: COL.mute } }]))
    s.addTable(tbl, { x: 0.6, y: 1.75, w: 6.6, colW: [1.95, 2.45, 2.2], fontSize: 13, fontFace: BODY, rowH: 0.47, border: { type: 'solid', color: COL.line, pt: 0.75 }, fill: { color: '0B0D14' }, valign: 'middle', objectName: name(s, 'model-table') })
    shot(s, path.join(ROOT, 'docs/architecture.png'), 7.6, 1.75, 5.05, 3.35, 'architecture')
    card(s, 7.6, 5.4, 5.05, 1.05, 'fallback-card')
    T(s, [{ text: 'Never breaks on stage. ', options: { bold: true, color: COL.green } }, { text: 'Every call walks a per-task fallback chain (429 / 503 / 504 → next model) with a live agent trace.', options: { color: COL.mute } }], { x: 7.85, y: 5.5, w: 4.6, h: 0.85, fontSize: 12.5, valign: 'middle' }, 'fallback')
  }

  // 8 — Market & model
  {
    const s = add(`2:15 – 2:35 — Business\n\nSAY: Our buyers are independent specialty practices and the billing firms that serve them. Twelve dollars a verified appeal, or 10–15% of recovered dollars. Inference costs cents — over 90% gross margin. And the public data is on our side: independent reviewers overturn 78% of glucose-monitor denials.\n\nMOTION: Three metric cards zoom; the overturn-rate bar chart draws in.`)
    eyebrow(s, 'Market & business model'); title(s, 'Software margins on', 'recovered revenue')
    const m = [['~2.8M', 'MA prior-auth denials a year never appealed (2023)', COL.rose], ['$12', 'per verified appeal — or 10–15% contingency on recovered dollars', COL.cyan], ['>90%', 'gross margin: ~$0.10–0.40 of Gemini inference per appeal (est.)', COL.green]]
    m.forEach(([v, l, c], i) => {
      const y = 1.75 + i * 1.5
      card(s, 0.6, y, 5.6, 1.3, 'metric-card')
      T(s, v, { x: 0.85, y: y + 0.15, w: 1.9, h: 1.0, fontSize: 38, bold: true, color: c, valign: 'middle' }, 'metric')
      T(s, l, { x: 2.8, y: y + 0.15, w: 3.2, h: 1.0, fontSize: 13.5, color: COL.mute, valign: 'middle' }, 'metric-label')
    })
    s.addChart(pres.charts.BAR, [{ name: 'Overturned', labels: ['All IMRs', 'Facet joint procedures', 'CPAP / BiPAP', 'CGM / diabetes supplies'], values: [52.5, 47.8, 53.5, 78.2] }], {
      x: 6.6, y: 1.75, w: 6.05, h: 4.15, barDir: 'bar', chartColors: [COL.green], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0"%"',
      dataLabelColor: COL.ink, dataLabelFontSize: 12, dataLabelFontFace: '+mn-lt', catAxisLabelColor: COL.mute, catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt',
      valAxisHidden: true, valAxisMaxVal: 100, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false,
      showTitle: true, title: 'Independent medical reviews overturned (%)', titleColor: COL.ink, titleFontSize: 14, titleFontFace: '+mn-lt', catAxisLineShow: false, objectName: name(s, 'chart'),
    })
    T(s, 'California DMHC Independent Medical Review open data, 42,710 cases (2001–2026). Commercial / Medi-Cal plans — a public prior, not Medicare Advantage.', { x: 6.6, y: 6.0, w: 6.05, h: 0.5, fontSize: 10.5, color: COL.dim }, 'source')
  }

  // 9 — Competition & moat
  {
    const s = add(`2:35 – 2:47 — Moat\n\nSAY: Others generate letters. We prove them — compliance violations, double-verified quotes, policy time-travel. And every win and loss compounds into per-payer playbooks no template tool will ever have.\n\nMOTION: Comparison table fades in; Overturn’s green column reads first.`)
    eyebrow(s, 'Competition & moat'); title(s, 'Others write letters.', 'We prove them.')
    const cols = ['', 'Overturn', 'EHR / RCM-bundled letters', 'Enterprise denial AI', 'Free letter tools']
    const rows = [
      ['Finds the plan’s compliance violations', 1, 0, 0, 0],
      ['Every quote verified twice (provenance + support)', 1, 0, 0, 0],
      ['Policy version time-travel on the date of service', 1, 0, 0, 0],
      ['Built for independent practices & billing firms', 1, 0, 2, 1],
      ['Outcome flywheel → per-payer playbooks', 1, 2, 1, 0],
      ['P2P rehearsal with live voice', 1, 0, 0, 0],
    ]
    const mark = v => v === 1 ? { text: '●', options: { color: COL.green, align: 'center', fontSize: 16 } } : v === 2 ? { text: '◐', options: { color: COL.amber, align: 'center', fontSize: 16 } } : { text: '—', options: { color: COL.dim, align: 'center' } }
    const tbl = [cols.map((c, i) => ({ text: c, options: { bold: true, color: i === 1 ? COL.green : COL.mute, align: i ? 'center' : 'left', fontSize: 12.5 } }))]
      .concat(rows.map(r => [{ text: r[0], options: { color: COL.ink } }, mark(r[1]), mark(r[2]), mark(r[3]), mark(r[4])]))
    s.addTable(tbl, { x: 0.6, y: 1.75, w: 12.05, colW: [4.45, 1.7, 2.1, 1.9, 1.9], fontSize: 13.5, fontFace: BODY, rowH: 0.56, border: { type: 'solid', color: COL.line, pt: 0.75 }, fill: { color: '0B0D14' }, valign: 'middle', objectName: name(s, 'compare-table') })
    T(s, 'Examples: Epic- and Waystar-bundled appeal letters; enterprise agentic denial management (e.g., Amperos); free generators (Doximity GPT, Counterforce Health). ● yes  ◐ partial  — no', { x: 0.6, y: 5.85, w: 12.05, h: 0.5, fontSize: 11, color: COL.dim }, 'legend')
  }

  // 10 — Ask
  {
    const s = add(`2:47 – 3:00 — Ask\n\nSAY: We’re raising a lean $1.5 million seed: ten billing firms, five thousand appeals, and a BAA-covered Vertex AI deployment in twelve months. Every denial deserves an answer — in the insurer’s own words. Scan the code and overturn one yourself. Thank you.\n\nMOTION: Closing line zooms; milestones cascade; QR code to the live demo zooms in last.`)
    s.addImage({ path: A.logo, x: 0.6, y: 0.62, w: 0.62, h: 0.62, objectName: '!!logo' })
    T(s, 'Overturn', { x: 1.38, y: 0.62, w: 4, h: 0.62, fontFace: HEAD, fontSize: 28, bold: true, valign: 'middle' }, 'brand')
    T(s, [{ text: 'Every denial deserves an answer. ', options: {} }, { text: 'In the insurer’s own words.', options: { italic: true, fontFace: SERIF, color: COL.green } }],
      { x: 0.6, y: 1.55, w: 7.4, h: 1.8, fontFace: HEAD, fontSize: 38, bold: true, valign: 'top' }, 'closing')
    card(s, 0.6, 3.55, 7.4, 2.85, 'ask-card')
    T(s, 'Raising a $1.5M seed — 12-month milestones', { x: 0.9, y: 3.72, w: 6.9, h: 0.45, fontSize: 17, bold: true, color: COL.ink }, 'ask-head')
    T(s, [
      { text: '10 paying billing firms; 5,000 verified appeals filed', options: { bullet: true, breakLine: true } },
      { text: '1,000+ adjudicated outcomes replacing the public prior', options: { bullet: true, breakLine: true } },
      { text: 'Every DME MAC and A/B MAC LCD, plus commercial policy bulletins', options: { bullet: true, breakLine: true } },
      { text: 'Cloud Run + Vertex AI under a Google Cloud BAA; SOC 2 Type I', options: { bullet: true } },
    ], { x: 0.9, y: 4.22, w: 6.9, h: 2.0, fontSize: 14.5, color: COL.mute, paraSpaceAfter: 6, valign: 'top' }, 'milestones')
    card(s, 8.55, 1.55, 4.1, 4.85, 'qr-card')
    s.addImage({ path: A.qr, x: 9.15, y: 1.9, w: 2.9, h: 2.9, objectName: name(s, 'qr') })
    T(s, 'Try it live', { x: 8.55, y: 4.95, w: 4.1, h: 0.4, fontSize: 18, bold: true, align: 'center' }, 'qr-head')
    T(s, 'vnmoorthy.github.io/overturn', { x: 8.55, y: 5.35, w: 4.1, h: 0.35, fontSize: 12.5, color: COL.cyan, align: 'center', fontFace: 'Courier New' }, 'url')
    T(s, 'github.com/vnmoorthy/overturn', { x: 8.55, y: 5.72, w: 4.1, h: 0.35, fontSize: 12.5, color: COL.mute, align: 'center', fontFace: 'Courier New' }, 'repo')
  }

  const file = path.join(OUT, 'Overturn-pitch-deck.pptx')
  await pres.writeFile({ fileName: file })
  console.log('wrote', file)
})().catch(e => { console.error(e); process.exit(1) })
