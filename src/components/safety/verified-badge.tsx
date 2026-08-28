import type { VerificationStatus } from "@/types";

/** Small "verified student" badge shown next to a display name. */
export function VerifiedBadge({
  verification,
  className = "",
}: {
  verification: VerificationStatus | null | undefined;
  className?: string;
}) {
  if (verification !== "verified") return null;
  return (
    <span
      title="Verified student email"
      className={`inline-flex items-center gap-0.5 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success ${className}`}
    >
      ✓ Verified
    </span>
  );
}
