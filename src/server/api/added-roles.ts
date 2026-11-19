// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readParticipant } from '../db/read-participant.ts'
import { theWriterAStampNames } from '../lib/records.ts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { sqlite } from '../db/client.ts'
import { actorFrom, actorWithTheWordsItActsOn } from '../lib/http.ts'
import { theSecretaryActingForThePerson, writeDownASettingChange } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { sayASecretaryChangedItForThem } from '../lib/changed-from-another-computer.ts'
import { announce } from '../lib/events.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { ADDED_ROLE_PREFIX, removedAddedRoleNames, addedRoles, checkAddedRole, loadAddedRoles, lockedRoleProblem, previewAddedRole, sortedRoleCard } from '../lib/added-roles.ts'
import { keepTheWordsOfAnAddedCard, removeTheWordsOfAnAddedCard } from '../lib/card-words.ts'
import { theCardWithoutItsWords, type RoleCard } from '@shared/roles.ts'
import { warrantBody } from './records.ts'

const common = { version: z.string().nullable(), because: z.string().trim().min(1).max(500), warrant: warrantBody.optional() }
const edit = z.strictObject({ ...common, card: z.unknown(), name: z.string().min(1).optional() })
const restore = z.strictObject({ ...common, name: z.string().min(1), from: z.string().min(1) })
const preview = z.strictObject({ card: z.unknown(), name: z.string().min(1).optional(), from: z.string().min(1).optional() })
function refuse(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'addedRoleRefused', values: { reason } })
}
// Asked of every read and write except a removal. A stored row under one of the office's own names was never used, and removing it is the way back.
function unlocked(name: string): void { const why = lockedRoleProblem(name); if (why !== null) refuse(why) }
function fromHistory(name: string, from: string): unknown {
  if (from === 'shipped') return null
  const row = sqlite.prepare('SELECT new_value FROM changes WHERE id=? AND record_id=?').get(from, 'setting:role:' + name) as { new_value: string | null } | undefined
  if (row?.new_value == null) refuse('That version is not in this card’s history.', 404)
  return (JSON.parse(row.new_value) as { card: unknown }).card
}
function nameOf(card: unknown): string {
  if (typeof card !== 'object' || card === null || !('name' in card) || typeof card.name !== 'string' || card.name.trim() === '') refuse('Send a complete card with a name of one word.')
  return card.name
}
function history(name: string, offset: number) {
  const rows = sqlite.prepare('SELECT id,at,actor_type,actor_id,old_value,new_value FROM changes WHERE record_id=? ORDER BY rowid DESC LIMIT 11 OFFSET ?').all('setting:role:' + name, offset) as { id: string; at: string; actor_type: string; actor_id: string; old_value: string | null; new_value: string | null }[]
  return { versions: rows.slice(0, 10).map(row => ({ id: row.id, at: row.at, by: { type: row.actor_type, id: row.actor_id, name: row.actor_type === 'human' ? readParticipant({ kind: 'person', id: row.actor_id })?.name ?? row.actor_id : theWriterAStampNames(row.actor_type + ':' + row.actor_id) }, before: row.old_value === null ? null : JSON.parse(row.old_value), after: row.new_value === null ? null : JSON.parse(row.new_value) })), next: rows.length > 10 ? offset + 10 : null }
}
export type AddedRolePreview = ReturnType<typeof previewAddedRole>
export type AddedRoleHistory = ReturnType<typeof history>

// The saved cards are read at the start, in buildApp (src/server/index.ts), and again after every write.
export async function addedRolesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/roles/added', route('role.added', 'remote', 'Read the office-wide added cards, their versions, and the saved cards this release left out with their problems.'), async () => ({ cards: addedRoles().filter(row => row.problems.length === 0), leftOut: addedRoles().filter(row => row.problems.length > 0), removed: removedAddedRoleNames() }))
  app.post('/roles/added/preview', route('role.preview-added', 'remote', 'Check a card or removal without writing. Show field changes, acts gained and lost, current holders and reminders.'), async req => {
    const parsed = preview.safeParse(req.body)
    if (!parsed.success) refuse('Send a card and, for editing or removal, its existing name.')
    const name = parsed.data.name ?? nameOf(parsed.data.card)
    if (parsed.data.from !== 'shipped') unlocked(name)
    const card = parsed.data.from === undefined ? parsed.data.card : fromHistory(name, parsed.data.from)
    return previewAddedRole(card, name)
  })
  app.get('/roles/added/history', route('role.added-history', 'remote', 'Read ten complete changes to one added card with writer, time and reason. Query name and optional offset.'), async req => {
    const parsed = z.strictObject({ name: z.string().min(1), offset: z.coerce.number().int().min(0).default(0) }).safeParse(req.query)
    if (!parsed.success) refuse('Name a card and a non-negative history offset.')
    return history(parsed.data.name, parsed.data.offset)
  })
  async function write(req: FastifyRequest, restoring: boolean) {
    const parsed = (restoring ? restore : edit).safeParse(req.body)
    if (!parsed.success) refuse('Send the complete card or restore choice, the version you read, and a reason of 1 to 500 characters. Do not send extra fields.')
    const body = parsed.data
    const name = 'from' in body ? body.name : body.name ?? nameOf(body.card)
    if (!('from' in body) || body.from !== 'shipped') unlocked(name)
    const current = addedRoles().find(row => row.name === name)
    if (body.version !== (current?.version ?? null)) {
      if (body.version !== null && addedRoles().some(row => row.name !== name && row.version === body.version)) refuse('The name cannot change after a card is added. Agents’ registry rows store that name.')
      refuse('This card changed after you read it. Read it again before Apply.', 409)
    }
    const card = 'from' in body ? fromHistory(name, body.from) : body.card
    if (!('from' in body) && card === null) refuse('Use restore from shipped to remove an added card.')
    let actor = actorFrom(req)
    if (!thePersonIsProved(actor) && actor.theOwnersAuthority?.holds !== true) {
      try { actor = actorWithTheWordsItActsOn(req, body.warrant, 'office.set-role:' + JSON.stringify({ name, card: sortedRoleCard(card) })) }
      catch (error) { if (!(error instanceof PanelError)) throw error; refuse(error.message, error.status) }
      if (!theSecretaryActingForThePerson(actor)) refuse('Only the person, the owner’s authority, or a secretary carrying the person’s exact words for this exact card may change roles.', 403)
    }
    const checked = checkAddedRole(card, name)
    if (checked.problems.length > 0) refuse(checked.problems.join('\n'))
    // The row keeps the powers and the structure, and the card's role_card_words record keeps its words. Both are
    // written in this one transaction, or neither. The history below keeps the whole card, so a version can be put back.
    try {
      sqlite.transaction(() => {
        if (card === null) {
          sqlite.prepare('DELETE FROM runtime_settings WHERE name=?').run(ADDED_ROLE_PREFIX + name)
          removeTheWordsOfAnAddedCard(name, actor)
        } else {
          sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(ADDED_ROLE_PREFIX + name, JSON.stringify(theCardWithoutItsWords(card as Record<string, unknown>)))
          keepTheWordsOfAnAddedCard(card as RoleCard, actor, body.because)
        }
        writeDownASettingChange(actor, { setting: 'role:' + name, field: 'office-wide role card', before: { card: current?.card ?? null }, after: { card, because: body.because }, workspaceId: workspaceOf(req) })
        sayASecretaryChangedItForThem(req, actor, `The added role ${name} was changed`)
      })()
    } catch (error) {
      // A refusal from the record door is this door's refusal too, and nothing of either was stored.
      if (error instanceof PanelError) refuse(error.message.replace(/ Nothing was (written|changed)\.$/, ''), error.status)
      throw error
    }
    loadAddedRoles()
    announce({ name: 'machine.changed', changed: ['settings'] })
    return { name, card, version: addedRoles().find(row => row.name === name)?.version ?? null, reminders: checked.reminders }
  }
  app.post('/roles/added', route('role.set-added', 'remote', 'Apply a checked added card with a version and reason. Keep the complete change and rebuild the shared readers after committing.'), req => write(req, false))
  app.post('/roles/added/restore', route('role.restore-added', 'remote', 'Put back a checked version from this card’s history, or remove the card with from shipped when no agent that is not retired holds it.'), req => write(req, true))
}
