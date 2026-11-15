import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, FileStack, History, Home as HomeIcon, Menu, Mic, Settings as SettingsIcon, X, Briefcase } from 'lucide-react'
import { navigate, useRoute } from './lib/router'
import { keySource } from './lib/gemini'
import { Logo, Toaster, Wordmark, cx } from './ui/kit'
import { TracePanel, useTraceLog } from './ui/TracePanel'
import Home from './pages/Home'
import Worklist from './pages/Worklist'
import Workspace from './pages/Workspace'
import Rehearse from './pages/Rehearse'
import Audit from './pages/Audit'
import Settings from './pages/Settings'

const NAV = [
  { path: '/', label: 'Overview', icon: HomeIcon },
  { path: '/cases', label: 'Denial worklist', icon: FileStack },
  { path: '/case', label: 'Case workspace', icon: Briefcase },
  { path: '/rehearse', label: 'P2P rehearsal', icon: Mic },
  { path: '/audit', label: 'Audit trail', icon: History },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function App() {
  const route = useRoute()
  const [traceOpen, setTraceOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const trace = useTraceLog()
  const lastCase = typeof localStorage !== 'undefined' ? localStorage.getItem('overturn_last_case') : null
  const ks = keySource()

  useEffect(() => { setNavOpen(false) }, [route.path])
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump(n => n + 1); window.addEventListener('overturn-key', f); return () => window.removeEventListener('overturn-key', f) }, [])
  useEffect(() => { document.title = 'Overturn — appeal denials with the insurer’s own rulebook' }, [])

  const top = '/' + (route.parts[0] || '')
  let page = <Home />
  if (top === '/cases') page = <Worklist />
  else if (top === '/case') page = <Workspace id={route.parts[1] || lastCase || 'maria-cgm'} />
  else if (top === '/rehearse') page = <Rehearse id={route.parts[1] || lastCase || 'maria-cgm'} />
  else if (top === '/audit') page = <Audit />
  else if (top === '/settings') page = <Settings />

  return (
    <div className="relative min-h-full bg-paper">
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 cursor-pointer"><Logo size={22} /><Wordmark /></button>
        <button onClick={() => setNavOpen(v => !v)} className="rounded-[4px] border border-line bg-paper-high p-2 hover:border-line-strong cursor-pointer" aria-label="Menu">{navOpen ? <X className="size-4" /> : <Menu className="size-4" />}</button>
      </div>

      {navOpen && <div className="fixed inset-0 z-20 bg-[#141414]/25 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside className={cx('fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-line bg-paper px-3 py-5 transition-transform lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
        <button onClick={() => navigate('/')} className="mb-7 flex items-center gap-2.5 px-2 text-left cursor-pointer">
          <Logo size={26} />
          <div className="leading-tight">
            <Wordmark />
            <div className="eyebrow mt-0.5 !text-[9.5px]">Denials, quoted back</div>
          </div>
        </button>
        <div className="eyebrow mb-2 px-3 !text-[9.5px]">Workspace</div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n, i) => {
            const active = n.path === '/' ? top === '/' : top === n.path
            const Icon = n.icon
            return (
              <button key={n.path} onClick={() => navigate(n.path === '/case' ? `/case/${lastCase || 'maria-cgm'}` : n.path === '/rehearse' ? `/rehearse/${lastCase || 'maria-cgm'}` : n.path)}
                aria-current={active ? 'page' : undefined}
                className={cx('group relative flex items-center gap-3 rounded-[5px] px-3 py-2 text-[13.5px] transition-colors cursor-pointer', active ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100 hover:bg-black/[0.035]')}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[5px] border border-line bg-paper-high shadow-[0_1px_2px_rgba(20,20,20,.04)]" transition={{ type: 'spring', damping: 32, stiffness: 420 }} />}
                {active && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-mint" />}
                <Icon className="relative size-[15px]" strokeWidth={1.75} />
                <span className="relative flex-1 text-left">{n.label}</span>
                <span className="relative font-mono text-[10px] text-faint">0{i + 1}</span>
              </button>
            )
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <button onClick={() => setTraceOpen(v => !v)} className="flex w-full items-center justify-between rounded-[5px] border border-line bg-paper-high px-3 py-2.5 text-[12.5px] text-ink-200 hover:border-line-strong cursor-pointer">
            <span className="flex items-center gap-2"><Activity className="size-3.5 text-mint-deep" strokeWidth={2} /> Agent trace</span>
            <span className="rounded-[3px] border border-line bg-paper px-1.5 font-mono text-[10.5px] text-ink-300">{trace.length}</span>
          </button>
          <button onClick={() => navigate('/settings')} className="flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-400 hover:bg-black/[0.035] cursor-pointer">
            <span className={cx('size-1.5 rounded-full', ks === 'none' ? 'bg-amber-500' : 'bg-mint')} />
            <span>Gemini · {ks === 'user' ? 'your key' : ks === 'demo' ? 'free demo key' : <span className="text-amber-700">no key — add one</span>}</span>
          </button>
          <div className="px-3 text-[10.5px] leading-relaxed text-faint">Synthetic demo data only. Not legal or medical advice.</div>
        </div>
      </aside>

      <main className="relative min-h-full overflow-x-clip lg:pl-[248px]">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{page}</div>
      </main>

      <TracePanel open={traceOpen} onClose={() => setTraceOpen(false)} />
      <Toaster />
    </div>
  )
}
