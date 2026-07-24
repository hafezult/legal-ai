"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type ConversationRow = {
  id: string
  title: string
  createdAt: Date | string
}

type ConversationCreateAction = (title: string) => Promise<{
  error?: string
  success?: boolean
}>

type ConversationDeleteAction = (conversationId: string) => Promise<{
  error?: string
  success?: boolean
}>

function fmtShortDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function MatterConversationsPanel({
  conversations,
  createAction,
  deleteAction,
}: {
  conversations: ConversationRow[]
  createAction: ConversationCreateAction
  deleteAction: ConversationDeleteAction
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const runCreate = useCallback(() => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      setMessage({ type: "error", text: "Conversation title is required." })
      return
    }

    setMessage(null)
    startTransition(async () => {
      const result = await createAction(nextTitle)
      if (result.error) {
        setMessage({ type: "error", text: result.error })
        return
      }
      setTitle("")
      setMessage({ type: "success", text: "Conversation created." })
      router.refresh()
    })
  }, [createAction, router, title])

  const runDelete = useCallback(
    (conversationId: string) => {
      setMessage(null)
      setDeletingId(conversationId)
      startTransition(async () => {
        const result = await deleteAction(conversationId)
        setDeletingId(null)
        if (result.error) {
          setMessage({ type: "error", text: result.error })
          return
        }
        setMessage({ type: "success", text: "Conversation deleted." })
        router.refresh()
      })
    },
    [deleteAction, router]
  )

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Matter conversations
          </p>
          <p className="mt-1 font-serif text-[14px] text-white/55">
            {conversations.length === 0
              ? "No conversation threads yet"
              : `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-white/28">
        Named threads keep matter research context organized. Research queries also
        open a conversation automatically.
      </p>

      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          runCreate()
        }}
      >
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Disclosure obligations thread"
          maxLength={120}
          disabled={isPending}
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white/80 placeholder:text-white/22 focus:border-white/[0.16] focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] text-white/65 transition-colors hover:border-white/[0.18] hover:text-white/88 disabled:opacity-45"
        >
          {isPending && !deletingId ? "Saving..." : "Create thread"}
        </button>
      </form>

      {message ? (
        <p
          className={`mt-3 text-[11px] ${
            message.type === "error" ? "text-red-300/60" : "text-white/36"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        {conversations.length === 0 ? (
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3">
            <p className="text-xs leading-relaxed text-white/22">
              Create a thread or run research to start conversation history for this
              matter.
            </p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white/70">{conversation.title}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/28">
                  {fmtShortDate(conversation.createdAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runDelete(conversation.id)}
                className="shrink-0 rounded border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-red-400/25 hover:text-red-200/70 disabled:opacity-45"
              >
                {deletingId === conversation.id ? "..." : "Delete"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
