# Aether

Aether is a Next.js 14 application for AI-native legal workspaces. The current
platform includes Clerk authentication, matter management, document upload and
indexing, document chunk inspection, semantic retrieval, and grounded research
workflows.

## Requirements

- Node.js 20+
- PostgreSQL with the `vector` extension enabled
- Clerk application keys
- Supabase project with a private `legal-documents` storage bucket
- OpenAI API key for embeddings and AI research answers

The app can still parse and chunk uploaded documents without `OPENAI_API_KEY`,
but semantic retrieval and generated research answers will be unavailable.

## Environment

Copy the template and fill in real service values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma pooled/runtime PostgreSQL connection string |
| `DIRECT_URL` | Direct PostgreSQL connection string for migrations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service key for storage |
| `NEXT_PUBLIC_APP_URL` | Public base URL used for server callbacks |
| `INDEXING_SECRET` | Shared secret for the document indexing API |

Optional variables:

| Variable | Purpose |
| --- | --- |
| `INTERNAL_APP_URL` | Private server-to-server callback base URL. Takes precedence over `NEXT_PUBLIC_APP_URL`. |
| `OPENAI_API_KEY` | Enables embeddings and grounded AI research responses. |

`INDEXING_SECRET` is optional during local development and required in
production. If no app URL is configured locally, document uploads trigger the
indexing callback at `http://localhost:3000`.

## Database and storage setup

1. Enable `pgvector` on the target PostgreSQL database.
2. Generate the Prisma client:

   ```bash
   npm run db:generate
   ```

3. Apply the schema during development:

   ```bash
   npm run db:push
   ```

4. Create a private Supabase storage bucket named `legal-documents`.

## Development

Install dependencies and start the Next.js dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Authenticated `/app`
routes require valid Clerk credentials and a signed-in user.

## Validation

Run these checks before submitting changes:

```bash
npm run lint
npx prisma validate
npm run build
```

For local build validation without external services, dummy values can be used
for the required environment variables. Runtime testing of authenticated
workflows still requires real Clerk, Supabase, PostgreSQL, and optionally OpenAI
credentials.
