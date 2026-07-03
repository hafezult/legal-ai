/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "pdf-parse", "mammoth"],
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
}

export default nextConfig
