// AI intelligence layer public entrypoint.
export {
  DEFAULT_CONFIG,
  generateBatchEmbeddings,
  generateEmbedding,
  isEmbeddingConfigured,
} from "@/lib/ai/embeddings"
export {
  OPENAI_REQUEST_TIMEOUT_MS,
  createOpenAIClient,
} from "@/lib/ai/openai-client"
