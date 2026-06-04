import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const isProtectedRoute = createRouteMatcher(["/app(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

const hasClerkConfig =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY)

function authNotConfigured() {
  return NextResponse.json(
    {
      error:
        "Authentication is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.",
    },
    { status: 503 }
  )
}

function unauthenticatedMiddleware(req: NextRequest) {
  if (isProtectedRoute(req) || isAuthRoute(req)) {
    return authNotConfigured()
  }

  return NextResponse.next()
}

const configuredMiddleware = clerkMiddleware((auth, req) => {
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

export default hasClerkConfig ? configuredMiddleware : unauthenticatedMiddleware

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
}
