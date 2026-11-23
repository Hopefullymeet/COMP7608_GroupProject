import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { zhCN } from './zh-CN'

type Language = 'en' | 'zh-CN'
export type Message = [message: string, ...values: unknown[]]
export type Translate = (...message: Message) => string

type CountedItem = 'addition' | 'call' | 'comparison row' | 'draft sentence' | 'matching page'
  | 'model call' | 'note' | 'paper' | 'picked citation' | 'proposed addition'
  | 'relation' | 'statement' | 'step' | 'tool call' | 'topic'

export function count(tr: Translate, value: number, item: CountedItem) {
  return tr(`{0} ${item}${value === 1 ? '' : 's'}`, value)
}

const STORAGE_KEY = 'papertrace.language'

type LanguagePreference = Language | 'system'
export const nativeMac = isTauri() && /Mac/.test(navigator.platform)

function initialLanguage(): LanguagePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'zh-CN' || saved === 'en' ? saved : 'system'
  } catch {
    return 'system'
  }
}

const LanguageContext = createContext<{
  language: Language
  preference: LanguagePreference
  setLanguage: (language: LanguagePreference) => void
  tr: Translate
} | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setLanguage] = useState(initialLanguage)
  const [locale, setLocale] = useState(navigator.language)
  useEffect(() => {
    const sync = () => setLocale(navigator.language)
    window.addEventListener('languagechange', sync)
    return () => window.removeEventListener('languagechange', sync)
  }, [])
  const language = preference === 'system' ? (/^zh/i.test(locale) ? 'zh-CN' : 'en') : preference

  useEffect(() => {
    document.documentElement.lang = language
    if (nativeMac) void invoke('set_menu_language', { language }).catch(console.error)
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // The current session can still switch languages when storage is unavailable.
    }
  }, [language, preference])

  const tr: Translate = (message, ...values) => {
    const text = language === 'zh-CN' && Object.hasOwn(zhCN, message) ? zhCN[message] : message
    return values.length ? text.replace(/\{(\d+)\}/g, (token, index) =>
      index < values.length ? String(values[index] ?? '') : token) : text
  }

  return <LanguageContext.Provider value={{ language, preference, setLanguage, tr }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('LanguageProvider is missing')
  return context
}
