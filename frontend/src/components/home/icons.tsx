import type { SVGProps } from 'react'

// A handful of line icons, drawn inline. The project has no icon package,
// and eight glyphs don't justify adding one.
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

export const ArrowRight = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
export const Menu = (p: IconProps) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
export const Close = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const Waves = (p: IconProps) => (
  <Icon {...p}><path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" /></Icon>
)
export const Network = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="18" r="2.2" /><path d="M11 7l-5 9M13 7l5 9M7.2 18h9.6" /></Icon>
)
export const Fish = (p: IconProps) => (
  <Icon {...p}><path d="M3 12c3-5 9-6.5 13-3l4-3v12l-4-3c-4 3.5-10 2-13-3z" /><circle cx="8" cy="11" r="0.8" fill="currentColor" /></Icon>
)
export const Leaf = (p: IconProps) => (
  <Icon {...p}><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" /><path d="M5 19c3-4 6-6.5 10-8.5" /></Icon>
)
export const Radar = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l6-6" /><circle cx="12" cy="12" r="1" fill="currentColor" /></Icon>
)
export const ChartUp = (p: IconProps) => (
  <Icon {...p}><path d="M4 19h16" /><path d="M5 15l4-4 3 3 6-7" /><path d="M14 7h4v4" /></Icon>
)
export const ChevronDown = (p: IconProps) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>
