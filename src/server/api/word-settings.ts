// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { gatePosition } from '../../config/settings.mjs'
import { createHash } from 'node:crypto'
import { englishWords } from '@shared/words/joined.ts'
import { effectiveWord, savedWords, shippedWord, substitutions, translationStanding, validateWord, type SavedWord } from '@shared/word-settings.ts'
import { fingerprintOfEnglish } from '@shared/words/waiting.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { writeDownASettingChange } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { gateMet } from '../lib/gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { route } from '../lib/route.ts'
import { announce } from '../lib/events.ts'
import { loadSavedWords, WORD_SETTING_PREFIX, wordRevision, savedWordsRevision, storedWordNotUsed, storedWordsNotUsed } from '../lib/word-settings.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const query = z.strictObject({ key: z.string().optional(), search: z.string().max(200).optional(), offset: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(100).optional() })
const common = { key: z.string().min(1), version: z.string(), because: z.string().trim().min(1).max(500) }
const edit = z.strictObject({ ...common, en: z.unknown(), zh: z.unknown(), chineseMatchesEnglish: z.boolean() })
const restore = z.strictObject({ ...common, from: z.union([z.literal('shipped'), z.string().min(1)]) })
function refuse(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'wordSettingRefused', values: { reason } })
}
/** The version a writer must send back. A saved word that is not used is part of it, so a stale press is refused. */
function versionOf(key: string): string {
  const notUsed = storedWordNotUsed(key)
  return createHash('sha256').update(JSON.stringify(effectiveWord(key)) + ':' + wordRevision(key) + (notUsed === null ? '' : ':' + JSON.stringify(notUsed.stored))).digest('hex')
}
/** Every saved word this release cannot use, whatever the search, with the version its restore press needs. */
function notUsedWords() {
  return storedWordsNotUsed().map(one => ({ ...one, version: versionOf(one.key) }))
}
function row(key: string) {
  const shipped = shippedWord(key), current = effectiveWord(key)
  if (shipped === null || current === null) refuse('This word has no shipped source.', 404)
  return { key, ...current, shipped, version: versionOf(key), standing: translationStanding(current), changed: Object.hasOwn(savedWords(), key), substitutions: substitutions(shipped.en), plural: typeof shipped.en !== 'string' }
}
function history(key: string, offset = 0) {
  const rows = sqlite.prepare('SELECT id, at, actor_type, actor_id, old_value, new_value FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 11 OFFSET ?').all('setting:word:' + key, offset) as { id: string; at: string; actor_type: string; actor_id: string; old_value: string | null; new_value: string | null }[]
  return { versions: rows.slice(0, 10).map(r => ({ id: r.id, at: r.at, by: { type: r.actor_type, id: r.actor_id }, before: r.old_value === null ? null : JSON.parse(r.old_value), after: r.new_value === null ? null : JSON.parse(r.new_value) })), next: rows.length > 10 ? offset + 10 : null }
}
export async function wordSettingsRoutes(app: FastifyInstance): Promise<void> {
  loadSavedWords()
  app.get('/words/effective', route('office.effective-words', 'remote', 'Read the office-wide saved page words and the last word-change stamp. Only overrides are carried; shipped sources remain in the program.'), async () => ({ words: savedWords(), revision: savedWordsRevision() }))
  app.get('/words/table', route('office.word-table', 'remote', 'Read English beside Chinese, shipped sources, translation freshness and the version, and every saved word this release cannot use. Query key or search, offset and limit (1 to 100).'), async req => {
    const parsed = query.safeParse(req.query)
    if (!parsed.success) refuse('Use a word key or search, a non-negative offset and a limit from 1 to 100.')
    const asked = parsed.data
    if (asked.key !== undefined) return { words: [row(asked.key)], count: 1, next: null, storedButNotUsed: notUsedWords() }
    const search = (asked.search ?? '').toLowerCase()
    const keys = Object.keys(englishWords()).sort().filter(key => search === '' || [key, JSON.stringify(effectiveWord(key))].join(' ').toLowerCase().includes(search))
    const offset = asked.offset ?? 0, limit = asked.limit ?? 25
    return { words: keys.slice(offset, offset + limit).map(row), count: keys.length, next: offset + limit < keys.length ? offset + limit : null, storedButNotUsed: notUsedWords() }
  })
  app.get('/words/history', route('office.word-history', 'remote', 'Read ten previous word choices, with writer, time, reason and complete before and after values. Query key and optional offset.'), async req => {
    const parsed = query.safeParse(req.query)
    if (!parsed.success || parsed.data.key === undefined) refuse('Name a word key and an optional non-negative offset.')
    row(parsed.data.key)
    return history(parsed.data.key, parsed.data.offset)
  })
  async function write(req: Parameters<typeof actorFrom>[0], restoring: boolean) {
    const actor = actorFrom(req)
    // At off the gate who-changes-the-page-words-and-sidebar lets any agent its own key proves through too, and counts it.
    if (!thePersonIsProved(actor) && actor.theOwnersAuthority?.holds !== true && !theKeyProvesASecretary(actor)) {
      const keyed = anAgentItsOwnKeyProves(actor) !== null
      if (!keyed && gatePosition('who-changes-the-page-words-and-sidebar') !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-page-words-and-sidebar', 'change or put back page words')
      if (!keyed || gateMet('who-changes-the-page-words-and-sidebar') === 'block') refuse('Only the owner or a secretary with its own key may change page words.', 403)
    }
    const parsed = (restoring ? restore : edit).safeParse(req.body)
    if (!parsed.success) refuse('Send a word key, the version you read, a reason and the complete choice. Do not send extra fields.')
    const body = parsed.data, notUsed = storedWordNotUsed(body.key)
    /** The stored row and its ledger entry change in one transaction. Then every reader reloads. */
    const keep = (removed: boolean, choice: SavedWord | null, before: { choice: SavedWord | null }) => {
      sqlite.transaction(() => {
        if (removed) sqlite.prepare('DELETE FROM runtime_settings WHERE name=?').run(WORD_SETTING_PREFIX + body.key)
        else sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(WORD_SETTING_PREFIX + body.key, JSON.stringify(choice))
        writeDownASettingChange(actor, { setting: 'word:' + body.key, field: 'page word', before: { ...before, ...(notUsed === null ? {} : { storedButNotUsed: notUsed.stored }) }, after: { choice, because: body.because }, workspaceId: workspaceOf(req) })
      })()
      loadSavedWords()
      announce({ name: 'machine.changed', changed: ['settings'] })
    }
    // A saved word for a key this release does not have has no row to read. Its shipped restore removes it.
    if (shippedWord(body.key) === null && notUsed !== null && 'from' in body && body.from === 'shipped') {
      if (versionOf(body.key) !== body.version) refuse('This word changed after you read it. Read it again before saving.', 409)
      keep(true, null, { choice: null })
      return { key: body.key, removed: true, storedButNotUsed: notUsedWords() }
    }
    const before = row(body.key)
    if (before.version !== body.version) refuse('This word changed after you read it. Read it again before saving.', 409)
    let choice: SavedWord
    if ('from' in body) {
      if (body.from === 'shipped') choice = before.shipped
      else {
        const revision = sqlite.prepare('SELECT new_value FROM changes WHERE id = ? AND record_id = ?').get(body.from, 'setting:word:' + body.key) as { new_value: string | null } | undefined
        if (!revision?.new_value) refuse('That version is not in this word’s history.', 404)
        choice = JSON.parse(revision.new_value).choice as SavedWord
        // A version that removed a saved word for a key this release did not have holds no word.
        if (choice === null) refuse('That version holds no word to put back. Use the shipped word instead.')
      }
    } else {
      try {
        validateWord(body.en, before.shipped.en, 'en')
        if (body.zh !== null) validateWord(body.zh, before.shipped.zh ?? body.en, 'zh')
        else if (before.shipped.zh !== null) throw new Error('Keep the Chinese line. It may be marked as needing translation.')
      } catch (error) { refuse(error instanceof Error ? error.message : String(error)) }
      choice = { en: body.en as SavedWord['en'], zh: body.zh as SavedWord['zh'], zhFrom: body.chineseMatchesEnglish && body.zh !== null ? fingerprintOfEnglish(body.en) : before.zhFrom }
      if (JSON.stringify(body.zh) !== JSON.stringify(before.zh) && !body.chineseMatchesEnglish) refuse('Confirm which English this changed Chinese line was made from.')
    }
    // Validate a historical choice too: a new release may have changed the required substitutions.
    try { validateWord(choice.en, before.shipped.en, 'en'); if (choice.zh !== null) validateWord(choice.zh, before.shipped.zh ?? choice.en, 'zh') }
    catch (error) { refuse(error instanceof Error ? error.message : String(error)) }
    keep('from' in body && body.from === 'shipped', choice, { choice: { en: before.en, zh: before.zh, zhFrom: before.zhFrom } })
    return row(body.key)
  }
  app.post('/words/table', route('office.set-word', 'remote', 'Save one office-wide word. Owner or authenticated secretary; while the gate who-changes-the-page-words-and-sidebar is off, any agent proved by its own key too, and it is counted. Validate substitutions, plural forms and the version before writing; store writer, reason, old and new values.'), req => write(req, false))
  app.post('/words/restore', route('office.restore-word', 'remote', 'Restore one word from its own saved history or explicitly from shipped defaults, through the same permission and validation checks. A shipped restore also removes a saved word this release cannot use, for a key it does not have too.'), req => write(req, true))
}
export type WordTableRow = ReturnType<typeof row>
export type AWordNotUsed = ReturnType<typeof notUsedWords>[number]
export type WordHistory = ReturnType<typeof history>
