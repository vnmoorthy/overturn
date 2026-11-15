// Public outcome data: California DMHC Independent Medical Review determinations.
export interface ImrExample { id: string; year: number | string; determination: string; type: string; diagnosis: string; treatment: string; findings: string }
export interface ImrSegment { label: string; filter?: string; n: number; overturned: number; rate: number; examples: ImrExample[] }
export interface ImrData {
  source: string; source_url: string; retrieved: string; total_cases: number; year_range: [number, number]
  overall: { n: number; overturned: number; rate: number }
  by_type?: Record<string, { n: number; overturned: number; rate: number }>
  segments: Record<string, ImrSegment>
}

let data: ImrData | null = null
try {
  const mods = import.meta.glob('../data/imr.json', { eager: true, import: 'default' }) as Record<string, ImrData>
  data = Object.values(mods)[0] || null
} catch { /* node */ }

export function setImr(d: ImrData) { data = d }
export function imr(): ImrData | null { return data }
export function segment(key: string | null | undefined): ImrSegment | null {
  if (!data || !key) return null
  return data.segments?.[key] || null
}
/** Historical overturn rate for a policy family's segment, falling back to overall. */
export function overturnRate(segmentKey: string | null | undefined): { rate: number; n: number; label: string } {
  const s = segment(segmentKey)
  if (s && s.n > 0) return { rate: s.rate, n: s.n, label: s.label }
  if (data) return { rate: data.overall.rate, n: data.overall.n, label: 'All independent medical reviews' }
  return { rate: 0.6, n: 0, label: 'No outcome data loaded' }
}
