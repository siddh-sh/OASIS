import { ChatWindow } from '@/components/ChatWindow'

export function ChatbotPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">NL Chatbot</h1>
        <p className="text-sm text-ocean-500">Ask data questions; the coordinator invokes the agent pipeline as tools.</p>
      </div>
      <div className="min-h-0 flex-1">
        <ChatWindow />
      </div>
    </div>
  )
}
