// Shared UI primitives. Warm-paper theme: ink type, hairline borders, one mint accent.
// Tokens live in src/index.css (@theme). Headlines use font-serif; labels use the .eyebrow mono style.
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LoaderCircle, X } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }

type BtnVariant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'success' | 'outline'
export function Button({ variant = 'subtle', size = 'md', loading, icon, children, className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-ink-100 text-paper border border-ink-100 hover:bg-[#2b2a27] hover:border-[#2b2a27]',
    success: 'bg-mint text-mint-ink border border-mint hover:bg-[#27bf89] hover:border-[#27bf89]',
    danger: 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 hover:border-rose-300',
    subtle: 'bg-paper-high text-ink-100 border border-line hover:border-line-strong hover:bg-white',
    outline: 'bg-transparent text-ink-100 border border-line-strong hover:border-ink-100',
    ghost: 'bg-transparent text-ink-300 border border-transparent hover:text-ink-100 hover:bg-black/[0.04]',
  }
  const s = { sm: 'h-8 px-3 text-[12.5px] gap-1.5', md: 'h-10 px-4 text-[13.5px] gap-2', lg: 'h-12 px-5 text-[14.5px] gap-2.5' }[size]
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={cx('inline-flex items-center justify-center rounded-[4px] font-medium tracking-[-0.005em] transition-colors duration-150 select-none whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep', v[variant], s, className)}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function Card({ children, className, glow }: { children: ReactNode; className?: string; glow?: boolean }) {
  return <div className={cx('glass rounded-lg', glow && 'ring-glow', className)}>{children}</div>
}

export type Tone = 'green' | 'red' | 'amber' | 'violet' | 'cyan' | 'gray' | 'pink'
const TONES: Record<Tone, string> = {
  green: 'bg-mint-pale text-[#0b6b4a] border-[#a9e3cb]',
  red: 'bg-rose-50 text-rose-800 border-rose-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  violet: 'bg-[#ecebe5] text-ink-100 border-line-strong',
  cyan: 'bg-teal-50 text-teal-800 border-teal-200',
  gray: 'bg-paper-high text-ink-300 border-line',
  pink: 'bg-rose-50 text-rose-800 border-rose-200',
}
export function Badge({ tone = 'gray', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-[3px] font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.06em] whitespace-nowrap', TONES[tone], className)}>{icon}{children}</span>
}

export function ModelChip({ model, ms, cached }: { model: string; ms?: number; cached?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-paper-high px-1.5 py-0.5 font-mono text-[10.5px] text-ink-300">
      <span className={cx('size-1.5 rounded-full', cached ? 'bg-amber-500' : 'bg-mint')} />{model}{typeof ms === 'number' && <span className="text-faint">· {(ms / 1000).toFixed(1)}s</span>}
      {cached && <span className="text-amber-700">· cached</span>}
    </span>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('eyebrow', className)}>{children}</div>
}

export function SectionTitle({ eyebrow, title, right, className }: { eyebrow?: string; title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="font-serif text-[22px] font-medium leading-tight tracking-[-0.02em] text-ink-100">{title}</h2>
      </div>
      {right}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) { return <LoaderCircle className={cx('size-4 animate-spin', className)} /> }

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#141414]/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 360 }}
            className={cx('glass-strong relative max-h-[88vh] w-full overflow-hidden rounded-lg', wide ? 'max-w-5xl' : 'max-w-xl')}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div className="font-serif text-[18px] font-medium tracking-[-0.015em]">{title}</div>
              <button onClick={onClose} className="rounded-[4px] p-1.5 text-ink-400 hover:bg-black/[0.05] hover:text-ink-100 cursor-pointer" aria-label="Close"><X className="size-4" /></button>
            </div>
            <div className="scrollbar-thin max-h-[calc(88vh-56px)] overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------- toasts
type ToastT = { id: number; text: string; tone: Tone }
let toastId = 0
const toastListeners = new Set<(t: ToastT[]) => void>()
let toasts: ToastT[] = []
export function toast(text: string, tone: Tone = 'gray') {
  const t = { id: ++toastId, text, tone }
  toasts = [...toasts, t]
  toastListeners.forEach(l => l(toasts))
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); toastListeners.forEach(l => l(toasts)) }, 4200)
}
const TOAST_BAR: Record<Tone, string> = { green: 'bg-mint', red: 'bg-rose-600', amber: 'bg-amber-500', violet: 'bg-ink-100', cyan: 'bg-teal-600', gray: 'bg-line-strong', pink: 'bg-rose-600' }
export function Toaster() {
  const [list, setList] = useState<ToastT[]>([])
  useEffect(() => { toastListeners.add(setList); return () => { toastListeners.delete(setList) } }, [])
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence>
        {list.map(t => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }}
            className="glass-strong pointer-events-auto flex max-w-sm overflow-hidden rounded-md text-[13px] leading-snug text-ink-100">
            <span className={cx('w-1 shrink-0', TOAST_BAR[t.tone])} />
            <span className="px-3.5 py-3">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ------------------------------------------------------------ count-up number
export function CountUp({ to, decimals = 0, prefix = '', suffix = '', duration = 1400 }: { to: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }) {
  const [v, setV] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let started = false
    const start = () => {
      if (started) return
      started = true
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration)
        const e = 1 - Math.pow(1 - p, 3)
        setV(to * e)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { start(); return () => cancelAnimationFrame(raf) }
    const io = new IntersectionObserver(([en]) => en.isIntersecting && start(), { threshold: 0.3 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to, duration])
  return <span ref={ref}>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="eyebrow mb-1 !text-[10px]">{label}</div>
      <div className="truncate text-[13.5px] text-ink-100">{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="rounded-md border border-line bg-paper-high p-3 text-ink-300">{icon}</div>
      <div className="font-serif text-[18px] font-medium tracking-[-0.015em]">{title}</div>
      <p className="max-w-md text-[13.5px] text-ink-400">{body}</p>
      {action}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="inline-flex cursor-pointer items-center gap-2.5 rounded-[4px] text-left text-[13.5px] text-ink-200 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-deep">
      <span className={cx('relative inline-block h-5 w-9 shrink-0 rounded-full border transition-colors', checked ? 'border-mint-deep bg-mint' : 'border-line-strong bg-paper-low')}>
        <span className={cx('absolute top-[1px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(20,20,20,.25)] transition-all', checked ? 'left-[17px]' : 'left-[1px]')} />
      </span>
      {label}
    </button>
  )
}

/** Mark: ink tile, paper "turn" arrow, mint check. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden data-id={id}>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#141414" />
      <path d="M22.5 11.2A8 8 0 1 0 24 16" stroke="#f7f5f0" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24.6 7.6v4.6H20" stroke="#f7f5f0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.2 16.2l2.6 2.6 5-5.2" stroke="#2fce96" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Lowercase mono wordmark, as on the site header. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cx('font-mono text-[17px] font-medium tracking-[-0.02em] text-ink-100', className)}>overturn</span>
}
