import BrowseRidesPage from "./rides/page";

/**
 * The landing page is retired: / renders the rides feed directly.
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
      searchParams={Promise.resolve({
        when: pick("when"),
        from: pick("from"),
        to: pick("to"),
        type: pick("type"),
      })}
    />
  );
}
