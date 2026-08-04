import clsx from 'clsx'
import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/ocean', label: 'Ocean & Satellite' },
  { to: '/weather', label: 'Weather' },
  { to: '/species', label: 'Species / Biodiversity' },
  { to: '/fisheries', label: 'Fisheries' },
  { to: '/molecular', label: 'Molecular / eDNA' },
  { to: '/correlation', label: 'Correlation Studio' },
  { to: '/alerts', label: 'Risk & Anomaly Alerts' },
  { to: '/chat', label: 'NL Chatbot' },
  { to: '/admin', label: 'Admin / Data Status' },
]

export function NavSidebar() {
  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-ocean-200 bg-ocean-50 p-3 dark:border-ocean-800 dark:bg-ocean-950">
      <div className="mb-4 px-2 py-1">
        <span className="text-lg font-semibold text-ocean-900 dark:text-ocean-50">OASIS</span>
        <p className="text-xs text-ocean-500">Marine data platform</p>
      </div>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            clsx(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-ocean-600 text-white'
                : 'text-ocean-800 hover:bg-ocean-100 dark:text-ocean-200 dark:hover:bg-ocean-900',
            )
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
