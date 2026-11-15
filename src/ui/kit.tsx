// Shared UI primitives. Dark "ink" theme; tokens live in src/index.css (@theme).
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LoaderCircle, Sparkles, X } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }

type BtnVariant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'success' | 'outline'
export function Button({ variant = 'subtle', size = 'md', loading, icon, children, className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-gradient-to-b from-[#8b6dff] to-[#6a4cf0] text-white shadow-[0_8px_30px_-8px_rgba(124,92,255,.7)] hover:brightness-110 border border-white/15',
    success: 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-ink-950 font-semibold shadow-[0_8px_30px_-8px_rgba(52,211,153,.6)] hover:brightness-110',
    danger: 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25',
    subtle: 'bg-white/[0.06] text-ink-100 border border-white/10 hover:bg-white/[0.1]',
    outline: 'bg-transparent text-ink-100 border border-white/15 hover:border-white/30 hover:bg-white/[0.04]',
    ghost: 'bg-transparent text-ink-300 hover:text-ink-100 hover:bg-white/[0.06]',
  }
  const s = { sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl' }[size]
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={cx('inline-flex items-center justify-center font-medium transition-all duration-150 select-none whitespace-nowrap active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer', v[variant], s, className)}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function Card({ children, className, glow }: { children: ReactNode; className?: string; glow?: boolean }) {
  return <div className={cx('glass rounded-2xl', glow && 'ring-glow', className)}>{children}</div>
}

export type Tone = 'green' | 'red' | 'amber' | 'violet' | 'cyan' | 'gray' | 'pink'
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-400/12 text-emerald-300 border-emerald-400/25',
  red: 'bg-rose-400/12 text-rose-300 border-rose-400/25',
  amber: 'bg-amber-300/12 text-amber-200 border-amber-300/25',
  violet: 'bg-violet-400/12 text-violet-200 border-violet-400/25',
  cyan: 'bg-cyan-400/12 text-cyan-200 border-cyan-400/25',
  gray: 'bg-white/[0.06] text-ink-300 border-white/10',
  pink: 'bg-pink-400/12 text-pink-200 border-pink-400/25',
}
export function Badge({ tone = 'gray', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap', TONES[tone], className)}>{icon}{children}</span>
}

export function ModelChip({ model, ms, cached }: { model: string; ms?: number; cached?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-ink-300">
      <Sparkles className="size-3 text-violet-300" />{model}{typeof ms === 'number' && <span className="text-ink-400">· {(ms / 1000).toFixed(1)}s</span>}
      {cached && <span className="text-amber-300">· cached</span>}
    </span>
  )
}

export function SectionTitle({ eyebrow, title, right, className }: { eyebrow?: string; title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">{eyebrow}</div>}
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">{title}</h2>
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={cx('glass-strong relative max-h-[88vh] w-full overflow-hidden rounded-2xl shadow-2xl', wide ? 'max-w-5xl' : 'max-w-xl')}>
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
              <div className="text-[15px] font-semibold">{title}</div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 hover:text-ink-100 cursor-pointer" aria-label="Close"><X className="size-4" /></button>
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
export function Toaster() {
  const [list, setList] = useState<ToastT[]>([])
  useEffect(() => { toastListeners.add(setList); return () => { toastListeners.delete(setList) } }, [])
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      <AnimatePresence>
        {list.map(t => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 30 }}
            className={cx('glass-strong pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-xl', TONES[t.tone])}>{t.text}</motion.div>
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
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className="truncate text-[13.5px] text-ink-100">{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="rounded-2xl bg-white/[0.05] p-3 text-ink-300">{icon}</div>
      <div className="text-[15px] font-semibold">{title}</div>
      <p className="max-w-md text-sm text-ink-400">{body}</p>
      {action}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink-200 select-none">
      <span onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
        className={cx('relative inline-block h-5 w-9 rounded-full transition-colors', checked ? 'bg-emerald-400/80' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
    </label>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  const gid = 'lg-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#a78bfa" /><stop offset=".55" stopColor="#22d3ee" /><stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#0b0d14" stroke={`url(#${gid})`} strokeWidth="1.6" />
      <path d="M22.5 11.2A8 8 0 1 0 24 16" stroke={`url(#${gid})`} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24.6 7.6v4.6H20" stroke={`url(#${gid})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.2 16.2l2.6 2.6 5-5.2" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
