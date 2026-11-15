// Dev utility: checks which Gemini models answer with your key. Usage: node scripts/probe-models.mjs [model ...]
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
const key = (process.env.GEMINI_API_KEY || fs.readFileSync('.env', 'utf8').match(/GEMINI_API_KEY=(.*)/)?.[1] || '').trim()
const ai = new GoogleGenAI({ apiKey: key })
const models = process.argv.slice(2).length ? process.argv.slice(2) : ['gemini-3.8-flash']
await Promise.all(models.map(async (model) => {
  const t = Date.now()
  try {
    const r = await ai.models.generateContent({ model, contents: 'Reply with exactly: OK', config: { httpOptions: { timeout: 45000 } } })
    console.log(`${model}\t${Date.now() - t}ms\t${(r.text || '').trim().slice(0, 60)}`)
  } catch (e) { console.log(`${model}\t${Date.now() - t}ms\tERR ${String(e.message).slice(0, 200)}`) }
}))
