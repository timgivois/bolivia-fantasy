import Link from "next/link";

export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 7.2 8.2 10l1.45 4.4h4.7L15.8 10 12 7.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 2v5.2M8.2 10l-5.7-1.4M9.65 14.4 6.4 19.3M14.35 14.4l3.25 4.9M15.8 10l5.7-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ label }: { label: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bo-yellow/15 text-bo-yellow ring-1 ring-bo-yellow/40">
        <BallIcon className="h-5 w-5" />
      </span>
      <span className="text-base leading-tight font-extrabold tracking-tight text-white sm:text-lg">
        {label}
      </span>
    </Link>
  );
}
