import { useSyncExternalStore } from 'react'

function current() { return (location.hash.replace(/^#/, '') || '/') }
function subscribe(fn: () => void) { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn) }

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (current() === path) return
  if (opts.replace) {
    history.replaceState(history.state, '', '#' + path)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  location.hash = path
  window.scrollTo({ top: 0 })
}

export interface Route { path: string; parts: string[]; query: URLSearchParams }
let cacheKey = ''
let cacheVal: Route = { path: '/', parts: [], query: new URLSearchParams() }
function snapshot(): Route {
  const raw = current()
  if (raw === cacheKey) return cacheVal
  const [p, q] = raw.split('?')
  cacheKey = raw
  cacheVal = { path: p, parts: p.split('/').filter(Boolean), query: new URLSearchParams(q || '') }
  return cacheVal
}
export function useRoute(): Route { return useSyncExternalStore(subscribe, snapshot, snapshot) }
