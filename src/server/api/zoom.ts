// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORT FORMS ROUTES: what shorter forms a record has, whether they still hold, and writing them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE EXIST WHEN A SHORT FORM IS ALREADY A FIELD OF THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/records/<id>` hands back `data.shortForms` and always will. It cannot answer either of
 * the two questions a screen asks before drawing one:
 *
 *   IS THIS STILL ABOUT THE RECORD? A short form names the revision it was written from. Whether the
 *   record has changed since is a comparison against the ledger, and no read of the record does it.
 *
 *   WHAT DO I DRAW FOR THE FORTY ROWS THAT HAVE NONE? A list needs one answer per row, in one
 *   request, including for the rows where the honest answer is that nobody has written one.
 *
 * Everything either read does lives in src/server/lib/zoom.ts. This is the door.
 *
 *   GET  /api/records/:id/short-forms   every length, and where each one stands
 *   POST /api/records/:id/short-forms   write or clear some of them, naming what they were made from
 *   POST /api/short-forms/rows          one length, for a whole list of records, in one request
 *
 * ---------------------------------------------------------------------------------------
 * THE WRITE IS NOT A SECOND WRITE DOOR
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/records/:id/short-forms` calls `patchRecord` — the same function an ordinary PATCH
 * calls — so the field checking, the human-only rule, the change log and the revision all happen
 * exactly as they do on any other edit. This route is the convenient shape: it merges the levels a
 * caller names into the ones already there, and it says where all five stand afterwards.
 *
 * A PLAIN PATCH WRITES THE SAME FIELD AND GETS THE SAME TWO CHECKS. `settleShortForms` runs inside
 * `patchRecord` for every level a write changes: the revision the words name is checked against the
 * ledger, and `writtenBy` is derived from the actor headers rather than taken from the body. So
 * neither the stamp nor the mark saying a person wrote this by hand depends on which door was used.
 * They did until 19 August 2026, and the note on `settleShortForms` in src/server/lib/zoom.ts has
 * what an agent could store through the other one.
 *
 * WHAT NEITHER DOOR CAN CHECK, and it is worth stating beside the above so nobody reads the ledger
 * check as more than it is: `madeFrom` says which revision somebody READ. A writer who sends the
 * newest seq and hash with words written from something else passes every check there is. The pair
 * is checked for being real, never for being the one the words came from.
 *
 * A STAMP THE LEDGER DOES NOT HOLD IS STILL REPORTED HONESTLY ON THE READ, as `cannot_check` in its
 * own state word and never as `current`. Rows written before the gate closed exist, and a claim
 * nobody could check is reported as one nobody could check.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE GENERATES ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has no summariser. Whoever writes a record writes its short forms, and when nobody has
 * written one the answer is that there is none — which every reply here says in a sentence. There is
 * no endpoint that would make one, because making one would mean shortening the record, and a cut is
 * the thing this whole phase exists to replace.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ASK_FIRST_SENTENCE } from '@shared/ask-first.ts'
import { wouldBeAccepted, writeOrCheck, type WouldBeAccepted } from '../lib/only-a-check.ts'
import { z } from 'zod'
import {
  PARTS_KEY,
  PART_TEXT_SPECS,
  RETIRED_SHORT_FORM_KEYS,
  SHORT_FORM_LEVELS,
  SHORT_FORM_SPECS,
  STORED_SHORT_FORM_LEVELS,
  type ShortFormLevel,
} from '@shared/zoom.ts'
// THE SEVEN POSITIONS OF THE READING LADDER, NAMED IN ONE SENTENCE. Built from `RUNGS`, so a
// refusal here cannot name a ladder the product does not have.
import { SEVEN_RUNGS_NAMED } from '@shared/detail.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { refuseAMessageThisReaderMayNotRead, theMessageReader, theMessagesHiddenFrom } from '../lib/messages.ts'
import { noRecordHasThisId } from '../lib/no-record-has-this-id.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import {
  MAX_ROWS,
  readShortForms,
  shortFormsForRows,
  writeShortForms,
  type ShortFormForRow,
  type ShortFormsReading,
} from '../lib/zoom.ts'

// ---------------------------------------------------------------------------- input shapes

const recordIdParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain the id of a record' }),
})

/**
 * The whole-record lengths a LIST may ask for, read off the declaration so a new one needs no edit
 * here. All three, because a list row may ask for the record's own title or its own summary just as
 * it may ask for a written label — `readShortForms` answers all three.
 */
const level = z.enum(SHORT_FORM_LEVELS as [ShortFormLevel, ...ShortFormLevel[]], {
  error: `level must be one of: ${SHORT_FORM_LEVELS.join(', ')}`,
})

/**
 * The lengths a WRITE may name. One, since 3 September 2026.
 *
 * It is not `level` above and the two must not merge. A list may ASK for length 2; nobody WRITES
 * length 2 here, because it is the record's own title and is written with PATCH /api/records/<id>.
 * One enum for both would accept `standsFor: {"title": […]}` and then ignore it, which is a write
 * reported as done that did nothing.
 */
const storedLevel = z.enum(STORED_SHORT_FORM_LEVELS as unknown as [ShortFormLevel, ...ShortFormLevel[]], {
  error: `that length is not written here. The lengths written here are: ${STORED_SHORT_FORM_LEVELS.join(', ')}`,
})

/**
 * ONE PART OF THE REPORT, as a caller writes it.
 *
 * ALL THREE TEXTS ARE REQUIRED because they are three lengths of ONE part: a part written at level 5
 * and not at level 6 would vanish from the page when the reader asked for more. The budgets and the
 * coverage rules are enforced on the way through `patchRecord`, which is the one write door, so
 * none of them is repeated here.
 */
const partWrite = z.strictObject({
  id: z.string().min(1, { error: 'each part carries a stable id, unique within the record' }),
  heading: z
    .string()
    .min(1, { error: "heading is this part of the report summarised in one sentence" }),
  text30: z.string().min(1, { error: 'text30 is what this part says, in a sentence or two' }),
  text120: z.string().min(1, { error: 'text120 is what this part says, at length' }),
  covers: z.array(z.string().min(1, { error: 'each entry is the id of one block of this report' }), {
    error: 'covers is the list of block ids this part covers',
  }),
})

const madeFrom = z.strictObject({
  seq: z.number({ error: 'madeFrom.seq is the revision number, from GET /api/records/<id>/revisions' }),
  contentHash: z
    .string({ error: 'madeFrom.contentHash is the content hash of that same revision' })
    .min(1, { error: 'madeFrom.contentHash may not be blank' }),
})

/**
 * The body of a write.
 *
 * `null` clears one length, which is the same spelling `dataPatch` already uses for deleting a key.
 * A length that is not mentioned is left exactly as it was, so adding a brief does not drop a label
 * somebody wrote last week.
 */
const writeBody = z.strictObject({
  madeFrom,
  // WHO WROTE THESE WORDS IS NOT SENT, IT IS READ OFF THE ACTOR HEADERS. It was a field here until
  // 19 August 2026, which made "a person wrote this by hand" a claim the writer made about
  // themselves: an agent typing the word `human` got the override sentence on every screen while the
  // change log recorded the agent. A refusal rather than silence, because a caller still sending it
  // believes it is doing something.
  writtenBy: z
    .never({
      error:
        'writtenBy is not sent. Who wrote a short form is read from the actor headers — x-mole-office-actor-type, ' +
        'x-mole-office-actor-id and x-mole-office-session — like every other write in Mole Office. Send ' +
        'x-mole-office-actor-type: human to write one as a person, which is marked on every screen as a person ' +
        'stepping in front of what would otherwise be derived. Nothing was stored.',
    })
    .optional(),
  // THE THREE WHOLE-RECORD LENGTHS, EACH A TEXT, AND THE BY-PART STRUCTURE BESIDE THEM.
  //
  // Every key is optional and a key that is not named is left exactly as it was, which is the rule
  // this endpoint is for: adding a gist may not drop a label. A null clears one.
  //
  // THE THREE RETIRED KEYS ARE DECLARED AND REFUSED BY NAME rather than falling through to "that key
  // is not allowed", because a caller still sending one believes it is doing something, and the
  // sentence it needs is which seven positions the ladder now has.
  forms: z
    .strictObject({
      ...(Object.fromEntries(
        STORED_SHORT_FORM_LEVELS.map((one) => [one, z.union([z.string(), z.null()]).optional()]),
      ) as Record<ShortFormLevel, z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>>),
      [PARTS_KEY]: z.union([z.array(partWrite), z.null()]).optional(),
      ...(Object.fromEntries(
        RETIRED_SHORT_FORM_KEYS.map((one) => [
          one,
          z
            .never({
              error:
                `\`${one}\` is retired and cannot be written. The reading ladder has seven positions — ` +
                `${SEVEN_RUNGS_NAMED} — and only \`label\` and \`${PARTS_KEY}\` are written here. Reading ` +
                `length 2 is the record's own title and length 3 is its own summary, so both are written with ` +
                `PATCH /api/records/<id> {"title":…,"summary":…}; lengths 4, 5 and 6 are written by part, in ` +
                `\`forms.${PARTS_KEY}\`: a heading, a 30-word text, a 120-word text and the blocks covered, for ` +
                `each part of the report. What is already stored under \`${one}\` is left exactly as it is and ` +
                `nothing draws it. Nothing was stored.`,
            })
            .optional(),
        ]),
      ) as Record<string, z.ZodOptional<z.ZodNever>>),
    })
    .refine((forms) => Object.keys(forms).length > 0, {
      error:
        'forms named no length, so this write would change nothing. Name at least one of: ' +
        `${STORED_SHORT_FORM_LEVELS.join(', ')}, ${PARTS_KEY}`,
    }),
  /**
   * WHICH PARTS OF THE RECORD EACH FORM STANDS FOR, for the levels whose writer recorded them.
   *
   * OPTIONAL, AND LEAVING IT OUT IS AN ANSWER RATHER THAN A GAP. A form written with no source list
   * is one whose sources nobody recorded, and every screen that draws it says exactly that. It is
   * not filled in from anything: deriving which parts a summary covers and presenting the guess as
   * a record of what somebody did is what criterion 18 of design/problem-03/ACCEPTANCE.md forbids.
   *
   * The pairing rules and the check against the record's own parts are in `checkStandsFor` in
   * src/server/lib/zoom.ts, where they can be stated in whole sentences — including why a block and
   * a paragraph inside it are two parts a writer may name rather than two spellings of one.
   */
  standsFor: z
    .partialRecord(storedLevel, z.array(z.string().min(1, { error: 'each entry is the stored path of one part' })), {
      error:
        `standsFor is an object keyed by length: ${STORED_SHORT_FORM_LEVELS.join(', ')}. Each value is the list of ` +
        `parts of this record that length stands for, by stored path. A block and a paragraph inside it are ` +
        `different parts and both may be named: ["data.blocks[#b-1]","data.blocks[#b-1].text@0","section.openAround"].`,
    })
    .optional(),
})

const rowsBody = z.strictObject({
  recordIds: z
    .array(z.string().min(1, { error: 'each id is the id of one record' }), {
      error: 'recordIds is the list of records the rows are about',
    })
    .max(MAX_ROWS, { error: `ask about at most ${String(MAX_ROWS)} records at once` }),
  level,
})

/** Every length and what each is for, said once, for the route notes. */
const LENGTHS = [
  ...STORED_SHORT_FORM_LEVELS.map((name) => {
    const spec = SHORT_FORM_SPECS[name]
    return `${name} (${String(spec.minWords)}-${String(spec.maxWords)} words, the ${spec.noun})`
  }),
  `title (reading length 2, which is the record's own \`title\` — at most ${String(SHORT_FORM_SPECS.title.maxWords)} ` +
    `words, a target and not a rule, written with PATCH /api/records/<id>)`,
  `gist (reading length 3, which is the record's own \`summary\` — ${String(SHORT_FORM_SPECS.gist.minWords)} to ` +
    `${String(SHORT_FORM_SPECS.gist.maxWords)} words, a target and not a rule, written the same way)`,
  `${PARTS_KEY} (levels 4, 5 and 6 together: for each part of the report a heading of at most ` +
    `${String(PART_TEXT_SPECS.heading.maxWords)} words, a text of at most ${String(PART_TEXT_SPECS.text30.maxWords)}, ` +
    `a text of at most ${String(PART_TEXT_SPECS.text120.maxWords)}, and the ids of the blocks the part covers)`,
].join(', ')

// ---------------------------------------------------------------------------- routes

export async function zoomRoutes(app: FastifyInstance): Promise<void> {
  /** Every length of one record, and where each one stands. */
  app.get(
    '/records/:id/short-forms',
    route(
      'record.short-forms',
      'remote',
      'Where this record stands at every reading length: ' +
        `${LENGTHS}. ALL SEVEN POSITIONS COME BACK — ${SEVEN_RUNGS_NAMED} — whether or not anybody has written ` +
        'them, and `state` says which of six situations each one is in: "current" (written, and the record has ' +
        'not changed since), "out_of_date" (written, and the record changed afterwards — `changedSince` names ' +
        'the fields that moved), "cannot_check" (it names a revision this ledger does not hold, so Mole Office ' +
        'will not say either way), "none" (there is a place for it and room for it and nobody has written one — ' +
        'the one a reader can act on), "cannot_write" (this record cannot have that level at all: the kind has ' +
        'no place for it, or the record is already too short) and "is_the_record" (Full, which is the ' +
        'record itself and has no shorter form of it to be missing). `why` CARRIES THE REASON A POSITION HAS NO ' +
        'WORDS: "noPlace" (this kind of record has no parts to write), "tooShort" (the record is already that ' +
        'short) or "notWritten" (somebody can still write it), and null wherever somebody wrote it. ' +
        'It is the same answer the card on the drawing gives. LEVELS 4, 5 AND 6 ARE WRITTEN BY PART and ' +
        'have no single text, so their `text` is null and `parts` says whether the structure is there and how ' +
        'many parts it holds; all three stand or fall together, because all three read the one structure. ' +
        '`wordsPer` says whether a length\'s word budget is counted over the whole form or over each part. ' +
        'NOTHING IS SHORTENED TO FILL A GAP: a length nobody has written comes back empty with a sentence ' +
        'saying so, because a cut of the record is not a short form of it. `override` is true where a person ' +
        'wrote that length by hand, which is read from the actor headers of the write rather than from anything ' +
        'the writer said about itself. Writes nothing.',
    ),
    async (req): Promise<ShortFormsReading> => {
      const { id } = parse(recordIdParams, req.params, 'The URL is not usable:')
      // A MESSAGE'S SHORT FORMS ARE ITS WORDS SHORTENED, so a reader who may not read the message is
      // refused them, in the words an id naming nothing is refused with.
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), id, () => noRecordHasThisId(id))
      return readShortForms(id, workspaceOf(req))
    },
  )

  /** One length, for a whole list of records, in one request. */
  app.post(
    '/short-forms/rows',
    route(
      'record.short-forms',
      'remote',
      'One length, for every record a list is about to draw, in ONE request. Send {"recordIds":[…],' +
        '"level":"label"}. A list that asked per row would be a request per row, which is how the review list ' +
        'came to draw every row the same. IT NEVER SUBSTITUTES ANOTHER LENGTH: a row that asked for a label and ' +
        'has none comes back with `text` null and a sentence, rather than the 250-word brief that happens to ' +
        'exist. Each row also carries the record\'s `title`, as its own field, so a caller that draws the title ' +
        'in place of a missing label needs no second request; it never fills `text`. ' +
        'A record that is not in this project is left out, so a shorter answer than the question means ' +
        'some of the ids are elsewhere. Writes nothing.',
    ),
    async (req): Promise<{ level: ShortFormLevel; rows: ShortFormForRow[]; asked: number; note: string }> => {
      const body = parse(rowsBody, req.body, 'That request is not usable:')
      // A MESSAGE THIS READER MAY NOT READ IS LEFT OUT like a record of another project. The
      // note below says an id may be missing for either reason.
      const reader = theMessageReader(actorFrom(req))
      const hidden = theMessagesHiddenFrom(reader, body.recordIds)
      const rows = shortFormsForRows(body.recordIds.filter((one) => !hidden.has(one)), workspaceOf(req), body.level)
      const written = rows.filter((row) => row.text !== null).length
      return {
        level: body.level,
        rows,
        asked: body.recordIds.length,
        note:
          `${String(written)} of ${String(rows.length)} record${rows.length === 1 ? '' : 's'} ` +
          `${written === 1 ? 'has' : 'have'} a ${SHORT_FORM_SPECS[body.level].noun} written. The rest say so ` +
          `rather than being drawn from something longer. ` +
          `${rows.length === body.recordIds.length ? '' : `${String(body.recordIds.length - rows.length)} of the ids asked about ${reader.readsEveryMessage ? 'are not in this project.' : 'are not in this project, or name a message you may not read.'}`}`.trim(),
      }
    },
  )

  /** Write or clear some of one record's short forms. */
  app.post(
    '/records/:id/short-forms',
    route(
      'record.short-forms-write',
      'remote',
      'Write shorter forms of one record. Body {"madeFrom":{"seq":4,"contentHash":"…"},"forms":{"label":"…",' +
        '"gist":"…"}}. LEVELS 4, 5 AND 6 ARE WRITTEN TOGETHER, BY PART, under `forms.parts`: an array of ' +
        '{"id":"p-1","heading":"…","text30":"…","text120":"…","covers":["b-1","b-2"]}, one entry per part of the ' +
        'record, in the order they are drawn. WHICH BLOCKS THOSE ARE IS THE KIND\'S OWN FIELD, read off the ' +
        'declaration and never assumed: a report keeps them in `blocks` and a module in `summaryBlocks`, and ' +
        'GET /api/kinds says which field a kind declares. A KIND WITH NO BLOCK FIELD HAS NO LEVELS 4, 5 AND 6 ' +
        'at all and no place to write them. EVERY BLOCK MUST BE COVERED BY EXACTLY ONE PART — a ' +
        'block covered by nothing, a block covered twice, an id the record does not hold and a part covering ' +
        'nothing are each refused, and the refusal names the ids. Only the blocks the record holds at the top ' +
        'level are covered: a block inside a section, a set of columns or a grid is drawn by the block that ' +
        'holds it, so covering the container covers what is inside it. Pictures and charts are covered like ' +
        `anything else. The lengths are ${LENGTHS}. WHO WROTE THEM IS READ FROM THE ACTOR HEADERS and is not sent ` +
        'in the body: x-mole-office-actor-type: human files a level as a person writing by hand, which every screen ' +
        'marks as an override, and anything else files it as derived. `madeFrom` IS CHECKED AGAINST THE LEDGER ' +
        'BY THIS ROUTE and is never filled in — send the seq and contentHash from the same entry of ' +
        'GET /api/records/<id>/revisions, which is the revision the words were actually written from. A plain ' +
        'PATCH of the record can write this field too, and makes the same check — a rule enforced on one write ' +
        'path is not a rule. A length named with null is cleared; a length not named is left alone, so ' +
        'adding a brief does not drop a label. WHICH PARTS EACH FORM STANDS FOR is recorded with the words, ' +
        'in the optional `standsFor` — {"standsFor":{"gist":["data.blocks[#b-1]","section.openAround"]}} — one ' +
        'entry per level being written, each a stored path this record really holds, both of which are checked. ' +
        'A BLOCK AND A PARAGRAPH INSIDE IT ARE DIFFERENT PARTS AND BOTH CAN BE NAMED: "data.blocks[#b-1]" is the ' +
        'whole block and "data.blocks[#b-1].text@0" is the paragraph starting at character 0 inside it, so name ' +
        'the one you mean. Right-clicking the thing on the record page reads its exact id off the thing itself. ' +
        'LEAVING IT OUT IS AN ANSWER: the form carries no recorded source parts, and a whole-record form with no ' +
        'recorded parts stands for the whole record by rule — recorded parts are optional provenance, not a ' +
        'requirement. Every screen says that rather than deriving an answer or going quiet. ' +
        'WHAT IS REFUSED AS A CUT: a form whose words are the opening ' +
        'words of a longer form, or of the record\'s own prose, or a form ending in an ellipsis. That catches a ' +
        'cut nobody edited. It cannot catch a cut somebody has since reworded, and Mole Office does not claim to tell ' +
        'those from writing. This is an ordinary record edit underneath, so it writes a change row and a ' +
        'revision like any other.',
    ),
    async (req): Promise<ShortFormsReading> => writeOrCheckShortForms(req, 'write'),
  )

  /**
   * Ask whether that write would be accepted, and write nothing. The same function as the write, so
   * the same checks (problem jQayki_gIciU, lib/only-a-check.ts).
   */
  app.post(
    '/records/:id/short-forms/check',
    route('record.short-forms-check', 'remote', ASK_FIRST_SENTENCE),
    async (req, reply): Promise<WouldBeAccepted> => {
      writeOrCheckShortForms(req, 'check')
      return wouldBeAccepted(reply, 'POST /api/records/:id/short-forms', 200, {})
    },
  )
}

/**
 * WRITE SOME OF ONE RECORD'S SHORT FORMS, OR ONLY CHECK THEM. One transaction either way: the write
 * is stored, and the check is taken back.
 */
function writeOrCheckShortForms(req: FastifyRequest, only: 'write' | 'check'): ShortFormsReading {
  const { id } = parse(recordIdParams, req.params, 'The URL is not usable:')
  const body = parse(writeBody, req.body, 'That request is not usable:')
  return writeOrCheck(only, () => writeShortForms(id, workspaceOf(req), body, actorFrom(req)))
}
