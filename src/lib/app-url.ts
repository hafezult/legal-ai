const DEFAULT_LOCAL_PORT = "3000"

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

function withHttps(url: string): string {
  const normalized = normalizeBaseUrl(url)
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized
  }

  return `https://${normalized}`
}

export function getInternalAppUrl(): string {
  const internalAppUrl = normalizeBaseUrl(process.env.INTERNAL_APP_URL ?? "")
  if (internalAppUrl) {
    return internalAppUrl
  }

  const publicAppUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL ?? "")
  if (publicAppUrl) {
    return publicAppUrl
  }

  const vercelUrl = normalizeBaseUrl(process.env.VERCEL_URL ?? "")
  if (vercelUrl) {
    return withHttps(vercelUrl)
  }

  return `http://localhost:${process.env.PORT ?? DEFAULT_LOCAL_PORT}`
}
