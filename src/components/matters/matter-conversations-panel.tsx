"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type ConversationMessageRow = {
  id: string
  role: string
  content: string
  createdAt: Date | string
}

type ConversationRow = {
  id: string
  title: string
  createdAt: Date | string
  _count: { messages: number }
  canDelete?: boolean
}

type ConversationCreateAction = (title: string) => Promise<{
  error?: string
  success?: boolean
}>

type ConversationDeleteAction = (conversationId: string) => Promise<{
  error?: string
  success?: boolean
}>

type ConversationMessageCreateAction = (
  conversationId: string,
  content: string
) => Promise<{
  error?: string
  success?: boolean
}>

type ConversationMessagesRestoreAction = (conversationId: string) => Promise<{
  error?: string
  messages?: ConversationMessageRow[]
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

function roleLabel(role: string) {
  if (role === "assistant") return "Assistant"
  if (role === "user") return "User"
  if (role === "system") return "System"
  return "Note"
}

export function MatterConversationsPanel({
  conversations,
  createAction,
  deleteAction,
  createMessageAction,
  restoreMessagesAction,
  readOnly = false,
}: {
  conversations: ConversationRow[]
  createAction: ConversationCreateAction
  deleteAction: ConversationDeleteAction
  createMessageAction: ConversationMessageCreateAction
  restoreMessagesAction: ConversationMessagesRestoreAction
  readOnly?: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(
    conversations[0]?.id ?? null
  )
  const [draftById, setDraftById] = useState<Record<string, string>>({})
  const [messagesById, setMessagesById] = useState<
    Record<string, ConversationMessageRow[]>
  >({})
  const [requestedMessageIds, setRequestedMessageIds] = useState<Set<string>>(
    () => new Set()
  )
  const [loadingMessagesId, setLoadingMessagesId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [postingId, setPostingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const loadMessages = useCallback(
    (conversationId: string) => {
      setRequestedMessageIds((prev) => {
        if (prev.has(conversationId)) return prev
        const next = new Set(prev)
        next.add(conversationId)
        return next
      })
      setLoadingMessagesId(conversationId)
      startTransition(async () => {
        try {
          const result = await restoreMessagesAction(conversationId)
          setLoadingMessagesId(null)
          if (result.error) {
            setMessage({ type: "error", text: result.error })
            return
          }
          setMessagesById((prev) => ({
            ...prev,
            [conversationId]: result.messages ?? [],
          }))
        } catch {
          setLoadingMessagesId(null)
          setMessage({
            type: "error",
            text: "Unable to load conversation messages. Please try again.",
          })
        }
      })
    },
    [restoreMessagesAction]
  )

  useEffect(() => {
    if (!expandedId) return
    if (requestedMessageIds.has(expandedId)) return
    loadMessages(expandedId)
  }, [expandedId, loadMessages, requestedMessageIds])

  const runCreate = useCallback(() => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      setMessage({ type: "error", text: "Conversation title is required." })
      return
    }

    setMessage(null)
    startTransition(async () => {
      try {
        const result = await createAction(nextTitle)
        if (result.error) {
          setMessage({ type: "error", text: result.error })
          return
        }
        setTitle("")
        setMessage({ type: "success", text: "Conversation created." })
        router.refresh()
      } catch {
        setMessage({
          type: "error",
          text: "Unable to create conversation. Please try again.",
        })
      }
    })
  }, [createAction, router, title])

  const runDelete = useCallback(
    (conversationId: string) => {
      setMessage(null)
      setConfirmingDeleteId(null)
      setDeletingId(conversationId)
      startTransition(async () => {
        try {
          const result = await deleteAction(conversationId)
          setDeletingId(null)
          if (result.error) {
            setMessage({ type: "error", text: result.error })
            return
          }
          if (expandedId === conversationId) {
            setExpandedId(null)
          }
          setMessagesById((prev) => {
            const next = { ...prev }
            delete next[conversationId]
            return next
          })
          setRequestedMessageIds((prev) => {
            if (!prev.has(conversationId)) return prev
            const next = new Set(prev)
            next.delete(conversationId)
            return next
          })
          setMessage({ type: "success", text: "Conversation deleted." })
          router.refresh()
        } catch {
          setDeletingId(null)
          setMessage({
            type: "error",
            text: "Unable to delete conversation. Please try again.",
          })
        }
      })
    },
    [deleteAction, expandedId, router]
  )

  const runAddMessage = useCallback(
    (conversationId: string) => {
      const content = (draftById[conversationId] ?? "").trim()
      if (!content) {
        setMessage({ type: "error", text: "Message content is required." })
        return
      }

      setMessage(null)
      setPostingId(conversationId)
      startTransition(async () => {
        try {
          const result = await createMessageAction(conversationId, content)
          setPostingId(null)
          if (result.error) {
            setMessage({ type: "error", text: result.error })
            return
          }
          setDraftById((prev) => ({ ...prev, [conversationId]: "" }))
          setMessage({ type: "success", text: "Message added." })
          const restored = await restoreMessagesAction(conversationId)
          if (!restored.error) {
            setMessagesById((prev) => ({
              ...prev,
              [conversationId]: restored.messages ?? [],
            }))
          }
          router.refresh()
        } catch {
          setPostingId(null)
          setMessage({
            type: "error",
            text: "Unable to add message. Please try again.",
          })
        }
      })
    },
    [createMessageAction, draftById, restoreMessagesAction, router]
  )

  const totalMessages = conversations.reduce(
    (sum, conversation) => sum + conversation._count.messages,
    0
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
              : `${conversations.length} conversation${conversations.length === 1 ? "" : "s"} · ${totalMessages} message${totalMessages === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-white/28">
        Named threads keep matter research context organized. Research queries open a
        conversation and persist the question and grounded answer as messages.
      </p>

      {readOnly ? (
        <p className="mt-5 text-xs leading-relaxed text-white/28">
          Your organization role is read-only for this matter. Conversation history
          remains visible.
        </p>
      ) : (
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
            aria-label="Conversation thread title"
            maxLength={120}
            disabled={isPending}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white/80 placeholder:text-white/22 focus:border-white/[0.16] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !title.trim()}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] text-white/65 transition-colors hover:border-white/[0.18] hover:text-white/88 disabled:opacity-45"
          >
            {isPending && !deletingId && !postingId && !loadingMessagesId
              ? "Saving..."
              : "Create thread"}
          </button>
        </form>
      )}

      {message ? (
        <p
          role="status"
          aria-live="polite"
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
          conversations.map((conversation) => {
            const isExpanded = expandedId === conversation.id
            const draft = draftById[conversation.id] ?? ""
            const messages = messagesById[conversation.id]
            const isLoadingMessages =
              loadingMessagesId === conversation.id && !messages

            return (
              <div
                key={conversation.id}
                className="rounded-lg border border-white/[0.04] bg-white/[0.01]"
              >
                <div className="flex items-start justify-between gap-3 px-3.5 py-3">
                  <button
                    type="button"
                    id={`conversation-toggle-${conversation.id}`}
                    aria-expanded={isExpanded}
                    aria-controls={`conversation-panel-${conversation.id}`}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === conversation.id ? null : conversation.id
                      )
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm text-white/70">{conversation.title}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/28">
                      {fmtShortDate(conversation.createdAt)}
                      {" · "}
                      {conversation._count.messages} message
                      {conversation._count.messages === 1 ? "" : "s"}
                    </p>
                  </button>
                  {conversation.canDelete ? (
                    confirmingDeleteId === conversation.id ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setConfirmingDeleteId(null)}
                          className="rounded border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-white/[0.16] hover:text-white/60 disabled:opacity-45"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runDelete(conversation.id)}
                          className="rounded border border-red-400/25 bg-red-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-red-200/75 transition-colors hover:border-red-400/40 disabled:opacity-45"
                        >
                          {deletingId === conversation.id ? "..." : "Confirm"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setMessage(null)
                          setConfirmingDeleteId(conversation.id)
                        }}
                        className="shrink-0 rounded border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-red-400/25 hover:text-red-200/70 disabled:opacity-45"
                      >
                        Delete
                      </button>
                    )
                  ) : null}
                </div>

                {isExpanded ? (
                  <div
                    id={`conversation-panel-${conversation.id}`}
                    role="region"
                    aria-labelledby={`conversation-toggle-${conversation.id}`}
                    className="border-t border-white/[0.04] px-3.5 py-3"
                  >
                    {isLoadingMessages ? (
                      <p className="text-xs leading-relaxed text-white/22">
                        Loading messages…
                      </p>
                    ) : !messages || messages.length === 0 ? (
                      <p className="text-xs leading-relaxed text-white/22">
                        No messages yet. Add a note or run research to capture the
                        exchange.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {messages.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-md border border-white/[0.04] bg-black/20 px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                                {roleLabel(entry.role)}
                              </p>
                              <p className="text-[10px] text-white/22">
                                {fmtShortDate(entry.createdAt)}
                              </p>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-white/55">
                              {entry.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!readOnly ? (
                      <form
                        className="mt-3 flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          runAddMessage(conversation.id)
                        }}
                      >
                        <textarea
                          value={draft}
                          onChange={(event) =>
                            setDraftById((prev) => ({
                              ...prev,
                              [conversation.id]: event.target.value,
                            }))
                          }
                          rows={3}
                          maxLength={8000}
                          disabled={isPending}
                          placeholder="Add a working note to this thread…"
                          aria-label={`Add note to ${conversation.title}`}
                          className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white/80 placeholder:text-white/22 focus:border-white/[0.16] focus:outline-none disabled:opacity-50"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={isPending || !draft.trim()}
                            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/65 transition-colors hover:border-white/[0.18] hover:text-white/88 disabled:opacity-45"
                          >
                            {postingId === conversation.id ? "Saving..." : "Add note"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
