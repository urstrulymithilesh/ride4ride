import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full">
        <Link
          href="/"
          className="mx-auto mb-8 flex min-h-11 items-center justify-center text-lg font-semibold tracking-tight text-content"
        >
          Ride4Ride
        </Link>
        {children}
      </div>
    </div>
  );
}
