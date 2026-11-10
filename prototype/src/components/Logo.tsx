export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="3.5" y="2.5" width="15" height="20" rx="2.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.4" />
      <path d="M7 8h8M7 11.5h6" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 15.5h4.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19.5" cy="18.5" r="3.2" fill="var(--accent)" />
    </svg>
  )
}
