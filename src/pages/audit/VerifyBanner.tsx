// Big animated result banner for "Verify chain" (and the post-tamper prompt).
import { motion } from 'framer-motion'
import { FlaskConical, RotateCcw, ScanSearch, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { Button, cx } from '../../ui/kit'
import { shortHash, type VerifyRecord } from './utils'

export type BannerState =
  | { kind: 'scan'; done: number; total: number }
  | { kind: 'ok'; record: VerifyRecord; head: string }
  | { kind: 'broken'; record: VerifyRecord }
  | { kind: 'tamper'; seq: number }

const THEME = {
  scan: { wrap: 'border-cyan-400/30 from-cyan-500/[0.14] via-cyan-500/[0.04]', orb: 'bg-cyan-400/15 text-cyan-200 border-cyan-300/40', ring: 'border-cyan-300/50' },
  ok: { wrap: 'border-emerald-400/35 from-emerald-500/[0.16] via-emerald-500/[0.05]', orb: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/40', ring: 'border-emerald-300/50' },
  broken: { wrap: 'border-rose-400/40 from-rose-500/[0.18] via-rose-500/[0.06]', orb: 'bg-rose-500/20 text-rose-200 border-rose-300/50', ring: 'border-rose-300/60' },
  tamper: { wrap: 'border-amber-300/35 from-amber-400/[0.14] via-amber-400/[0.04]', orb: 'bg-amber-400/15 text-amber-200 border-amber-300/40', ring: 'border-amber-300/50' },
}

export function VerifyBanner({ state, onClose, onJump, onReseal, onVerify, resealing }: {
  state: BannerState; onClose: () => void; onJump: (seq: number) => void; onReseal: () => void; onVerify: () => void; resealing: boolean
}) {
  const t = THEME[state.kind]
  const Icon = state.kind === 'scan' ? ScanSearch : state.kind === 'ok' ? ShieldCheck : state.kind === 'broken' ? ShieldAlert : FlaskConical

  return (
    <motion.div
      key={state.kind}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={state.kind === 'broken' ? { opacity: 1, y: 0, scale: 1, x: [0, -10, 10, -6, 6, 0] } : { opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: state.kind === 'broken' ? 0.5 : 0.3, ease: 'easeOut' }}
      role="status" aria-live="polite"
      className={cx('relative overflow-hidden rounded-2xl border bg-gradient-to-r to-transparent p-5 backdrop-blur-xl sm:p-6', t.wrap)}>
      {/* sheen */}
      {state.kind !== 'scan' && (
        <motion.div aria-hidden initial={{ x: '-120%' }} animate={{ x: '220%' }} transition={{ duration: 1.3, ease: 'easeInOut', delay: 0.1 }}
          className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      )}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative grid size-14 shrink-0 place-items-center">
          <motion.span aria-hidden className={cx('absolute inset-0 rounded-2xl border', t.ring)}
            animate={{ scale: [1, 1.35], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
          <motion.div initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 11, stiffness: 240 }}
            className={cx('relative grid size-14 place-items-center rounded-2xl border', t.orb)}>
            <Icon className={cx('size-7', state.kind === 'scan' && 'animate-pulse')} />
          </motion.div>
        </div>

        <div className="min-w-0 flex-1">
          {state.kind === 'scan' && (
            <>
              <div className="text-lg font-semibold tracking-tight text-cyan-50 sm:text-xl">Recomputing SHA-256 hashes…</div>
              <div className="mt-1 font-mono text-[12.5px] text-cyan-100/80">{state.done.toLocaleString()} / {state.total.toLocaleString()} entries checked</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" animate={{ width: `${Math.round((state.done / Math.max(1, state.total)) * 100)}%` }} transition={{ duration: 0.08 }} />
              </div>
            </>
          )}
          {state.kind === 'ok' && (
            <>
              <div className="text-xl font-semibold tracking-tight text-emerald-50 sm:text-2xl">Chain intact · {state.record.checked.toLocaleString()} {state.record.checked === 1 ? 'entry' : 'entries'} verified</div>
              <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-emerald-100/75">
                Every entry's hash was recomputed from its contents and matched, and every entry points at the one before it. No record has been edited, removed, or reordered since it was written.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-emerald-200/70">
                <span>{state.record.ms < 1 ? '<1' : state.record.ms.toFixed(0)} ms</span>
                <span>head {shortHash(state.head, 10, 6)}</span>
                <span>SHA-256 · Web Crypto</span>
              </div>
            </>
          )}
          {state.kind === 'broken' && (
            <>
              <div className="text-xl font-semibold tracking-tight text-rose-50 sm:text-2xl">Tampering detected at entry #{state.record.brokenAt} — {state.record.reason}</div>
              <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-rose-100/75">
                {state.record.checked.toLocaleString()} {state.record.checked === 1 ? 'entry' : 'entries'} before it verified clean. Nothing from #{state.record.brokenAt} onward can be trusted until the record is investigated. The broken link is marked in red below.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" icon={<ShieldAlert className="size-3.5" />} onClick={() => state.record.brokenAt != null && onJump(state.record.brokenAt)}>Show entry #{state.record.brokenAt}</Button>
                <Button size="sm" variant="ghost" loading={resealing} icon={<RotateCcw className="size-3.5" />} onClick={onReseal}>Reseal (demo reset)</Button>
              </div>
            </>
          )}
          {state.kind === 'tamper' && (
            <>
              <div className="text-lg font-semibold tracking-tight text-amber-50 sm:text-xl">Entry #{state.seq} was edited behind the app's back</div>
              <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-amber-100/75">
                Its payload was changed directly in browser storage, the way someone might quietly fix a record after the fact. Its stored hash was left alone. Run Verify chain to see whether the math catches it.
              </p>
              <div className="mt-3">
                <Button size="sm" variant="primary" icon={<ShieldCheck className="size-3.5" />} onClick={onVerify}>Verify chain</Button>
              </div>
            </>
          )}
        </div>

        {state.kind !== 'scan' && (
          <button onClick={onClose} aria-label="Dismiss" className="absolute right-0 top-0 rounded-lg p-1.5 text-ink-400 hover:bg-white/10 hover:text-ink-100 cursor-pointer sm:static sm:self-start">
            <X className="size-4" />
          </button>
        )}
      </div>
    </motion.div>
  )
}
