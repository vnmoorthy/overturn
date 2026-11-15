// Canvas "voice orb": a glowing sphere with fluid layers and a spectrum ring that
// react in real time to mic input (provider) and model output (medical director).

import { useEffect, useRef } from 'react'
import { analyserSpectrum } from '../../lib/liveAudio'
import type { CallActivity, CallPhase, Levels } from './useLiveCall'

type RGB = [number, number, number]
const PAL: Record<string, [RGB, RGB]> = {
  idle: [[139, 109, 255], [34, 211, 238]],
  connecting: [[34, 211, 238], [124, 92, 255]],
  live: [[124, 92, 255], [34, 211, 238]],
  speaking: [[167, 139, 250], [244, 114, 182]],
  listening: [[52, 211, 153], [34, 211, 238]],
  thinking: [[124, 92, 255], [99, 102, 241]],
  ended: [[107, 115, 144], [154, 162, 189]],
}

const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`
const mix = (c: RGB, d: RGB, t: number): RGB => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t]

export function CallOrb({ phase, activity, muted, levels }: { phase: CallPhase; activity: CallActivity; muted: boolean; levels: () => Levels }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef({ phase, activity, muted, levels })
  live.current = { phase, activity, muted, levels }

  useEffect(() => {
    const cv = canvas.current, el = wrap.current
    if (!cv || !el) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let w = 0, h = 0, dpr = 1
    const resize = () => {
      const r = el.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = Math.max(1, r.width); h = Math.max(1, r.height)
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      if (ready) draw(performance.now()) // resizing clears the canvas; repaint even if rAF is throttled
    }
    let ready = false
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(el)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const N = 90
    const BANDS = 36
    const spec = new Float32Array(BANDS)
    const sSpec = new Float32Array(BANDS)
    const pts: [number, number][] = Array.from({ length: N }, () => [0, 0])
    let micS = 0, outS = 0
    let ca: RGB = [...PAL.idle[0]] as RGB, cb: RGB = [...PAL.idle[1]] as RGB
    let raf = 0

    const draw = (now: number) => {
      const { phase, activity, muted, levels } = live.current
      const L = levels()
      micS += ((muted ? 0 : L.mic) - micS) * 0.24
      outS += (L.out - outS) * 0.24
      const director = outS >= micS && outS > 0.02
      const e = Math.min(1, Math.max(micS, outS))

      const key = phase === 'live' ? (activity === 'idle' ? (director ? 'speaking' : 'live') : activity) : phase
      const [ta, tb] = PAL[key] || PAL.idle
      ca = mix(ca, ta, 0.07); cb = mix(cb, tb, 0.07)

      analyserSpectrum(director ? L.outAnalyser : L.micAnalyser, spec)
      for (let i = 0; i < BANDS; i++) sSpec[i] += (spec[i] - sSpec[i]) * 0.3

      const t = now / 1000
      const cx = w / 2, cy = h / 2
      const base = Math.min(w, h) * 0.25
      const breathe = reduce ? 0 : Math.sin(t * 1.5) * (phase === 'live' ? 0.008 : 0.016)
      const R = base * (1 + breathe + e * 0.09)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = phase === 'ended' ? 0.7 : 1

      // 1. ambient glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 2.7)
      glow.addColorStop(0, rgba(ca, 0.32 + e * 0.35))
      glow.addColorStop(0.45, rgba(cb, 0.1 + e * 0.16))
      glow.addColorStop(1, rgba(cb, 0))
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // 2. spectrum ring (mirrored so the top is the low end)
      const bars = 72
      const ringR = R * 1.36
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1.5, R * 0.024)
      for (let i = 0; i < bars; i++) {
        const ang = (i / bars) * Math.PI * 2 - Math.PI / 2 + (reduce ? 0 : t * 0.04)
        const k = i < bars / 2 ? i : bars - 1 - i
        const v = sSpec[Math.min(BANDS - 1, Math.floor((k / (bars / 2)) * BANDS))]
        const idle = reduce ? 0.03 : 0.035 + 0.025 * Math.sin(t * 2.2 + i * 0.55)
        const len = R * (0.025 + Math.max(v * 0.46, idle * (phase === 'live' ? 0.7 : 0.45)))
        const c = Math.cos(ang), s = Math.sin(ang)
        ctx.strokeStyle = rgba(i % 2 ? ca : cb, 0.28 + v * 0.7)
        ctx.beginPath()
        ctx.moveTo(cx + c * ringR, cy + s * ringR)
        ctx.lineTo(cx + c * (ringR + len), cy + s * (ringR + len))
        ctx.stroke()
      }

      // 3. fluid layers
      ctx.globalCompositeOperation = 'lighter'
      for (let layer = 0; layer < 3; layer++) {
        const amp = (reduce ? 0.008 : 0.02) + e * (0.17 - layer * 0.04)
        const ph = layer * 2.1
        const sp = reduce ? 0.2 : 1
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2
          const n = Math.sin(3 * a + t * (0.9 + layer * 0.3) * sp + ph) * 0.5
            + Math.sin(5 * a - t * (1.3 + layer * 0.2) * sp + ph * 1.7) * 0.3
            + Math.sin(2 * a + t * 0.6 * sp - ph) * 0.2
          const r = R * (1.02 + layer * 0.04) * (1 + amp * n)
          pts[i][0] = cx + Math.cos(a) * r
          pts[i][1] = cy + Math.sin(a) * r
        }
        ctx.beginPath()
        const m0x = (pts[0][0] + pts[1][0]) / 2, m0y = (pts[0][1] + pts[1][1]) / 2
        ctx.moveTo(m0x, m0y)
        for (let i = 1; i <= N; i++) {
          const p = pts[i % N], q = pts[(i + 1) % N]
          ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        }
        ctx.closePath()
        const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R * 1.3)
        const c1 = layer === 1 ? cb : ca, c2 = layer === 1 ? ca : cb
        g.addColorStop(0, rgba(c1, 0))
        g.addColorStop(0.62, rgba(c1, 0.16 + e * 0.1))
        g.addColorStop(1, rgba(c2, 0.34 + e * 0.15))
        ctx.fillStyle = g
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // 4. core sphere
      const cr = R * 0.9
      const core = ctx.createRadialGradient(cx - cr * 0.35, cy - cr * 0.42, cr * 0.04, cx, cy, cr)
      core.addColorStop(0, 'rgba(255,255,255,0.92)')
      core.addColorStop(0.2, rgba(mix(ca, [255, 255, 255], 0.45), 0.96))
      core.addColorStop(0.58, rgba(ca, 0.94))
      core.addColorStop(0.86, rgba(cb, 0.9))
      core.addColorStop(1, rgba(mix(cb, [5, 6, 10], 0.55), 0.95))
      ctx.beginPath()
      ctx.arc(cx, cy, cr, 0, Math.PI * 2)
      ctx.fillStyle = core
      ctx.fill()

      // inner swirl
      ctx.save()
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.clip()
      ctx.translate(cx, cy)
      ctx.rotate(reduce ? 0 : t * (0.35 + e * 1.2))
      for (let k = 0; k < 2; k++) {
        const ox = cr * (0.32 + k * 0.12), oy = cr * (k ? -0.2 : 0.28)
        const sg = ctx.createRadialGradient(ox, oy, 0, ox, oy, cr * (0.7 - k * 0.15))
        sg.addColorStop(0, rgba(k ? cb : [255, 255, 255], 0.22 + e * 0.25))
        sg.addColorStop(1, rgba(k ? cb : [255, 255, 255], 0))
        ctx.fillStyle = sg
        ctx.beginPath(); ctx.ellipse(ox, oy, cr * 0.75, cr * 0.42, k ? 0.8 : -0.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()

      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke()

      // 5. orbiting arc while connecting / waiting on the director
      if (phase === 'connecting' || (phase === 'live' && activity === 'thinking')) {
        const s = t * 2.8
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.2, s, s + Math.PI * 0.55)
        ctx.strokeStyle = rgba(cb, 0.85); ctx.lineWidth = 2.2; ctx.stroke()
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.2, s + Math.PI, s + Math.PI * 1.3)
        ctx.strokeStyle = rgba(ca, 0.6); ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    const loop = (now: number) => { raf = requestAnimationFrame(loop); draw(now) }
    ready = true
    resize()
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [])

  return (
    <div ref={wrap} className="relative h-full w-full">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  )
}
