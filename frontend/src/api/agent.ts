import { apiFetch } from '@/api/client'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  sources?: string[]
}

export interface ChatResponse {
  conversation_id: number
  message: ChatMessage
}

export const agentApi = {
  chat: (message: string, conversationId?: number) =>
    apiFetch<ChatResponse>('/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversation_id: conversationId }),
    }),
}
