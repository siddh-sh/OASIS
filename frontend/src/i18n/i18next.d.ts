import 'i18next'
import type en from './locales/en.json'

/**
 * Types every t('…') key against the English dictionary, so a misspelt or
 * removed key is a compile error rather than a raw key on screen.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}
