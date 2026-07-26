/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "pdf-parse", "mammoth"],
  // Large document uploads go through /api/matters/[matterId]/documents so
  // ordinary Server Actions keep the default small body limit.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com https://*.supabase.co",
              "font-src 'self' data:",
              "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://api.openai.com https://*.supabase.co https://api.resend.com",
              "frame-src https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.supabase.co",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
