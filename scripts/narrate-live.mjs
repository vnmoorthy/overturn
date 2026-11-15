// Voices scripts/narration.json with the Gemini Live API (gemini-3.8-live): one session per line,
// strict read-verbatim instruction, PCM captured to docs/demo/narration/<id>.wav, and the model's
// own output transcription saved so we can confirm it said exactly the script.
// Usage: node scripts/narrate-live.mjs [id ...]
import { GoogleGenAI, Modality } from '@google/genai'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1beta' } })
const cfg = JSON.parse(fs.readFileSync('scripts/narration.json', 'utf8'))
const only = process.argv.slice(2)
const OUT = path.resolve('docs/demo/narration')
fs.mkdirSync(OUT, { recursive: true })
const SYS = 'You are a professional voiceover narrator for a product demo video. When the user gives you a line, read it aloud exactly, word for word, in a calm, warm, confident documentary voice at a measured pace. Never add, drop or change words. Say nothing else.'

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

async function say(text) {
  const chunks = []; let transcript = ''; let rate = 24000
  let done; const finished = new Promise(r => { done = r })
  const s = await ai.live.connect({
    model: 'gemini-3.8-live',
    config: { responseModalities: [Modality.AUDIO], systemInstruction: SYS, outputAudioTranscription: {}, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
    callbacks: {
      onmessage: m => {
        for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) { chunks.push(Buffer.from(p.inlineData.data, 'base64')); rate = Number(/rate=(\d+)/.exec(p.inlineData.mimeType || '')?.[1] || rate) }
        if (m.serverContent?.outputTranscription?.text) transcript += m.serverContent.outputTranscription.text
        if (m.serverContent?.turnComplete) done()
      },
      onerror: e => { console.log('  live error', e?.message); done() },
      onclose: () => done(),
    },
  })
  s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `Read this line exactly:\n${text}` }] }], turnComplete: true })
  await Promise.race([finished, new Promise(r => setTimeout(r, 45000))])
  s.close()
  return { pcm: Buffer.concat(chunks), rate, transcript: transcript.trim() }
}

const durFile = path.join(OUT, 'durations.json')
const out = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, 'utf8')) : {}
for (const seg of cfg.segments) {
  if (only.length && !only.includes(seg.id)) continue
  let best = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await say(seg.text)
    const exact = norm(r.transcript) === norm(seg.text)
    console.log(`${seg.id} #${attempt}: ${(r.pcm.length / 2 / r.rate).toFixed(2)}s exact=${exact} | ${r.transcript}`)
    if (r.pcm.length && (!best || exact)) best = { ...r, exact }
    if (exact) break
  }
  if (!best?.pcm.length) { console.log(`  ${seg.id}: no audio`); continue }
  const f = path.join(OUT, `${seg.id}.wav`)
  fs.writeFileSync(f, wav(best.pcm, best.rate))
  // trim leading/trailing silence so clips butt cleanly against the cuts
  const tmp = f.replace('.wav', '.trim.wav')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', tmp])
  fs.renameSync(tmp, f)
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
  out[seg.id] = { mark: seg.mark, seconds, voice: 'gemini-3.8-live', exact: best.exact, transcript: best.transcript }
}
fs.writeFileSync(durFile, JSON.stringify(out, null, 1))
process.exit(0)
