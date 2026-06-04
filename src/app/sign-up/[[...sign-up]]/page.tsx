import { SignUp } from "@clerk/nextjs"
import { dark } from "@clerk/themes"

const hasClerkProvider = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-16">
      <div className="mb-10 text-center">
        <p className="font-serif text-2xl tracking-tight text-white/90">Aether</p>
        <p className="mt-2 text-sm text-white/45">Create your organization account</p>
      </div>
      {hasClerkProvider ? (
        <SignUp
          forceRedirectUrl="/app"
          appearance={{
            baseTheme: dark,
            variables: {
              colorBackground: "#0a0a0a",
              colorInputBackground: "#111111",
              colorPrimary: "#e4e4e7",
            },
            elements: {
              card: "border border-white/[0.08] shadow-2xl",
              headerTitle: "font-serif tracking-tight",
            },
          }}
        />
      ) : (
        <div className="max-w-md rounded-[var(--aether-radius-panel)] border border-amber-400/[0.16] bg-amber-400/[0.04] p-6 text-center">
          <p className="font-serif text-lg text-amber-200/80">Authentication is not configured</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-100/50">
            Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in
            .env.local to enable account creation.
          </p>
        </div>
      )}
    </div>
  )
}
