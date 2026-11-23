import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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

function initialLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'zh-CN' ? 'zh-CN' : 'en'
  } catch {
    return 'en'
  }
}

const LanguageContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
  tr: Translate
} | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // The current session can still switch languages when storage is unavailable.
    }
  }, [language])

  const tr: Translate = (message, ...values) => {
    const text = language === 'zh-CN' && Object.hasOwn(zhCN, message) ? zhCN[message] : message
    return values.length ? text.replace(/\{(\d+)\}/g, (token, index) =>
      index < values.length ? String(values[index] ?? '') : token) : text
  }

  return <LanguageContext.Provider value={{ language, setLanguage, tr }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('LanguageProvider is missing')
  return context
}
