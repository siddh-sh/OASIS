// Line icons for the app shell, drawn on a 24px grid with a 1.6 stroke so
// they sit with Inter. Inline SVG rather than an icon package: ~20 glyphs
// don't justify a dependency.
type IconProps = { size?: number; className?: string }

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  )
}

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></Svg>
)
export const SatelliteIcon = (p: IconProps) => (
  <Svg {...p}><path d="M13 7 9 3 5 7l4 4" /><path d="m17 11 4 4-4 4-4-4" /><path d="m8 12 4 4 6-6-4-4Z" /><path d="m16 8 3-3" /><path d="M9 21a6 6 0 0 0-6-6" /></Svg>
)
export const WeatherIcon = (p: IconProps) => (
  <Svg {...p}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></Svg>
)
export const FishIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 12c3-5 8.5-5.5 13-0 -4.5 5.5-10 5-13 0Z" /><path d="M6.5 12 2 8.5v7Z" /><circle cx="16" cy="11" r=".6" fill="currentColor" /></Svg>
)
export const AnchorIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5V21" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /></Svg>
)
export const DnaIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 3c0 6 10 6 10 12s-10 3-10 6" /><path d="M17 3c0 6-10 6-10 12s10 3 10 6" /><path d="M8.5 7h7M8.5 17h7" /></Svg>
)
export const CorrelationIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 3v18h18" /><circle cx="8" cy="15" r="1.2" /><circle cx="12" cy="11" r="1.2" /><circle cx="16" cy="9" r="1.2" /><circle cx="19" cy="5" r="1.2" /></Svg>
)
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></Svg>
)
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></Svg>
)
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></Svg>
)
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>
)
export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Svg>
)
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
)
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
)
export const CollapseIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path d="m15 10-2 2 2 2" /></Svg>
)
export const ThermometerIcon = (p: IconProps) => (
  <Svg {...p}><path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0Z" /></Svg>
)
export const RadarIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m12 12 6.4-6.4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></Svg>
)
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
)
export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" /></Svg>
)
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></Svg>
)

/** The OASIS emblem — the same mark as the homepage navigation. */
export function OasisEmblem({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#16d9d0" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="2 3" />
      <circle cx="16" cy="16" r="10.5" fill="rgba(22,217,208,0.10)" stroke="#27c6d5" strokeWidth="1.2" />
      <path d="M9.5 16.5c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0 3.2-1.4 3.4-.2" fill="none" stroke="#a7f3e5" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.5 20c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0 3.2-1.4 3.4-.2" fill="none" stroke="#27c6d5" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="11.2" r="1.5" fill="#ff6384" />
    </svg>
  )
}
