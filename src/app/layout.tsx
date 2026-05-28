import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import "./globals.css"

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Aether — Legal intelligence infrastructure",
    template: "%s · Aether",
  },
  description:
    "Workflow orchestration, AI legal reasoning, and enterprise document intelligence for modern law firms.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
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
      </body>
    </html>
  )
}
