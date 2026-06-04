# Aether legal intelligence workspace

Aether is a Next.js 14 application for matter-scoped legal research and
document intelligence. It combines Clerk authentication, Prisma/Postgres with
pgvector, Supabase document storage, and OpenAI-powered embeddings and grounded
answers.

## What is included

- Marketing landing page for the Aether platform narrative.
- Clerk-protected workspace shell with dashboard, matters, research, drafting,
  documents, workflows, memory, and settings surfaces.
- Matter registry and matter intake flow.
- Private document upload to Supabase, parsing for PDF/DOCX/TXT, chunking,
  embedding, and pgvector retrieval.
- Grounded research action that persists `ResearchSession` rows with retrieved
  chunk lineage.
- Document workstation for chunk inspection and source-level retrieval context.

## Required services

Copy `.env.example` to `.env.local` and provide:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime Prisma connection string. |
| `DIRECT_URL` | Direct migration connection string for Prisma. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key. |
| `CLERK_SECRET_KEY` | Clerk server key. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage key. |
| `OPENAI_API_KEY` | Embeddings and grounded answer generation. |
| `NEXT_PUBLIC_APP_URL` | Base URL used to trigger indexing, e.g. `http://localhost:3000`. |
| `INDEXING_SECRET` | Optional shared secret for `/api/index-document/[documentId]`. |

The Supabase bucket defaults to `legal-documents`. The upload flow attempts to
create it if the service role key has permission.

## Database setup

The Prisma schema uses the Postgres `vector` extension. Enable it before pushing
the schema:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then generate Prisma and sync the database:

```bash
npm install
npm run db:generate
npm run db:push
```

Use `npm run db:migrate` instead of `db:push` when creating tracked migrations
for a production deployment workflow.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Platform routes under `/app` require valid Clerk
keys and a signed-in user. Marketing routes can render without service
credentials.

## Document intelligence flow

1. Create or open a matter.
2. Upload a PDF, DOCX, or TXT source in the matter workspace.
3. The server action registers the document and triggers
   `/api/index-document/[documentId]`.
4. The indexing pipeline parses text, chunks the document, stores chunks,
   optionally generates embeddings with OpenAI, and marks retrieval readiness.
5. Run research from `/app/research`; grounded answers and chunk references are
   saved as `ResearchSession` records and surface on the dashboard, matter
   detail, and memory pages.

Without `OPENAI_API_KEY`, documents still parse and chunk, but semantic
retrieval and grounded answer generation remain unavailable.

## Verification

```bash
npm run build
```

The build runs `prisma generate`, compiles the Next.js app, lints, and performs
type checking.
