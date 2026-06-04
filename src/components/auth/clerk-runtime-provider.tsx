import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import type { ReactNode } from "react"

export function ClerkRuntimeProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorBackground: "#000000",
          colorInputBackground: "#0a0a0a",
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
