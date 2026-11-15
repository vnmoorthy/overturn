import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cx } from '../../ui/kit'

export function SettingsCard({ icon, title, sub, right, children, className, delay = 0, id }: {
  icon: ReactNode; title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; delay?: number; id?: string
}) {
  return (
    <motion.section id={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={cx('glass min-w-0 scroll-mt-24 rounded-lg', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-black/[0.03]">{icon}</div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink-100">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-400">{sub}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </motion.section>
  )
}

export function Note({ icon, children, tone = 'gray' }: { icon: ReactNode; children: ReactNode; tone?: 'gray' | 'amber' | 'violet' }) {
  const t = { gray: 'border-line/70 bg-black/[0.02] text-ink-300', amber: 'border-amber-600/25 bg-amber-500/[0.07] text-amber-800', violet: 'border-line-strong bg-black/[0.04] text-ink-200' }[tone]
  return (
    <div className={cx('flex gap-2.5 rounded-md border px-3.5 py-3 text-[12.5px] leading-relaxed', t)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener"
      className={cx('text-ink-200 underline decoration-violet-300/40 underline-offset-2 transition-colors hover:text-ink-200 hover:decoration-violet-200', className)}>
      {children}
    </a>
  )
}
