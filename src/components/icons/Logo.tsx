export default function Logo({ className = "size-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#031633" />
          <stop offset="100%" stopColor="#1a2b49" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="4" fill="url(#logo-gradient)" />
      <path
        d="M20 10l-2 6h-4l-2 6h4l-2 6h4l2-6h4l2-6h-4l2-6h-4z"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 14l3 3m4-3l-3 3m-1 4l3 3m4-3l-3 3"
        fill="none"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M20 12v16M14 20h12"
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="3" fill="none" stroke="white" strokeWidth="1.5" />
      <path
        d="M17.5 13l-1 3.5M22.5 13l1 3.5M17.5 27l-1-3.5M22.5 27l1-3.5"
        fill="none"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
