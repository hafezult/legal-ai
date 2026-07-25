import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isAppUrlConfigured,
  isNonPublicAppHostname,
  resolveAppBaseUrl,
} from "./app-url.ts"

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

  it("rejects localhost, private, and invalid origins outside development", () => {
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
          NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        }),
      /absolute http\(s\) origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://10.0.0.8",
        }),
      /absolute http\(s\) origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://192.168.1.20",
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

  it("requires a valid absolute public http(s) origin", () => {
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
    assert.equal(
      isAppUrlConfigured({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://172.16.4.2",
      }),
      false
    )
  })
})

describe("isNonPublicAppHostname", () => {
  it("flags loopback, private, and metadata hosts", () => {
    assert.equal(isNonPublicAppHostname("localhost"), true)
    assert.equal(isNonPublicAppHostname("app.localhost"), true)
    assert.equal(isNonPublicAppHostname("127.0.0.1"), true)
    assert.equal(isNonPublicAppHostname("10.1.2.3"), true)
    assert.equal(isNonPublicAppHostname("172.20.0.5"), true)
    assert.equal(isNonPublicAppHostname("192.168.0.1"), true)
    assert.equal(isNonPublicAppHostname("169.254.169.254"), true)
    assert.equal(isNonPublicAppHostname("::1"), true)
    assert.equal(isNonPublicAppHostname("fd12::1"), true)
    assert.equal(isNonPublicAppHostname("aether.example.com"), false)
    assert.equal(isNonPublicAppHostname("facebook.com"), false)
    assert.equal(isNonPublicAppHostname("8.8.8.8"), false)
  })
})
