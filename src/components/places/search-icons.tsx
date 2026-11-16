/**
 * The X that clears a filled search field. One definition so the feed
 * search, popup, and picker can't drift in size or weight.
 */
export function ClearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

/**
 * Hailing-person glyph: the waving figure with luggage, shared by the
 * feed dock's need-ride tab and the filter chips. Height-driven so each
 * surface picks its optical size (dock 22, chips 20).
 */
export function HailPersonIcon({ height = 22 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="45 20 137 181"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M72.08 196.42 C74.45 193.90 74.51 193.40 74.83 174.17 C75.11 157.14 74.92 154.07 73.45 151.30 C70.81 146.35 63.36 144.66 54.75 147.05 C48.56 148.77 48.00 150.94 48.00 173.37 L48.00 192.85L50.59 195.92 C53.09 198.90 53.44 199.00 61.41 199.00 C68.97 199.00 69.85 198.79 72.08 196.42 Z M105.46 198.38 C109.40 196.87 110.00 193.05 110.00 169.55 L110.00 147.00L118.43 147.00 L126.87 147.00L127.18 170.59 L127.50 194.18L130.31 196.59 C134.09 199.84 139.27 199.82 142.55 196.55 L145.00 194.09L145.03 136.80 L145.05 79.50L151.63 76.56 C164.19 70.95 174.39 57.64 178.48 41.54 C180.78 32.53 180.49 29.33 177.08 25.92 C171.50 20.35 163.86 23.34 162.50 31.64 C162.15 33.76 160.96 38.60 159.86 42.39 C158.20 48.10 156.97 50.16 152.60 54.53 C143.58 63.55 137.86 65.73 119.94 66.99 C104.13 68.10 99.67 69.17 88.50 74.54 C70.54 83.18 61.06 95.50 58.06 114.08 C56.43 124.24 60.53 130.14 68.07 128.48 C72.24 127.57 74.09 124.76 75.54 117.13 C77.04 109.25 79.02 104.80 82.86 100.66 C85.21 98.13 89.96 95.00 91.45 95.00 C91.75 95.00 92.00 117.02 92.00 143.92 L92.00 192.85L94.59 195.92 C97.18 199.01 101.36 199.95 105.46 198.38 Z M127.48 55.71 C142.74 47.07 136.06 22.94 118.43 23.02 C107.56 23.06 98.80 34.72 101.90 45.05 C105.26 56.26 117.50 61.37 127.48 55.71 Z"
      />
    </svg>
  );
}

/**
 * Person glyph (head and shoulders) from the Figma set. Used by the
 * dock menu trigger and the member-count pill. Height-driven; width
 * follows the viewBox aspect.
 */
export function PersonGlyph({ height = 12 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="35 10 97 110"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M128.44 115.78 C129.63 114.08 130.00 110.85 130.00 102.08 L130.00 90.60L124.19 84.95 C114.37 75.39 98.30 69.03 84.00 69.03 C69.70 69.03 53.63 75.39 43.81 84.95 L38.00 90.60L38.00 102.08 C38.00 110.85 38.37 114.08 39.56 115.78 L41.11 118.00L84.00 118.00 L126.89 118.00L128.44 115.78 Z M96.78 58.33 C99.59 56.59 102.65 53.50 104.47 50.55 C107.02 46.44 107.55 44.45 107.82 38.08 C108.11 30.99 107.92 30.15 104.82 25.04 C94.80 8.53 71.79 9.08 62.57 26.05 C55.48 39.08 61.70 55.39 75.75 60.63 C81.70 62.85 91.13 61.82 96.78 58.33 Z"
      />
    </svg>
  );
}

/**
 * Down chevron for the feed filter chips. Closed state only — the open
 * state (if any) is decided when chip behavior lands.
 */
export function ChevronDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}