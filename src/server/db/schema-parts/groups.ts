// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

/**
 * A GROUP: A CONVERSATION WITH SEVERAL SUBSCRIBERS. One row per group, added by migration 0120.
 *
 * Criterion M11: a message pool with several subscribers, where a message one member sends goes to
 * them all. A group is a name and the participants in it. It holds no messages: a message addressed
 * to a group is one message with one delivery row per member, exactly as a message addressed to two
 * people is, and `message_delivery` stays the only copy of who a message reached.
 *
 * `about` HOLDS THE ONE SPELLING OF AN OVERLAP BETWEEN TWO WORK CLAIMS, or NULL on a group somebody
 * opened by hand. Criterion M13 says the same overlap never opens a second group, and a unique index
 * over this column is what makes that a fact of the database rather than a check somebody has to
 * remember to run. SQLite treats NULLs as distinct under a unique index, so any number of
 * hand-opened groups sit under it. Nothing draws this column: it is a key, and the words a reader
 * sees are `name` and `opened_because`.
 */
export const groups = aPartTable(sqliteTable(
  'groups',
  {
    /** nanoid, so a group can be addressed and cited. */
    id: text('id').primaryKey(),
    /** The project the group is in. A conversation about work belongs to the project the work is in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** The name a reader sees in the list of conversations. */
    name: text('name').notNull(),
    /** `person` or `agent`, and the id in that registry: who opened it. */
    openedByKind: text('opened_by_kind').notNull(),
    openedById: text('opened_by_id').notNull(),
    /** One plain sentence saying why. Never empty: the door refuses one. */
    openedBecause: text('opened_because').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    openedAt: text('opened_at').notNull(),
    /** The overlap this group was opened for, or NULL because somebody opened it by hand. */
    about: text('about'),
  },
  (t) => [index('groups_workspace_idx').on(t.workspaceId), uniqueIndex('groups_about_idx').on(t.about)],
), { existingArchive: true })

/**
 * WHO IS IN A GROUP, AND WHO USED TO BE. One row per join.
 *
 * A MEMBER WHO LEAVES KEEPS THEIR ROW, with `left_at` set. Deleting it would delete the fact that
 * they were ever in the group, which is the one fact somebody reading a month-old conflict needs.
 * The unique index is therefore partial — at most one LIVE membership per participant per group —
 * and rejoining writes a new row rather than clearing the old one, because joining twice is two acts
 * with two moments.
 *
 * THE PARTIAL INDEX IS DECLARED HERE AS WELL AS IN THE MIGRATION, the way `session_resources_live_idx`
 * is. tests/schema-tables.test.ts compares the indexes this file declares against the ones a freshly
 * migrated database has, so an index in the migration and not here fails the suite.
 */
export const groupMembers = aPartTable(sqliteTable(
  'group_members',
  {
    /** nanoid, so one membership can be cited. */
    id: text('id').primaryKey(),
    /** The group this is a membership of. */
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    /** `person` or `agent`, and the id in that registry. */
    memberKind: text('member_kind').notNull(),
    memberId: text('member_id').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    joinedAt: text('joined_at').notNull(),
    /** One plain sentence saying why they were added. Never empty: the door refuses one. */
    joinedBecause: text('joined_because').notNull(),
    /** When they left, or NULL because they are still in it. */
    leftAt: text('left_at'),
  },
  (t) => [
    index('group_members_group_idx').on(t.groupId),
    index('group_members_member_idx').on(t.memberKind, t.memberId),
    uniqueIndex('group_members_one_live_per_member_idx')
      .on(t.groupId, t.memberKind, t.memberId)
      .where(sql`left_at IS NULL`),
  ],
), { existingArchive: true })

/**
 * WHICH ADDRESSEE'S DEAD LETTERS A SECRETARY HAS TAKEN ON. One row per addressee, ever.
 *
 * Criterion M111: after a time or a count, the office
 * broadcasts the dead letters to every secretary, opens a group for them, and each claims the ones
 * that are its to handle — and settled further: the broadcast is one message naming a
 * group and a count, the group holds the list, and a claim is per ADDRESSEE (the agent the letters
 * were for), never per letter. Since 2 October 2026 the line goes only to the
 * secretary the person named to take the dead letters, or to nobody when nobody is named; it never
 * goes to every secretary (src/server/lib/deadletters.ts).
 *
 * THE LETTERS THEMSELVES ARE NOT A SECOND STORE. A dead letter is a `message_delivery` row already
 * — `mark = 'queued'`, `recipient_kind = 'agent'` — whose recipient the office's own presence
 * reading (src/server/lib/presence.ts) now says is retired or unreachable; `at` on that row is
 * already "when", and the recipient is already "to whom". This table exists for the one fact
 * nothing else holds: which addressee has been taken on, by whom, and when.
 *
 * WHY `agent_id` IS UNIQUE ACROSS THE WHOLE TABLE, not per group. "A claim is per addressee" is the owner's
 * words read literally: one addressee has one standing claim, ever, not one per broadcast it
 * happened to be named in. A later sweep that finds this addressee already has a row leaves it
 * alone — new dead letters for an already-claimed addressee are still that secretary's to find,
 * the same way a work claim covers what its claimant does with it after the claim is filed.
 *
 * `group_id` NAMES THE BROADCAST THIS ROW WAS ANNOUNCED IN, so a reader can open the group and see
 * the announcement; it is not what scopes the claim. `claimed_by_*`, `claimed_at` and
 * `claimed_because` are all NULL until a secretary claims it, which is the ordinary shape of an
 * authored fact this repository uses everywhere else: NULL is "nobody yet", not a default state.
 */
export const deadLetterClaims = aPartTable(sqliteTable(
  'dead_letter_claims',
  {
    /** nanoid, so one row can be cited. */
    id: text('id').primaryKey(),
    /** The project the broadcast group was opened in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** The group the broadcast naming this addressee was announced in. */
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    /** The agent registry id the dead letters were addressed to. Never a handle. */
    agentId: text('agent_id').notNull(),
    /** LOCAL wall clock: when this addressee was named in a broadcast. No SQL default. */
    openedAt: text('opened_at').notNull(),
    /** `person` or `agent`: who claimed it. NULL until claimed. */
    claimedByKind: text('claimed_by_kind'),
    claimedById: text('claimed_by_id'),
    /** LOCAL wall clock. NULL exactly when the two columns above are. */
    claimedAt: text('claimed_at'),
    /** One plain sentence saying what the claimant said, or NULL because nobody has claimed it. */
    claimedBecause: text('claimed_because'),
  },
  (t) => [
    uniqueIndex('dead_letter_claims_agent_idx').on(t.agentId),
    index('dead_letter_claims_group_idx').on(t.groupId),
    index('dead_letter_claims_workspace_idx').on(t.workspaceId),
  ],
), { existingArchive: true })
