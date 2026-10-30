import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import bn from './locales/bn.json'
import en from './locales/en.json'
import gu from './locales/gu.json'
import kn from './locales/kn.json'
import ml from './locales/ml.json'
import mr from './locales/mr.json'
import or_ from './locales/or.json'
import ta from './locales/ta.json'
import te from './locales/te.json'

/**
 * One language per coastal state this platform actually covers, plus
 * English as the default/fallback. Not a general-purpose i18n rollout —
 * scoped to the same 9 states as the region-boundary and audience-mode
 * features (see viewMode.ts, MapView.tsx's regionShapes).
 *
 * Only the app's static UI chrome (nav, page headers, login) is translated
 * here. Dynamic content — chatbot answers, chart labels, species names —
 * stays in whatever language the underlying source returns; translating
 * that live is a separate, harder problem (LLM prompting or a translation
 * API, with real accuracy risk on domain-specific terms) and is out of
 * scope for this pass.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', state: null },
  { code: 'ml', label: 'മലയാളം (Malayalam)', state: 'Kerala' },
  { code: 'mr', label: 'मराठी (Marathi)', state: 'Maharashtra' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)', state: 'Gujarat' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', state: 'Karnataka' },
  { code: 'ta', label: 'தமிழ் (Tamil)', state: 'Tamil Nadu' },
  { code: 'te', label: 'తెలుగు (Telugu)', state: 'Andhra Pradesh' },
  { code: 'or', label: 'ଓଡ଼ିଆ (Odia)', state: 'Odisha' },
  { code: 'bn', label: 'বাংলা (Bengali)', state: 'West Bengal' },
] as const

/** Languages maintained key-for-key with English (enforced by locales.test.ts). */
export const FULLY_SUPPORTED: string[] = SUPPORTED_LANGUAGES.map((l) => l.code)

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

/**
 * Goa has no boundary-derived language of its own here: Konkani (its
 * official language) doesn't have the translation-library support the other
 * eight do, and Marathi is widely spoken/understood there too — so Goa maps
 * to Marathi rather than inventing lower-quality Konkani strings.
 */
export const STATE_TO_LANGUAGE: Record<string, LanguageCode> = {
  Kerala: 'ml',
  Maharashtra: 'mr',
  Goa: 'mr',
  Gujarat: 'gu',
  Karnataka: 'kn',
  'Tamil Nadu': 'ta',
  'Andhra Pradesh': 'te',
  Odisha: 'or',
  'West Bengal': 'bn',
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ml: { translation: ml },
    mr: { translation: mr },
    gu: { translation: gu },
    kn: { translation: kn },
    ta: { translation: ta },
    te: { translation: te },
    or: { translation: or_ },
    bn: { translation: bn },
  },
  lng: 'en',
  // Every language is maintained key-for-key with English (enforced by
  // locales.test.ts); the fallback only matters if a key is ever added to
  // English first, and then it shows English rather than a raw key.
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  // Surface a missing key during development instead of letting it fall
  // back silently — the fallback hides exactly the gaps worth fixing.
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (lngs, _ns, key) => {
    if (!FULLY_SUPPORTED.includes(i18n.language)) return
    console.warn(`[i18n] missing key "${key}" for ${lngs.join(', ')}`)
  },
})

// Keep <html lang> in step so screen readers pronounce the text in the right
// language and the browser picks a Devanagari-capable font for Marathi.
const syncDocumentLanguage = (language: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}
syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
