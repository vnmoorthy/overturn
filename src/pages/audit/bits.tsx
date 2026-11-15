// Small building blocks shared by the Audit trail and Settings pages.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate } from 'framer-motion'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { Button, Modal, cx, toast } from '../../ui/kit'
import { copyText } from './utils'

/** Re-render on an interval so relative times stay fresh. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

/** Number that animates from its previous value to the new one (CountUp restarts from 0). */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(0)
  useEffect(() => {
    const ctrl = animate(prev.current, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: v => setShown(v) })
    prev.current = value
    return () => ctrl.stop()
  }, [value])
  return <span className={cx('tabular-nums', className)}>{Math.round(shown).toLocaleString('en-US')}</span>
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" aria-label={label} title={label}
      onClick={async e => {
        e.stopPropagation()
        if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1400) }
        else toast('Clipboard is blocked in this browser.', 'amber')
      }}
      className={cx('inline-grid size-6 shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-100 cursor-pointer', className)}>
      {done ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, icon, extra }: {
  open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: string; children: ReactNode
  confirmLabel: string; icon?: ReactNode; extra?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title}>
      <div className="flex gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-300">
          {icon ?? <TriangleAlert className="size-5" />}
        </div>
        <div className="min-w-0 space-y-2 text-sm leading-relaxed text-ink-300">{children}</div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        {extra}
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" loading={busy} autoFocus
          onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

/** Syntax-coloured, read-only JSON. Keys listed in `danger` are highlighted (e.g. a tampered field). */
export function JsonView({ value, danger = [], className }: { value: unknown; danger?: string[]; className?: string }) {
  const text = JSON.stringify(value, null, 2) ?? 'null'
  const out: ReactNode[] = []
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] && m[2]) {
      const key = m[1].slice(1, -1)
      out.push(<span key={i++} className={danger.includes(key) ? 'rounded bg-rose-500/25 px-0.5 text-rose-200' : 'text-violet-200'}>{m[1]}</span>, m[2])
    } else if (m[1]) out.push(<span key={i++} className="text-emerald-200/90">{m[1]}</span>)
    else if (m[3]) out.push(<span key={i++} className="text-amber-200">{m[3]}</span>)
    else if (m[4]) out.push(<span key={i++} className="text-cyan-200">{m[4]}</span>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return (
    <pre className={cx('scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/8 bg-ink-950/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink-300', className)}>
      {out}
    </pre>
  )
}
