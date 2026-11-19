// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theWordsRecordsOfEachCard` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * `ROLE_CARD_WORDS_KIND` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * `roleNameOf` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { db } from './client.ts'
import { records } from './schema.ts'
import type { TheWordsRecord } from '../lib/card-words.ts'

/**
 * EVERY LIVE WORDS RECORD, by the card's name, and all of them where one card has two. It never
 * throws. The added cards are read with it, and they name two records as a problem of that one card
 * rather than stopping the start.
 */
export function theWordsRecordsOfEachCard(): ReadonlyMap<string, readonly TheWordsRecord[]> {
  const out = new Map<string, TheWordsRecord[]>()
  for (const row of db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(and(eq(records.kind, ROLE_CARD_WORDS_KIND), isNull(records.deletedAt)))
    .all()) {
    const name = roleNameOf(row.data)
    if (name === null) continue
    out.set(name, [...(out.get(name) ?? []), { id: row.id, data: row.data as Record<string, unknown> }])
  }
  return out
}
export const ROLE_CARD_WORDS_KIND = 'role_card_words'
export function roleNameOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const name = (data as Record<string, unknown>)['roleName']
  return typeof name === 'string' ? name : null
}
