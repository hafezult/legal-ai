import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { clientKeyFromRequest, isPlausibleClientIp } from "./request-ip.ts"

describe("isPlausibleClientIp", () => {
  it("accepts common IPv4 and IPv6 forms", () => {
    assert.equal(isPlausibleClientIp("203.0.113.10"), true)
    assert.equal(isPlausibleClientIp("127.0.0.1"), true)
    assert.equal(isPlausibleClientIp("::1"), true)
    assert.equal(isPlausibleClientIp("2001:db8::1"), true)
    assert.equal(isPlausibleClientIp("[2001:db8::1]"), true)
    assert.equal(isPlausibleClientIp("fe80::1%eth0"), true)
  })

  it("rejects empty, oversized, and non-IP values", () => {
    assert.equal(isPlausibleClientIp(""), false)
    assert.equal(isPlausibleClientIp("   "), false)
    assert.equal(isPlausibleClientIp("not-an-ip"), false)
    assert.equal(isPlausibleClientIp("999.1.1.1"), false)
    assert.equal(isPlausibleClientIp("1.2.3"), false)
    assert.equal(isPlausibleClientIp("a".repeat(65)), false)
    assert.equal(isPlausibleClientIp("203.0.113.10, 198.51.100.1"), false)
  })
})

describe("clientKeyFromRequest", () => {
  it("uses a validated x-real-ip and otherwise shares anonymous", () => {
    assert.equal(
      clientKeyFromRequest(
        new Request("https://example.com", {
          headers: { "x-real-ip": "203.0.113.44" },
        })
      ),
      "203.0.113.44"
    )
    assert.equal(
      clientKeyFromRequest(
        new Request("https://example.com", {
          headers: { "x-real-ip": "spoofed-client" },
        })
      ),
      "anonymous"
    )
    assert.equal(
      clientKeyFromRequest(
        new Request("https://example.com", {
          headers: { "x-forwarded-for": "203.0.113.99" },
        })
      ),
      "anonymous"
    )
    assert.equal(
      clientKeyFromRequest(new Request("https://example.com")),
      "anonymous"
    )
  })
})
