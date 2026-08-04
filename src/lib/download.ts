/** Trigger a browser download of text content as a Markdown file. */
export function downloadMarkdown(filename: string, content: string) {
  const safeName = filename.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-")
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = safeName.endsWith(".md") ? safeName : `${safeName}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
