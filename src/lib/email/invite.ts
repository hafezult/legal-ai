/**
 * Optional outbound invite email via Resend HTTP API.
 * When RESEND_API_KEY is unset, callers should fall back to copyable links / mailto.
 */

export type InviteEmailInput = {
  to: string
  organizationName: string
  inviteUrl: string
  role: string
  invitedByName?: string | null
}

export type InviteEmailResult =
  | { sent: true; provider: "resend" }
  | { sent: false; reason: "not_configured" | "request_failed"; detail?: string }

export function isInviteEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function resolveFromAddress() {
  const configured = process.env.RESEND_FROM_EMAIL?.trim()
  if (configured) return configured
  return "Aether <onboarding@resend.dev>"
}

export async function sendOrganizationInviteEmail(
  input: InviteEmailInput
): Promise<InviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { sent: false, reason: "not_configured" }
  }

  const inviter = input.invitedByName?.trim() || "A teammate"
  const subject = `Join ${input.organizationName} on Aether`
  const text = [
    `${inviter} invited you to join “${input.organizationName}” on Aether as ${input.role}.`,
    "",
    "1. Sign in (or create an account) with this email address.",
    `2. Open the invite link: ${input.inviteUrl}`,
    "",
    "The link expires in 14 days.",
  ].join("\n")

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.5;">
      <p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(
        input.organizationName
      )}</strong> on Aether as <strong>${escapeHtml(input.role)}</strong>.</p>
      <ol>
        <li>Sign in (or create an account) with this email address.</li>
        <li><a href="${escapeHtml(input.inviteUrl)}">Accept the invite</a></li>
      </ol>
      <p style="color: #555;">The link expires in 14 days.</p>
    </div>
  `.trim()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveFromAddress(),
        to: [input.to],
        subject,
        text,
        html,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      return {
        sent: false,
        reason: "request_failed",
        detail: detail.slice(0, 240) || `HTTP ${response.status}`,
      }
    }

    return { sent: true, provider: "resend" }
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError")
    return {
      sent: false,
      reason: "request_failed",
      detail: aborted
        ? "Resend request timed out"
        : error instanceof Error
          ? error.message
          : "Unknown email error",
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** Escape untrusted strings before interpolating into invite HTML bodies. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
