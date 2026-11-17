import { BrowseRidesPage } from "./rides/page";

/**
 * Landing page: `/` is the need-ride (hail) feed. `/rides` serves
 * ride-available — the route picks the type, never the URL.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const pick = (key: string) => {
    const v = raw[key];
    return typeof v === "string" ? v : undefined;
  };
  return (
    <BrowseRidesPage
      rideType="get"
      searchParams={Promise.resolve({
        from: pick("from"),
        to: pick("to"),
        airport: pick("airport"),
        university: pick("university"),
      })}
    />
  );
}
