import { createClient } from "@/lib/supabase/server";

async function getJoinedCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (typeof count === "number") return count;
  } catch {
    // Public count unavailable — fall back to the seed value.
  }
  return 2;
}

export default async function Home() {
  const joined = await getJoinedCount();

  return (
    <main className="flex w-full flex-1 flex-col bg-black px-5 pb-6 pt-8 text-white">
      <div className="-mx-5 flex h-16 items-center border-l-[3.75px] border-primary pl-3 pr-5">
        <div className="flex flex-wrap items-center gap-x-3">
          <p className="whitespace-nowrap text-4xl font-normal italic text-white/90">
            need ride?
          </p>
          <p className="text-xs text-white/60">
            request a ride from someone nearby
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <span className="rounded-full border border-white/25 bg-surface px-10 py-2 text-3xl font-bold tracking-wider text-white shadow-[0_0_24px_rgba(255,255,255,0.06)]">
          ride4ride.com
        </span>
        <p className="mt-8 text-sm text-white/70">
          yes, it&apos;s completely free • open to everyone
        </p>
        <p className="mt-8 text-sm text-white/85">
          users joined : {joined}
        </p>
      </div>

      <div className="-mx-5 flex h-16 items-center justify-end border-r-[3.75px] border-primary pl-5 pr-3">
        <p className="text-center text-3xl font-normal italic text-white/90">
          you can give rides too!
        </p>
      </div>

      <div aria-hidden="true" className="h-28" />

      <div className="text-center text-xs leading-relaxed text-white/60">
        <p>only log in when you&apos;re ready to connect</p>
        <p>all your info. is kept private</p>
      </div>
    </main>
  );
}
