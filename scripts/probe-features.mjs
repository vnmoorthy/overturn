import { GoogleGenAI, Modality } from '@google/genai'
import fs from 'fs'
const key = fs.readFileSync('.env', 'utf8').match(/GEMINI_API_KEY=(.*)/)[1].trim()
const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1beta' } })
const tasks = {
  tts: async () => {
    const r = await ai.models.generateContent({ model: 'gemini-3.8-flash-tts', contents: 'Say calmly: Your appeal is ready.', config: { responseModalities: ['AUDIO'], httpOptions: { timeout: 40000 } } })
    const p = r.candidates?.[0]?.content?.parts?.[0]?.inlineData
    return `${p?.mimeType} ${p?.data?.length}`
  },
  search_h: async () => {
    const r = await ai.models.generateContent({ model: 'gemini-4-hydrogen', contents: 'What is the CMS LCD ID for Glucose Monitors? One line.', config: { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: 'low' }, httpOptions: { timeout: 60000 } } })
    const md = r.candidates?.[0]?.groundingMetadata
    return (r.text || '').slice(0, 120) + ' | chunks=' + (md?.groundingChunks?.length || 0) + ' ' + (md?.groundingChunks?.[0]?.web?.uri || '').slice(0, 80)
  },
  live: async () => new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 25000)
    for (const model of ['gemini-3.8-live']) {
      try {
        const s = await ai.live.connect({ model, config: { responseModalities: [Modality.AUDIO], outputAudioTranscription: {} }, callbacks: {
          onmessage: (m) => { if (m.serverContent) { clearTimeout(timer); resolve(model + ' ok ' + (m.serverContent?.outputTranscription?.text || 'audio')); try { s.close() } catch {} } },
          onerror: (e) => { resolve(model + ' err ' + (e.message || e)) }, onclose: (e) => { resolve(model + ' closed ' + (e?.code || '') + ' ' + (e?.reason || '')) } } })
        s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Say hello.' }] }], turnComplete: true })
      } catch (e) { resolve(model + ' connect err ' + String(e.message).slice(0, 200)) }
    }
  }),
}
await Promise.all(Object.entries(tasks).map(async ([k, f]) => {
  const t = Date.now()
  try { const v = await f(); console.log(k, Date.now() - t + 'ms', v) } catch (e) { console.log(k, Date.now() - t + 'ms', 'ERR', String(e.message).slice(0, 220)) }
}))
process.exit(0)
