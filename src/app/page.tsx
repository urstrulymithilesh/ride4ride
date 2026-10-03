import Link from "next/link";
import { getSignupCount } from "@/lib/signup-count";

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="8" r="3.5" />
      <path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M18.5 8v6" />
      <path d="M15.5 11h6" />
    </svg>
  );
}

export default async function Home() {
  // Cached ~60s (see lib/signup-count). Null hides the line: no number
  // is better than a wrong number on the landing page.
  const memberCount = await getSignupCount();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center">
      <span className="chip mb-4 border border-hairline text-muted">
        For the student community
      </span>
      <h1 className="wrap-anywhere text-3xl font-semibold tracking-tight text-content">
        Share the ride. Split the trip.
      </h1>
      <p className="mt-4 text-base text-muted">
        Offer a ride you&apos;re already taking, or find one going your way.
        Browse freely — sign in when you&apos;re ready to connect.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <Link href="/rides" className="btn btn-primary w-full">
          <SearchIcon />
          Browse rides
        </Link>
        <Link href="/sign-up" className="btn btn-secondary w-full">
          <UserPlusIcon />
          Create an account
        </Link>
      </div>
      {memberCount !== null && memberCount > 0 ? (
        <p className="mt-6 text-sm text-muted">
          Joined by {memberCount} member{memberCount === 1 ? "" : "s"} and
          counting.
        </p>
      ) : null}
    </main>
  );
}
