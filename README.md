# Aether Legal AI

Aether is a Next.js legal intelligence workspace for matter-scoped document ingestion, indexing, semantic retrieval, grounded research, and evidence-bound drafting. The app combines Clerk authentication, Prisma/Postgres with pgvector, Supabase-backed document storage, and OpenAI embeddings/completions.

## Core workflow

1. Create a Clerk-authenticated user session.
2. Create a matter workspace.
3. Upload PDF, DOCX, or TXT source documents to a matter.
4. The indexing endpoint parses, chunks, embeds, and stores document vectors.
5. The research surface retrieves matter-scoped excerpts and generates grounded answers with source traceability.
6. The drafting surface prepares advice notes, skeletons, memos, and clause analyses from the same retrieval layer.

## Tech stack

- Next.js 16 App Router and React 18
- Clerk for authentication
- Prisma 5 with PostgreSQL and pgvector
- Supabase Storage for uploaded legal documents
- OpenAI embeddings and chat completions

## Local setup

Install dependencies:

```bash
npm install
```

Use Node.js 20.9 or newer (CI validates on Node.js 22).

Copy environment variables and fill in service credentials:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime PostgreSQL connection string for Prisma. |
| `DIRECT_URL` | Direct PostgreSQL connection string for migrations. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the browser. |
| `CLERK_SECRET_KEY` | Clerk server key for auth and user sync. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for server-side document storage. |
| `SUPABASE_DOCUMENT_BUCKET` | Storage bucket name; defaults to `legal-documents` in code. |
| `OPENAI_API_KEY` | Enables embeddings, semantic retrieval, and grounded answers. |
| `NEXT_PUBLIC_APP_URL` | Absolute app URL used for invite acceptance links. |
| `INDEXING_SECRET` | Shared secret for the optional `/api/index-document` HTTP trigger outside development (≥32 characters, non-placeholder). Upload/reindex run indexing in-process. Also accepted (when strong) as the fallback for `/api/ready` detail unlock. |
| `HEALTH_DETAIL_SECRET` | Optional. Prefer this for full `/api/ready` probe details via `x-aether-health-secret`. Same strength rules as `INDEXING_SECRET` (≥32 chars; weak placeholders never unlock details). |
| `RESEND_API_KEY` | Optional. When set, pending organization invites are emailed via Resend. |
| `RESEND_FROM_EMAIL` | Optional Resend from address (defaults to `Aether <onboarding@resend.dev>`). |
| `UPSTASH_REDIS_REST_URL` | Optional. Enables shared sliding-window rate limits across instances. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional. Upstash Redis REST token paired with the URL above. |

Initialize the database:

```bash
npm run db:generate
npx prisma migrate deploy
```

For local prototypes where migration history is not required, `npm run db:push` can also synchronize the schema.

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production deploy

1. Provision PostgreSQL with the `vector` extension, a Supabase (or S3-compatible) bucket for `SUPABASE_DOCUMENT_BUCKET`, and Clerk application credentials with sign-in/sign-up URLs pointing at your deployment.
2. Set all required environment variables from `.env.example`. Generate a long random `INDEXING_SECRET` (≥32 characters). Prefer a separate `HEALTH_DETAIL_SECRET` for readiness detail unlocks.
3. Run `npx prisma migrate deploy` against `DIRECT_URL`, then start with `npm run build && npm run start` (or your host’s Next.js build pipeline).
4. Point load balancers at `GET /api/health` for liveness and `GET /api/ready` for dependency readiness (HTTP 503 when critical probes fail). Use `x-aether-health-secret` only for detailed probe JSON.
5. Configure Clerk authorized origins / redirect URLs for your production host. Optionally set `RESEND_API_KEY` + verified `RESEND_FROM_EMAIL` for invite email delivery, and Upstash Redis for multi-instance rate limits.
6. Smoke-test the loop: sign up → create matter → upload a PDF/DOCX/TXT → confirm retrieval-ready → run research/draft → invite a teammate.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npx prisma validate
npm audit --audit-level=high
npm run build
```

For build-only validation without live service credentials, use syntactically valid dummy values for Clerk/Supabase/Postgres and leave `OPENAI_API_KEY` empty. Semantic retrieval requires a real OpenAI key and re-indexed documents. With the pinned Next.js 16.2.11 release and dependency overrides (`brace-expansion@5.0.8`, `minimatch@10.2.5`, nested Next `postcss@8.5.23`), `npm audit --audit-level=high` is clean.

## Database notes

The Prisma schema requires PostgreSQL with the `vector` extension. The initial migration creates the extension and tables for users, matters, conversations, documents, chunks, and research sessions. Later migrations add `ConversationMessage` rows for thread history, `AuditEvent` rows for ownership-scoped workspace activity, `DraftDocument` rows for grounded drafting outputs, `Organization` / `OrganizationMember` tables for role-based workspace sharing, `User.activeOrganizationId` for multi-org switching, `OrganizationInvite` for pre-signup email invites (with `tokenHash` at rest), `AuditEvent.organizationId` for org-scoped activity feeds, a unique constraint on `User.email`, an `OrganizationRole` enum constraining membership/invite roles, a partial unique index enforcing one owner per organization, nullable `Matter.userId` (`ON DELETE SET NULL`) so org-shared matters survive creator deletion, nullable `ResearchSession.userId` / `DraftDocument.userId` (`ON DELETE SET NULL`) so matter work product survives creator deletion, `Document.indexingRunId` leases for indexing claims, and `Conversation.createdByUserId` for work-product delete policy. Document chunk embeddings use `vector(1536)`, matching `text-embedding-3-small`.

## Security notes

- Platform routes are protected by Clerk via `src/proxy.ts`.
- Data access is scoped through the authenticated user's persisted app row and organization membership.
- Each signed-in user receives a personal organization (owner role). Additional organizations can be created from Settings; matter creation uses the active organization.
- Users who belong to multiple organizations can switch the active workspace from the sidebar or Settings.
- List surfaces (dashboard, matters, documents, research, drafting, memory, workflows) scope to the active organization, plus legacy creator-owned matters with no organization attachment.
- Non-owners can leave an organization; owners can transfer ownership to another member (becoming admin) or delete the organization after name confirmation when they own more than one workspace.
- Organization roles (`owner`, `admin`, `member`, `viewer`) gate read, write, delete, and membership management. Organization matters require current membership; creator ownership only applies to legacy personal matters without an organization.
- Document upload validates matter write access server-side.
- Document deletion removes storage objects and cascaded chunks after delete-permission checks. Storage cleanup failures are logged and surfaced as warnings so orphaned objects are not silently retained.
- Matter status updates (active / on hold / closed / archived) require write permission.
- Matter metadata (title, client, practice area, jurisdiction, risk, billing, description) can be edited after creation with write permission.
- Matter deletion removes cascaded documents, chunks, conversations, and research sessions after delete-permission checks, then cleans Supabase storage objects (with the same cleanup warning if object removal fails).
- Matter conversations can be created with write permission; research queries also open a conversation thread automatically. Conversation create/message and matter create actions are rate-limited per user.
- Conversation messages (user/assistant/note) are permission-scoped through the parent matter and cascade when a conversation is deleted.
- Work-product deletion (conversations, research sessions, drafts) allows the creator with write permission, or any actor with matter `delete` permission (admin/owner). Legacy conversations / research / drafts without a recorded creator require `delete`.
- Key mutations write ownership-scoped `AuditEvent` records (matter, document, research, conversation, draft, organization). Trail writes are non-fatal and Settings shows actor activity for the active organization (including legacy personal matters) plus shared matter activity in that organization. Membership and invite audit rows (including invite refresh events) are visible only to owners/admins. Matter deletion audits keep the organization stamp without dangling matter FKs; invite create/refresh metadata never stores acceptance tokens/URLs or invitee emails in refresh summaries.
- Pending invite metadata (email/role/expiry) is only loaded for owners and admins; raw tokens are never serialized to the client. Member roster emails are likewise admin/owner-only (members still see their own email).
- Draft generation requires write permission; drafts persist instruction, type, content, and retrieved chunk ids. Draft deletion follows the work-product policy above.
- Research and drafting history can be restored in-place with stored provenance excerpts (and authorities for research) and exported as Markdown; viewer roles retain read/export access. Matter detail deep-links into research/drafting with optional session/draft restore, including archived matters.
- Research queries and draft instructions are capped server-side (8,000 characters). Grounded LLM failures still return retrieved excerpts with an error message. Per-user rate limits throttle research, drafting, upload, reindex, and invite bursts (Upstash Redis when configured; otherwise in-process). Persistence failures surface a non-fatal warning while still returning generated content.
- Failed indexing, empty/unscannable sources, embedding/retrieval failures, indexed-but-pending retrieval (no OpenAI key yet), stale mid-pipeline statuses (parsing/chunking/embedding older than ~10 minutes), or pipeline errors can be retried from Documents, Workflows, the matter source registry, and the document workstation when the actor has write permission. Legacy personal matters keep creator write controls even when the active organization role is viewer. Upload/reindex run the indexing pipeline in-process, claim documents with an `indexingRunId` lease so concurrent/stale reclaim runs cannot interleave chunk writes or publish superseded embeddings, lease-conditional chunk deletes/embedding publishes plus embed-batch heartbeats keep long runs from being wiped by reclaim, refuse claim conflicts without marking the active run failed, and surface a warning when indexing fails so retry controls appear immediately. Semantic retrieval and retrieval-ready UI counts only include documents with both `retrievalStatus = ready` and `indexingStatus = retrieval-ready`.
- Public `/api/health` is a cheap process liveness probe (no database fan-out). Public `/api/ready` returns status + `checkedAt` only (HTTP 503 when critical probes are degraded) and rate-limits by platform `x-real-ip` (shared anonymous bucket otherwise) with a short in-process cache. Full probe details require `x-aether-health-secret` matching a strong `HEALTH_DETAIL_SECRET` or `INDEXING_SECRET` (≥32 characters; placeholders such as `change-me` never unlock details). Critical Clerk and Supabase probes perform bounded HTTP checks (not env-presence alone). Settings shows live probes and env readiness to organization admins/owners only; aggregate readiness ignores optional OpenAI/indexing/Upstash configuration so missing AI keys do not mark the deployment unhealthy.
- Organization invite acceptance (token and auto email-match) claims invites with a conditional `acceptedAt` update inside a transaction so concurrent accepts cannot double-apply membership. Invite secrets are stored as SHA-256 hashes; copying a pending invite mints a fresh link and invalidates the previous one.
- User emails are stored lowercased and uniquely constrained so invite/member matching cannot collide across accounts.
- Settings exposes organization roster controls for owners/admins (rename, create organization, add/invite by email, role update, remove, revoke pending invites, transfer ownership, delete organization). Admins can only manage members strictly below their own rank (peer admins cannot demote/remove each other).
- Pending invites include a shareable `/app/invites/[token]` acceptance link. Invite pages validate token shape and only reveal organization name, role, and invited email after the signed-in account matches the invite target. Accept and decline paths never echo the invitee email to the wrong signed-in account; declining deletes the pending invite (admin-visible `organization.invite_reject` audit) so a fresh invite can be sent later. With `RESEND_API_KEY` configured, invites are emailed automatically; Resend delivery failures surface a warning while the copyable link remains available. Without Resend, copyable links and mailto drafts remain available. Invites also activate automatically when the invited email signs in (14-day expiry), and auto-accept writes the same `organization.invite_accept` audit trail as token acceptance. Accepting an invite while already a member upgrades the role when the invite outranks the current membership.
- Organization deletion detaches matters (organizationId set null) while preserving creator ownership; creator-less org matters are reassigned to the deleting owner so they do not become inaccessible. Memberships and invites cascade away.
- `/api/index-document/[documentId]` requires a strong `INDEXING_SECRET` outside local development (≥32 characters; placeholder values such as `change-me` are rejected). Auth attempts are rate-limited by client IP before the secret check. Misconfiguration returns a generic 503 while the detailed reason is logged server-side. Embedding batches must return one 1536-dimension vector per chunk before retrieval is marked ready.
- Responses include baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and a Clerk/Supabase-aware Content-Security-Policy). Shared secret comparisons for indexing/readiness use timing-safe equality.
- Retrieval queries are matter-scoped at the SQL layer and limited to documents with `retrievalStatus = ready` / `indexingStatus = retrieval-ready`.
