import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { RequireAuth } from '@/components/RequireAuth'
import { useGeoLanguage } from '@/hooks/useGeoLanguage'
import { AdminPage } from '@/pages/AdminPage'
import { ChatbotPage } from '@/pages/ChatbotPage'
import { CorrelationPage } from '@/pages/CorrelationPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FisheriesPage } from '@/pages/FisheriesPage'
import { LoginPage } from '@/pages/LoginPage'
import { MolecularPage } from '@/pages/MolecularPage'
import { OceanExplorerPage } from '@/pages/OceanExplorerPage'
import { RiskAlertsPage } from '@/pages/RiskAlertsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SpeciesExplorerPage } from '@/pages/SpeciesExplorerPage'
import { WeatherExplorerPage } from '@/pages/WeatherExplorerPage'
import { useAuthStore } from '@/store/auth'

function App() {
  // A refresh restores the persisted token but not the profile (status is
  // intentionally not persisted). Revalidate once on mount: fetchProfile
  // loads the profile on success and clears the session on a 401, so a
  // stale token can't keep the user "logged in" against a server that has
  // already rejected it.
  useEffect(() => {
    const { accessToken, profile, fetchProfile } = useAuthStore.getState()
    if (accessToken && !profile) void fetchProfile()
  }, [])

  // Runs pre-login too, so the language is already right by the time
  // someone reaches the login screen — see useGeoLanguage.ts for why it's
  // silent-by-design and never overrides an explicit choice.
  useGeoLanguage()

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/ocean" element={<OceanExplorerPage />} />
        <Route path="/weather" element={<WeatherExplorerPage />} />
        <Route path="/species" element={<SpeciesExplorerPage />} />
        <Route path="/fisheries" element={<FisheriesPage />} />
        <Route path="/molecular" element={<MolecularPage />} />
        <Route path="/correlation" element={<CorrelationPage />} />
        <Route path="/alerts" element={<RiskAlertsPage />} />
        <Route path="/chat" element={<ChatbotPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
