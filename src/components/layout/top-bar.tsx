/**
 * Slim sticky top bar: hamburger menu (left). Location readout moved to
 * the feed below the type tabs; the picker owns its own detection.
 *
 * Glass chrome (per Figma): white/25 inside stroke, frosted translucent
 * fill so the feed blurs underneath on scroll. 0.25px renders as a 1px
 * hairline in CSS — the 25% opacity is the visible part of the spec.
 * Refraction/splay are 0 (no-ops); depth/dispersion are
 * Figma-proprietary with no CSS equivalent. (The top-down glass light
 * was tried as an inset highlight and removed — it read as an extra
 * stroke on the top edge.)
 */
export function TopBar({
  menu,
  memberCount,
}: {
  menu: React.ReactNode;
  memberCount: number | null;
}) {
  return (
    <header className="safe-top sticky top-0 z-40 rounded-b-[16px] border-b border-white/25 bg-app/70 backdrop-blur-xl">
      <div className="relative flex h-13 items-center justify-between pl-5 pr-2">
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
