// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { join } from 'node:path'
import { theOwnersHome } from '../../config/install-the-entry.mjs'
import providerRows from '../../config/provider-setup/providers.json' with { type: 'json' }
import { assertPrivateKeyStorageAvailable, readPrivateKey, Refusal, writePrivateKey } from '../../config/provider-setup/private-key.mjs'
import { askTrial, checkTrial } from '../../config/provider-setup/trial.mjs'
import { customKey } from '../../config/provider-setup/custom-key.mjs'
import { trialSays } from '../../config/provider-setup/trial-words.mjs'
import { theGuideInSettings } from '@shared/provider-guide.ts'

export interface ProviderSetupRow {
  id: string
  name: string
  folder: string
  file: string
  prefix: string
  min: number
  page: string
  documentation: string
  instructions: string
  scopes?: string
  permissions?: Record<string, string[]>
  otherPermissionsOff?: string
  expiry?: string
  trial: { url: string; method: string; answers?: { status: number; name?: string; means: string }[] } | null
  trialDescription?: string
}
export interface ProviderKeyInput {
  provider: string
  value: string
  replace?: boolean
  lang?: 'en' | 'zh'
  customName?: string
  prefix?: string
  min?: number
}
/** WHERE A KEY IS SAVED: a file in a folder of the home's .config. Settings and its tests read the path from here. */
export function keyFileFor(home: string, row: Pick<ProviderSetupRow, 'folder' | 'file'>): string { return join(home, '.config', row.folder, row.file) }
export { customKey }
const safeName = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v) && v !== '.' && v !== '..' && v.length <= 100

export function createProviderKeySetup(options: { home?: string; providers?: ProviderSetupRow[] } = {}) {
  // The home is asked for when a key is saved or tried, as the other doors that write under it ask, not when the doors are made.
  const home = (): string => options.home ?? theOwnersHome()
  const rows: ProviderSetupRow[] = options.providers ?? providerRows
  function rowFor(id: string): ProviderSetupRow {
    const row = rows.find((entry) => entry.id === id)
    if (!row || !safeName(row.id) || !safeName(row.folder) || !safeName(row.file) || typeof row.prefix !== 'string' || !Number.isSafeInteger(row.min) || row.min < 1) throw new Error('Choose a valid provider.')
    return row
  }
  return {
    list() {
      return rows.map(theGuideInSettings).map(({ id, name, page, documentation, instructions, scopes, permissions, otherPermissionsOff, expiry, trialDescription }) => ({
        id, name, page, documentation, instructions, scopes, permissions, otherPermissionsOff, expiry, trialDescription,
      }))
    },
    /** False where the shared writer refuses to save, so the page says so before the person types a key. */
    savingAvailable(): boolean {
      try { assertPrivateKeyStorageAvailable(); return true } catch { return false }
    },
    save(input: ProviderKeyInput) {
      if (typeof input.value !== 'string' || input.value.length > 4096 || (input.replace !== undefined && typeof input.replace !== 'boolean')) throw new Error('Enter a key of at most 4096 characters.')
      let row: ProviderSetupRow
      if (input.provider === 'custom') {
        if (!safeName(input.customName) || typeof input.prefix !== 'string' || input.prefix.length > 100 || !Number.isSafeInteger(input.min) || input.min! < 1 || input.min! > 4096) throw new Error('Choose a name, prefix and minimum length for the custom key.')
        row = { id: 'custom', name: input.customName, ...customKey(input.customName), prefix: input.prefix, min: input.min!, page: '', documentation: '', instructions: '', trial: null }
      } else row = rowFor(input.provider)
      writePrivateKey(keyFileFor(home(), row), input.value, { prefix: row.prefix, min: row.min, replace: input.replace === true, lang: input.lang })
      return { saved: true, trialAvailable: row.trial !== null }
    },
    async trial(id: string) {
      const row = rowFor(id)
      if (row.trial === null) return { outcome: 'not-tested', says: 'This key has not been tested with the provider.' }
      // EACH SENTENCE BELOW REACHES THE PAGE, because the door passes a Refusal's words on. None of them carries the key.
      try { checkTrial(row.trial) } catch { throw new Refusal('The trial address is not allowed.') }
      const file = keyFileFor(home(), row)
      let value: string
      try { value = readPrivateKey(file, row.prefix, row.min) } catch { throw new Refusal('The private key could not be read safely. Check the file and try again.') }
      let answer: { outcome: string; status: number }
      try { answer = await askTrial(row.trial, value) } catch { throw new Refusal(trialSays('unreachable')) }
      if (answer.outcome === 'passed' || answer.outcome === 'too-broad') return { outcome: answer.outcome, says: trialSays(answer.outcome, answer.status) }
      throw new Refusal(trialSays(answer.outcome, answer.status))
    },
  }
}
