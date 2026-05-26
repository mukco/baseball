import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import AssistantSidebar from './components/FloatingAssistant'
import { SandboxProvider, useSandbox } from './contexts/SandboxContext'
import Calculator from './components/Calculator'
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
import MLBuilder from './pages/MLBuilder'
import StatsReference from './pages/StatsReference'
import BaseballReference from './pages/BaseballReference'
import GamblingReference from './pages/GamblingReference'
import Prospects from './pages/Prospects'
import YahooFantasy from './pages/YahooFantasy'
import Gambling from './pages/Gambling'
import Transactions from './pages/Transactions'
import Projections from './pages/Projections'
import ScenarioBuilder from './pages/ScenarioBuilder'
import Simulation from './pages/Simulation'
import SimulationLeague from './pages/SimulationLeague'
import SimulationRoster from './pages/SimulationRoster'
import SimulationBoxScore from './pages/SimulationBoxScore'
import SimulationLeaders from './pages/SimulationLeaders'
import SimulationTeam from './pages/SimulationTeam'
import SimulationPlayer from './pages/SimulationPlayer'
import SimulationPlayoffs from './pages/SimulationPlayoffs'
import SimulationTeams from './pages/SimulationTeams'
import SimulationConfig from './pages/SimulationConfig'
import SimulationAwards from './pages/SimulationAwards'
import SimulationInjuries from './pages/SimulationInjuries'
import SimulationNews from './pages/SimulationNews'
import SimulationFranchise from './pages/SimulationFranchise'
import Settings from './pages/Settings'

const THEME_STORAGE_KEY = 'statline-theme'

function AppContent() {
  const location = useLocation()
  const mainWidthClass = 'max-w-7xl'
  const [theme, setTheme] = useState(() => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.dataset.theme || 'light'
  })
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [mlRunPayload, setMlRunPayload] = useState(null)
  const { openAssistantRef } = useSandbox()

  // Let sandbox context open the assistant sidebar programmatically
  useEffect(() => {
    openAssistantRef.current = setAssistantOpen
  }, [openAssistantRef])

  useEffect(() => {
    const handler = (e) => {
      setAssistantOpen(true)
      setMlRunPayload(e.detail)
    }
    window.addEventListener('statline:open-assistant', handler)
    return () => window.removeEventListener('statline:open-assistant', handler)
  }, [])

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
          <main className={`${mainWidthClass} mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8`}>
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
              <Route path="/ml" element={<MLBuilder />} />
              <Route path="/stats-reference" element={<StatsReference />} />
              <Route path="/baseball-reference" element={<BaseballReference />} />
              <Route path="/gambling-reference" element={<GamblingReference />} />
              <Route path="/prospects" element={<Prospects />} />
              <Route path="/fantasy" element={<YahooFantasy />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/gambling" element={<Gambling />} />
              <Route path="/projections" element={<Projections />} />
              <Route path="/projections/scenarios" element={<ScenarioBuilder />} />
              <Route path="/simulation" element={<Simulation />} />
              <Route path="/franchise/:id" element={<SimulationFranchise />} />
              <Route path="/simulation/:id" element={<SimulationLeague />} />
              <Route path="/simulation/:id/roster/:teamId" element={<SimulationRoster />} />
              <Route path="/simulation/:id/game/:gameId" element={<SimulationBoxScore />} />
              <Route path="/simulation/:id/leaders" element={<SimulationLeaders />} />
              <Route path="/simulation/:id/team/:teamId" element={<SimulationTeam />} />
              <Route path="/simulation/:id/player/:playerId" element={<SimulationPlayer />} />
              <Route path="/simulation/:id/playoffs" element={<SimulationPlayoffs />} />
              <Route path="/simulation/:id/teams" element={<SimulationTeams />} />
              <Route path="/simulation/:id/config" element={<SimulationConfig />} />
              <Route path="/simulation/:id/awards" element={<SimulationAwards />} />
              <Route path="/simulation/:id/injuries" element={<SimulationInjuries />} />
              <Route path="/simulation/:id/news" element={<SimulationNews />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
        <AssistantSidebar
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          mlRunPayload={mlRunPayload}
          onMlRunPayloadConsumed={() => setMlRunPayload(null)}
        />
      </div>

      {/* Floating calculator toggle */}
      <button
        onClick={() => setCalcOpen(o => !o)}
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        className={`fixed left-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
          calcOpen
            ? 'bg-brand text-white scale-95'
            : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary hover:border-brand/30 hover:shadow-brand/10'
        }`}
        title="Calculator"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <rect x="7" y="5" width="10" height="3.5" rx="0.5" />
          <circle cx="8"  cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="8"  cy="16" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
          <circle cx="8"  cy="20" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="20" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <Calculator open={calcOpen} onClose={() => setCalcOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <SandboxProvider>
      <AppContent />
    </SandboxProvider>
  )
}
