-- Atomic reindex publish: keep a published chunk generation searchable while a
-- replacement indexing run builds embeddings, then swap publishedRunId.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "publishedRunId" TEXT;
CREATE INDEX IF NOT EXISTS "Document_publishedRunId_idx" ON "Document"("publishedRunId");

ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "indexingRunId" TEXT;
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_indexingRunId_idx"
  ON "DocumentChunk" ("documentId", "indexingRunId");

-- Backfill: existing retrieval-ready docs publish their current lease (or a
-- synthetic id when lease is null) and stamp live chunks with that run id.
UPDATE "Document" AS d
SET "publishedRunId" = COALESCE(d."indexingRunId", 'legacy-' || d.id)
WHERE d."retrievalStatus" = 'ready'
  AND d."indexingStatus" = 'retrieval-ready'
  AND d."publishedRunId" IS NULL;

UPDATE "DocumentChunk" AS c
SET "indexingRunId" = d."publishedRunId"
FROM "Document" AS d
WHERE c."documentId" = d.id
  AND d."publishedRunId" IS NOT NULL
  AND c."indexingRunId" IS NULL;

-- Optional ANN acceleration for cosine distance search (pgvector HNSW).
-- IF NOT EXISTS keeps re-applies safe; unsupported builds can no-op via DO block.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
    ON "DocumentChunk"
    USING hnsw (embedding vector_cosine_ops);
EXCEPTION
  WHEN undefined_object THEN
    -- Older pgvector without HNSW support: skip.
    NULL;
  WHEN feature_not_supported THEN
    NULL;
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;
