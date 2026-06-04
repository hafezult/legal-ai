# Aether

Aether is an AI-native legal intelligence workspace for matter management,
document ingestion, semantic retrieval, and grounded legal research.

The application is built with Next.js App Router, TypeScript, Tailwind CSS,
Clerk authentication, Prisma/PostgreSQL with pgvector, Supabase Storage, and
OpenAI embeddings/chat completions.

## Product surface

- Marketing site at `/`
- Clerk sign-in and sign-up routes
- Protected platform shell under `/app`
- Matter registry and matter detail workspaces
- Document upload and indexing for PDF, DOCX, and TXT files
- Matter-scoped research that retrieves indexed chunks and persists sessions
- Dashboard with live matter, document, indexing, and research activity

## Requirements

- Node.js 20+
- PostgreSQL with the `vector` extension enabled
- Clerk application keys
- Supabase project and a private document bucket
- OpenAI API key for embeddings and grounded responses

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment:

   ```bash
   cp .env.example .env.local
   ```

3. Fill `.env.local`:

   - `DATABASE_URL` and `DIRECT_URL` should point to the same Postgres database
     for local development.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` come from Clerk.
   - `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from Supabase.
   - `SUPABASE_DOCUMENT_BUCKET` defaults to `aether-documents` when omitted.
   - `OPENAI_API_KEY` enables embeddings and grounded AI responses.
   - `APP_URL` should match the app origin used by the server-side indexing
     callback, for example `http://localhost:3000`.
   - `INDEXING_SECRET` is sent by document upload actions to the internal
     indexing API. Leave it blank only for local development.

4. Enable pgvector in your database if it is not already enabled:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

5. Generate Prisma Client and sync the schema:

   ```bash
   npm run db:generate
   npm run db:push
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Document indexing flow

Document upload stores the original file in Supabase, registers a `Document`
record, and calls `POST /api/index-document/:documentId`. The indexing pipeline
then parses the file, chunks extracted text, creates embeddings when
`OPENAI_API_KEY` is configured, and marks retrieval-ready chunks in pgvector.

In production, set `APP_URL` and `INDEXING_SECRET` so the fire-and-forget
callback can reach the deployed app securely.

## Scripts

```bash
npm run dev          # start Next.js locally
npm run build        # generate Prisma Client and build Next.js
npm run lint         # run Next.js ESLint rules
npm run db:generate  # generate Prisma Client
npm run db:push      # push schema to the configured database
npm run db:migrate   # create and apply a Prisma migration
npm run db:studio    # open Prisma Studio
```

## Quality gate

The repository includes a GitHub Actions workflow that runs install, Prisma
generation, lint, and build on pushes and pull requests to `main`.
