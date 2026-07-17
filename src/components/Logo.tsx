interface Props {
  size?: number
}

// Marque Echo : un cercle fin traverse par une onde, ivoire et or.
export function Logo({ size = 28 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14" stroke="rgba(242, 240, 234, 0.85)" strokeWidth="1.1" />
      <path
        d="M4 16 C 7 16, 7.5 9.8, 10.5 9.8 C 13.5 9.8, 13.5 22.2, 16.5 22.2 C 19.5 22.2, 19.5 11.5, 22.5 11.5 C 25 11.5, 25.8 16, 28 16"
        stroke="#dfb87e"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
