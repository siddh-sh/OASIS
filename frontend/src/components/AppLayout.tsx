import { Link, Outlet } from 'react-router-dom'
import { NavSidebar } from '@/components/NavSidebar'
import { ViewModeSwitcher } from '@/components/ViewModeSwitcher'
import { useAuth } from '@/hooks/useAuth'

export function AppLayout() {
  const { profile, logout } = useAuth()

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-ocean-950">
      <NavSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ocean-200 px-6 py-3 dark:border-ocean-800">
          <span className="text-sm text-ocean-600 dark:text-ocean-300">
            {profile ? `${profile.full_name ?? profile.email} · ${profile.role}` : 'Not signed in'}
          </span>
          <div className="flex items-center gap-4 text-sm">
            <ViewModeSwitcher />
            <Link to="/settings" className="text-ocean-600 hover:underline dark:text-ocean-300">
              Settings
            </Link>
            <button
              onClick={() => void logout()}
              className="rounded-md border border-ocean-300 px-3 py-1 text-ocean-700 hover:bg-ocean-100 dark:border-ocean-700 dark:text-ocean-200 dark:hover:bg-ocean-900"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
