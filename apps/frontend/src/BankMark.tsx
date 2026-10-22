/** Bank colonnade crossed by a ledger path; shared product and assistant identity. */
export function BankMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M5 11.5 16 5l11 6.5M6.5 13.5h19M8 15v9m8-9v6m8-6v9M5 27h22"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.5 23.5h6l4-4H26"
          stroke="var(--primary)"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="26" cy="19.5" r="2" fill="var(--primary)" />
      </svg>
    </span>
  );
}
