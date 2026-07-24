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
| `NEXT_PUBLIC_APP_URL` | Absolute app URL used to trigger indexing after uploads. |
| `INDEXING_SECRET` | Shared secret for the internal indexing endpoint outside development. |
| `RESEND_API_KEY` | Optional. When set, pending organization invites are emailed via Resend. |
| `RESEND_FROM_EMAIL` | Optional Resend from address (defaults to `Aether <onboarding@resend.dev>`). |

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
npx prisma validate
npm audit --audit-level=high
npm run build
```

For build-only validation without live service credentials, use syntactically valid dummy values for Clerk/Supabase/Postgres and leave `OPENAI_API_KEY` empty. Semantic retrieval requires a real OpenAI key and re-indexed documents. With the pinned Next.js 16.2.11 release and dependency overrides, `npm audit --audit-level=high` is clean.

## Database notes

The Prisma schema requires PostgreSQL with the `vector` extension. The initial migration creates the extension and tables for users, matters, conversations, documents, chunks, and research sessions. Later migrations add `ConversationMessage` rows for thread history, `AuditEvent` rows for ownership-scoped workspace activity, `DraftDocument` rows for grounded drafting outputs, `Organization` / `OrganizationMember` tables for role-based workspace sharing, `User.activeOrganizationId` for multi-org switching, and `OrganizationInvite` for pre-signup email invites. Document chunk embeddings use `vector(1536)`, matching `text-embedding-3-small`.

## Security notes

- Platform routes are protected by Clerk via `src/proxy.ts`.
- Data access is scoped through the authenticated user's persisted app row and organization membership.
- Each signed-in user receives a personal organization (owner role). Additional organizations can be created from Settings; matter creation uses the active organization.
- Users who belong to multiple organizations can switch the active workspace from the sidebar or Settings.
- List surfaces (dashboard, matters, documents, research, drafting, memory, workflows) scope to the active organization, plus legacy creator-owned matters with no organization attachment.
- Non-owners can leave an organization; owners can transfer ownership to another member (becoming admin) or delete the organization after name confirmation when they own more than one workspace.
- Organization roles (`owner`, `admin`, `member`, `viewer`) gate read, write, delete, and membership management.
- Document upload validates matter write access server-side.
- Document deletion removes storage objects and cascaded chunks after delete-permission checks.
- Matter status updates (active / on hold / closed / archived) require write permission.
- Matter metadata (title, client, practice area, jurisdiction, risk, billing, description) can be edited after creation with write permission.
- Matter deletion removes cascaded documents, chunks, conversations, and research sessions after delete-permission checks, then cleans Supabase storage objects.
- Matter conversations can be created or deleted with write permission; research queries also open a conversation thread automatically.
- Conversation messages (user/assistant/note) are permission-scoped through the parent matter and cascade when a conversation is deleted.
- Research session deletion requires write permission on the parent matter and revalidates matter/research surfaces.
- Key mutations write ownership-scoped `AuditEvent` records (matter, document, research, conversation, draft, organization). Trail writes are non-fatal and surface on Settings.
- Draft generation and deletion require write permission; drafts persist instruction, type, content, and retrieved chunk ids.
- Research and drafting history can be restored in-place with stored provenance excerpts (and authorities for research) and exported as Markdown; viewer roles retain read/export access.
- Failed indexing can be retried from Documents, Workflows, the matter source registry, and the document workstation when the actor has write permission.
- Live readiness is exposed at `/api/health` and mirrored on Settings (configured vs reachable probes).
- Settings exposes organization roster controls for owners/admins (rename, create organization, add/invite by email, role update, remove, revoke pending invites, transfer ownership, delete organization).
- Pending invites include a shareable `/app/invites/[token]` acceptance link. With `RESEND_API_KEY` configured, invites are emailed automatically; otherwise copyable links and mailto drafts remain available. Invites also activate automatically when the invited email signs in (14-day expiry).
- Organization deletion detaches matters (organizationId set null) while preserving creator ownership; memberships and invites cascade away.
- `/api/index-document/[documentId]` requires `INDEXING_SECRET` outside local development.
- Retrieval queries are matter-scoped at the SQL layer.
