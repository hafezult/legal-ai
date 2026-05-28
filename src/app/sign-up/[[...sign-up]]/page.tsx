import { SignUp } from "@clerk/nextjs"
import { dark } from "@clerk/themes"

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-16">
      <div className="mb-10 text-center">
        <p className="font-serif text-2xl tracking-tight text-white/90">Aether</p>
        <p className="mt-2 text-sm text-white/45">Create your organization account</p>
      </div>
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
    </div>
  )
}
