// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** An explicit synthetic contract for the installed private parse seam; never loads native DSH. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Observe the synthetic fixtures' scalar lines only; this is not a production YAML reader. */
export const CAPTURE_DSH_SELECTION = String.raw`function captureDshSelection(text, typed = false) {
  const sections = {}; let section
  for (const line of text.split(/\r?\n/)) {
    const header = /^([A-Za-z0-9_-]+):/.exec(line)
    if (header) { section = header[1]; sections[section] = {}; continue }
    const scalar = /^  ([A-Za-z0-9_-]+):[ \t]+([^\r\n]*)$/.exec(line)
    if (section && scalar) {
      const raw = scalar[2].trim(), quoted = /^"(?:\\.|[^"\\])*"/.exec(raw)
      const token = quoted === null ? raw.replace(/[ \t]+#.*/, '').trim() : quoted[0]
      let value = token
      if (typed || quoted !== null) { try { value = JSON.parse(token) } catch {} }
      if (typed && quoted === null && text.startsWith('%YAML 1.1\n') && ['agent-default-model','llm-deepseek'].includes(section) && token === 'off') value = false
      sections[section][scalar[1]] = value
    }
  }
  return sections
}`

export const SYNTHETIC_DSH_READER = CAPTURE_DSH_SELECTION + String.raw`
export class FileSettingsProvider {
  parse(text) {
    if (text.includes('SYNTHETIC_NATIVE_DIAGNOSTIC')) { console.log('SYNTHETIC_SECRET_CANARY'); console.error('SYNTHETIC_SECRET_CANARY'); process.emitWarning('SYNTHETIC_SECRET_CANARY') }
    const value = text.trim()
    const keys = [...text.matchAll(/^["']?([A-Za-z0-9_-]+)["']?:/gm)].map(match => match[1])
    if (/^[^\n]*:\s*\[[^\]\n]*(?:\n|$)/m.test(text) || /^- /m.test(text) || (text.includes('\n---') && !text.startsWith('%YAML 1.1\n---\n')) || (/^\.\.\.$/m.test(text) && text.trim().split('\n').at(-1) !== '...') || new Set(keys).size !== keys.length || (value !== '' && value !== '{}' && !keys.length)) throw new Error('Synthetic malformed document; source is never printed')
    const result = captureDshSelection(text, true)
    if (/^  reasoningEffort:[^ \t\r\n]/m.test(text)) result['llm-deepseek'] = 'synthetic native scalar section'
    return result
  }
}
`

export function syntheticDshReader(folder: string): string {
  mkdirSync(folder, { recursive: true })
  const file = join(folder, 'synthetic-dsh-reader.mjs')
  writeFileSync(file, SYNTHETIC_DSH_READER)
  return file
}
