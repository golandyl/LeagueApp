// Blue check mark shown next to players who signed the insurance form.
// `muted` renders a grey outline (used for the manager's toggle on unverified players).
export function VerifiedBadge({ muted = false, className = 'h-4 w-4' }: { muted?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`shrink-0 ${className}`} aria-hidden="true">
      <circle
        cx="10" cy="10" r="9"
        className={muted ? 'fill-transparent stroke-zinc-600' : 'fill-sky-500 stroke-sky-500'}
        strokeWidth="1.5"
      />
      <path
        d="M6 10.2l2.6 2.6L14 7.4"
        fill="none"
        className={muted ? 'stroke-zinc-600' : 'stroke-white'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
