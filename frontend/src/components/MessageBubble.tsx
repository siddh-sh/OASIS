import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { SourceCitation } from '@/components/SourceCitation'
import type { ChatMessage } from '@/api/agent'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
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
        <p
          className="whitespace-pre-wrap"
          // The user's own words are their data; answers are model-written.
          translate={isUser ? 'no' : undefined}
          data-generated={!isUser && !message.fallback_code ? 'llm' : undefined}
        >
          {/* A pipeline failure is shown from its code, in the reader's
              language; real answers are already written in it by the model. */}
          {message.fallback_code
            ? `${t(`chat.fallback.${message.fallback_code}`)} ${t('chat.fallback.hint')}`
            : message.content}
        </p>
        {!isUser && message.sources && <SourceCitation sources={message.sources} />}
      </div>
    </div>
  )
}
