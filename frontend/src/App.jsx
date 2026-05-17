import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import AssistantSidebar from './components/FloatingAssistant'
import Today from './pages/Today'
import GameDetails from './pages/GameDetails'
import PlayerProfile from './pages/PlayerProfile'
import TeamProfile from './pages/TeamProfile'
import Leaderboards from './pages/Leaderboards'
import News from './pages/News'
import Sandbox from './pages/Sandbox'
import LiveTV from './pages/LiveTV'
import DailySummary from './pages/DailySummary'
import Teams from './pages/Teams'

const THEME_STORAGE_KEY = 'statline-theme'

export default function App() {
  const location = useLocation()
  const fullWidthRoutes = new Set(['/news'])
  const mainWidthClass = fullWidthRoutes.has(location.pathname) ? 'max-w-none' : 'max-w-7xl'
  const [theme, setTheme] = useState(() => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.dataset.theme || 'light'
  })
  const [assistantOpen, setAssistantOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage errors (private mode, blocked storage)
    }
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        assistantOpen={assistantOpen}
        onToggleAssistant={() => setAssistantOpen((o) => !o)}
      />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <main className={`${mainWidthClass} mx-auto px-4 sm:px-6 lg:px-8 py-8`}>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/game/:gamePk" element={<GameDetails />} />
              <Route path="/player/:id" element={<PlayerProfile />} />
              <Route path="/team/:id" element={<TeamProfile />} />
              <Route path="/leaderboards" element={<Leaderboards />} />
              <Route path="/news" element={<News />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/live" element={<LiveTV />} />
              <Route path="/digest" element={<DailySummary />} />
              <Route path="/teams" element={<Teams />} />
            </Routes>
          </main>
        </div>
        <AssistantSidebar open={assistantOpen} />
      </div>
    </div>
  )
}
