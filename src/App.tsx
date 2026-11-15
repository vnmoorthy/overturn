import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, FileStack, History, Home as HomeIcon, Menu, Mic, Settings as SettingsIcon, Sparkles, X, Briefcase } from 'lucide-react'
import { navigate, useRoute } from './lib/router'
import { keySource } from './lib/gemini'
import { Logo, Toaster, cx } from './ui/kit'
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
    <div className="relative min-h-full">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="aurora-blob absolute -top-40 left-[10%] h-[520px] w-[520px] rounded-full bg-violet-600/20" />
        <div className="aurora-blob absolute top-[30%] right-[-10%] h-[480px] w-[480px] rounded-full bg-cyan-500/10" style={{ animationDelay: '-6s' }} />
        <div className="aurora-blob absolute bottom-[-20%] left-[30%] h-[420px] w-[420px] rounded-full bg-emerald-500/10" style={{ animationDelay: '-11s' }} />
        <div className="grid-bg absolute inset-0" />
      </div>

      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/8 bg-ink-950/80 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 font-semibold cursor-pointer"><Logo size={24} /> Overturn</button>
        <button onClick={() => setNavOpen(v => !v)} className="rounded-lg p-2 hover:bg-white/10 cursor-pointer" aria-label="Menu">{navOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      </div>

      <aside className={cx('fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-white/8 bg-ink-950/85 px-3 py-4 backdrop-blur-xl transition-transform lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
        <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-2.5 px-2 text-left cursor-pointer">
          <Logo />
          <div>
            <div className="text-[17px] font-semibold tracking-tight">Overturn</div>
            <div className="text-[11px] text-ink-400">Denials, quoted back.</div>
          </div>
        </button>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(n => {
            const active = n.path === '/' ? top === '/' : top === n.path
            const Icon = n.icon
            return (
              <button key={n.path} onClick={() => navigate(n.path === '/case' ? `/case/${lastCase || 'maria-cgm'}` : n.path === '/rehearse' ? `/rehearse/${lastCase || 'maria-cgm'}` : n.path)}
                className={cx('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors cursor-pointer', active ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100 hover:bg-white/[0.04]')}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.07]" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
                <Icon className="relative size-4" /><span className="relative">{n.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <button onClick={() => setTraceOpen(v => !v)} className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[12.5px] text-ink-300 hover:bg-white/[0.06] cursor-pointer">
            <span className="flex items-center gap-2"><Activity className="size-3.5 text-cyan-300" /> Agent trace</span>
            <span className="rounded-md bg-white/10 px-1.5 font-mono text-[11px]">{trace.length}</span>
          </button>
          <button onClick={() => navigate('/settings')} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11.5px] text-ink-400 hover:bg-white/[0.04] cursor-pointer">
            <Sparkles className="size-3.5 text-violet-300" />
            <span>Gemini · {ks === 'user' ? 'your key' : ks === 'demo' ? 'demo key (free tier)' : <span className="text-amber-300">no key — add one</span>}</span>
          </button>
          <div className="px-3 text-[10.5px] leading-relaxed text-ink-400/80">Synthetic demo data only. Not legal or medical advice.</div>
        </div>
      </aside>

      <main className="relative lg:pl-[248px]">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{page}</div>
      </main>

      <TracePanel open={traceOpen} onClose={() => setTraceOpen(false)} />
      <Toaster />
    </div>
  )
}
