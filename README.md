# Aether Legal AI

Aether is a Next.js legal intelligence workspace for matter-scoped document ingestion, indexing, semantic retrieval, and grounded research. The app combines Clerk authentication, Prisma/Postgres with pgvector, Supabase-backed document storage, and OpenAI embeddings/completions.

## Core workflow

1. Create a Clerk-authenticated user session.
2. Create a matter workspace.
3. Upload PDF, DOCX, or TXT source documents to a matter.
4. The indexing endpoint parses, chunks, embeds, and stores document vectors.
5. The research surface retrieves matter-scoped excerpts and generates grounded answers with source traceability.

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

Use Node.js 20.9 or newer; this matches the framework runtime requirement.

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
npx prisma validate
npm audit --audit-level=high
npm run build
```

For build-only validation without live service credentials, use syntactically valid dummy values for Clerk/Supabase/Postgres and leave `OPENAI_API_KEY` empty. Semantic retrieval requires a real OpenAI key and re-indexed documents. The current Next.js release still reports a moderate nested PostCSS advisory with no available upstream fix; the high-severity audit gate is clean.

## Database notes

The Prisma schema requires PostgreSQL with the `vector` extension. The initial migration creates the extension and tables for users, matters, documents, chunks, and research sessions. Document chunk embeddings use `vector(1536)`, matching `text-embedding-3-small`.

## Security notes

- Platform routes are protected by Clerk middleware.
- Data access is scoped through the authenticated user's persisted app row.
- Document upload validates matter ownership server-side.
- `/api/index-document/[documentId]` requires `INDEXING_SECRET` outside local development.
- Retrieval queries are matter-scoped at the SQL layer.
