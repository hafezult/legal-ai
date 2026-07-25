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
| `INDEXING_SECRET` | Shared secret for the optional `/api/index-document` HTTP trigger outside development. Upload/reindex run indexing in-process. |
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

The Prisma schema requires PostgreSQL with the `vector` extension. The initial migration creates the extension and tables for users, matters, conversations, documents, chunks, and research sessions. Later migrations add `ConversationMessage` rows for thread history, `AuditEvent` rows for ownership-scoped workspace activity, `DraftDocument` rows for grounded drafting outputs, `Organization` / `OrganizationMember` tables for role-based workspace sharing, `User.activeOrganizationId` for multi-org switching, `OrganizationInvite` for pre-signup email invites, `AuditEvent.organizationId` for org-scoped activity feeds, a unique constraint on `User.email`, and an `OrganizationRole` enum constraining membership/invite roles. Document chunk embeddings use `vector(1536)`, matching `text-embedding-3-small`.

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
- Matter conversations can be created or deleted with write permission; research queries also open a conversation thread automatically.
- Conversation messages (user/assistant/note) are permission-scoped through the parent matter and cascade when a conversation is deleted.
- Research session deletion requires write permission on the parent matter and revalidates matter/research surfaces.
- Key mutations write ownership-scoped `AuditEvent` records (matter, document, research, conversation, draft, organization). Trail writes are non-fatal and Settings shows actor activity for the active organization (including legacy personal matters) plus shared matter activity in that organization. Membership and invite audit rows (which include emails) are visible only to owners/admins. Matter deletion audits keep the organization stamp without dangling matter FKs; invite create metadata never stores acceptance tokens/URLs.
- Pending invite tokens and acceptance URLs are only loaded for owners and admins.
- Draft generation and deletion require write permission; drafts persist instruction, type, content, and retrieved chunk ids.
- Research and drafting history can be restored in-place with stored provenance excerpts (and authorities for research) and exported as Markdown; viewer roles retain read/export access. Matter detail deep-links into research/drafting with optional session/draft restore, including archived matters.
- Research queries and draft instructions are capped server-side (8,000 characters). Grounded LLM failures still return retrieved excerpts with an error message. Per-user rate limits throttle research, drafting, upload, reindex, and invite bursts (Upstash Redis when configured; otherwise in-process). Persistence failures surface a non-fatal warning while still returning generated content.
- Failed indexing, empty/unscannable sources, embedding/retrieval failures, indexed-but-pending retrieval (no OpenAI key yet), stale mid-pipeline statuses (parsing/chunking/embedding older than ~10 minutes), or pipeline errors can be retried from Documents, Workflows, the matter source registry, and the document workstation when the actor has write permission. Legacy personal matters keep creator write controls even when the active organization role is viewer. Upload/reindex run the indexing pipeline in-process, claim documents so concurrent runs cannot interleave chunk writes, refuse claim conflicts without marking the active run failed, and surface a warning when indexing fails so retry controls appear immediately.
- Public `/api/health` is a cheap process liveness probe (no database fan-out). Settings and the dashboard load full dependency probes via `getHealthReport()`; aggregate readiness ignores optional OpenAI/indexing configuration so missing AI keys do not mark the deployment unhealthy.
- User emails are stored lowercased and uniquely constrained so invite/member matching cannot collide across accounts.
- Settings exposes organization roster controls for owners/admins (rename, create organization, add/invite by email, role update, remove, revoke pending invites, transfer ownership, delete organization). Admins can only manage members strictly below their own rank (peer admins cannot demote/remove each other).
- Pending invites include a shareable `/app/invites/[token]` acceptance link. Invite pages validate token shape and only reveal organization name, role, and invited email after the signed-in account matches the invite target. With `RESEND_API_KEY` configured, invites are emailed automatically; otherwise copyable links and mailto drafts remain available. Invites also activate automatically when the invited email signs in (14-day expiry), and auto-accept writes the same `organization.invite_accept` audit trail as token acceptance. Accepting an invite while already a member upgrades the role when the invite outranks the current membership.
- Organization deletion detaches matters (organizationId set null) while preserving creator ownership; memberships and invites cascade away.
- `/api/index-document/[documentId]` requires a non-trivial `INDEXING_SECRET` outside local development (placeholder values such as `change-me` are rejected). Misconfiguration returns a generic 503 while the detailed reason is logged server-side. Embedding batches must return one 1536-dimension vector per chunk before retrieval is marked ready.
- Responses include baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a Clerk/Supabase-aware Content-Security-Policy).
- Retrieval queries are matter-scoped at the SQL layer.
