import { useState } from 'react'
import { agentApi, type ChatMessage } from '@/api/agent'
import { ApiError } from '@/api/client'
import { MessageBubble } from '@/components/MessageBubble'

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<number>()

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setSending(true)
    try {
      const res = await agentApi.chat(text, conversationId)
      setConversationId(res.conversation_id)
      setMessages((prev) => [...prev, res.message])
    } catch (e) {
      const fallback =
        e instanceof ApiError && e.status === 501
          ? "The NL chatbot isn't wired up yet — it lands in Phase 5 (LangGraph pipeline + pgvector RAG)."
          : `Couldn't get a response: ${(e as Error).message}`
      setMessages((prev) => [...prev, { role: 'assistant', content: fallback }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-ocean-200 dark:border-ocean-800">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-ocean-500">
            Ask a data question — e.g. "What's the average SST off the Kerala coast this month?"
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
      </div>
      <div className="flex gap-2 border-t border-ocean-200 p-3 dark:border-ocean-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="Ask about ocean, weather, species, fisheries, or molecular data…"
          className="flex-1 rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-900"
        />
        <button
          onClick={() => void send()}
          disabled={sending}
          className="rounded-md bg-ocean-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
