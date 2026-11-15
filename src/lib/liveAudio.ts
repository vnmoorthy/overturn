// Browser audio plumbing for the Gemini Live API.
//  - MicCapture: getUserMedia -> AudioWorklet (inline) -> 16 kHz mono PCM16 chunks (base64)
//  - PcmPlayer: base64 PCM16 (24 kHz) -> gapless AudioBufferSourceNode scheduling, barge-in stop
// Both expose an AnalyserNode so the UI can draw real input/output levels.

export const MIC_RATE = 16000
export const MIC_MIME = `audio/pcm;rate=${MIC_RATE}`
export const OUT_RATE = 24000

// ------------------------------------------------------------------ base64
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step) as unknown as number[])
  return btoa(bin)
}
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
/** Sample rate from a mime type like "audio/pcm;rate=24000" (defaults to 24 kHz). */
export function rateOf(mimeType: string | undefined, fallback = OUT_RATE): number {
  const m = mimeType?.match(/rate=(\d+)/)
  return m ? Number(m[1]) : fallback
}

// ------------------------------------------------------------------ levels
function makeAnalyser(ctx: AudioContext): AnalyserNode {
  const a = ctx.createAnalyser()
  a.fftSize = 1024
  a.smoothingTimeConstant = 0.72
  return a
}
const scratch = new Float32Array(1024)
/** Raw time-domain RMS (0..1) of an analyser — used for voice-activity heuristics. */
export function analyserRms(a: AnalyserNode | null): number {
  if (!a) return 0
  const buf = scratch.length === a.fftSize ? scratch : new Float32Array(a.fftSize)
  a.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}
/** Perceptual 0..1 level (compressed RMS with a small noise gate) for visuals. */
export function analyserLevel(a: AnalyserNode | null): number {
  const v = Math.sqrt(analyserRms(a)) * 1.9 - 0.04
  return Math.max(0, Math.min(1, v))
}

// --------------------------------------------------------------- mic input
// Runs on the audio thread: two one-pole low-pass stages (anti-alias, ~7 kHz)
// then fractional box-filter decimation to 16 kHz, emitting Int16 chunks.
const WORKLET_SRC = `
class OverturnPcm16 extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.target = o.targetRate || 16000;
    this.ratio = sampleRate / this.target;
    this.chunk = o.chunkSamples || 800;
    this.buf = new Int16Array(this.chunk);
    this.n = 0; this.acc = 0; this.cnt = 0; this.pos = 0;
    this.a = 1 - Math.exp(-2 * Math.PI * Math.min(7000, this.target * 0.45) / sampleRate);
    this.y1 = 0; this.y2 = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.y1 += this.a * (ch[i] - this.y1);
      this.y2 += this.a * (this.y1 - this.y2);
      this.acc += this.y2; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let s = this.acc / this.cnt;
        this.acc = 0; this.cnt = 0;
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === this.chunk) {
          this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
          this.buf = new Int16Array(this.chunk);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('overturn-pcm16', OverturnPcm16);
`

export type MicErrorKind = 'denied' | 'notfound' | 'busy' | 'insecure' | 'unsupported' | 'other'
export class MicError extends Error {
  kind: MicErrorKind
  constructor(kind: MicErrorKind, message: string) { super(message); this.kind = kind }
}
function classifyMicError(e: unknown): MicError {
  if (e instanceof MicError) return e
  const name = (e as { name?: string })?.name || ''
  const msg = e instanceof Error ? e.message : String(e)
  if (name === 'NotAllowedError' || name === 'SecurityError' || /denied|permission/i.test(msg)) return new MicError('denied', 'Microphone permission was denied.')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new MicError('notfound', 'No microphone was found on this device.')
  if (name === 'NotReadableError' || name === 'AbortError') return new MicError('busy', 'The microphone is in use by another app.')
  return new MicError('other', msg || 'Could not start the microphone.')
}

export class MicCapture {
  readonly ctx: AudioContext
  readonly analyser: AnalyserNode
  private stream: MediaStream
  private source: MediaStreamAudioSourceNode
  private node: AudioWorkletNode
  private sink: GainNode
  private stopped = false

  private constructor(ctx: AudioContext, stream: MediaStream, source: MediaStreamAudioSourceNode, node: AudioWorkletNode, analyser: AnalyserNode, sink: GainNode) {
    this.ctx = ctx; this.stream = stream; this.source = source; this.node = node; this.analyser = analyser; this.sink = sink
  }

  /** Ask for the mic and build the capture graph. Throws MicError. */
  static async open(chunkMs = 50): Promise<MicCapture> {
    if (typeof window !== 'undefined' && !window.isSecureContext) throw new MicError('insecure', 'The microphone needs HTTPS or localhost.')
    if (!navigator.mediaDevices?.getUserMedia) throw new MicError('unsupported', 'This browser cannot capture microphone audio.')
    if (typeof AudioWorkletNode === 'undefined') throw new MicError('unsupported', 'This browser does not support AudioWorklet.')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (e) { throw classifyMicError(e) }
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
      try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
      const source = ctx.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(ctx, 'overturn-pcm16', {
        numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
        processorOptions: { targetRate: MIC_RATE, chunkSamples: Math.round((MIC_RATE * chunkMs) / 1000) },
      })
      const analyser = makeAnalyser(ctx)
      const sink = ctx.createGain()
      sink.gain.value = 0 // keep the worklet pulled by the graph without echoing the mic
      source.connect(analyser)
      source.connect(node)
      node.connect(sink).connect(ctx.destination)
      return new MicCapture(ctx, stream, source, node, analyser, sink)
    } catch (e) {
      stream.getTracks().forEach(t => t.stop())
      void ctx.close().catch(() => undefined)
      throw e instanceof MicError ? e : new MicError('unsupported', e instanceof Error ? e.message : String(e))
    }
  }

  /** Start emitting base64 PCM16 @16 kHz chunks. */
  start(onChunk: (base64: string) => void) {
    this.node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      if (this.stopped) return
      onChunk(bytesToBase64(new Uint8Array(ev.data)))
    }
  }

  /** Muting disables the track (silence, zero level) without tearing the graph down. */
  setEnabled(on: boolean) { this.stream.getAudioTracks().forEach(t => { t.enabled = on }) }
  get label(): string { return this.stream.getAudioTracks()[0]?.label || 'Microphone' }
  level() { return analyserLevel(this.analyser) }
  rms() { return analyserRms(this.analyser) }

  stop() {
    if (this.stopped) return
    this.stopped = true
    try { this.node.port.onmessage = null } catch { /* ignore */ }
    try { this.source.disconnect(); this.node.disconnect(); this.analyser.disconnect(); this.sink.disconnect() } catch { /* ignore */ }
    this.stream.getTracks().forEach(t => t.stop())
    void this.ctx.close().catch(() => undefined)
  }
}

// ------------------------------------------------------------ model output
export class PcmPlayer {
  readonly ctx: AudioContext
  readonly analyser: AnalyserNode
  private gain: GainNode
  private next = 0
  private sources = new Set<AudioBufferSourceNode>()
  private closed = false

  /** Construct inside a user gesture so autoplay policies let it start. */
  constructor() {
    let ctx: AudioContext
    try { ctx = new AudioContext({ sampleRate: OUT_RATE, latencyHint: 'interactive' }) } catch { ctx = new AudioContext({ latencyHint: 'interactive' }) }
    this.ctx = ctx
    this.gain = ctx.createGain()
    this.analyser = makeAnalyser(ctx)
    this.gain.connect(this.analyser).connect(ctx.destination)
    void ctx.resume().catch(() => undefined)
  }

  resume() { return this.ctx.resume().catch(() => undefined) }

  /** Queue one base64 PCM16 little-endian mono chunk for gapless playback. */
  enqueue(b64: string, rate = OUT_RATE) {
    if (this.closed) return
    const bytes = base64ToBytes(b64)
    const n = bytes.byteLength >> 1
    if (!n) return
    const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
    const buf = this.ctx.createBuffer(1, n, rate) // the context resamples if its own rate differs
    const ch = buf.getChannelData(0)
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.gain)
    const now = this.ctx.currentTime
    // Starting fresh (or after an underrun): leave a small cushion to absorb network jitter.
    if (this.next < now + 0.01) this.next = now + 0.06
    src.start(this.next)
    this.next += buf.duration
    this.sources.add(src)
    src.onended = () => { this.sources.delete(src) }
  }

  /** Barge-in: drop everything queued or playing. */
  interrupt() {
    for (const s of this.sources) { try { s.onended = null; s.stop() } catch { /* ignore */ } }
    this.sources.clear()
    this.next = 0
  }

  /** Seconds of audio still scheduled. */
  remaining() { return Math.max(0, this.next - this.ctx.currentTime) }
  get playing() { return this.sources.size > 0 && this.remaining() > 0 }
  level() { return analyserLevel(this.analyser) }

  close() {
    if (this.closed) return
    this.closed = true
    this.interrupt()
    try { this.gain.disconnect(); this.analyser.disconnect() } catch { /* ignore */ }
    void this.ctx.close().catch(() => undefined)
  }
}

let binScratch = new Uint8Array(512)
/** Fill `out` (0..1) with a log-ish spectrum of an analyser, for visualizers. */
export function analyserSpectrum(a: AnalyserNode | null, out: Float32Array) {
  out.fill(0)
  if (!a) return
  if (binScratch.length !== a.frequencyBinCount) binScratch = new Uint8Array(a.frequencyBinCount)
  const bins = binScratch
  a.getByteFrequencyData(bins)
  // Voice lives in the low bins; map output bands onto ~80 Hz – 6 kHz logarithmically.
  const nyq = a.context.sampleRate / 2
  const lo = Math.max(1, Math.floor((80 / nyq) * bins.length))
  const hi = Math.min(bins.length - 1, Math.ceil((6000 / nyq) * bins.length))
  for (let i = 0; i < out.length; i++) {
    const f0 = lo * Math.pow(hi / lo, i / out.length)
    const f1 = lo * Math.pow(hi / lo, (i + 1) / out.length)
    let m = 0
    for (let b = Math.floor(f0); b <= Math.max(Math.floor(f0), Math.floor(f1)); b++) m = Math.max(m, bins[b] || 0)
    out[i] = m / 255
  }
}
