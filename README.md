# Aether

Aether is a Next.js legal-intelligence platform for matter-scoped document ingestion, pgvector retrieval, and grounded AI research. The app includes a public marketing site and an authenticated Clerk workspace for matters, documents, workflows, memory, drafting preparation, research, and configuration health.

## Stack

- Next.js 14 App Router, React 18, TypeScript, Tailwind CSS 4
- Clerk authentication
- Prisma with PostgreSQL and pgvector
- Supabase Storage for uploaded legal documents
- OpenAI embeddings and grounded research responses

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy the environment template and fill in service credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Prepare PostgreSQL with pgvector enabled. The initial migration creates the `vector` extension, but managed databases may require enabling pgvector in the provider dashboard first.

4. Apply the Prisma schema:

   ```bash
   npm run db:push
   # or, for migration-based environments:
   npm run db:migrate
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`.

## Required services

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma pooled PostgreSQL connection |
| `DIRECT_URL` | Direct PostgreSQL connection for migrations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser auth |
| `CLERK_SECRET_KEY` | Clerk server auth and user sync |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage administration |
| `OPENAI_API_KEY` | Embeddings and grounded research responses |
| `INDEXING_SECRET` | Protects internal indexing callbacks in production |
| `NEXT_PUBLIC_APP_URL` | App origin for server-side indexing callbacks |

Create a private Supabase bucket named `legal-documents`. Uploaded files are stored under Clerk-user and matter scoped paths.

## Core workflows

- **Matter registry:** create governed workspaces with client, practice, jurisdiction, risk, and billing metadata.
- **Document intelligence:** upload PDF, DOCX, or TXT files from a matter workspace. Uploads are stored in Supabase and indexed asynchronously through `/api/index-document/[documentId]`.
- **Indexing pipeline:** parse, chunk, embed, and store vectors in PostgreSQL/pgvector. Documents remain visible even when OpenAI is not configured, but semantic retrieval becomes available only after embeddings are stored.
- **Research:** run matter-scoped semantic search and generate answers grounded only in retrieved excerpts. Research sessions are persisted for dashboard and matter activity.
- **Operations:** dashboard, documents, workflows, memory, drafting preparation, and settings pages surface live readiness and configuration state.

## Scripts

```bash
npm run dev          # start Next.js dev server
npm run build        # prisma generate + production build
npm run start        # start production server
npm run lint         # Next.js ESLint checks
npm run db:generate  # generate Prisma client
npm run db:push      # push schema to database
npm run db:migrate   # create/apply local Prisma migrations
npm run db:studio    # open Prisma Studio
```

## Production notes

- Set `INDEXING_SECRET` in every production environment; the indexing API rejects production requests when it is missing.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, and database credentials server-only.
- Use migration history for deployed databases. `db:push` is convenient for local development but should not replace reviewed migrations in production.
- The app tolerates temporary database unavailability in server-rendered workspace pages, but document upload, indexing, and research require a reachable data plane.
