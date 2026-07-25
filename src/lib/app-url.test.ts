import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isAppUrlConfigured, resolveAppBaseUrl } from "./app-url.ts"

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

  it("rejects localhost and invalid origins outside development", () => {
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        }),
      /absolute http\(s\) origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "not-a-url",
        }),
      /absolute http\(s\) origin/
    )
  })

  it("allows localhost when NODE_ENV is development", () => {
    assert.equal(
      resolveAppBaseUrl({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
      }),
      "http://localhost:3000"
    )
  })
})

describe("isAppUrlConfigured", () => {
  it("accepts localhost only in development", () => {
    assert.equal(
      isAppUrlConfigured({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
      true
    )
    assert.equal(
      isAppUrlConfigured({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
      false
    )
  })

  it("requires a valid absolute http(s) origin", () => {
    assert.equal(isAppUrlConfigured({ NODE_ENV: "production" }), false)
    assert.equal(
      isAppUrlConfigured({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "not-a-url",
      }),
      false
    )
    assert.equal(
      isAppUrlConfigured({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://aether.example.com",
      }),
      true
    )
  })
})
