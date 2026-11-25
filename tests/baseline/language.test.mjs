import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

test('UI-01 language changes update translated content and survive remount', async () => {
  const { outputFiles } = await build({
    stdin: { resolveDir: resolve(process.env.PAPERTRACE_UI_ROOT, 'frontend/src'),
      contents: "export {LanguageProvider} from './i18n'; export {LanguagePicker} from './components/LanguagePicker'" },
    bundle: true, write: false, jsx: 'automatic', format: 'cjs', external: ['react', 'react/*'],
  })
  const mod = { exports: {} }
  compileFunction(outputFiles[0].text, ['module', 'require'])(mod, createRequire(import.meta.url))
  const { LanguageProvider, LanguagePicker } = mod.exports
  const dom = new JSDOM('<main></main>', { url: 'https://papertrace.test' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })
  async function choose(language) {
    const select = document.querySelector('select')
    if (select) {
      await act(() => {
        select.value = language
        select.dispatchEvent(new window.Event('change', { bubbles: true }))
      })
      return
    }
    await act(() => document.querySelector('button[aria-expanded]').click())
    await act(() => document.querySelector(`button[lang="${language}"]`).click())
  }
  async function mount() {
    const root = createRoot(document.querySelector('main'))
    await act(() => root.render(React.createElement(LanguageProvider, null, React.createElement(LanguagePicker))))
    return root
  }
  function check(lang, label, preference = lang) {
    assert.equal(document.documentElement.lang, lang)
    const select = document.querySelector('select')
    assert.equal(select ? select.getAttribute('aria-label') : document.querySelector('button').textContent, label)
    if (select) assert.equal(select.value, preference)
  }
  let root = await mount()
  try {
    check('en', 'Language', 'system')
    await choose('zh-CN')
    check('zh-CN', '语言')
    await act(() => root.unmount())
    root = await mount()
    check('zh-CN', '语言')
    await choose('en')
    check('en', 'Language')
  } finally {
    await act(() => root.unmount())
    dom.window.close()
  }
})
