// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARIAT GROUP: ONE STANDING GROUP FOR THE OWNER AND EVERY SECRETARY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * A message: every secretary is put into the Secretariat group automatically,
 * the person is
 * in it too, and so an office-wide notice, such as a notice from Mole Office or a change in the
 * environment, is said there
 * once. The office keeps that group whether or not anybody asked: it holds the owner and every
 * un-retired agent that holds the secretary card, an agent joins it the moment it is registered with
 * that card or given it, and a retired secretary leaves it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS FILED, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A group row carries a project (`groups.workspace_id`), and the secretaries themselves are
 * installation-wide: an agent registry is not a project's (see
 * `NO_PROJECT_BECAUSE_IT_IS_THE_WHOLE_INSTALLATION` in db/why-no-project.ts). So the group is filed in
 * `DEFAULT_WORKSPACE`, the one project that is the installation's own rather than any team's. That
 * is the same project the dead-letter sweep already uses for its group, for the same reason.
 *
 * IT IS SEEN FROM EVERY PROJECT. `GET /api/groups` reads `EVERY_PROJECT` (decision t5DlN5-uTZoT: a
 * group follows the conversations, and the person, not the project on screen), so the one row is
 * drawn in every project's list. The `workspaceId` on the row says where it is filed; it does not
 * hide it from anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS MADE HERE AND NOT THROUGH `openAGroup`
 * ---------------------------------------------------------------------------------------
 *
 * This file writes the group and its membership rows directly, and it writes no message. The reason
 * is that the office reconciles membership from the registry — at start, after a card is given, and
 * after a retirement — and `openAGroup`/`writeASystemLine` open a record write with its own
 * transaction, which cannot be nested inside another. A membership row is already the record of who
 * is in the group: `joined_because` says why, `joined_at` says when, and `left_at` says when they
 * left. A second line per join would be one fact written twice.
 *
 * ONE RULE, IN ONE PLACE. The `sync` below is the only thing that decides who is in the group, and
 * the two exported names are the two things a caller can want: `syncTheSecretariatGroup` makes the
 * group if it is missing, and `bringTheSecretariatGroupInStep` changes nothing when there is no
 * group. Every door that can change a secretary (a registration, a card, a retirement) calls one of
 * them after its own write, and nothing else adds or removes a member of this group by hand.
 *
 * ---------------------------------------------------------------------------------------
 * WHO HOLDS THE SECRETARY CARD, WITHOUT WRITING THE ROLE'S NAME HERE
 * ---------------------------------------------------------------------------------------
 *
 * The card a role holds is a word in `design/permissions/roles.json`, and the declaration already
 * names the secretary card for the one power only it may hold: `elevation.onlyThisCardCanHoldIt`.
 * `theSecretaries` reads that, so this file never carries a second copy of the role's name. The same
 * seam `theActiveSecretary` in lib/claims.ts uses.
 */

import { anOfficeId } from './ids.ts'
import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
import { SECRETARIAT_GROUP_KEY } from '@shared/groups.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'

// THE KEY THAT NAMES THE ONE GROUP lives in `@shared/groups.ts`, beside the mark it writes and the
// reader that takes it off a group row, so the browser and this file cannot come to two spellings.

/** The name a reader sees in the list of conversations. */
export const SECRETARIAT_GROUP_NAME = 'Secretariat'

/** The one sentence on the group's own row saying why it exists. */
export const THE_SECRETARIAT_IS_OPEN_BECAUSE =
  'The office keeps one standing group for the owner and every agent holding the secretary card, so a notice that ' +
  'is for all of them is said there once.'

/** Said on the owner's membership row. */
const THE_OWNER_IS_IN_BECAUSE = 'The owner is in the Secretariat group, so an office-wide notice reaches the owner too.'

/** Said on a secretary's membership row. */
const A_SECRETARY_IS_IN_BECAUSE = 'It holds the secretary card, and every secretary is in the Secretariat group.'

/** One membership row as this file needs it. */
interface AMembershipRow {
  id: string
  member_kind: string
  member_id: string
}

/** What one reconciliation did, for a caller that reports it. */
export interface TheSecretariatAfterASync {
  id: string
  workspaceId: string
  /** True when this call made the group row. */
  created: boolean
  /** True when this call added or ended any membership, including the person's. */
  membershipChanged: boolean
  /** Agent ids put in by this call, in registry order. */
  added: string[]
  /** Agent ids taken out by this call, in the order they were found. */
  removed: string[]
}

/**
 * EVERY UN-RETIRED AGENT THAT HOLDS THE SECRETARY CARD, in registry-id order so a report of what was
 * added reads the same twice.
 *
 * THE CARD'S NAME COMES FROM THE DECLARATION, never from a word written here: the file already names
 * the secretary card as the one that may hold elevation, and that is the seam the rest of the server
 * reads. Where the declaration has not been read, the answer is nobody rather than a guess, and
 * `syncTheSecretariatGroup` keeps the group as it is rather than emptying it on an unread file.
 *
 * ONLY THE SECRETARIES' ROWS ARE READ. The role is compared exactly, and only a retired mark of 1
 * leaves an agent out, as when every row was read and kept here. WHY: every agent's row was read for
 * this, 972 of the 1,237 rows one role request read on a made-up office of 972 agents (round 42 of
 * wave 13u).
 */
export function theSecretaries(): ParticipantRef[] {
  if (!theRoleCardsAreRead()) return []
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  const rows = sqlite
    .prepare('SELECT id FROM agents WHERE role = ? AND retired IS NOT 1 ORDER BY id')
    .all(card) as { id: string }[]
  return rows.map((row) => ({ kind: 'agent' as const, id: row.id }))
}

/** The one member the office always keeps in the group, where the person's registry row exists. */
function theOwnerWhereRegistered(): ParticipantRef | null {
  const row = sqlite.prepare('SELECT id FROM people WHERE id = ?').get(THE_PERSON) as { id: string } | undefined
  return row === undefined ? null : { kind: 'person' as const, id: row.id }
}

/** The group's row, made when it is missing and `createIfMissing` says so. No message is written. */
function theGroupRow(at: string, createIfMissing: boolean): { id: string; workspaceId: string; created: boolean } | null {
  const found = sqlite.prepare('SELECT id, workspace_id FROM groups WHERE about = ?').get(SECRETARIAT_GROUP_KEY) as
    | { id: string; workspace_id: string }
    | undefined
  if (found !== undefined) return { id: found.id, workspaceId: found.workspace_id, created: false }
  if (!createIfMissing) return null
  const id = anOfficeId()
  sqlite
    .prepare(
      'INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at, about) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      DEFAULT_WORKSPACE,
      SECRETARIAT_GROUP_NAME,
      moleOffice().kind,
      moleOffice().id,
      THE_SECRETARIAT_IS_OPEN_BECAUSE,
      at,
      SECRETARIAT_GROUP_KEY,
    )
  return { id, workspaceId: DEFAULT_WORKSPACE, created: true }
}

/** Put somebody in the group now, in the one way this file ever writes a membership row. */
function addAMemberRow(groupId: string, who: ParticipantRef, because: string, at: string): void {
  sqlite
    .prepare(
      'INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, NULL)',
    )
    .run(anOfficeId(), groupId, who.kind, who.id, at, because)
}

/** Mark one live membership as ended now, in the one way this file ever ends one. */
function endAMembershipRow(membershipId: string, at: string): void {
  sqlite.prepare('UPDATE group_members SET left_at = ? WHERE id = ? AND left_at IS NULL').run(at, membershipId)
}

/**
 * MAKE THE GROUP IF IT IS MISSING, AND MAKE ITS MEMBERS EXACTLY THE PEOPLE WHO BELONG.
 *
 * It is idempotent: calling it once more with nothing changed writes nothing, because every add and
 * every remove is asked against the rows that are live now. It returns what it did so a caller can
 * report it one day, and nothing depends on a return value for correctness.
 *
 * THE DECLARATION BEING UNREAD IS NOT "NO SECRETARIES". When the role cards have not been read the
 * card's name is unknown, so this keeps the group and its members as they are and only makes sure the
 * owner is in it. Emptying a group because a file had not been read would be the silent fallback the
 * first rule forbids.
 */
export function syncTheSecretariatGroup(at: string = nowStamp()): TheSecretariatAfterASync {
  return sync(at, true)!
}

/**
 * BRING AN ALREADY-EXISTING GROUP BACK IN STEP, AND MAKE NOTHING.
 *
 * A door that only removes somebody — a retirement, an agent's record removed — calls this. It does
 * not make the group, because the owner's rule makes it at a server start or at the first secretary's
 * registration, and a retirement that quietly made a group would be a second maker. Where there is
 * no group, nothing is out of step and null is the whole answer.
 */
export function bringTheSecretariatGroupInStep(at: string = nowStamp()): TheSecretariatAfterASync | null {
  return sync(at, false)
}

function sync(at: string, createIfMissing: boolean): TheSecretariatAfterASync | null {
  const group = theGroupRow(at, createIfMissing)
  if (group === null) return null
  const wanted = new Map<string, { who: ParticipantRef; because: string }>()
  const owner = theOwnerWhereRegistered()
  if (owner !== null) wanted.set(`${owner.kind}:${owner.id}`, { who: owner, because: THE_OWNER_IS_IN_BECAUSE })
  const cardsAreRead = theRoleCardsAreRead()
  if (cardsAreRead) {
    for (const who of theSecretaries()) {
      wanted.set(`${who.kind}:${who.id}`, { who, because: A_SECRETARY_IS_IN_BECAUSE })
    }
  }

  const live = sqlite
    .prepare('SELECT id, member_kind, member_id FROM group_members WHERE group_id = ? AND left_at IS NULL')
    .all(group.id) as AMembershipRow[]
  const liveKeys = new Set(live.map((row) => `${row.member_kind}:${row.member_id}`))

  const removed: string[] = []
  let membershipChanged = false
  if (cardsAreRead) {
    for (const row of live) {
      if (wanted.has(`${row.member_kind}:${row.member_id}`)) continue
      endAMembershipRow(row.id, at)
      membershipChanged = true
      if (row.member_kind === 'agent') removed.push(row.member_id)
    }
  }

  const added: string[] = []
  for (const [key, member] of wanted) {
    if (liveKeys.has(key)) continue
    addAMemberRow(group.id, member.who, member.because, at)
    membershipChanged = true
    if (member.who.kind === 'agent') added.push(member.who.id)
  }

  return { id: group.id, workspaceId: group.workspaceId, created: group.created, membershipChanged, added, removed }
}
