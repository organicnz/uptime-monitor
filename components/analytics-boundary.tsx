"use client";

import dynamic from "next/dynamic";

/**
 * The analytics script, in the browser only.
 *
 * The component works out which route the reader is on by reading the
 * URL, and a URL is runtime data: it is not known when the shell is
 * built, so a client component that reads one cannot be part of a
 * prerender. On a route with a dynamic segment that is not known ahead
 * of time, the framework reports it on every build.
 *
 * The measurement is a browser concern — the script is injected from an
 * effect anyway, once the page is interactive — so the component is
 * loaded in the browser and never on the server. `ssr: false` is the
 * framework's own way of saying that, and it is the difference between
 * a page that prerenders cleanly and one that carries a hole it can
 * never fill.
 */
const Analytics = dynamic(
  () => import("@vercel/analytics/next").then((module) => module.Analytics),
  { ssr: false },
);

export function AnalyticsBoundary() {
  return <Analytics />;
}
