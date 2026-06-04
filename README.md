# Aether

Aether is a Next.js legal AI workspace for UK law teams. It provides
matter-scoped document ingestion, private source storage, pgvector indexing,
and grounded research responses over uploaded matter documents.

## Stack

- Next.js 14 App Router
- Clerk authentication
- Prisma with PostgreSQL and `pgvector`
- Supabase Storage for private source documents
- OpenAI embeddings and grounded responses

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in local credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Prepare PostgreSQL with pgvector enabled:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. Apply the database schema:

   ```bash
   npm run db:migrate
   ```

5. Create or verify the private Supabase Storage bucket named
   `legal-documents`. The app will attempt to create it at upload time when the
   service role key has the required permissions.

6. Start the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL connection used by Prisma at runtime. |
| `DIRECT_URL` | Direct PostgreSQL connection used by Prisma migrations. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser configuration. |
| `CLERK_SECRET_KEY` | Clerk server-side authentication. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for document storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage administration key. |
| `OPENAI_API_KEY` | Embeddings and grounded research responses. |
| `INDEXING_SECRET` | Optional shared secret for the internal indexing API. |
| `NEXT_PUBLIC_APP_URL` | Public app origin used to trigger async indexing after upload. |

For local development, `NEXT_PUBLIC_APP_URL` defaults to
`http://localhost:3000` when it is not set.

## Core workflow

1. Sign in with Clerk.
2. Create a matter.
3. Upload PDF, DOCX, or TXT source documents from the matter page.
4. The upload action stores the file in Supabase and calls
   `POST /api/index-document/:documentId`.
5. The indexing pipeline parses, chunks, embeds, and stores vectors in
   PostgreSQL.
6. Run matter-scoped research queries from `/app/research`.

## Useful commands

```bash
npm run dev          # local development server
npm run lint         # Next.js lint
npm run build        # prisma generate + production build
npm run db:generate  # generate Prisma client
npm run db:push      # push schema without creating a migration
npm run db:migrate   # create/apply Prisma migrations
npm run db:studio    # inspect local data
```

## Operational checks

- `/app/documents` lists all uploaded documents across matters with parse,
  index, and retrieval status.
- `/app/settings` shows safe readiness checks for database, Clerk, Supabase,
  OpenAI, and indexing configuration.
- Documents that are chunked but not retrieval-ready usually indicate
  `OPENAI_API_KEY` was missing or embedding generation failed during indexing.
