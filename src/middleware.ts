import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Flip to false (and push) to bring the site back online.
const MAINTENANCE_MODE = true;

const MAINTENANCE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex" />
<title>Everest — Temporarily Offline</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #1F2937; color: #F9FAFB; font-family: -apple-system, system-ui, sans-serif; }
  .card { text-align: center; max-width: 28rem; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #2ABFBF; }
  p { color: #9CA3AF; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Everest is temporarily offline</h1>
    <p>We're doing some maintenance. Please check back shortly.</p>
  </div>
</body>
</html>`;

export function middleware(request: NextRequest) {
  if (!MAINTENANCE_MODE) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  return new NextResponse(MAINTENANCE_PAGE, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "3600",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
