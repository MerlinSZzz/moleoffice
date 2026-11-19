// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
const tablePath = new URL('../../src/config/provider-setup/providers.json', import.meta.url)
import { readKey } from './readkey.mjs'
import { Refusal, sentence } from './keycheck.mjs'
import { askTrial, checkTrial } from '../../src/config/provider-setup/trial.mjs'
import { customKey } from '../../src/config/provider-setup/custom-key.mjs'
import { trialSays } from '../../src/config/provider-setup/trial-words.mjs'

const safeName = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) && value !== '.' && value !== '..'
export function providers() {
  const rows = JSON.parse(readFileSync(tablePath, 'utf8'))
  if (!Array.isArray(rows) || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('Invalid provider table')
  for (const row of rows) {
    if (!safeName(row.id) || !safeName(row.folder) || !safeName(row.file) || !Number.isSafeInteger(row.min) || row.min < 1 ||
      typeof row.prefix !== 'string' || typeof row.name !== 'string' || typeof row.page !== 'string' ||
      typeof row.documentation !== 'string' || typeof row.instructions !== 'string' || (typeof row.scopes !== 'string' && (typeof row.permissions !== 'object' || row.permissions === null))) throw new Error('Invalid provider table')
    if (row.trial !== null) checkTrial(row.trial)
  }
  return rows
}
export function provider(id) {
  if (id.startsWith('custom:')) {
    const name = id.slice('custom:'.length)
    if (!safeName(name)) return undefined
    return { id, name, page: '', documentation: '', instructions: '', scopes: '', ...customKey(name), prefix: '', min: 1, trial: null, trialDescription: 'This custom key is checked locally; no provider is contacted.', trialDescriptionZh: '自定义密钥只在本地检查，不连接提供商。' }
  }
  return providers().find((row) => row.id === id)
}
export async function trial(row, file) {
  const value = readKey(file, { prefix: row.prefix, min: row.min })
  if (row.trial === null) return sentence('The private file and key shape passed. No provider was contacted.', '私有文件和密钥格式检查通过；没有连接提供商。')
  let answer
  try { answer = await askTrial(row.trial, value) }
  catch { throw new Refusal(trialSays('unreachable', undefined, process.env.KEY_SETUP_LANG)) }
  if (answer.outcome !== 'passed') throw new Refusal(trialSays(answer.outcome, answer.status, process.env.KEY_SETUP_LANG))
  return trialSays('passed', answer.status, process.env.KEY_SETUP_LANG)
}
