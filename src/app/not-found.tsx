import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-faint">
        404
      </p>
      <h1 className="mt-2 text-xl font-semibold text-content">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-muted">
        This page doesn&apos;t exist, or the post may have expired or been
        removed.
      </p>
      <Link href="/rides" className="btn btn-primary mt-6 w-full">
        Browse rides
      </Link>
    </main>
  );
}
