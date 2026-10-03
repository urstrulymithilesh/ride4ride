import Link from "next/link";

export function SiteFooter() {
  const link =
    "inline-flex min-h-11 items-center px-1 hover:text-content";
  return (
    <footer className="safe-bottom mt-auto border-t border-hairline">
      <div className="flex flex-col items-center justify-between gap-1 px-4 py-4 text-xs text-muted sm:flex-row">
        <p>© {new Date().getFullYear()} ride4ride</p>
        <nav aria-label="legal" className="flex items-center gap-4">
          <Link href="/rides" className={link}>
            browse
          </Link>
          <Link href="/privacy" className={link}>
            privacy
          </Link>
          <Link href="/terms" className={link}>
            terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
