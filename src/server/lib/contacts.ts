// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST: reading it, and the things they can change.
 *
 * Criteria M119 to M124: the first level is two
 * locked top groups, Human and Agent, that do not mix and cannot be renamed; under them are ordinary
 * groups the person may add, rename and move contacts between; under Agent the default arrangement
 * is by role and every group folds, with the fold state kept on the server.
 *
 * ---------------------------------------------------------------------------------------
 * TWO LEVELS, ONE OF WHICH IS A DECLARATION AND ONE OF WHICH IS THE PERSON'S
 * ---------------------------------------------------------------------------------------
 *
 * The two top groups and the second-level defaults are declared in `src/shared/contacts.ts` and are
 * not rows: a fresh installation has the default arrangement with no rows at all. So a row
 * here is always somebody's own act — a group they made, a default group they renamed or moved, a
 * placement, or a fold. Reading the list writes nothing.
 *
 * A CONTACT'S SIDE IS NOT STORED. It is read from what the contact is — a person is on Human, an
 * agent and a writer nobody registered are on Agent — because a copy of that rule could disagree
 * with the kind beside it. The side of a group IS stored, because a group somebody made has no kind
 * to read it from, and it is fixed when the group is made.
 *
 * A PLACEMENT ACROSS THE LINE IS NOT WRITTEN AND IS NOT DRAWN. The move door refuses it with a
 * plain sentence (M119), and a placement row that names a group on the other side — which can only
 * be a database edited by hand, since no door writes one — falls back to the default group rather
 * than moving somebody the person never moved there.
 */

import { and, eq } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { db } from '../db/client.ts'
import { contactGroupCollapses, contactGroups, contactPlacements } from '../db/schema.ts'
import { nowStamp } from '@shared/time.ts'
import {
  CONTACT_SIDES,
  DEFAULT_CONTACT_GROUPS,
  defaultGroupFor,
  isATopGroup,
  isABuiltInGroup,
  LEGACY_TOP_GROUP_KEYS,
  orderInsideOneContactGroup,
  sideOfContact,
  type ContactGroup,
  type ContactSide,
} from '@shared/contacts.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { PanelError } from './panel-error.ts'
import { announce } from './events.ts'

/** What a contact row has to say for this file to place it: its key, what it is, and its card. */
export interface ContactToPlace {
  /** The key the panel already uses for this row, registered or not. */
  key: string
  /** The participant kind, or null because nobody registered this writer. */
  kind: 'person' | 'agent' | null
  /** The registry id, or null for the same reason. */
  id: string | null
  /**
   * The card the registry reads the agent as, or null for a person and for a writer nobody
   * registered. A registered agent with no card reads as `worker` before it reaches here.
   */
  role: string | null
  /** True when the registry row says this agent is retired. Criterion M121. */
  retired: boolean
}

/** One contact, with the second-level group it is in and where it sits. */
export interface PlacedContact {
  key: string
  group: string
  at: number
}

/** One of the two locked top groups, with the fold state the person set on it. */
export interface ContactSideReading {
  key: ContactSide
  name: string
  collapsed: boolean
}

// ============================================================================ reading

/**
 * The rows one person has written about their groups, in the order they were stored.
 *
 * A ROW NAMING `human`, `agent` OR `special` IS SKIPPED. Those were the three first-level groups
 * before M119; they are not second-level groups now, and drawing one would put a group at the wrong
 * level. The rows are left in the table — a migration never rewrites history — and this is the one
 * reader that knows not to draw them.
 */
function storedGroups(
  owner: ParticipantRef,
): { key: string; name: string; at: number; made: boolean; side: ContactSide }[] {
  return db
    .select()
    .from(contactGroups)
    .where(and(eq(contactGroups.ownerKind, owner.kind), eq(contactGroups.ownerId, owner.id)))
    .all()
    .filter((row) => !LEGACY_TOP_GROUP_KEYS.includes(row.key))
    .map((row) => ({
      key: row.key,
      name: row.name,
      at: row.at,
      made: !isABuiltInGroup(row.key),
      // A ROW WRITTEN BEFORE MIGRATION 0161 HAS NO SIDE. It is worked out from the key rather than
      // invented: the default keys have a declared side, and every group somebody made before the
      // column existed was made under Agent, which is where every contact was.
      side: sideFromStored(row.side, row.key),
    }))
}

/** Which side a stored group row belongs to, reading the key when the column is NULL. */
function sideFromStored(stored: string | null, key: string): ContactSide {
  if (stored === 'human' || stored === 'agent') return stored
  const declared = DEFAULT_CONTACT_GROUPS.find((one) => one.key === key)
  return declared?.side ?? 'agent'
}

/** The rows one person has written about where a contact sits. */
function storedPlacements(owner: ParticipantRef): { contact: string; groupKey: string | null; at: number | null }[] {
  return db
    .select()
    .from(contactPlacements)
    .where(and(eq(contactPlacements.ownerKind, owner.kind), eq(contactPlacements.ownerId, owner.id)))
    .all()
    .map((row) => ({ contact: row.contact, groupKey: row.groupKey, at: row.at }))
}

/** The fold states one person has written, by group key. Absent means "use the default". */
function storedCollapses(owner: ParticipantRef): Map<string, boolean> {
  const rows = db
    .select()
    .from(contactGroupCollapses)
    .where(and(eq(contactGroupCollapses.ownerKind, owner.kind), eq(contactGroupCollapses.ownerId, owner.id)))
    .all()
  return new Map(rows.map((row) => [row.groupKey, row.collapsed === 1]))
}

/** The declared order of a default group, or a number past every default for one somebody made. */
function declaredIndex(key: string): number {
  const at = DEFAULT_CONTACT_GROUPS.findIndex((one) => one.key === key)
  return at === -1 ? DEFAULT_CONTACT_GROUPS.length : at
}

/**
 * THE SECOND-LEVEL GROUPS THIS PERSON HAS, in the order they are drawn.
 *
 * Human's groups come before Agent's, because Human is the first top group. Inside one side the
 * order is `at`, then the declared order, then the name, so the answer never depends on what order
 * the database happened to hand the rows back. A stored row overrides a default's name or place; a
 * group somebody made sits where its own `at` puts it.
 */
export function groupsOf(owner: ParticipantRef): ContactGroup[] {
  const out = new Map<string, ContactGroup>()
  for (const one of DEFAULT_CONTACT_GROUPS) out.set(one.key, { ...one })
  for (const row of storedGroups(owner)) {
    const built = out.get(row.key)
    if (built !== undefined) {
      out.set(row.key, { ...built, name: row.name, at: row.at, side: row.side })
      continue
    }
    out.set(row.key, { key: row.key, name: row.name, at: row.at, made: true, side: row.side, collapsed: false })
  }
  const collapsed = storedCollapses(owner)
  const sideOrder: Record<ContactSide, number> = { human: 0, agent: 1 }
  return [...out.values()]
    .map((group) => ({ ...group, collapsed: collapsed.get(group.key) ?? group.collapsed }))
    .sort(
      (a, b) =>
        sideOrder[a.side] - sideOrder[b.side] ||
        a.at - b.at ||
        declaredIndex(a.key) - declaredIndex(b.key) ||
        a.name.localeCompare(b.name),
    )
}

/**
 * THE TWO LOCKED TOP GROUPS, each with the fold state the person set on it.
 *
 * There is never a stored row for the heading's name: it is the fixed word `Human` / `Agent` and no door
 * writes another. Only the fold is stored, and only once somebody presses it.
 */
export function sidesOf(owner: ParticipantRef): ContactSideReading[] {
  const collapsed = storedCollapses(owner)
  return CONTACT_SIDES.map((one) => ({ key: one.key, name: one.name, collapsed: collapsed.get(one.key) ?? false }))
}

/**
 * WHERE EVERY CONTACT SITS, given the list in the order the panel would have drawn it anyway.
 *
 * `contacts` arrives in the order `contactsFor` produced — newest conversation first — and that is
 * the default order inside each group. A contact somebody ordered by hand sits at the number they
 * gave it; one they have not sits after all of those, the ones `online` says are online first, each
 * part keeping the order it already had (`orderInsideOneContactGroup`). `online` is asked by the
 * contact's key. A caller that reads only each contact's group passes `() => false`.
 *
 * A PLACEMENT NAMING A GROUP THAT IS NOT THERE, OR ONE ON THE OTHER SIDE, FALLS BACK TO THE DEFAULT
 * GROUP. No door writes such a row — the move door refuses a crossing (M119), and no route deletes a
 * group — so this is a database edited by hand. Every contact is in exactly one group either way,
 * which is what makes the counts add up.
 */
export function placeTheContacts(owner: ParticipantRef, contacts: readonly ContactToPlace[], online: (key: string) => boolean): PlacedContact[] {
  const groups = new Map(groupsOf(owner).map((one) => [one.key, one]))
  const placements = new Map(storedPlacements(owner).map((row) => [row.contact, row]))
  const byGroup = new Map<string, { key: string; at: number | null }[]>()
  for (const contact of contacts) {
    const said = placements.get(contact.key)
    const wanted = said?.groupKey ?? null
    const side = sideOfContact(contact.kind)
    const named = wanted === null ? undefined : groups.get(wanted)
    const group = wanted !== null && named !== undefined && named.side === side ? wanted : defaultGroupFor(contact)
    const list = byGroup.get(group) ?? []
    list.push({ key: contact.key, at: said?.at ?? null })
    byGroup.set(group, list)
  }
  const out: PlacedContact[] = []
  for (const [group, list] of byGroup) {
    // THE ONE RULE FOR THE ORDER INSIDE A GROUP, shared with the page that places a row again after a
    // new message moves it to the top (`orderInsideOneContactGroup`).
    const ordered = orderInsideOneContactGroup(list, (one) => one.at, (one) => online(one.key))
    for (const [at, one] of ordered.entries()) out.push({ key: one.key, group, at })
  }
  return out
}

/**
 * THE CONTACTS THIS PERSON PLACED BY HAND, by their keys: the rows `placeTheContacts` puts first in
 * their group. A `message.new` sent to this person's pages carries them, so a page can move a row to
 * the top of its group by the same rule without reading the whole list again.
 */
export function theContactsPlacedByHand(owner: ParticipantRef): string[] {
  return storedPlacements(owner)
    .filter((one) => one.at !== null)
    .map((one) => one.contact)
}

/**
 * TELL THIS PERSON'S PAGES THAT HOW THEIR CONTACTS ARE ARRANGED CHANGED, once per act.
 *
 * The groups, the folds and where each contact sits are the person's own and are drawn by every page
 * of theirs. Only their pages are told. The page that made the change reads the list itself.
 */
function theArrangementChanged(owner: ParticipantRef, because: string): void {
  announce({ name: 'list.changed', workspaceId: null, lists: ['contacts'], about: owner, groupId: null, because })
}

// ============================================================================ changing it

/** Write one group row, replacing whatever was there for that key. */
function writeGroup(owner: ParticipantRef, group: ContactGroup): void {
  db.delete(contactGroups)
    .where(
      and(
        eq(contactGroups.ownerKind, owner.kind),
        eq(contactGroups.ownerId, owner.id),
        eq(contactGroups.key, group.key),
      ),
    )
    .run()
  db.insert(contactGroups)
    .values({
      id: anOfficeId(),
      ownerKind: owner.kind,
      ownerId: owner.id,
      key: group.key,
      side: group.side,
      name: group.name,
      at: group.at,
      createdAt: nowStamp(),
    })
    .run()
}

/** A name somebody typed, checked before anything is written. */
function aUsableName(said: string): string {
  const name = said.trim()
  if (name === '') {
    throw new PanelError('A group needs a name. Nothing was written.', 400)
  }
  if (name.length > GROUP_NAME_MAX) {
    throw new PanelError(
      `That name is ${String(name.length)} characters and a group's name may be ${String(GROUP_NAME_MAX)}. ` +
        'Nothing was written.',
      400,
    )
  }
  return name
}

/** The longest a group's name may be. A heading, not a sentence. */
export const GROUP_NAME_MAX = 40

/**
 * MAKE A GROUP under one of the two top groups. It goes at the end of that side, because that is
 * where a thing you have just made belongs.
 *
 * Its key is a nanoid and never the name, so renaming it moves nothing and two groups may share a
 * name without one of them being unreachable. Its side is fixed at this moment and the move door
 * refuses to change it afterwards (M119).
 */
export function makeAContactGroup(owner: ParticipantRef, said: string, side: ContactSide): ContactGroup {
  const name = aUsableName(said)
  if (side !== 'human' && side !== 'agent') {
    throw new PanelError('A group belongs under Human or under Agent, and nowhere else. Nothing was written.', 400)
  }
  const mine = groupsOf(owner).filter((one) => one.side === side)
  const group: ContactGroup = {
    key: anOfficeId(),
    name,
    at: Math.max(...mine.map((one) => one.at), -1) + 1,
    made: true,
    side,
    collapsed: false,
  }
  writeGroup(owner, group)
  theArrangementChanged(owner, `${owner.id} made the contact group "${name}".`)
  return group
}

/**
 * RENAME A SECOND-LEVEL GROUP. The two top groups cannot be renamed (M119), and a key naming one of
 * them is refused with a sentence rather than answered as though it named no group at all.
 */
export function renameAContactGroup(owner: ParticipantRef, key: string, said: string): ContactGroup {
  if (isATopGroup(key)) throw new PanelError(theTopGroupCannotBeRenamed(key), 409)
  const name = aUsableName(said)
  const group = groupsOf(owner).find((one) => one.key === key)
  if (group === undefined) throw new PanelError(theresNoGroup(key), 404)
  const renamed = { ...group, name }
  writeGroup(owner, renamed)
  theArrangementChanged(owner, `${owner.id} renamed a contact group to "${name}".`)
  return renamed
}

/**
 * MOVE A GROUP UP OR DOWN BY ONE PLACE WITHIN ITS OWN SIDE.
 *
 * `by` is -1 or 1. The two top groups do not move and are refused. Moving the first group of a side
 * up and the last one down does nothing and says so with a refusal rather than answering 200 for a
 * move that did not happen: a press that quietly does nothing is a press a person tries again.
 */
export function moveAContactGroup(owner: ParticipantRef, key: string, by: number): ContactGroup[] {
  if (isATopGroup(key)) throw new PanelError(theTopGroupCannotBeMoved(key), 409)
  const groups = groupsOf(owner)
  const selected = groups.find((one) => one.key === key)
  if (selected === undefined) throw new PanelError(theresNoGroup(key), 404)
  const mine = groups.filter((one) => one.side === selected.side)
  const at = mine.findIndex((one) => one.key === key)
  const to = at + by
  if (to < 0 || to >= mine.length) {
    throw new PanelError(
      `"${selected.name}" is already ${by < 0 ? 'first' : 'last'} in its group, so nothing was moved.`,
      409,
    )
  }
  const moved = [...mine]
  const [taken] = moved.splice(at, 1)
  if (taken === undefined) throw new PanelError(theresNoGroup(key), 404)
  moved.splice(to, 0, taken)
  // EVERY GROUP ON THAT SIDE GETS A NUMBER, for the reason at the top of this file: an order is a
  // comparison, and the other side's numbers are a comparison of its own.
  const written = moved.map((one, index) => ({ ...one, at: index }))
  for (const one of written) writeGroup(owner, one)
  theArrangementChanged(owner, `${owner.id} moved the contact group "${selected.name}".`)
  return groupsOf(owner)
}

/**
 * FOLD ONE GROUP AWAY, OR OPEN IT AGAIN. Criterion M121.
 *
 * The key names a second-level group or one of the two top groups, because every group folds. The
 * state is stored against the person, so the same fold holds on every machine, because the fold
 * state is kept on the server. A key that names neither is refused rather than stored as a fold on nothing.
 */
export function setAContactGroupCollapsed(owner: ParticipantRef, key: string, collapsed: boolean): void {
  const known = isATopGroup(key) || groupsOf(owner).some((one) => one.key === key)
  if (!known) throw new PanelError(theresNoGroup(key), 404)
  db.delete(contactGroupCollapses)
    .where(
      and(
        eq(contactGroupCollapses.ownerKind, owner.kind),
        eq(contactGroupCollapses.ownerId, owner.id),
        eq(contactGroupCollapses.groupKey, key),
      ),
    )
    .run()
  db.insert(contactGroupCollapses)
    .values({
      id: anOfficeId(),
      ownerKind: owner.kind,
      ownerId: owner.id,
      groupKey: key,
      collapsed: collapsed ? 1 : 0,
      setAt: nowStamp(),
    })
    .run()
  theArrangementChanged(owner, `${owner.id} ${collapsed ? 'folded' : 'opened'} a contact group.`)
}

/** Write one placement row, replacing whatever was there for that contact. */
function writePlacement(owner: ParticipantRef, contact: string, group: string | null, at: number | null): void {
  db.delete(contactPlacements)
    .where(
      and(
        eq(contactPlacements.ownerKind, owner.kind),
        eq(contactPlacements.ownerId, owner.id),
        eq(contactPlacements.contact, contact),
      ),
    )
    .run()
  db.insert(contactPlacements)
    .values({
      id: anOfficeId(),
      ownerKind: owner.kind,
      ownerId: owner.id,
      contact,
      groupKey: group,
      at,
      placedAt: nowStamp(),
    })
    .run()
}

/**
 * MOVE ONE CONTACT INTO A GROUP.
 *
 * It goes to the end of that group, and any hand-ordering it had is dropped: a position was a
 * position in the group it has left. The order of the group it left is untouched, because those
 * numbers are still a comparison between the contacts still there.
 *
 * A MOVE ACROSS THE LINE IS REFUSED, and that refusal is the server's rather than the interface's
 * (M119). The person cannot put an agent under a Human group or a person under
 * an Agent group, and the sentence says so in plain words. Nothing is written.
 */
export function moveAContact(
  owner: ParticipantRef,
  contacts: readonly ContactToPlace[],
  contact: string,
  group: string,
): void {
  const known = contacts.find((one) => one.key === contact)
  if (known === undefined) throw new PanelError(theresNoContact(contact), 404)
  const groups = groupsOf(owner)
  const target = groups.find((one) => one.key === group)
  if (target === undefined) throw new PanelError(theresNoGroup(group), 404)
  const theirs = sideOfContact(known.kind)
  if (target.side !== theirs) throw new PanelError(theTwoSidesDoNotMix(theirs, target), 409)
  writePlacement(owner, contact, group, null)
  theArrangementChanged(owner, `${owner.id} moved a contact into the group "${target.name}".`)
}

/**
 * MOVE ONE CONTACT UP OR DOWN BY ONE PLACE INSIDE ITS OWN GROUP.
 *
 * `by` is -1 or 1. Every contact in that group is given a number, for the reason at the top of this
 * file, and the group it is in is written with it so a later move does not lose it. The move is a move
 * in the order the group is drawn in, so `online` is the one the contacts door places the list with.
 */
export function moveAContactBy(
  owner: ParticipantRef,
  contacts: readonly ContactToPlace[],
  contact: string,
  by: number,
  online: (key: string) => boolean,
): void {
  const placed = placeTheContacts(owner, contacts, online)
  const mine = placed.find((one) => one.key === contact)
  if (mine === undefined) throw new PanelError(theresNoContact(contact), 404)
  const inGroup = placed.filter((one) => one.group === mine.group).sort((a, b) => a.at - b.at)
  const at = inGroup.findIndex((one) => one.key === contact)
  const to = at + by
  if (to < 0 || to >= inGroup.length) {
    throw new PanelError(
      `That contact is already ${by < 0 ? 'first' : 'last'} in its group, so nothing was moved.`,
      409,
    )
  }
  const moved = [...inGroup]
  const [taken] = moved.splice(at, 1)
  if (taken === undefined) throw new PanelError(theresNoContact(contact), 404)
  moved.splice(to, 0, taken)
  for (const [index, one] of moved.entries()) writePlacement(owner, one.key, mine.group, index)
  theArrangementChanged(owner, `${owner.id} moved a contact inside its group.`)
}

/** The refusal when a key names no group of this person's. */
function theresNoGroup(key: string): string {
  return `No group of yours answers to "${key}". Nothing was written.`
}

/** The refusal when a key names nobody in this person's contacts. */
function theresNoContact(key: string): string {
  return `Nobody in your contacts answers to "${key}". Nothing was written.`
}

/** The refusal when somebody tries to rename one of the two locked top groups. Criterion M119. */
function theTopGroupCannotBeRenamed(key: string): string {
  const name = CONTACT_SIDES.find((one) => one.key === key)?.name ?? key
  return `${name} is one of the two top groups and cannot be renamed. Nothing was written.`
}

/** The refusal when somebody tries to move one of the two locked top groups. Criterion M119. */
function theTopGroupCannotBeMoved(key: string): string {
  const name = CONTACT_SIDES.find((one) => one.key === key)?.name ?? key
  return `${name} is one of the two top groups and does not move. Nothing was written.`
}

/**
 * The refusal when a move would cross the line between the two top groups. Criterion M119.
 *
 * It names both sides in the words the panel shows rather than in a machine word, so the panel can draw it as it
 * stands and a reader learns which rule stopped them.
 */
export function theTwoSidesDoNotMix(theirs: ContactSide, target: ContactGroup): string {
  const theirWord = theirs === 'human' ? 'Human' : 'Agent'
  const groupWord = target.side === 'human' ? 'Human' : 'Agent'
  return (
    `${theirWord} contacts stay on the ${theirWord} side and this one is on the ${groupWord} side, ` +
    `so it cannot go into "${target.name}". Nothing was moved.`
  )
}
