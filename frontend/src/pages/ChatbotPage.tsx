import { useTranslation } from 'react-i18next'
import { ChatWindow } from '@/components/ChatWindow'

export function ChatbotPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.chatbot.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.chatbot.subtitle')}</p>
      </div>
      <div className="min-h-0 flex-1">
        <ChatWindow />
      </div>
    </div>
  )
}
