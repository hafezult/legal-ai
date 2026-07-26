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

  it("rejects localhost, private, cleartext HTTP, and invalid origins outside development", () => {
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        }),
      /absolute https origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        }),
      /absolute https origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://10.0.0.8",
        }),
      /absolute https origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://192.168.1.20",
        }),
      /absolute https origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "http://aether.example.com",
        }),
      /absolute https origin/
    )
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "not-a-url",
        }),
      /absolute https origin/
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

  it("requires a valid absolute public https origin outside development", () => {
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
        NEXT_PUBLIC_APP_URL: "http://aether.example.com",
      }),
      false
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
  it("flags loopback, private, CGNAT, TEST-NET, and metadata hosts", () => {
    assert.equal(isNonPublicAppHostname("localhost"), true)
    assert.equal(isNonPublicAppHostname("app.localhost"), true)
    assert.equal(isNonPublicAppHostname("127.0.0.1"), true)
    assert.equal(isNonPublicAppHostname("10.1.2.3"), true)
    assert.equal(isNonPublicAppHostname("172.20.0.5"), true)
    assert.equal(isNonPublicAppHostname("192.168.0.1"), true)
    assert.equal(isNonPublicAppHostname("169.254.169.254"), true)
    assert.equal(isNonPublicAppHostname("100.64.0.1"), true)
    assert.equal(isNonPublicAppHostname("100.127.255.255"), true)
    assert.equal(isNonPublicAppHostname("192.0.2.10"), true)
    assert.equal(isNonPublicAppHostname("198.51.100.1"), true)
    assert.equal(isNonPublicAppHostname("203.0.113.50"), true)
    assert.equal(isNonPublicAppHostname("::1"), true)
    assert.equal(isNonPublicAppHostname("fd12::1"), true)
    assert.equal(isNonPublicAppHostname("::"), true)
    assert.equal(isNonPublicAppHostname("::ffff:127.0.0.1"), true)
    assert.equal(isNonPublicAppHostname("::ffff:10.0.0.1"), true)
    assert.equal(isNonPublicAppHostname("0:0:0:0:0:ffff:7f00:1"), true)
    assert.equal(isNonPublicAppHostname("fec0::1"), true)
    assert.equal(isNonPublicAppHostname("ff02::1"), true)
    // Documentation prefix 2001:db8::/32 (RFC 3849)
    assert.equal(isNonPublicAppHostname("2001:db8::1"), true)
    assert.equal(isNonPublicAppHostname("2001:db8:abcd::"), true)
    assert.equal(isNonPublicAppHostname("[2001:db8::a]"), true)
    // Benchmarking / discard / local-use NAT64 special ranges
    assert.equal(isNonPublicAppHostname("198.18.0.1"), true)
    assert.equal(isNonPublicAppHostname("198.19.255.255"), true)
    assert.equal(isNonPublicAppHostname("224.0.0.1"), true)
    assert.equal(isNonPublicAppHostname("239.255.255.255"), true)
    assert.equal(isNonPublicAppHostname("240.0.0.1"), true)
    assert.equal(isNonPublicAppHostname("255.255.255.255"), true)
    assert.equal(isNonPublicAppHostname("2001:2::1"), true)
    assert.equal(isNonPublicAppHostname("100::1"), true)
    assert.equal(isNonPublicAppHostname("64:ff9b:1::1"), true)
    assert.equal(isNonPublicAppHostname("aether.example.com"), false)
    assert.equal(isNonPublicAppHostname("facebook.com"), false)
    assert.equal(isNonPublicAppHostname("8.8.8.8"), false)
    assert.equal(isNonPublicAppHostname("100.63.255.255"), false)
    assert.equal(isNonPublicAppHostname("100.128.0.1"), false)
    assert.equal(isNonPublicAppHostname("198.17.255.255"), false)
    assert.equal(isNonPublicAppHostname("198.20.0.1"), false)
    assert.equal(isNonPublicAppHostname("223.255.255.255"), false)
    assert.equal(isNonPublicAppHostname("2001:4860:4860::8888"), false)
    assert.equal(isNonPublicAppHostname("64:ff9b::1"), false)
  })

  it("rejects IPv6 documentation origins outside development", () => {
    assert.throws(
      () =>
        resolveAppBaseUrl({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://[2001:db8::1]",
        }),
      /absolute https origin/
    )
    assert.equal(
      isAppUrlConfigured({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://[2001:db8::10]",
      }),
      false
    )
  })
})
