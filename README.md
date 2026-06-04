# Aether

Aether is a Next.js 14 legal AI workspace for matter-scoped document
intelligence. The MVP flow is:

1. Sign in with Clerk.
2. Create a matter workspace.
3. Upload PDF, DOCX, or TXT source documents.
4. Parse, chunk, and embed matter documents with OpenAI + pgvector.
5. Run grounded research against indexed matter sources.
6. Inspect documents in a split-pane workstation with chunks, authorities, and
   research traces.

## Getting Started

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env.local
```

Configure these services in `.env.local`:

- PostgreSQL with the `vector` extension enabled (`DATABASE_URL`, `DIRECT_URL`)
- Clerk (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- Supabase Storage (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- OpenAI (`OPENAI_API_KEY`)
- `INDEXING_SECRET` for protected manual indexing triggers outside local dev

Then generate Prisma Client and sync the database schema:

```bash
npm run db:generate
npm run db:push
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
Marketing pages render without signing in. Platform routes under `/app` require Clerk.

## Validation

Useful checks:

```bash
npm run lint
npm run build
```

For build-only validation without real service credentials, provide syntactically
valid dummy values for the required environment variables. Runtime upload,
indexing, and research require live Postgres, Supabase, Clerk, and OpenAI
credentials.

## Storage and indexing notes

- Uploaded sources are stored in the Supabase `legal-documents` bucket.
- Upload actions trigger the indexing pipeline directly in the app process.
- The `/api/index-document/[documentId]` route is retained for manual/internal
  re-indexing and requires `INDEXING_SECRET` in production.
- Documents become research-ready after parsing, chunk creation, and embedding
  writes complete.

## Project structure

- `src/app/(marketing)` — public marketing site
- `src/app/(platform)/app` — authenticated matter, document, research, and
  settings surfaces
- `src/lib/workflows/indexing.ts` — document parsing/chunking/embedding pipeline
- `src/lib/retrieval` — chunking and pgvector semantic search
- `src/lib/legal/authorities.ts` — legal authority extraction helpers
- `prisma/schema.prisma` — users, matters, documents, chunks, and sessions

Drafting, workflow orchestration, and long-term firm memory are intentionally
marked as planned navigation items beyond the current MVP.
