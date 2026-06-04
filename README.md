# Aether

Aether is a Next.js 14 legal intelligence workspace for matter management,
document ingestion, pgvector retrieval, and grounded AI research.

## Stack

- Next.js App Router and React server actions
- Clerk authentication
- Prisma + PostgreSQL with the `vector` extension
- Supabase Storage for uploaded source documents
- OpenAI embeddings and grounded analysis

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in service credentials:

   ```bash
   cp .env.example .env.local
   ```

   Required variables are documented in `.env.example`. `DATABASE_URL` and
   `DIRECT_URL` must point at a PostgreSQL database where `CREATE EXTENSION
   vector` is allowed.

3. Provision Prisma:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Core workflow

1. Clerk-authenticated users are mirrored into the `User` table by the platform
   layout.
2. Matters scope all documents, chunks, and research sessions.
3. Document uploads are stored in Supabase, registered in Postgres, then sent
   through the indexing pipeline:
   `uploaded -> parsing -> chunking -> embedding -> retrieval-ready`.
4. Research embeds the query, searches matter-scoped chunks with pgvector, and
   asks OpenAI to answer only from retrieved excerpts.

## Validation

Run these before shipping changes:

```bash
npm run build
npx prisma validate
```

The build requires syntactically valid environment variables for Clerk, Prisma,
Supabase, and the app URL. Semantic retrieval and grounded analysis require a
real `OPENAI_API_KEY`; without it the app still builds, but research reports
that embeddings are not configured.
