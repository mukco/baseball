import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Today from './pages/Today'
import PlayerProfile from './pages/PlayerProfile'
import Leaderboards from './pages/Leaderboards'

export default function App() {
  return (
    <div className="min-h-screen bg-bg-base">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/player/:id" element={<PlayerProfile />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
        </Routes>
      </main>
    </div>
  )
}
