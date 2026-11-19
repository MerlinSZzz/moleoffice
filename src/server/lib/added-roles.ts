// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { THE_REPORTS_TO_NAMES_NOBODY, differenceBetweenRoleCards, checkTheActsAreReal, problemsWithACardMadeHere, problemsWithTheRoleDeclaration, powersOn, theCardInTheseWords, whoTheCardReportsTo, type RoleCard, type RolesDeclaration } from '@shared/roles.ts'
import { sqlite } from '../db/client.ts'
import { theWordsRecordsOfEachCard } from '../db/the-words-records-of-each-card.ts'
import { listParticipants } from '../db/list-participants.ts'
import { joinAddedRoleCards, thePublishedRoleActs, theRoleCards, theShippedRoleCards } from './roles.ts'

// role_card records belong to one project and the general record door edits them without checking a card.
// An enforced card needs one office-wide store and one checked way in. Those records remain unenforced.
// The row keeps the powers and the structure. The card's words are its role_card_words record (wave 13w), and
// every card read here is the row in the words of that record (`theCardInTheseWords`).
export const ADDED_ROLE_PREFIX = 'office.role:'
export interface AddedRoleRow { name: string; card: unknown; version: string; problems: string[] }
let saved: AddedRoleRow[] = []
let removed: string[] = []
export function removedAddedRoleNames(): readonly string[] { return removed }
export function addedRoles(): readonly AddedRoleRow[] { return saved }
export function holdersOfAddedRole(name: string) {
  return listParticipants().agents.filter(agent => !agent.retired && agent.role === name).map(agent => ({ id: agent.id, handle: agent.handle, name: agent.name }))
}
// The office's own roles are locked by a decision. The
// sentence a person reads names no decision.
export function lockedRoleProblem(name: string): string | null {
  const shipped = theShippedRoleCards()
  return [...shipped.cards, ...shipped.personCards].some(card => card.name === name)
    ? `${name} is one of the office's own roles, and those are locked.` : null
}
// The card is sorted first, because a card put back together from its row and its words has its parts in another order.
export function roleVersion(name: string, card: unknown): string {
  const newest = sqlite.prepare('SELECT rowid AS seq FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1').get('setting:role:' + name) as { seq: number } | undefined
  return createHash('sha256').update(JSON.stringify(sortedRoleCard(card)) + ':' + String(newest?.seq ?? 0)).digest('hex')
}
/** The stored row of one added card as it is kept: a parsed value, the text of a row that is not JSON, or undefined when there is none. */
export function storedAddedRow(name: string): unknown {
  const row = sqlite.prepare('SELECT value FROM runtime_settings WHERE name=?').get(ADDED_ROLE_PREFIX + name) as { value: string } | undefined
  if (row === undefined) return undefined
  try { return JSON.parse(row.value) } catch { return row.value }
}
const isACard = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Preview, Apply, restore and startup all ask this same check. Reminders never refuse a write. */
export function checkAddedRole(card: unknown, name: string, declaration: RolesDeclaration = theRoleCards()) {
  const problems: string[] = []
  const locked = lockedRoleProblem(name)
  // A locked name's holders hold the shipped card, which no change here touches.
  const holders = locked === null ? holdersOfAddedRole(name) : []
  // THE WORDS NAME NOBODY THE OFFICE KNOWS, so no agent is added above the holder when two work areas overlap.
  // This is a reminder and never a problem: the words are prose a person wrote, and the card can still be applied.
  const namesNobody = isACard(card) && typeof card.reportsTo === 'string' && whoTheCardReportsTo(card as unknown as RoleCard) === 'nobody the office can name'
  const reminders = ["Only the person gives this card.", ...(namesNobody ? [THE_REPORTS_TO_NAMES_NOBODY] : []), ...holders.map(agent => `${agent.handle} (${agent.name}) holds this card. Changes to its permissions take effect for them when Apply runs.`)]
  if (card === null) {
    // A stored row under a locked name was never used, because the shipped card is. So removing it is allowed: it is the way back.
    if (storedAddedRow(name) === undefined) problems.push(...(locked === null ? [] : [locked]), `There is no added card called ${name}, so there is nothing to remove.`)
    if (holders.length > 0) problems.push(`This card is held by ${holders.map(agent => `${agent.handle} (${agent.name})`).join(', ')}. Give them another card first.`)
    return { problems, reminders }
  }
  if (locked !== null) problems.push(locked)
  if (typeof card !== 'object' || Array.isArray(card)) return { problems: [...problems, 'Send a complete role card.'], reminders }
  const candidate = card as Record<string, unknown>
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '' || candidate.name !== candidate.name.trim()) problems.push('Give the card a name of one word, without leading or trailing spaces.')
  if (candidate.name !== name) problems.push('The name cannot change after a card is added. Agents’ registry rows store that name.')
  const namedLock = typeof candidate.name === 'string' ? lockedRoleProblem(candidate.name) : null
  if (namedLock !== null && namedLock !== locked) problems.push(namedLock)
  const madeHere = sqlite.prepare("SELECT id FROM records WHERE kind='role_card' AND deleted_at IS NULL AND json_extract(data,'$.madeHere')=1 AND json_extract(data,'$.roleName')=? LIMIT 1").get(name)
  if (madeHere !== undefined) problems.push(`A role card written in a project already uses ${name}. One word means one thing. Choose another name.`)
  // The shared check reads mustRead.chapters. A null required block is missing, so even that saved row gets problems and a recovery press.
  problems.push(...problemsWithACardMadeHere({ ...candidate, mustRead: candidate.mustRead ?? undefined }, declaration))
  if (candidate.workArea === undefined) problems.push(`The ${name} card needs a workArea block. Registration refuses a card without one.`)
  if (candidate.rung !== null) problems.push('An added card is off the tree. Its rung must be null, because a rung holds one role.')
  if (candidate.appointedBy !== 'the person') problems.push('An added card must be appointedBy "the person", because only their press gives an off-tree card.')
  if (Array.isArray(candidate.powers) && candidate.powers.includes("The person's own acts")) problems.push("An added card cannot hold The person's own acts. Chapter 8 permits those acts only through elevation for a time.")
  if (candidate.standing !== undefined) problems.push('An added card is an agent’s card, and only a person’s card has a standing. Leave standing out.')
  if (problems.length === 0) {
    const joined = { ...declaration, cards: [...declaration.cards.filter(one => one.name !== name), card as RoleCard] }
    problems.push(...problemsWithTheRoleDeclaration(joined), ...checkTheActsAreReal(joined, thePublishedRoleActs()))
  }
  return { problems: [...new Set(problems)], reminders }
}

/**
 * A release may reject saved cards. Keep and name them so a recovery press remains available.
 * Each card is its row in the words of its record. A row from before the words moved still holds its own words,
 * and those are read only where no record gives them. Two live words records are named, not chosen between.
 */
export function loadAddedRoles(): void {
  const shipped = theShippedRoleCards(), valid: RoleCard[] = [], rows: AddedRoleRow[] = [], words = theWordsRecordsOfEachCard()
  for (const row of sqlite.prepare('SELECT name,value FROM runtime_settings WHERE name LIKE ? ORDER BY name').all(ADDED_ROLE_PREFIX + '%') as { name: string; value: string }[]) {
    const name = row.name.slice(ADDED_ROLE_PREFIX.length)
    let card: unknown, problems: string[]
    try { card = JSON.parse(row.value) }
    catch { rows.push({ name, card: row.value, version: roleVersion(name, row.value), problems: ['This saved card is not JSON. Restore a checked version or remove it.'] }); continue }
    const held = lockedRoleProblem(name) === null ? words.get(name) ?? [] : []
    if (isACard(card)) card = theCardInTheseWords(card as unknown as RoleCard, held[0]?.data ?? null)
    problems = card === null ? ['This saved row holds no card. Restore a checked version or remove it.'] : checkAddedRole(card, name, { ...shipped, cards: [...shipped.cards, ...valid] }).problems
    if (held.length > 1) problems = [`The words of this card are kept in ${String(held.length)} live records, ${held.map(one => one.id).join(' and ')}, and nothing says which one is the card’s. Delete all but one on its record page.`, ...problems]
    if (problems.length === 0) valid.push(card as RoleCard)
    rows.push({ name, card, version: roleVersion(name, card), problems })
  }
  saved = rows
  const present = new Set(rows.map(row => row.name))
  removed = (sqlite.prepare("SELECT record_id, new_value FROM changes WHERE rowid IN (SELECT MAX(rowid) FROM changes WHERE record_id LIKE 'setting:role:%' GROUP BY record_id) ORDER BY record_id").all() as { record_id: string; new_value: string }[]).filter(row => { const name = row.record_id.slice('setting:role:'.length); return !present.has(name) && lockedRoleProblem(name) === null && (JSON.parse(row.new_value) as { card: unknown }).card === null }).map(row => row.record_id.slice('setting:role:'.length))
  joinAddedRoleCards(valid)
}

/**
 * WHAT A WORDS WRITE WOULD BREAK IN AN ADDED CARD THAT IS IN USE. `held` is the record's words after the write,
 * or null when the record goes. An added card's row keeps no words, so a record left without a part the card
 * needs would take the card out of use, and its holders' permissions with it. A card already left out is not
 * asked here: the Roles page is how it is put right.
 */
export function problemsWordsWouldGiveAnAddedCard(name: string, held: Readonly<Record<string, unknown>> | null): string[] {
  if (!saved.some(row => row.name === name && row.problems.length === 0)) return []
  const row = storedAddedRow(name)
  if (!isACard(row)) return []
  return checkAddedRole(theCardInTheseWords(row as unknown as RoleCard, held), name).problems
}

export function previewAddedRole(card: unknown, name: string) {
  const current = saved.find(row => row.name === name)
  const before = current?.card ?? null
  const checked = checkAddedRole(card, name)
  const difference = differenceBetweenRoleCards(before, card)
  const acts = (one: unknown, usable: boolean) => !usable || one === null ? [] : powersOn(theRoleCards(), one as RoleCard).flatMap(power => power.acts)
  const oldActs = acts(before, current !== undefined && current.problems.length === 0), newActs = acts(card, checked.problems.length === 0)
  return { ...checked, name, card, before, version: current?.version ?? null, difference, acts: newActs, gained: newActs.filter(act => !oldActs.some(old => old.act === act.act)), lost: oldActs.filter(act => !newActs.some(next => next.act === act.act)), holders: holdersOfAddedRole(name), mayBeGivenTo: 'A registered agent, by the person alone.' }
}

/** Sort object keys recursively so a warrant binds to exactly one card, independent of key order. */
export function sortedRoleCard(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedRoleCard)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, one]) => [key, sortedRoleCard(one)]))
}
