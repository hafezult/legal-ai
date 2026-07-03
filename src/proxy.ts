import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher(["/app(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

export default clerkMiddleware((auth, req) => {
  const { userId } = auth()

  // Authenticated users visiting auth pages are sent to the platform
  if (isAuthRoute(req) && userId) {
    return NextResponse.redirect(new URL("/app", req.url))
  }

  // Unauthenticated users attempting to access the platform are redirected to sign-in
  if (isProtectedRoute(req)) {
    auth().protect()
  }
})

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
}
