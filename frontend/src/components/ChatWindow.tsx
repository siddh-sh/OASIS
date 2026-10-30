import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { agentApi, type ChatMessage } from '@/api/agent'
import { ApiError } from '@/api/client'
import { MessageBubble } from '@/components/MessageBubble'
import { describeError } from '@/i18n/errors'

export function ChatWindow() {
  const { t, i18n } = useTranslation()
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
      const res = await agentApi.chat(text, conversationId, i18n.language)
      setConversationId(res.conversation_id)
      // Guard the shape rather than trusting it: pushing an undefined message
      // renders a MessageBubble with no `role`, which throws during render and
      // blanks the entire page — a far worse failure than a visible error.
      const reply: ChatMessage =
        res.message && typeof res.message.content === 'string'
          ? res.message
          : { role: 'assistant', content: t('chat.unexpectedShape') }
      setMessages((prev) => [...prev, reply])
    } catch (e) {
      const fallback =
        e instanceof ApiError && e.status === 501
          ? t('chat.notWired')
          : t('chat.requestFailed', { message: describeError(e) })
      setMessages((prev) => [...prev, { role: 'assistant', content: fallback }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-ocean-200 dark:border-ocean-800">
      <div className="oasis-scroll flex-1 space-y-3 overflow-y-auto p-4" data-lenis-prevent>
        {messages.length === 0 && <p className="text-sm text-ocean-500">{t('chat.emptyHint')}</p>}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
      </div>
      <div className="flex gap-2 border-t border-ocean-200 p-3 dark:border-ocean-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder={t('chat.placeholder')}
          className="flex-1 rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-900"
        />
        <button
          onClick={() => void send()}
          disabled={sending}
          className="rounded-md bg-ocean-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? t('chat.sending') : t('chat.send')}
        </button>
      </div>
    </div>
  )
}
