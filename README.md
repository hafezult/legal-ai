# Aether Legal AI

Aether is a Next.js 14 legal-intelligence workspace for matter-scoped document ingestion,
semantic retrieval, and grounded research. The Phase 1 product path is:

1. Create a Clerk-authenticated user session.
2. Create a legal matter.
3. Upload PDF, DOCX, or TXT source documents to Supabase Storage.
4. Parse, chunk, and embed documents into Postgres with pgvector.
5. Run matter-scoped research queries with retrieval traces saved per session.

## Getting Started

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Fill in:

- `DATABASE_URL` and `DIRECT_URL` for a Postgres database with pgvector available.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally
  `SUPABASE_DOCUMENT_BUCKET`.
- `OPENAI_API_KEY` for embeddings and grounded responses. Without it, documents can parse
  and chunk but semantic retrieval remains unavailable.
- `NEXT_PUBLIC_APP_URL`, normally `http://localhost:3000` in local development.
- `INDEXING_SECRET`, required in production for the internal indexing endpoint.

Initialize the database:

```bash
npm run db:generate
npm run db:migrate
```

Start the app:

```bash
npm run dev
```

Open <http://localhost:3000>.

## Supabase Storage

The app stores uploaded sources in a private bucket. By default the bucket name is
`legal-documents`; override it with `SUPABASE_DOCUMENT_BUCKET`. The upload path is scoped
by Clerk user ID and matter ID. Server-side storage access uses the service role key, so do
not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Document indexing

Document uploads create database records and then trigger:

```text
pending -> parsing -> chunking -> embedding -> retrieval-ready
```

`POST /api/index-document/[documentId]` runs the pipeline. In production this route rejects
requests unless `INDEXING_SECRET` is configured and supplied through `x-aether-secret`.
Local development may run without the secret, though using one keeps local behavior close
to production.

## Validation

Use these checks before shipping changes:

```bash
npm run lint
npm run build
```

Schema-only validation can run with dummy database URLs:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/aether?schema=public" \
DIRECT_URL="postgresql://user:pass@localhost:5432/aether?schema=public" \
npx prisma validate
```

## Runtime smoke test

1. Sign in through Clerk.
2. Create a matter.
3. Upload a PDF, DOCX, or TXT document.
4. Confirm the document reaches `retrieval-ready` or use Retry from the matter page.
5. Run a research query in `/app/research`.
6. Confirm the dashboard, matter page, document workstation, and `/app/documents` show the
   persisted document and research session data.
