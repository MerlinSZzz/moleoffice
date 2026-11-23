// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { tsImport } from 'tsx/esm/api'

const { words } = await tsImport('../../src/words.ts', import.meta.url)
export const readyWords = [words.en.ready, words.zh.ready]
export const packLoadingWords = [words.en.packLoading, words.zh.packLoading]

// Playwright serializes this function into the page, so it uses only its argument and document.
export function readsSettled(ready) {
  const lines = [...document.querySelectorAll('.read-status > p')]
  if (lines.length !== 5) return false
  const shown = lines.filter(line => !line.hidden && (line.textContent ?? '').trim() !== '')
  if (shown.length !== 1 || shown[0] !== lines[0]) return false
  const text = shown[0].textContent.trim()
  return ready.some(word => text.startsWith(word + ' · ') && text.slice(word.length + 3).trim() !== '')
}
