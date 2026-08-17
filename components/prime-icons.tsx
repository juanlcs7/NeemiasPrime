type IconProps = { className?: string };

export function PrimeArrowIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={`prime-arrow-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="22" height="22" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 16.5 16.5 7.5M10 7.5h6.5V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="16.5" r="1.25" fill="currentColor" />
    </svg>
  );
}
