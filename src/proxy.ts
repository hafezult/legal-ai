import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { SKIP_INVITE_AUTO_ACCEPT_HEADER } from "@/lib/auth/invite-auto-accept"

const isProtectedRoute = createRouteMatcher(["/app(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])
const isInviteRoute = createRouteMatcher(["/app/invites(.*)"])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  // Authenticated users visiting auth pages are sent to the platform
  if (isAuthRoute(req) && userId) {
    return NextResponse.redirect(new URL("/app", req.url))
  }

  // Unauthenticated users attempting to access the platform are redirected to sign-in
  if (isProtectedRoute(req)) {
    await auth.protect()
  }

  // Stamp the request (not response) so RSC `headers()` can read it.
  // Always strip a client-supplied skip header first so only invite routes
  // can suppress email auto-accept.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.delete(SKIP_INVITE_AUTO_ACCEPT_HEADER)
  if (isInviteRoute(req)) {
    requestHeaders.set(SKIP_INVITE_AUTO_ACCEPT_HEADER, "1")
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  })
})

export const config = {
  // Include authenticated upload APIs so Clerk stamps AuthStatus for auth().
  // Keep /api/health, /api/ready, and /api/index-document outside the matcher.
  matcher: [
    "/app(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/matters(.*)",
  ],
}
