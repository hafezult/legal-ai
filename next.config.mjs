/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "pdf-parse", "mammoth"],
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
}

export default nextConfig
