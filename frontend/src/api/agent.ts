import { apiFetch } from '@/api/client'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  sources?: string[]
  /** Set when the pipeline failed; the UI renders the message for this code
   *  in the reader's language instead of the stored English `content`. */
  fallback_code?: 'malformed_tool_call' | 'rate_limit' | 'pipeline_failed' | null
}

export interface ChatResponse {
  conversation_id: number
  message: ChatMessage
}

export const agentApi = {
  /** `language` makes the model answer in the UI language. */
  chat: (message: string, conversationId?: number, language = 'en') =>
    apiFetch<ChatResponse>('/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversation_id: conversationId, language }),
    }),
}
