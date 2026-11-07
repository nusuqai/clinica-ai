/**
 * Renders a promise's value — for streaming a page in parts. Start the query in
 * the page without awaiting it, then hand the same promise to one or more
 * `<Suspense><Await>` pairs: the page shell renders at once, each part shows its
 * fallback until the data lands, and the query still runs only once.
 */
export async function Await<T>({
  promise,
  children,
}: {
  promise: Promise<T>;
  children: (value: T) => React.ReactNode;
}) {
  return <>{children(await promise)}</>;
}
