import { ClerkProvider } from "@clerk/nextjs"
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
    "Matter-scoped legal research, grounded drafting, and document intelligence for modern law firms.",
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
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  )
}
