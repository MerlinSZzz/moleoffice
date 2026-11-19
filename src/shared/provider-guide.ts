// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import providerRows from '../config/provider-setup/providers.json' with { type: 'json' }
import type { WordKey } from './i18n.ts'

/** The parts of a provider's guide that Settings draws as sentences, in the order the panel draws them. */
export const GUIDE_PARTS = ['instructions', 'scopes', 'otherPermissionsOff', 'expiry', 'trialDescription'] as const
export type GuidePart = (typeof GUIDE_PARTS)[number]
type GuideRow = { id: string; name: string; permissions?: Record<string, string[]> } & { [P in GuidePart]?: string }

/**
 * The word key of one part of a provider's guide: its name, a sentence, or one permission line. The English list holds
 * every such key of the table's rows, because it spreads PROVIDER_GUIDE_WORDS; a key it does not hold is drawn marked.
 */
export function providerGuideWord(id: string, part: 'name' | GuidePart | `permission.${string}`): WordKey {
  return `providerSetup.guide.${id}.${part}` as WordKey
}

/**
 * A PROVIDER'S GUIDE AS SETTINGS SHOWS IT. The table writes Resend's guide for the office's own sending domain, and
 * Settings tells the person to use the domain they verified. Settings' door and the word lists both read this.
 */
export function theGuideInSettings<R extends GuideRow>(row: R): R {
  if (row.id !== 'resend') return row
  return { ...row, instructions: row.instructions?.replaceAll('moleoffice.com', 'your verified domain'), scopes: row.scopes?.replaceAll('moleoffice.com', 'your verified domain') }
}

/** Every provider's guide as list words, so the panel draws them in the reader's language once they are translated. */
export const PROVIDER_GUIDE_WORDS: Readonly<Record<string, string>> = Object.fromEntries(
  (providerRows as GuideRow[]).map(theGuideInSettings).flatMap((row) => [
    [providerGuideWord(row.id, 'name'), row.name],
    ...GUIDE_PARTS.flatMap((part) => (row[part] === undefined ? [] : [[providerGuideWord(row.id, part), row[part]]])),
    ...Object.entries(row.permissions ?? {}).map(([resource, actions]) => [providerGuideWord(row.id, `permission.${resource}`), `${resource}: ${actions.join(', ')}`]),
  ]),
)
