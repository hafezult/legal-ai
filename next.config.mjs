/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
}

export default nextConfig
