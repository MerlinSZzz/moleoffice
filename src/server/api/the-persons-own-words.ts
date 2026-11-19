// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR THROUGH WHICH WORDS THE PERSON SAID SOMEWHERE ELSE BECOME A RECORD OF
 * THEIR OWN. This is option C on problem bXW3UpEsrsoZ: a decision in the person's name cites a record of
 * the person's own words, and words said somewhere the office cannot see, such as a secretary's terminal, first go in
 * through a door only the person can use.
 *
 *   POST /api/records/:id/file-as-my-words   the person files a prepared note's words as a note of their own
 *   POST /api/records/:id/not-what-i-said    the person says a prepared note is not what they said; the note is kept
 *   GET  /api/the-persons-words              the prepared notes still waiting, across every project, a page at a time
 *   POST /api/the-persons-words/confirm-all  the person files every note the page shows, all or none
 *
 * THE PAGE OF THEM IS LOOK A: its own row in the sidebar, one row per note, and on
 * each row "Confirm", which is the press above, and "Not what I said".
 *
 * A SECRETARY PREPARES, THE PERSON PRESSES. The secretary writes an ordinary `note` whose `body` copies the person's
 * words and sets `for_the_person_to_file`: true. The prepared note stays the secretary's. The person's one press,
 * drawn on that note's page, writes a new note as the person, with the same body and `filed_from` naming the prepared
 * note. The change log credits the new note to the person, which is what makes it "a record they wrote" to the guard
 * in `assertMayDecide` (src/server/lib/the-persons-own-words.ts).
 *
 * THE PERSON'S GRANT CARRIES THE THREE PRESSES WHERE THIS OFFICE SAYS IT DOES (wave 13s round 68). Each asks the person
 * first, then `aRaiseCarriesIt`, then refuses in the old words. What a secretary's press writes is the secretary's, and
 * it never reads as the person's own words: the note it files holds `filed_under_the_grant`, naming the prepared note,
 * the secretary, the grant and the press, and never `filed_from`; the change log credits it to the secretary, so a
 * decision in the person's name cannot cite it as theirs. Its mark on a prepared note is
 * `not_what_they_said_under_the_grant`, and never `not_what_the_person_said`. Either answers the prepared note once:
 * it no longer waits, and a later press on it, the person's own among them, is refused in words naming the secretary.
 * Who pressed is worked out once, by `whoPressedItUnderTheGrant` (src/server/lib/the-persons-own-words.ts).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sqlite } from '../db/client.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theMessageReader } from '../lib/messages.ts'
import {
  aRaiseCarriesIt,
  assertThePersonIsProved,
  createRecord,
  getRecord,
  patchRecord,
  recordInWorkspace,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import type { PanelRecord } from '@shared/types.ts'
import { nowStamp } from '@shared/time.ts'
import {
  FILED_FROM,
  FILED_UNDER_THE_GRANT,
  NOT_WHAT_THE_PERSON_SAID,
  NOT_WHAT_THEY_SAID_UNDER_THE_GRANT,
  tellTheWriterOfTheNote,
  theNotesWaitingForThePerson,
  theSecretarysName,
  whoPressedItUnderTheGrant,
  whyThisNoteDoesNotWait,
} from '../lib/the-persons-own-words.ts'
import type { AWaitingNote } from '@shared/the-persons-own-words.ts'

const FILE_NOTE =
  'THE PERSON FILES WORDS A SECRETARY PREPARED AS THEIR OWN. The record in the URL is a `note` with ' +
  '`for_the_person_to_file`: true, whose `body` copies what the person said somewhere the office cannot see. ' +
  'The person presses it. The person\'s grant carries it for a secretary only where this office says so, and no warrant ' +
  'does. The person\'s press writes a new `note` as the person, with ' +
  'the same `body` and `date` and `filed_from` naming the prepared note, and answers it. A decision in the person\'s ' +
  'name may then cite that note in `authority_reference`. A secretary\'s press under the grant writes a new `note` as ' +
  'the secretary instead, with `filed_under_the_grant` naming the prepared note, the secretary, the grant and the press, ' +
  'and no `filed_from`: it is never the person\'s own words. Refused, writing ' +
  'nothing: a record that is not such a note, a note with no words, a note the person or a secretary said is not what ' +
  'the person said, and a note already filed, whose filed note the refusal names. Takes no body.'

const NOT_WHAT_I_SAID =
  'THE PERSON SAYS A NOTE A SECRETARY PREPARED IS NOT WHAT THEY SAID. The record in the URL is a `note` with ' +
  '`for_the_person_to_file`: true. The person presses it. The person\'s grant carries it for a secretary only where ' +
  'this office says so, and no warrant does. The person\'s press writes ' +
  '`not_what_the_person_said` on that note, as the time they pressed, and changes nothing else: the note is kept, and ' +
  'nothing is filed as their words. A secretary\'s press under the grant writes `not_what_they_said_under_the_grant` ' +
  'instead, naming when, the secretary, the grant and the press; it is never the person\'s own mark. Either way the note ' +
  'then no longer waits, and it cannot be filed. Refused, writing nothing: a record that is not such a note, a note ' +
  'already filed, and a note already marked. Takes no body.'

const WAITING =
  'THE NOTES STILL WAITING FOR THE PERSON, ACROSS EVERY PROJECT. A note waits when it is a live `note` with ' +
  '`for_the_person_to_file`: true, and nobody has answered it: neither the person nor a secretary under the person\'s ' +
  'grant has pressed "Not what I said" on it or filed it. ' +
  'Oldest first. `limit` (1 to 25, default 25) and `offset` (default 0) page through them, and `total` counts them all. ' +
  'Each note carries its project, its words exactly as stored (`body`, null when it holds none), its `date`, when it was ' +
  'written, and who wrote it. Nothing records where or to whom the person said the words, so no field says that.'

const CONFIRM_ALL =
  'THE PERSON FILES MANY PREPARED NOTES AS THEIR OWN WORDS IN ONE PRESS. The body is `{"ids":[...]}`: from 1 to 25 ' +
  'note ids, in any project, each one a note still waiting for the person (GET /api/the-persons-words). The person ' +
  'presses it. The person\'s grant carries it for a secretary only where this office says so, and no warrant does. ' +
  'Every id is checked before anything is written, and one that is ' +
  'not waiting refuses the whole press, naming it, with nothing written. Otherwise each note is filed exactly as ' +
  'POST /api/records/:id/file-as-my-words files it, in one transaction, and the reply lists the notes written.'

const ONLY_THE_PERSON = 'Only the person files words as their own. A secretary prepares them as a note, and the person presses.'

const waitingQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(25).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})
const confirmAllBody = z.strictObject({ ids: z.array(z.string().min(1)).min(1).max(25) })

/** The words a prepared note holds, trimmed, or a refusal when it holds none. */
function theWordsOf(id: string, prepared: PanelRecord): string {
  const body = typeof prepared.data['body'] === 'string' ? prepared.data['body'].trim() : ''
  if (body === '') throw new PanelError(`The note ${id} holds no words to file. Nothing was written.`, 409)
  return body
}

/**
 * The note filed from a prepared one that has passed both checks above, and the line that tells whoever wrote the
 * prepared note down. The person's press writes the person's note, with `filed_from`. A secretary's press under the
 * grant writes the secretary's note, with `filed_under_the_grant` and no `filed_from`, so it is never the person's own
 * words. Called inside a transaction, so the note and the line are written together or not at all.
 */
function fileIt(id: string, prepared: PanelRecord, body: string, actor: Actor): PanelRecord {
  const date = prepared.data['date']
  const pressed = whoPressedItUnderTheGrant(actor)
  const note = createRecord({
    kind: 'note',
    title: prepared.title,
    data: {
      body,
      ...(typeof date === 'string' ? { date } : {}),
      ...(pressed === null ? { [FILED_FROM]: id } : { [FILED_UNDER_THE_GRANT]: { from: id, ...pressed } }),
    },
    workspaceId: prepared.workspaceId,
    actor,
  })
  tellTheWriterOfTheNote(
    prepared,
    pressed === null
      ? { is: 'confirmed', filedAs: note.id }
      : { is: 'filedUnderTheGrant', filedAs: note.id, by: theSecretarysName(pressed.by) },
  )
  return note
}

export async function thePersonsOwnWordsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/records/:id/file-as-my-words',
    route('record.file-as-my-words', 'remote', FILE_NOTE),
    async (req): Promise<{ note: PanelRecord; filedFrom: string }> => {
      const actor = actorFrom(req)
      if (!thePersonIsProved(actor) && !aRaiseCarriesIt(actor)) assertThePersonIsProved(actor, 'Filing words as your own', ONLY_THE_PERSON)
      takesNoInput(req, 'POST /api/records/:id/file-as-my-words', 'The words are the prepared note\'s; nothing else is sent.')
      const { id } = req.params as { id: string }
      const prepared = recordInWorkspace(id, workspaceOf(req), theMessageReader(actor))
      const why = whyThisNoteDoesNotWait(prepared)
      if (why !== null) throw new PanelError(`${why} Nothing was written.`, 409)
      const body = theWordsOf(id, prepared)
      return { note: sqlite.transaction(() => fileIt(id, prepared, body, actor))(), filedFrom: id }
    },
  )

  app.post(
    '/records/:id/not-what-i-said',
    route('record.not-what-i-said', 'remote', NOT_WHAT_I_SAID),
    async (req): Promise<{ note: PanelRecord }> => {
      const actor = actorFrom(req)
      if (!thePersonIsProved(actor) && !aRaiseCarriesIt(actor)) {
        assertThePersonIsProved(actor, 'Saying a note is not what you said', 'Only the person says that words are not what they said.')
      }
      takesNoInput(req, 'POST /api/records/:id/not-what-i-said', 'The press says only that the note is not what you said.')
      const { id } = req.params as { id: string }
      const prepared = recordInWorkspace(id, workspaceOf(req), theMessageReader(actor))
      const why = whyThisNoteDoesNotWait(prepared)
      if (why !== null) throw new PanelError(`${why} Nothing was written.`, 409)
      // THE MARK AND THE LINE TO WHOEVER WROTE THE NOTE DOWN ARE ONE WRITE. A secretary's press under the grant writes
      // its own mark, naming who pressed, and never the person's.
      const pressed = whoPressedItUnderTheGrant(actor)
      const marked = sqlite.transaction(() => {
        const dataPatch =
          pressed === null
            ? { [NOT_WHAT_THE_PERSON_SAID]: nowStamp() }
            : { [NOT_WHAT_THEY_SAID_UNDER_THE_GRANT]: { at: nowStamp(), ...pressed } }
        const note = patchRecord(id, { dataPatch }, actor).record
        tellTheWriterOfTheNote(
          prepared,
          pressed === null ? { is: 'notWhatTheySaid' } : { is: 'notWhatTheySaidUnderTheGrant', by: theSecretarysName(pressed.by) },
        )
        return note
      })()
      return { note: marked }
    },
  )

  app.get(
    '/the-persons-words',
    route('project.the-persons-words-waiting', 'remote', WAITING),
    async (req): Promise<{ notes: AWaitingNote[]; total: number; limit: number; offset: number }> => {
      const query = parse(waitingQuery, req.query ?? {}, 'The page asked for')
      const page = { limit: query.limit ?? 25, offset: query.offset ?? 0 }
      return { ...theNotesWaitingForThePerson(page), ...page }
    },
  )

  app.post(
    '/the-persons-words/confirm-all',
    route('record.confirm-all-my-words', 'remote', CONFIRM_ALL),
    async (req): Promise<{ filed: Array<{ note: PanelRecord; filedFrom: string }> }> => {
      const actor = actorFrom(req)
      if (!thePersonIsProved(actor) && !aRaiseCarriesIt(actor)) assertThePersonIsProved(actor, 'Filing words as your own', ONLY_THE_PERSON)
      const { ids } = parse(confirmAllBody, req.body ?? {}, 'Confirm all')
      const twice = ids.find((id, at) => ids.indexOf(id) !== at)
      if (twice !== undefined) throw new PanelError(`The note ${twice} is named twice. Nothing was written.`, 400)
      // EVERY NOTE IS CHECKED BEFORE ANY IS FILED, so a press that cannot file one of them files none.
      const checked = ids.map((id) => {
        const prepared = getRecord(id)
        if (prepared === null || prepared.deletedAt !== null) {
          throw new PanelError(`There is no note ${id}, or it was deleted. Nothing was written.`, 404)
        }
        const why = whyThisNoteDoesNotWait(prepared)
        if (why !== null) throw new PanelError(`${why} Nothing was written.`, 409)
        return { id, prepared, body: theWordsOf(id, prepared) }
      })
      const filed = sqlite.transaction(() =>
        checked.map(({ id, prepared, body }) => ({ note: fileIt(id, prepared, body, actor), filedFrom: id })),
      )()
      return { filed }
    },
  )
}
