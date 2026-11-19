// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO OWNS THIS OFFICE, AS THE SERVER READS IT. The one module that reads the owner setting.
 *
 * The setting lives on the owner's own `people` row, in `office_owner` (the owner migration `the_owner_comes_from_the_installer`), and was
 * written at the first migrate from what the installer set. src/server/db/owner-setting.ts says how
 * it is written and holds the one reading of the row; this file reads it through the server's own
 * database connection and gives the rest of the server three things:
 *
 *   - `theOfficeOwner()`: the owner's id, name (null while nobody gave one) and mark;
 *   - `theOwnerAsTheDoorSaysIt(language)`: the answer GET /api/office/owner gives;
 *   - `nameTheOwner(...)`: the one write, made by POST /api/office/owner.
 *
 * EVERY READ TELLS @shared/person.ts. `THE_PERSON` there is the id the 39 older readers use, and it
 * holds what this file last read. The server reads the owner once right after its database is
 * migrated and before it listens (src/server/index.ts), so no request is answered before
 * `THE_PERSON` is the owner's id.
 */

import { sqlite } from '../db/client.ts'
import { readTheOfficeOwner, type OfficeOwnerRow } from '../db/owner-setting.ts'
import { theOwnerIsKnown } from '@shared/person.ts'
import { THE_GUIDE_ADDRESS, THE_OWNER_PLACEHOLDER, type TheOfficeOwner } from '@shared/owner.ts'
import { isLanguage, type Language } from '@shared/i18n.ts'
import { announce } from './events.ts'
import { fileTheGettingStartedReport } from './getting-started.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theOfficeOwner } from '../db/the-office-owner.ts'

export { theOfficeOwner } from '../db/the-office-owner.ts'

/** The language the owner chose, from `people.language`, or null when they have not chosen. */
export function theOwnersLanguage(): Language | null {
  const owner = theOfficeOwner()
  const row = sqlite.prepare('SELECT language FROM people WHERE id = ?').get(owner.id) as { language: unknown } | undefined
  return isLanguage(row?.language) ? row.language : null
}

/** What GET /api/office/owner answers, with the placeholder in the language asked for. */
export function theOwnerAsTheDoorSaysIt(language: Language): TheOfficeOwner {
  const owner = theOfficeOwner()
  return {
    id: owner.id,
    name: owner.name,
    named: owner.name !== null,
    placeholder: THE_OWNER_PLACEHOLDER[language],
    guide: THE_GUIDE_ADDRESS,
  }
}

/**
 * NAME THE OWNER: the person's own press or a secretary recording their written words, allowed once while
 * unnamed. The door has already checked who is asking and the name's shape. The write is one statement that names the row
 * only while it is still `unnamed`, so two presses at once cannot both win: the second finds nothing
 * to change and is refused.
 *
 * `language` is written where the office already keeps the person's language, `people.language`.
 */
export function nameTheOwner(name: string, language: Language | null, actor: Actor): OfficeOwnerRow {
  const owner = theOfficeOwner()
  // A NAMING THAT STANDS ALWAYS HAS ITS GETTING-STARTED REPORT AND ITS CHECKLIST ITEM: both are written in the same
  // transaction, so a report that could not be filed leaves the office unnamed, and a refused naming files nothing.
  const changed = sqlite.transaction(() => {
    const changed = sqlite
      .prepare(
        "UPDATE people SET name = ?, office_owner = 'named-by-the-person', language = COALESCE(?, language) " +
          "WHERE id = ? AND office_owner = 'unnamed'",
      )
      .run(name, language, owner.id).changes
    if (changed === 1) fileTheGettingStartedReport({ person: owner.id, name, language: theOwnersLanguage() })
    return changed
  })()
  if (changed === 0) {
    throw new PanelError(
      `This office's owner already has a name, ${JSON.stringify(owner.name)}, so there is nothing to name. Nothing was changed.`,
      409,
    )
  }
  // EVERY PAGE IS TOLD, because the owner's name is on the chat's lists: the placeholder there becomes
  // the name the person gave.
  announce({
    name: 'list.changed',
    workspaceId: null,
    lists: ['participants', 'contacts'],
    about: null,
    groupId: null,
    participant: { kind: 'person', id: owner.id },
    because: actor.warrantUsed === true
      ? "A secretary recorded the owner's name on the owner's written words."
      : "The office's owner gave their name.",
  })
  return theOfficeOwner()
}
