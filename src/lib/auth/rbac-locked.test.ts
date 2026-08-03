import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { requireMatterPermissionLocked } from "./rbac.ts"

type RawResult = Array<{ role?: string; id?: string }>

function makeTx(args: {
  matter: {
    id: string
    userId: string | null
    organizationId: string | null
    status?: string
  } | null
  membershipRole?: string | null
}) {
  const calls: string[] = []
  const tx = {
    calls,
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join("?")
      if (sql.includes('"Matter"') && sql.includes("FOR UPDATE")) {
        calls.push(`matter-lock:${String(values[0])}`)
        return [{ id: String(values[0]) }] satisfies RawResult
      }
      if (sql.includes('"OrganizationMember"') && sql.includes("FOR UPDATE")) {
        calls.push(
          `member-lock:${String(values[0])}:${String(values[1])}`
        )
        if (!args.membershipRole) return [] satisfies RawResult
        return [{ role: args.membershipRole }] satisfies RawResult
      }
      throw new Error(`Unexpected raw SQL: ${sql}`)
    },
    matter: {
      async findFirst() {
        calls.push("matter-find")
        return args.matter
      },
    },
  }
  return tx
}

describe("requireMatterPermissionLocked", () => {
  it("locks OrganizationMember after Matter for org matters and allows write", async () => {
    const tx = makeTx({
      matter: {
        id: "matter_1",
        userId: "user_1",
        organizationId: "org_1",
        status: "active",
      },
      membershipRole: "member",
    })

    const result = await requireMatterPermissionLocked(
      tx as never,
      "user_1",
      "matter_1",
      "write"
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.access.role, "member")
      assert.equal(result.access.organizationId, "org_1")
    }
    assert.deepEqual(tx.calls, [
      "matter-lock:matter_1",
      "matter-find",
      "member-lock:org_1:user_1",
    ])
  })

  it("denies org matters when membership row is missing under lock", async () => {
    const tx = makeTx({
      matter: {
        id: "matter_1",
        userId: "user_1",
        organizationId: "org_1",
      },
      membershipRole: null,
    })

    const result = await requireMatterPermissionLocked(
      tx as never,
      "user_1",
      "matter_1",
      "write"
    )

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /Insufficient organization role/)
    }
    assert.deepEqual(tx.calls, [
      "matter-lock:matter_1",
      "matter-find",
      "member-lock:org_1:user_1",
    ])
  })

  it("denies org matters when locked membership is viewer for write", async () => {
    const tx = makeTx({
      matter: {
        id: "matter_1",
        userId: "user_1",
        organizationId: "org_1",
      },
      membershipRole: "viewer",
    })

    const result = await requireMatterPermissionLocked(
      tx as never,
      "user_1",
      "matter_1",
      "write"
    )

    assert.equal(result.ok, false)
  })

  it("skips membership lock for legacy personal matters and grants creator owner", async () => {
    const tx = makeTx({
      matter: {
        id: "matter_personal",
        userId: "user_1",
        organizationId: null,
      },
    })

    const result = await requireMatterPermissionLocked(
      tx as never,
      "user_1",
      "matter_personal",
      "delete"
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.access.role, "owner")
      assert.equal(result.access.isCreator, true)
    }
    assert.deepEqual(tx.calls, ["matter-lock:matter_personal", "matter-find"])
  })
})
