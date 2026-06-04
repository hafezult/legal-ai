# Aether

Aether is a Next.js legal intelligence workspace for matter-scoped document
ingestion, indexing, and grounded research. The Phase 1 product includes:

- Clerk-protected platform routes under `/app`
- Matter creation, registry, and detail workspaces
- Supabase-backed PDF, DOCX, and TXT uploads
- Prisma/Postgres with pgvector document chunks
- OpenAI embeddings and grounded research responses
- Persisted research sessions surfaced on dashboards

## Prerequisites

- Node.js 20+
- PostgreSQL with the `vector` extension available
- Clerk application keys
- Supabase project with service-role storage access
- OpenAI API key for embeddings and AI answers

## Environment

Copy the example environment and fill in the service credentials:

```bash
cp .env.example .env.local
```

`NEXT_PUBLIC_APP_URL` is optional in local development and defaults to
`http://localhost:3000`. Set `INDEXING_SECRET` in shared environments so only
internal requests can trigger document indexing.

## Database

Generate the Prisma client and apply migrations:

```bash
npm run db:generate
npm run db:migrate
```

The initial migration creates the pgvector extension, application tables, and
document chunk indexes used by semantic retrieval.

## Development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open http://localhost:3000. Authenticated users can create matters, upload
documents, wait for indexing to complete, and run grounded research from the
Research workspace.

## Validation

Run the core checks before shipping changes:

```bash
npm run lint
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public" \
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public" \
npx prisma validate
npm run build
```
