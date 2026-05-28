// Embedding layer — provider-abstracted for OpenAI, Voyage AI, Cohere, local models

export type EmbeddingProvider = "openai" | "voyage" | "cohere"

export type EmbeddingConfig = {
  provider: EmbeddingProvider
  model: string
  dimensions: number
}

export const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: "openai",
  model: "text-embedding-3-small",
  dimensions: 1536,
}

// ── OpenAI ────────────────────────────────────────────────────────────────

async function openAIEmbed(
  texts: string[],
  model: string
): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.")

  const { OpenAI } = await import("openai")
  const client = new OpenAI({ apiKey })

  const response = await client.embeddings.create({
    model,
    input: texts.map((t) => t.slice(0, 8000)), // safety truncation
    encoding_format: "float",
  })

  type EmbeddingItem = { index: number; embedding: number[] }
  return (response.data as EmbeddingItem[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

// ── Voyage AI (stub — add API key + implement when contracted) ────────────

async function voyageEmbed(
  _texts: string[],
  _model: string
): Promise<number[][]> {
  throw new Error("Voyage AI provider not yet implemented.")
}

// ── Public API ────────────────────────────────────────────────────────────

export async function generateEmbedding(
  text: string,
  config: Partial<EmbeddingConfig> = {}
): Promise<number[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const [embedding] = await generateBatchEmbeddings([text], cfg)
  return embedding
}

export async function generateBatchEmbeddings(
  texts: string[],
  config: Partial<EmbeddingConfig> = {}
): Promise<number[][]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const BATCH = 100 // OpenAI max batch size
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    let batchResult: number[][]

    switch (cfg.provider) {
      case "openai":
        batchResult = await openAIEmbed(batch, cfg.model)
        break
      case "voyage":
        batchResult = await voyageEmbed(batch, cfg.model)
        break
      default:
        throw new Error(`Unknown embedding provider: ${cfg.provider}`)
    }

    results.push(...batchResult)
  }

  return results
}

export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}
