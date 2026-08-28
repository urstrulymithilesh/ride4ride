import Link from "next/link";

export default function Home() {
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
          Browse rides
        </Link>
        <Link href="/sign-up" className="btn btn-secondary w-full">
          Create an account
        </Link>
      </div>
    </main>
  );
}
