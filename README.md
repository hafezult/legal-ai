# Aether Legal AI

Aether is a Next.js legal intelligence workspace for matter-scoped document ingestion, indexing, semantic retrieval, grounded research, and evidence-bound drafting. The app combines Clerk authentication, Prisma/Postgres with pgvector, Supabase-backed document storage, and OpenAI embeddings/completions.

## Core workflow

1. Create a Clerk-authenticated user session.
2. Create a matter workspace.
3. Upload PDF, DOCX, or TXT source documents to a matter.
4. Upload and reindex run the indexing pipeline in-process (parse → chunk → embed → store vectors). An optional `/api/index-document` HTTP trigger is also available when `INDEXING_SECRET` is configured.
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

Use Node.js 22 or newer (required for `npm test` type stripping; CI validates on Node.js 22).

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
| `NEXT_PUBLIC_APP_URL` | Absolute app URL used for invite acceptance links (required outside development; must be `https` with a public host — localhost / loopback / RFC1918 / CGNAT / TEST-NET and cleartext HTTP are rejected for Settings readiness and invite minting in production). |

Optional variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_DOCUMENT_BUCKET` | Storage bucket name; defaults to `legal-documents` in code. |
| `OPENAI_API_KEY` | Enables embeddings, semantic retrieval, and grounded answers. Leave blank for UI-only local work. |
| `INDEXING_SECRET` | Shared secret for the optional `/api/index-document` HTTP trigger outside development (≥32 characters, ≥10 distinct characters, non-placeholder). Values starting with `ci-indexing-secret`, `replace-with-a-long-random`, or `aether-ci-validate` are rejected. Upload/reindex run indexing in-process. Also accepted (when strong) as the fallback for `/api/ready` detail unlock. |
| `HEALTH_DETAIL_SECRET` | Prefer this for full `/api/ready` probe details via `x-aether-health-secret`. Same strength rules as `INDEXING_SECRET` (≥32 chars, ≥10 distinct; weak placeholders never unlock details). |
| `RESEND_API_KEY` | When set, pending organization invites are emailed via Resend. |
| `RESEND_FROM_EMAIL` | Resend from address (defaults to `Aether <onboarding@resend.dev>`). |
| `UPSTASH_REDIS_REST_URL` | Enables shared sliding-window rate limits across instances. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token paired with the URL above. |

Initialize the database:

```bash
npm run db:generate
npm run db:deploy
```

For local prototypes where migration history is not required, `npm run db:push` can also synchronize the schema.

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production deploy

1. Provision PostgreSQL with the `vector` extension, a Supabase (or S3-compatible) bucket for `SUPABASE_DOCUMENT_BUCKET`, and Clerk application credentials with sign-in/sign-up URLs pointing at your deployment.
2. Set all required environment variables from `.env.example`. Generate a long random `INDEXING_SECRET` (≥32 characters, ≥10 distinct). Prefer a separate `HEALTH_DETAIL_SECRET` for readiness detail unlocks.
3. Run `npm run db:deploy` against `DIRECT_URL`, then start with `npm run build && npm run start` (or your host’s Next.js build pipeline).
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

The Prisma schema requires PostgreSQL with the `vector` extension. The initial migration creates the extension and tables for users, matters, conversations, documents, chunks, and research sessions. Later migrations add `ConversationMessage` rows for thread history, `AuditEvent` rows for ownership-scoped workspace activity, `DraftDocument` rows for grounded drafting outputs, `Organization` / `OrganizationMember` tables for role-based workspace sharing, `User.activeOrganizationId` for multi-org switching, `OrganizationInvite` for pre-signup email invites (with `tokenHash` at rest), `AuditEvent.organizationId` for org-scoped activity feeds, a unique constraint on `User.email`, an `OrganizationRole` enum constraining membership/invite roles, a partial unique index enforcing one owner per organization, nullable `Matter.userId` (`ON DELETE SET NULL`) so org-shared matters survive creator deletion, nullable `ResearchSession.userId` / `DraftDocument.userId` (`ON DELETE SET NULL`) so matter work product survives creator deletion, `Document.indexingRunId` leases for indexing claims, `Document.publishedRunId` plus per-chunk `indexingRunId` for atomic reindex publish (prior retrieval stays live until the new generation embeds successfully), optional HNSW acceleration for chunk embeddings when the database supports it, and `Conversation.createdByUserId` for work-product delete policy. Document chunk embeddings use `vector(1536)`, matching `text-embedding-3-small`.

## Security notes

- Platform routes are protected by Clerk via `src/proxy.ts`.
- Data access is scoped through the authenticated user's persisted app row and organization membership. Server Actions, document upload, and platform pages resolve identity through a non-throwing actor helper so Clerk outages return structured errors / WorkspaceLoadError instead of uncaught failures. Platform list surfaces, matter intake, and matter/document detail pages treat an authenticated session without a provisioned app user as a load failure (not an empty workspace, writable intake form, or 404), and the shell announces workspace sync outages (including personal-organization provisioning failures — never a false empty org roster). Matter create and sibling mutations return structured session errors when the app user row is missing instead of redirecting as if signed out. Matter mutation clients (edit/status/delete/conversations/research) and the organization switcher catch unexpected action transport failures into live regions. Research/draft restore fails closed when the live indexed-chunk count cannot be verified (instead of substituting provenance length).
- Document workstation embedding presence and permission probes surface unavailable/error states instead of silently reading as zero embeddings or read-only.
- Each signed-in user receives a personal organization (owner role). First-provision races on the deterministic personal slug recover by re-querying the owner membership (P2002) instead of failing the shell as an empty workspace. Additional organizations can be created from Settings; matter creation requires an active organization (personal workspace is recovered once if missing) and never inserts legacy `organizationId: null` matters.
- Users who belong to multiple organizations can switch the active workspace from the sidebar or Settings (rate-limited per user).
- List surfaces (dashboard, matters, documents, research, drafting, memory, workflows) scope to the active organization, plus legacy creator-owned matters with no organization attachment.
- Non-owners can leave an organization; leave and admin member-remove clear or reassign `activeOrganizationId` in the same transaction as the membership delete. Owners can transfer ownership to another member (becoming admin) or delete the organization after name confirmation when they own more than one workspace.
- Organization roles (`owner`, `admin`, `member`, `viewer`) gate read, write, delete, and membership management. Organization matters require current membership; creator ownership only applies to legacy personal matters without an organization.
- Document upload posts to `/api/matters/[matterId]/documents`, which authenticates, rate-limits, and checks matter write access before parsing multipart bodies (Content-Length required; rejected above ~51 MB). Permission-check data-layer outages and storage/registration infrastructure failures return HTTP 503 (not 403/400).
- Document deletion removes storage objects and cascaded chunks after delete-permission checks. Storage cleanup failures are logged and surfaced as warnings so orphaned objects are not silently retained.
- Matter status updates (active / on hold / closed / archived) require write permission.
- Matter metadata (title, client, practice area, jurisdiction, risk, billing, description) can be edited after creation with write permission.
- Matter deletion removes cascaded documents, chunks, conversations, and research sessions after delete-permission checks, then cleans Supabase storage objects (with the same cleanup warning if object removal fails).
- Matter conversations can be created with write permission; research queries also open a conversation thread automatically. Conversation create/message and matter create actions are rate-limited per user.
- Conversation messages (user/assistant/note) are permission-scoped through the parent matter and cascade when a conversation is deleted.
- Work-product deletion (conversations, research sessions, drafts) allows the creator with write permission, or any actor with matter `delete` permission (admin/owner). Legacy conversations / research / drafts without a recorded creator require `delete`.
- Key mutations write ownership-scoped `AuditEvent` records (matter, document, research, conversation, draft, organization). Trail writes are non-fatal and Settings shows actor activity for the active organization (including legacy personal matters) plus shared matter activity in that organization. Membership and invite audit rows (including invite refresh events) are visible only to owners/admins. Matter deletion audits keep the organization stamp without dangling matter FKs; invite create/refresh metadata never stores acceptance tokens/URLs or invitee emails in refresh summaries. Expired audit rows older than 365 days are purged opportunistically in bounded batches after trail writes.
- Pending invite metadata (email/role/expiry) is only loaded for owners and admins; raw tokens are never serialized to the client. Member roster emails are likewise admin/owner-only (members still see their own email).
- Draft generation requires write permission; drafts persist instruction, type, content, and retrieved chunk ids. Draft deletion follows the work-product policy above.
- Research and drafting history can be restored in-place with stored provenance excerpts (and authorities for research) and exported as Markdown; viewer roles retain read/export access. Matter detail deep-links into research/drafting with optional session/draft restore, including archived matters.
- Research queries and draft instructions are capped server-side (8,000 characters). Grounded LLM failures still return retrieved excerpts with an error message. Per-user rate limits throttle research, drafting, research/draft restore, upload, reindex, invite bursts, matter edits, organization switches, and destructive deletes (matters, documents, conversations, research sessions, drafts) — Upstash Redis when configured; otherwise in-process. Organization leave/rename/transfer/delete plus invite revoke and member role/remove mutations share the same admin throttle. Invite link refresh renews the acceptance TTL; expired unaccepted invites are purged opportunistically. Persistence failures surface a non-fatal warning while still returning generated content; research conversation-thread failures are reported separately from session save failures.
- Failed indexing, empty/unscannable sources, embedding/retrieval failures, indexed-but-pending retrieval (no OpenAI key yet), stale mid-pipeline statuses (parsing/chunking/embedding older than ~10 minutes), or pipeline errors can be retried from Documents, Workflows, the matter source registry, and the document workstation when the actor has write permission. Legacy personal matters keep creator write controls even when the active organization role is viewer. Upload/reindex run the indexing pipeline in-process (matter/workstation route segments allow up to 300s), claim documents with an `indexingRunId` lease so concurrent/stale reclaim runs cannot interleave chunk writes or publish superseded embeddings, stage replacement chunks under the new run while keeping `publishedRunId` searchable, atomically swap `publishedRunId` only after embeddings succeed (restoring the prior generation on failure), lease-conditional chunk deletes/embedding publishes plus embed-batch heartbeats keep long runs from being wiped by reclaim, refuse claim conflicts without marking the active run failed, wrap unexpected post-claim failures (chunk/vector/publish) in lease recovery so Retry is not blocked for the stale-lease window, and surface a warning when indexing fails so retry controls appear immediately. OpenAI embedding and completion calls use a shared ~90s request timeout. Semantic retrieval serves chunks whose `indexingRunId` matches `Document.publishedRunId`; readiness counts also treat mid-reindex documents with a live published generation as retrieval-ready.
- Public `/api/health` is a cheap process liveness probe (no database fan-out) and rate-limits in-process only (never Upstash). Public `/api/ready` returns status + `checkedAt` only (HTTP 503 when critical probes are degraded) and rate-limits by a validated platform `x-real-ip` (shared anonymous bucket when missing or non-IP) with a short in-process cache. Full probe details require `x-aether-health-secret` matching a strong `HEALTH_DETAIL_SECRET` or `INDEXING_SECRET` (≥32 characters with ≥10 distinct characters; placeholders such as `change-me` never unlock details). Critical Clerk and Supabase probes perform bounded HTTP checks (not env-presence alone). Upstash rate-limit fetches use a short abort timeout and treat malformed pipeline responses as transport failures (in-memory fallback) instead of fail-opening. Mission Control never labels Authentication as operational without a successful Clerk probe. Settings shows live probes and env readiness to organization admins/owners only; aggregate readiness ignores optional OpenAI/indexing/Upstash configuration so missing AI keys do not mark the deployment unhealthy.
- Organization invite acceptance (explicit token Accept only) claims invites with a conditional `acceptedAt` update inside a transaction (including the active-workspace switch) so concurrent accepts cannot double-apply membership and data-layer outages are not misreported as “already accepted.” Silent verified-email auto-accept is disabled by default so Decline cannot be bypassed by visiting another `/app` route. Invite secrets are stored as SHA-256 hashes; copying a pending invite mints a fresh link and invalidates the previous one.
- User emails are stored lowercased and uniquely constrained so invite/member matching cannot collide across accounts.
- Settings exposes organization roster controls for owners/admins (rename, create organization, add/invite by email, role update, remove, revoke pending invites, transfer ownership, delete organization). Admins can only manage members strictly below their own rank (peer admins cannot demote/remove each other).
- Pending invites include a shareable `/app/invites/[token]` acceptance link. Invite pages validate token shape and only reveal organization name, role, and invited email after the signed-in account matches the invite target. Membership starts only after the invited account explicitly Accepts; Decline deletes the pending invite (admin-visible `organization.invite_reject` audit) so a fresh invite can be sent later. Accept and decline paths never echo the invitee email to the wrong signed-in account and require a currently verified Clerk email. With `RESEND_API_KEY` configured, invites are emailed automatically (10s request timeout); Resend delivery failures surface a warning while the copyable link remains available. Without Resend, copyable links and mailto drafts remain available. Unverified Clerk emails are not persisted for invite matching. Accepting an invite while already a member upgrades the role when the invite outranks the current membership and switches the active organization to the joined workspace.
- Organization deletion detaches matters (organizationId set null) while preserving creator ownership; creator-less org matters are reassigned to the deleting owner so they do not become inaccessible. Memberships and invites cascade away.
- `/api/index-document/[documentId]` requires a strong `INDEXING_SECRET` outside local development (≥32 characters with ≥10 distinct characters; placeholder values such as `change-me` are rejected). Auth attempts are rate-limited by client IP before the secret check, and starts are additionally capped by a global sliding-window limit. Misconfiguration returns a generic 503 while the detailed reason is logged server-side. Embedding batches must return one 1536-dimension vector per chunk before retrieval is marked ready.
- Responses include baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and a Clerk/Supabase-aware Content-Security-Policy). Shared secret comparisons for indexing/readiness use timing-safe equality.
- Retrieval queries are matter-scoped at the SQL layer and limited to chunks on documents with `retrievalStatus = ready` whose `indexingRunId` matches `publishedRunId`.
