// One entry in the hash-chained audit list, plus the chain link that ties it to the entry before it.
import { memo, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Briefcase, Check, ChevronDown, Cpu, Link2, Scale, ShieldAlert, ShieldCheck, Sparkles, Unlink2, UserCheck } from 'lucide-react'
import type { AuditEntry } from '../../lib/audit'
import { navigate } from '../../lib/router'
import { Badge, cx, type Tone } from '../../ui/kit'
import { CopyButton, JsonView } from './bits'
import { GENESIS, absTime, actorKind, actorLabel, recomputeHash, relTime, shortHash, summarize, type ActorKind, type LinkState } from './utils'

export const KIND: Record<ActorKind, { tone: Tone; label: string; icon: (cls: string) => ReactNode; node: string }> = {
  ai: { tone: 'violet', label: 'AI step', icon: c => <Sparkles className={c} />, node: 'text-ink-200 border-line-strong bg-black/[0.04]' },
  verifier: { tone: 'cyan', label: 'Verifier', icon: c => <ShieldCheck className={c} />, node: 'text-teal-800 border-teal-600/30 bg-teal-500/[0.09]' },
  human: { tone: 'green', label: 'Human decision', icon: c => <UserCheck className={c} />, node: 'text-emerald-800 border-emerald-600/30 bg-emerald-500/[0.09]' },
  rules: { tone: 'amber', label: 'Rules engine', icon: c => <Scale className={c} />, node: 'text-amber-800 border-amber-600/30 bg-amber-500/[0.09]' },
  system: { tone: 'gray', label: 'System', icon: c => <Cpu className={c} />, node: 'text-ink-300 border-line bg-black/[0.03]' },
}

export function ActorChip({ actor }: { actor: string }) {
  const k = actorKind(actor)
  const K = KIND[k]
  return <Badge tone={K.tone} icon={K.icon('size-3')} className={k === 'ai' ? 'font-mono text-[11px]' : undefined}>{actorLabel(actor)}</Badge>
}

const LINE: Record<LinkState, string> = {
  idle: 'bg-black/[0.06]',
  ok: 'bg-emerald-500 ',
  broken: 'bg-rose-500 ',
  unchecked: 'bg-amber-500/[0.16]',
  scanning: 'bg-teal-500 ',
}

export type Below =
  | { kind: 'link'; state: LinkState; olderSeq: number; contents: boolean }
  | { kind: 'gap'; hidden: number }
  | { kind: 'genesis'; state: LinkState }
  | { kind: 'more' }
  | { kind: 'end' }

function belowLine(b: Below): string {
  if (b.kind === 'link' || b.kind === 'genesis') return LINE[b.state]
  return 'bg-transparent border-l border-dashed border-line-strong'
}

interface RowProps {
  entry: AuditEntry
  state: LinkState
  below: Below
  expanded: boolean
  onToggle: (seq: number) => void
  caseTitle: string | null
  now: number
  contentsBreak: boolean
}

export const AuditRow = memo(function AuditRow({ entry: e, state, below, expanded, onToggle, caseTitle, now, contentsBreak }: RowProps) {
  const kind = actorKind(e.actor)
  const K = KIND[kind]
  const cached = e.payload?.cached === true
  const summary = summarize(e.payload || {})
  const toggle = () => onToggle(e.seq)

  const nodeCls = state === 'broken' ? 'border-rose-600/60 bg-rose-500/[0.16] text-rose-800 '
    : state === 'ok' ? cx(K.node, 'ring-2 ring-emerald-600/50')
    : state === 'scanning' ? 'border-teal-600/60 bg-teal-500/[0.16] text-teal-800 '
    : K.node

  const cardCls = state === 'broken' ? 'border-rose-600/45 bg-rose-500/[0.07] '
    : state === 'scanning' ? ''
    : state === 'unchecked' ? 'opacity-60'
    : ''

  return (
    <li id={`audit-row-${e.seq}`} className="scroll-mt-24">
      <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
        {/* rail: node + line down to the link */}
        <div className="relative flex justify-center">
          <motion.div
            key={state === 'broken' ? 'b' : 'n'}
            animate={state === 'broken' ? { scale: [1, 1.25, 1], rotate: [0, -8, 8, 0] } : state === 'scanning' ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.5 }}
            className={cx('relative z-10 mt-1 grid size-9 place-items-center rounded-md border transition-colors duration-300', nodeCls)}
            title={K.label}>
            {state === 'broken' ? <ShieldAlert className="size-4" /> : K.icon('size-4')}
          </motion.div>
          {below.kind !== 'end' && <div className={cx('absolute left-1/2 top-10 bottom-0 w-px -translate-x-1/2 transition-colors duration-300', belowLine(below))} />}
        </div>

        {/* card */}
        <motion.div
          key={state === 'broken' ? 'card-b' : 'card'}
          animate={state === 'broken' ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.45 }}
          className={cx('glass min-w-0 rounded-lg transition-[box-shadow,opacity,background-color,border-color] duration-300', cardCls)}>
          <div className="cursor-pointer px-3.5 py-3 sm:px-4" onClick={toggle}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="font-mono text-[12px] font-medium text-ink-400">#{e.seq}</span>
              <ActorChip actor={e.actor} />
              <span className="font-mono text-[13px] font-medium text-ink-100">{e.action}</span>
              {cached && <Badge tone="amber">cached run</Badge>}
              {state === 'broken' && <Badge tone="red" icon={<ShieldAlert className="size-3" />}>tampered</Badge>}
              {state === 'unchecked' && <Badge tone="amber">downstream of break</Badge>}
              <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-400">
                <span title={absTime(e.ts)}>{relTime(e.ts, now)}</span>
                <button type="button" aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'}
                  onClick={ev => { ev.stopPropagation(); toggle() }}
                  className="grid size-6 place-items-center rounded-md hover:bg-black/[0.06] hover:text-ink-100 cursor-pointer">
                  <ChevronDown className={cx('size-4 transition-transform', expanded && 'rotate-180')} />
                </button>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {e.caseId && (
                <button type="button" onClick={ev => { ev.stopPropagation(); navigate(`/case/${e.caseId}`) }}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-black/[0.03] px-2 py-0.5 text-[12px] text-ink-200 transition-colors hover:border-line-strong hover:text-ink-100 cursor-pointer"
                  title={`Open case ${e.caseId}`}>
                  <Briefcase className="size-3 text-ink-400" /><span className="truncate">{caseTitle || e.caseId}</span>
                </button>
              )}
              {summary && <span className="order-last min-w-0 basis-full truncate font-mono text-[11.5px] text-ink-400 sm:order-none sm:flex-1 sm:basis-0">{summary}</span>}
              <span className={cx('ml-auto inline-flex items-center gap-1 font-mono text-[11px]', state === 'broken' ? 'text-rose-700' : state === 'ok' ? 'text-emerald-700' : 'text-ink-300')}>
                <span className="text-ink-400">hash</span> {shortHash(e.hash)}
              </span>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden">
                <div className="space-y-4 border-t border-line/70 px-3.5 py-4 sm:px-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Meta label="Recorded">{absTime(e.ts)}</Meta>
                    <Meta label="Actor"><span className="font-mono">{e.actor}</span></Meta>
                    <Meta label="Kind">{K.label}</Meta>
                    <Meta label="Case"><span className="font-mono">{e.caseId || 'none (global)'}</span></Meta>
                  </div>
                  <HashLine label="Entry hash · SHA-256" value={e.hash} tone={state === 'broken' ? 'red' : state === 'ok' ? 'green' : undefined} />
                  <HashLine label={e.prevHash === GENESIS ? 'Previous hash · genesis' : `Previous hash · links to #${e.seq - 1}`} value={e.prevHash} />
                  {state === 'broken' && <Forensics entry={e} contents={contentsBreak} />}
                  <div>
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">Payload</div>
                    <JsonView value={e.payload} danger={['tampered']} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* link to the previous entry */}
        {below.kind !== 'end' && <Connector below={below} entry={e} />}
      </div>
    </li>
  )
})

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className="truncate text-[12.5px] text-ink-100">{children}</div>
    </div>
  )
}

function HashLine({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className="flex items-start gap-2 rounded-lg border border-line/70 bg-ink-950/60 px-2.5 py-1.5">
        <code className={cx('min-w-0 flex-1 break-all font-mono text-[11.5px] leading-relaxed', tone === 'red' ? 'text-rose-700' : tone === 'green' ? 'text-emerald-700' : 'text-ink-200')}>{value}</code>
        <CopyButton text={value} label="Copy hash" />
      </div>
    </div>
  )
}

function Forensics({ entry, contents }: { entry: AuditEntry; contents: boolean }) {
  const [recomputed, setRecomputed] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (contents) recomputeHash(entry).then(h => { if (alive) setRecomputed(h) }).catch(() => undefined)
    return () => { alive = false }
  }, [entry, contents])
  return (
    <div className="rounded-md border border-rose-600/30 bg-rose-500/[0.07] p-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-rose-800"><ShieldAlert className="size-4" /> Why verification failed</div>
      {contents ? (
        <div className="space-y-1.5 font-mono text-[11.5px]">
          <div className="flex flex-wrap gap-x-2"><span className="w-28 shrink-0 text-ink-400">signed hash</span><span className="break-all text-ink-200">{entry.hash}</span></div>
          <div className="flex flex-wrap gap-x-2"><span className="w-28 shrink-0 text-ink-400">recomputed now</span><span className="break-all text-rose-700">{recomputed ?? 'computing…'}</span></div>
          <p className="pt-1 font-sans text-[12.5px] leading-relaxed text-ink-300">The contents of this entry no longer produce the hash it was signed with, so someone changed it after the fact. Entry #{entry.seq + 1} still points at the original hash, which is how the edit is caught.</p>
        </div>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-ink-300">This entry's previous-hash pointer does not match the hash of entry #{entry.seq - 1}. An entry was inserted, removed, or reordered here.</p>
      )}
    </div>
  )
}

function Connector({ below, entry }: { below: Below; entry: AuditEntry }) {
  const line = belowLine(below)
  let icon: ReactNode = null
  let label: ReactNode = null
  if (below.kind === 'link' || below.kind === 'genesis') {
    const target = below.kind === 'link' ? `#${below.olderSeq}` : 'genesis'
    const s = below.state
    icon = s === 'broken' ? <Unlink2 className="size-3 rotate-90" /> : s === 'ok' ? <Check className="size-3" /> : <Link2 className="size-3 rotate-90" />
    const contents = below.kind === 'link' && below.contents
    label = s === 'broken'
      ? contents
        ? <span className="text-rose-700">#{below.kind === 'link' ? below.olderSeq : ''} was edited after signing. Its contents no longer hash to {shortHash(entry.prevHash)}, the value this entry points to.</span>
        : <span className="text-rose-700">prevHash {shortHash(entry.prevHash)} does not match the hash of {target}.</span>
      : s === 'unchecked'
        ? <span className="text-amber-800">Not trusted: comes after the break.</span>
        : <span className={s === 'ok' ? 'text-emerald-700' : s === 'scanning' ? 'text-teal-800' : 'text-ink-400'}>
            <span className="text-ink-400">prevHash</span> {shortHash(entry.prevHash)} {s === 'ok' ? '=' : '→'} <span className="text-ink-400">hash of</span> {target}
          </span>
  } else if (below.kind === 'gap') {
    label = <span className="text-ink-400">{below.hidden} {below.hidden === 1 ? 'entry' : 'entries'} hidden by filters</span>
  } else if (below.kind === 'more') {
    label = <span className="text-ink-400">older entries below</span>
  }
  const iconCls = below.kind === 'link' || below.kind === 'genesis'
    ? below.state === 'broken' ? 'border-rose-600/60 bg-rose-500/[0.16] text-rose-800'
      : below.state === 'ok' ? 'border-emerald-600/50 bg-emerald-500/[0.135] text-emerald-800'
      : below.state === 'scanning' ? 'border-teal-600/60 bg-teal-500/[0.135] text-teal-800'
      : below.state === 'unchecked' ? 'border-amber-600/30 bg-ink-900 text-amber-800'
      : 'border-line bg-ink-900 text-ink-400'
    : ''
  return (
    <>
      <div className="relative flex h-10 justify-center">
        <div className={cx('absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-300', line)} />
        {icon && (
          <motion.div key={below.kind === 'link' || below.kind === 'genesis' ? below.state : 'x'}
            initial={below.kind === 'link' && below.state === 'broken' ? { scale: 0.4, rotate: -30 } : false}
            animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12, stiffness: 260 }}
            className={cx('relative z-10 my-auto grid size-5 place-items-center rounded-full border transition-colors duration-300', iconCls)}>
            {icon}
          </motion.div>
        )}
      </div>
      <div className="flex min-w-0 items-center font-mono text-[11px] leading-snug">{label}</div>
    </>
  )
}

export function GenesisNode({ ok }: { ok: boolean }) {
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
      <div className="flex justify-center">
        <div className={cx('grid size-9 place-items-center rounded-full border font-mono text-[10px] transition-colors duration-300', ok ? 'border-emerald-600/50 bg-emerald-500/[0.09] text-emerald-800' : 'border-line bg-black/[0.03] text-ink-400')}>0x0</div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-400">
        <span className="font-semibold text-ink-300">Genesis</span>
        <span className="truncate font-mono text-[11px]">{'0'.repeat(16)}…{'0'.repeat(4)}</span>
        <span className="hidden sm:inline">· the anchor every chain starts from</span>
      </div>
    </li>
  )
}
