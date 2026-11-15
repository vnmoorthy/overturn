// Gemini API key: source, paste/save/remove, and a live connection test.
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, CircleX, ExternalLink, Eye, EyeOff, KeyRound, Lock, PlugZap, Trash2 } from 'lucide-react'
import { ai, friendlyError, getUserKey, keySource, setUserKey } from '../../lib/gemini'
import { Badge, Button, ModelChip, cx, toast } from '../../ui/kit'
import { ExtLink, Note, SettingsCard } from './parts'

const TEST_MODEL = 'gemini-3.5-flash-lite'
const TEST_TIMEOUT = 20_000

type TestState =
  | { s: 'idle' }
  | { s: 'running' }
  | { s: 'ok'; ms: number; reply: string; via: 'user' | 'demo' | 'none' }
  | { s: 'err'; error: string }

const mask = (k: string) => (k.length > 10 ? `${k.slice(0, 4)}${'•'.repeat(8)}${k.slice(-4)}` : '•'.repeat(k.length))

export function ApiKeyCard({ delay, onChange }: { delay?: number; onChange?: () => void }) {
  const [src, setSrc] = useState(keySource())
  const [userKey, setUserKeyState] = useState(getUserKey())
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [test, setTest] = useState<TestState>({ s: 'idle' })

  const refresh = () => { setSrc(keySource()); setUserKeyState(getUserKey()); onChange?.() }
  const trimmed = draft.trim()
  const looksOdd = trimmed.length > 0 && !/^(AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_.-]{20,})$/.test(trimmed)

  const save = () => {
    if (!trimmed) return
    setUserKey(trimmed)
    setDraft(''); setShow(false); setTest({ s: 'idle' })
    refresh()
    toast('Key saved in this browser. Gemini calls now use your key.', 'green')
  }
  const remove = () => {
    setUserKey('')
    setTest({ s: 'idle' })
    refresh()
    toast(keySource() === 'demo' ? 'Your key was removed. Falling back to the demo key.' : 'Your key was removed from this browser.', 'gray')
  }
  const runTest = async () => {
    setTest({ s: 'running' })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TEST_TIMEOUT)
    const t0 = performance.now()
    try {
      const r = await ai().models.generateContent({ model: TEST_MODEL, contents: 'Reply OK', config: { abortSignal: ctrl.signal } })
      const ms = Math.round(performance.now() - t0)
      setTest({ s: 'ok', ms, reply: (r.text || '').trim().slice(0, 60) || '(empty reply)', via: keySource() })
    } catch (e) {
      const aborted = ctrl.signal.aborted || /abort/i.test(e instanceof Error ? e.message : String(e))
      setTest({ s: 'err', error: aborted ? `No reply within ${TEST_TIMEOUT / 1000}s. Gemini may be busy, so try again in a moment.` : friendlyError(e) })
    } finally {
      clearTimeout(timer)
    }
  }

  const badge = src === 'user' ? <Badge tone="green" icon={<KeyRound className="size-3" />}>Your key</Badge>
    : src === 'demo' ? <Badge tone="cyan">Demo key on free tier</Badge>
    : <Badge tone="red">None</Badge>

  return (
    <SettingsCard delay={delay} id="api-key" icon={<KeyRound className="size-4 text-ink-200" />} title="Gemini API key" right={badge}
      sub={src === 'user'
        ? <>Using your key <span className="font-mono text-ink-300">{mask(userKey)}</span>. Requests go straight from this browser to Gemini.</>
        : src === 'demo'
          ? 'Using the shared demo key on the free tier. Everyone trying the demo shares its rate limit, so add your own free key for reliable live runs.'
          : 'No key yet. Paste a free key to run cases live. Demo cases can still replay saved runs.'}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); save() }}>
        <label htmlFor="gemini-key" className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          {src === 'user' ? 'Replace with another key' : 'Paste your own key'}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <input id="gemini-key" type={show ? 'text' : 'password'} value={draft} onChange={e => setDraft(e.target.value)}
              placeholder="AIza… or AQ.…" autoComplete="off" spellCheck={false} autoCapitalize="off"
              className="h-10 w-full rounded-md border border-line bg-ink-950/60 pl-3.5 pr-11 font-mono text-[13px] text-ink-100 placeholder:text-ink-400/70 outline-none transition-colors focus:border-line-strong focus:bg-ink-950/80" />
            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide key' : 'Show key'}
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-black/[0.06] hover:text-ink-100 cursor-pointer">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!trimmed} className="flex-1 sm:flex-none">Save key</Button>
            {src === 'user' && <Button type="button" variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>Remove</Button>}
          </div>
        </div>
        {looksOdd && <div className="text-[12px] text-amber-800">Gemini API keys usually start with “AIza” or “AQ.”. Double-check you copied the whole key.</div>}
      </form>

      <div className="mt-5 rounded-md border border-line/70 bg-black/[0.02] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-ink-100">Test connection</div>
            <div className="text-[12px] text-ink-400">Sends “Reply OK” to <span className="font-mono">{TEST_MODEL}</span> with the active key and times the round trip.</div>
          </div>
          <Button variant="outline" icon={<PlugZap className="size-4 text-teal-700" />} loading={test.s === 'running'} disabled={src === 'none'} onClick={runTest}>
            {test.s === 'running' ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {test.s === 'ok' && (
            <motion.div key="ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-600/25 bg-emerald-500/[0.07] px-3 py-2 text-[13px] text-emerald-800">
              <CircleCheck className="size-4" /> Connected
              <ModelChip model={TEST_MODEL} ms={test.ms} />
              <span className="font-mono text-[11.5px] text-ink-300">{test.ms.toLocaleString()} ms · replied “{test.reply}”</span>
              <span className="text-[11.5px] text-ink-400">via {test.via === 'user' ? 'your key' : 'demo key'}</span>
            </motion.div>
          )}
          {test.s === 'err' && (
            <motion.div key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 flex items-start gap-2 rounded-lg border border-rose-600/25 bg-rose-500/[0.07] px-3 py-2 text-[13px] text-rose-800">
              <CircleX className="mt-0.5 size-4 shrink-0" /><span className="min-w-0">{test.error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener"
          className={cx('group flex items-center justify-between gap-3 rounded-md border border-line-strong bg-black/[0.04] px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-black/[0.04]')}>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-ink-200">Get a key at aistudio.google.com/apikey</div>
            <div className="text-[12px] text-ink-200">Free, no billing needed</div>
          </div>
          <ExternalLink className="size-4 shrink-0 text-ink-200 transition-transform group-hover:translate-x-0.5" />
        </a>
        <Note icon={<Lock className="size-3.5 text-ink-400" />}>
          Keys are stored only in this browser and sent only to Google’s Gemini API. Overturn has no server that could see them. <ExtLink href="https://ai.google.dev/gemini-api/docs/api-key">About API keys</ExtLink>
        </Note>
      </div>
    </SettingsCard>
  )
}
