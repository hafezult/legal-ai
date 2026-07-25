import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveAppBaseUrl } from "./app-url.ts"

describe("resolveAppBaseUrl", () => {
  it("uses configured NEXT_PUBLIC_APP_URL and strips trailing slash", () => {
    assert.equal(
      resolveAppBaseUrl({
        NEXT_PUBLIC_APP_URL: "https://aether.example.com/",
      }),
      "https://aether.example.com"
    )
  })

  it("falls back to localhost only in development", () => {
    assert.equal(
      resolveAppBaseUrl({ NODE_ENV: "development" }),
      "http://localhost:3000"
    )
  })

  it("rejects missing app URL outside development", () => {
    assert.throws(
      () => resolveAppBaseUrl({ NODE_ENV: "production" }),
      /NEXT_PUBLIC_APP_URL is not configured/
    )
    assert.throws(
      () => resolveAppBaseUrl({ NODE_ENV: "test" }),
      /NEXT_PUBLIC_APP_URL is not configured/
    )
  })
})
