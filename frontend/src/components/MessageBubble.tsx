import clsx from 'clsx'
import { SourceCitation } from '@/components/SourceCitation'
import type { ChatMessage } from '@/api/agent'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[75%] rounded-lg px-4 py-2 text-sm',
          isUser
            ? 'bg-ocean-600 text-white'
            : 'bg-ocean-100 text-ocean-950 dark:bg-ocean-900 dark:text-ocean-100',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.sources && <SourceCitation sources={message.sources} />}
      </div>
    </div>
  )
}
