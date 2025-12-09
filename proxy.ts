import { updateSession } from "@/lib/supabase/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  // CVE-2025-29927 (React2Shell) protection
  // Block requests with spoofed x-middleware-subrequest header
  if (request.headers.has("x-middleware-subrequest")) {
    return new NextResponse(null, { status: 403 });
  }

  // CVE-2025-66478 / CVE-2025-55182 protection
  // Block requests with spoofed x-middleware-prefetch header
  if (request.headers.has("x-middleware-prefetch")) {
    const prefetchValue = request.headers.get("x-middleware-prefetch");
    if (prefetchValue && prefetchValue !== "1") {
      return new NextResponse(null, { status: 403 });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * - api/cron (cron endpoints)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/cron).*)",
  ],
};
