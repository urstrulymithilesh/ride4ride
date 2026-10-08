/**
 * Slim sticky top bar: hamburger menu (left). Location readout moved to
 * the feed below the type tabs; the picker owns its own detection.
 */
export function TopBar({
  menu,
  memberCount,
}: {
  menu: React.ReactNode;
  memberCount: number | null;
}) {
  return (
    <header className="safe-top sticky top-0 z-40 bg-app/95 backdrop-blur">
      <div className="relative flex h-16 items-center justify-between pl-5 pr-2">
        <span className="relative">{menu}</span>
        {memberCount !== null && memberCount > 0 ? (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-sm text-muted">
            members joined: {memberCount}
          </span>
        ) : null}
        <span className="w-11" aria-hidden="true" />
      </div>
    </header>
  );
}
