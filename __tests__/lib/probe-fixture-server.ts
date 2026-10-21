#!/usr/bin/env bun
/**
 * A tiny HTTP server for the probe tests.
 *
 * It runs in its own process on purpose. The test suite preloads
 * `@happy-dom/global-registrator`, which replaces the global `Response`
 * and `fetch` with DOM implementations — and a server built on those
 * cannot serve a real HTTP response. A separate process has the native
 * globals, so the probe talks to a genuine HTTP server.
 *
 * Prints `PORT=<n>` on stdout once it is listening, then serves until it
 * is killed.
 */
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/keyword":
        return new Response("the quick brown fox jumps over the lazy dog");
      case "/boom":
        return new Response("nope", { status: 500 });
      case "/redirect":
        return new Response(null, {
          status: 302,
          headers: { location: "/final" },
        });
      case "/echo-host":
        return new Response(request.headers.get("host") ?? "no-host");
      case "/echo-method":
        return new Response(
          `${request.method} ${request.headers.get("x-probe") ?? ""}`,
        );
      default:
        return new Response("hello", {
          headers: { "x-test": "yes", server: "testserver" },
        });
    }
  },
});

console.log(`PORT=${server.port}`);
