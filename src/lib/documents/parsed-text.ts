/** Cap for Document.parsedText persisted during indexing (full text still chunked). */
export const PARSED_TEXT_MAX_CHARS = 50_000

/** True when stored parsedText hit the persistence cap and may omit a tail. */
export function isParsedTextTruncated(
  text: string | null | undefined
): boolean {
  return (text?.length ?? 0) >= PARSED_TEXT_MAX_CHARS
}
