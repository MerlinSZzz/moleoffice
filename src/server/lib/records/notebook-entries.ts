// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTEBOOK'S ENTRIES, AND THE TWO THINGS A NOTEBOOK IS REFUSED FOR, IN A MODULE OF THEIR OWN.
 *
 * The two checks were moved whole out of src/server/lib/records.ts with no change of behaviour: the
 * refusal of a hand-written entry list, and the refusal of a second notebook or of one for an agent
 * without the card. records.ts hands the names on with `export *`, so no caller changed.
 *
 * This file imports records.ts for isJsonObject only, inside a function body, so the cycle is safe.
 */
import { NOTEBOOK_KIND } from '@shared/notebook.ts'
import { now } from '@shared/now.ts'
import { isMoleOffice, MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD } from '@shared/participants.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, mayBeElevated } from '@shared/roles.ts'
import { and, eq, isNull } from 'drizzle-orm'
import { gatePosition } from '../../../config/settings.mjs'
import { db } from '../../db/client.ts'
import { records } from '../../db/schema.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { PanelError } from '../panel-error.ts'
import { theRowAnArrivingReferenceNames } from '../the-row-an-arriving-reference-names.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'

/**
 * A NOTEBOOK'S ENTRIES ARE WRITTEN BY ITS DOORS AND BY NOTHING ELSE. Criterion N2.
 *
 * Every entry says who wrote it and when. The doors take both from the actor and the clock; a
 * caller that could send them could write an entry in the person's name, and the next run would
 * read it as the person's — which is chapter 8 rule 1 and chapter 4 rule 5 at once. So a write that adds or
 * changes `entries` and does not come from a door is refused here, on both write paths, and the
 * refusal names the door to use.
 *
 * A WRITE THAT LEAVES `entries` ALONE IS NOT REFUSED. Retitling a notebook, writing its short
 * forms, linking it, setting it aside: all ordinary edits. `before` is what the record holds now,
 * or null on a create, so a create carrying no entries at all passes too.
 */
export function checkTheNotebookEntries(
  arriving: unknown,
  before: unknown,
  throughTheDoor: boolean,
  handle: string,
): void {
  if (throughTheDoor) return
  if (!isJsonObject(arriving) || !Object.hasOwn(arriving, 'entries')) return
  const now = isJsonObject(before) ? before['entries'] : undefined
  // AN UNCHANGED LIST IS NOT A CHANGE. A whole-object `data` write carries every field, including
  // one the caller never meant to touch, and refusing that would refuse retitling through `data`.
  if (JSON.stringify(arriving['entries']) === JSON.stringify(now)) return
  // AND AN EMPTY NOTEBOOK MAY BE MADE BY HAND. `entries` is a required field, so a caller filing a
  // notebook the ordinary way has to send one; an empty list adds no entry, so it puts nobody's
  // name on anything and loses nothing. Only on a CREATE: a patch that empties a notebook that had
  // entries in it is a removal, and removing is the person's act through the door below.
  if (now === undefined && Array.isArray(arriving['entries']) && arriving['entries'].length === 0) return
  throw new PanelError(
    `A notebook's entries are written by its own doors and not by a record write. Nothing was written. Each ` +
      `entry says who wrote it and when, and the doors take both from who is asking and from the clock: a ` +
      `writer that could send them could write an entry in the person's name, and the next run would read it as ` +
      `theirs. Add one with POST /api/agents/${handle}/notebook/entries {"entryKind":"…","text":"…"}, change one ` +
      `with PATCH /api/agents/${handle}/notebook/entries/<entry id>, and take one out with DELETE on that same ` +
      `address. Everything else about this record — its title, its short forms, its links — is an ordinary edit.`,
    403,
  )
}

/**
 * THE TWO THINGS A NOTEBOOK IS REFUSED FOR. Criterion N1.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN `validateData`
 * ---------------------------------------------------------------------------------------
 *
 * Both questions are asked of the database: is there already a notebook for this agent, and does
 * this agent hold the card the role declaration names. `validateData` runs in the browser and may
 * not touch the database, which is the same reason `checkBlockIds` in `./pipeline-blocks.ts` and `checkAnnotationContext` in
 * `../targets.ts` do not. And it runs on BOTH write paths, because a rule enforced on one write path is not a rule —
 * the sentence `./creating.ts` already carries above the pipeline check.
 *
 * WHICH CARD, READ FROM THE DECLARATION AND NEVER TYPED. `mayBeElevated` asks
 * `design/permissions/roles.json` which card can act for the person, the secretary card. Changing the word in that
 * file moves this refusal with it, and
 * `tests/one-declaration-decides-what-a-role-may-do.test.ts` fails on a source file that types it.
 *
 * `mine` IS THE NOTEBOOK BEING WRITTEN, or null on a create. On a patch it is the record's own id,
 * so a notebook does not refuse itself as its own second copy.
 */
export function checkTheNotebook(
  workspaceId: string,
  data: unknown,
  mine: string | null,
): void {
  if (!isJsonObject(data)) return
  const handle = data['agentHandle']
  if (typeof handle !== 'string' || handle.trim() === '') return

  // WHO IT IS FOR HAS TO BE SOMEBODY. A notebook under a name nothing answers to is a notebook no
  // brief will ever read, because the brief looks the reader up by handle. The name arrives with this
  // write, so it goes through the one resolver as a read: the live agent bearing it, else the one
  // retired agent bearing it, and a 409 where it names two (criterion I3 lets a retired agent and a
  // live one share a handle).
  const row = theRowAnArrivingReferenceNames(handle, 'reading')
  if (row === null) {
    throw new PanelError(
      `This notebook says it belongs to "${handle}", and Mole Office has no agent by that handle. Nothing was ` +
        `written. A notebook is kept under one agent's name, and the name has to be one the office knows: ` +
        `GET /api/participants lists them.`,
      400,
    )
  }

  // AND THAT SOMEBODY HOLDS THE CARD. The word comes from the declaration; nothing here types it.
  if (theRoleCardsAreRead()) {
    const cards = theRoleCards()
    const card = row.role ?? A_ROW_WITH_NO_ROLE_READS_AS
    if (!mayBeElevated(cards, card)) {
      const met = () => gateMet('who-holds-a-notebook')
      if (gatePosition('who-holds-a-notebook') === 'block') {
        // MOLE OFFICE'S OWN ROW HOLDS NO CARD, and nobody appoints the product, so its sentence says so.
        const said = isMoleOffice({ kind: 'agent', id: row.id })
          ? `"${handle}" ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}, and a notebook is kept for an agent holding the ` +
            `${cards.elevation.onlyThisCardCanHoldIt} card. Nothing was written. A notebook is what makes an agent ` +
            `that person's secretary, and Mole Office is the product, not an agent. Write the notebook under the ` +
            `agent that holds the card.`
          : `"${handle}" holds the ${card} card, and a notebook is kept for an agent holding the ` +
            `${cards.elevation.onlyThisCardCanHoldIt} card. Nothing was written. This notebook is what makes an ` +
            `agent that person's secretary — how they work, how they want to be answered, what it may settle alone — ` +
            `and keeping one for an agent that is not their secretary would be a record about a relationship nobody ` +
            `has. Ask the person to appoint "${handle}", or write the notebook under the agent that already holds ` +
            `the card.`
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(said, 400), met)
      }
      met()
    }
  }

  // AND THERE IS ONLY EVER ONE. Read live rather than remembered: two requests a second apart would
  // otherwise both pass a check made against what the table held before either of them.
  for (const other of db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, NOTEBOOK_KIND), isNull(records.deletedAt)))
    .all()) {
    if (other.id === mine) continue
    const said = other.data as Record<string, unknown> | null
    if (said === null || said['agentHandle'] !== handle) continue
    throw new PanelError(
      `"${handle}" already has a notebook, ${other.id} ("${other.title}"), and an agent has one. Nothing was ` +
        `written. A second notebook would be two accounts of one working relationship, and a run reading its ` +
        `notebook at the start could be handed either of them with nothing saying which is the person's. Add ` +
        `what you were going to write to ${other.id} instead: POST /api/agents/${handle}/notebook/entries.`,
      409,
    )
  }
}
