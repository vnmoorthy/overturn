// Call console meter for the lab surface: 32 thin mint bars showing the live voice spectrum
// (provider mic or medical director output, whichever is louder), plus two channel level
// readouts. Reacts in real time to the same levels() feed the call hook exposes.
// The export keeps its historical name; the dark panel around it is composed in Rehearse.tsx.

import { useEffect, useRef, type RefObject } from 'react'
import { analyserSpectrum } from '../../lib/liveAudio'
import { DIRECTOR } from './context'
import type { CallActivity, CallPhase, Levels } from './useLiveCall'

type RGB = [number, number, number]
const MINT: RGB = [47, 206, 150]
const PAPER: RGB = [233, 231, 224]
const BARS = 32
const BANDS = 36

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`
const cxs = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function CallOrb({ phase, activity, muted, levels }: { phase: CallPhase; activity: CallActivity; muted: boolean; levels: () => Levels }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const outFill = useRef<HTMLSpanElement>(null)
  const inFill = useRef<HTMLSpanElement>(null)
  const live = useRef({ phase, activity, muted, levels })
  live.current = { phase, activity, muted, levels }

  useEffect(() => {
    const cv = canvas.current, el = wrap.current
    if (!cv || !el) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let w = 0, h = 0, dpr = 1
    let ready = false
    const resize = () => {
      const r = el.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = Math.max(1, r.width); h = Math.max(1, r.height)
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      if (ready) draw(performance.now()) // resizing clears the canvas; repaint even if rAF is throttled
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(el)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const spec = new Float32Array(BANDS)
    const sSpec = new Float32Array(BANDS)
    const sBar = new Float32Array(BARS)
    let micS = 0, outS = 0
    let raf = 0

    const draw = (now: number) => {
      const { phase, activity, muted, levels } = live.current
      const L = levels()
      micS += ((muted ? 0 : L.mic) - micS) * 0.24
      outS += (L.out - outS) * 0.24
      const director = outS >= micS && outS > 0.02

      analyserSpectrum(director ? L.outAnalyser : L.micAnalyser, spec)
      for (let i = 0; i < BANDS; i++) sSpec[i] += (spec[i] - sSpec[i]) * 0.3

      // channel readouts (DOM, no React re-render)
      if (outFill.current) outFill.current.style.transform = `scaleX(${Math.min(1, outS * 2.2).toFixed(3)})`
      if (inFill.current) inFill.current.style.transform = `scaleX(${Math.min(1, (muted ? 0 : micS) * 2.2).toFixed(3)})`

      const t = now / 1000
      const cy = h / 2
      const span = Math.min(w - 8, 460)
      const x0 = (w - span) / 2
      const step = span / BARS
      const bw = Math.max(2, Math.min(3, step * 0.24))
      const maxHalf = h * 0.46
      const waiting = phase === 'connecting' || (phase === 'live' && activity === 'thinking')
      const sweep = (t * 0.55) % 1.3 - 0.15 // scan position across the meter while waiting

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // baseline hairline
      ctx.fillStyle = rgba(PAPER, 0.1)
      ctx.fillRect(x0, Math.round(cy), span, 1)

      ctx.lineCap = 'round'
      ctx.lineWidth = bw
      for (let i = 0; i < BARS; i++) {
        // mirrored: low (voice-heavy) bands in the middle, highs at the edges
        const k = Math.abs(i - (BARS - 1) / 2) / (BARS / 2)
        const band = Math.min(BANDS - 1, Math.floor(k * BANDS * 0.85))
        const target = phase === 'live' ? sSpec[band] : 0
        sBar[i] += (target - sBar[i]) * 0.35
        let v = sBar[i]
        let color: RGB = PAPER
        let alpha = phase === 'ended' ? 0.14 : 0.24
        if (phase === 'live') { color = MINT; alpha = 0.32 + v * 0.68 }
        if (waiting) {
          const p = i / (BARS - 1)
          const d = reduce ? 0 : Math.exp(-Math.pow((p - sweep) / 0.07, 2))
          v = Math.max(v, d * 0.16)
          color = MINT
          alpha = Math.max(alpha, 0.28 + d * 0.6)
        }
        const half = Math.max(1.5, v * maxHalf)
        const x = x0 + step * (i + 0.5)
        ctx.strokeStyle = rgba(color, alpha)
        ctx.beginPath()
        ctx.moveTo(x, cy - half)
        ctx.lineTo(x, cy + half)
        ctx.stroke()
      }
    }
    const loop = (now: number) => { raf = requestAnimationFrame(loop); draw(now) }
    ready = true
    resize()
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [])

  const isLive = phase === 'live'
  const dirOn = isLive && activity === 'speaking'
  const youOn = isLive && activity === 'listening' && !muted

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={wrap} className="relative min-h-0 flex-1">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
      </div>
      <div className="mx-auto grid w-full max-w-[460px] grid-cols-2 gap-5 pt-3 font-mono text-[10px] uppercase tracking-[0.13em]" aria-hidden>
        <Channel tag="Out" name={DIRECTOR.short} on={dirOn} dim={!isLive} fill={outFill} />
        <Channel tag="In" name={muted && isLive ? 'You · muted' : 'You'} on={youOn} dim={!isLive} warn={muted && isLive} fill={inFill} />
      </div>
    </div>
  )
}

function Channel({ tag, name, on, dim, warn, fill }: { tag: string; name: string; on: boolean; dim: boolean; warn?: boolean; fill: RefObject<HTMLSpanElement | null> }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={cxs('truncate transition-colors duration-200', on ? 'text-mint' : warn ? 'text-rose-300' : dim ? 'text-[#8f8c84]' : 'text-[#b9b6ad]')}>{name}</span>
        <span className="text-[#8f8c84]">{tag}</span>
      </div>
      <span className="mt-1.5 block h-[2px] overflow-hidden bg-[rgba(247,245,240,0.1)]">
        <span ref={fill} className="block h-full origin-left bg-mint" style={{ transform: 'scaleX(0)' }} />
      </span>
    </div>
  )
}
