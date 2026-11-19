// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/search?q=…` — which records say this.
 *
 * The rule is `src/shared/search.ts` and is not restated here: what is in this file is the request,
 * the workspace scope, and the difference between finding nothing and being unable to look.
 *
 * WHAT THIS IS NOT. It is not question search — there is no model behind it, no embedding and no
 * ranking anybody has to defend — and `GET /api/kinds` does not gain a field. Roadmap A11a is the
 * one that asks a question; this is the one that finds a string, and the two are kept apart on
 * purpose so that a caller always knows which of them answered.
 */

import { checkSubtraction, leftOutWords, SEARCH_RESULTS_BUCKET_WORDS, type LeftOutCounts, type LeftOutGroup, type SearchResultsBucket } from '@shared/disclosure.ts'
import type { FastifyInstance } from 'fastify'
// WHICH DECISIONS A LATER ONE REPLACED: the one reading. Problem ZSWftCSVUP2r.
import { replacedDecisionIds } from '../lib/replaced-decisions.ts'
import { z } from 'zod'
import { TWELVE_ID_CHARACTERS } from '@shared/messages.ts'
import { saysIt, searchRecord, theNeedle, theRecordsThatSay, usableQuery, type SearchResult } from '@shared/search.ts'
import { RECORD_KINDS, type PanelRecord } from '@shared/types.ts'
import { ACROSS_WORKSPACES, aProjectCounted, listRecordIdsKindsAndProjects, listRecords } from '../lib/records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theRecordsThatMaySay } from '../lib/record-text-index.ts'
import { theProjectsAsked, theRowsTheReaderMaySee } from '../lib/across-projects.ts'
import { EVERY_PROJECT, PROJECTS_QUERY } from '@shared/across-projects.ts'
import type { Workspace } from '@shared/workspaces.ts'
import type { RecordListItem } from './records.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  onlyTheMessagesThisReaderMayRead,
  theMessageReader,
  theMessagesHiddenFrom,
  theMessagesThisReaderMayRead,
  withEachNarrowingWorkedOutOnce,
  type AMessageReader,
} from '../lib/messages.ts'
import { recordsWithTheHonourThisReaderMaySee } from '../lib/honour.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { endTheSearchThread, prepareTheSearchThread, searchOnItsOwnThread } from '../lib/search-thread.ts'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records as recordsTable } from '../db/schema.ts'
import { route } from '../lib/route.ts'

/**
 * Could this be a record id at all?
 *
 * Any query that is exactly twelve characters of an id's alphabet, TWELVE_ID_CHARACTERS in
 * src/shared/messages.ts, whatever its shape. Checked before the database is touched so that an
 * ordinary search — a phrase, a Chinese title — never costs a lookup. It does NOT read isARecordId:
 * that rule decides whether a word in a sentence is drawn as an id, and it reads a real id such as
 * PJQLJ-nv-MCX as a word. Search asks a different question, so every id is looked up. A word that
 * passes, like "presentation", costs one read by primary key: the lookup below decides, and the word
 * simply finds nothing.
 */
function looksLikeId(q: string): boolean {
  const found = q.match(TWELVE_ID_CHARACTERS)
  return found !== null && found.length === 1 && found[0] === q
}

/**
 * The record with this id, in WHATEVER project it is in, or null.
 *
 * ACROSS PROJECTS ON PURPOSE, and it is the same rule `GET /api/records/:id` already follows: an id
 * is global, so answering "no such record" because the reader happens to be in another project
 * would be false, and the reply says which project it is in instead. Nothing else about that
 * project is readable from here — this is one row by primary key.
 */
function recordAnywhere(id: string): typeof recordsTable.$inferSelect | null {
  return db.select().from(recordsTable).where(eq(recordsTable.id, id)).get() ?? null
}

/** How many results come back before the reply says how many more there were. */
export const SEARCH_RESULTS = 50

/** ONE SENTENCE for an unusable query, so the schema and the blank-only check cannot word it twice. */
const NOTHING_TO_LOOK_FOR =
  'q must not be empty. An empty search is not a search that found nothing — it is a request that did ' +
  'not say what to look for, and answering it with every record would be a different question. ' +
  'GET /api/records lists everything.'

const searchQuery = z.strictObject({
  q: z.string({ error: 'q is the text to look for, and it is required' }).min(1, { error: NOTHING_TO_LOOK_FOR }),
  /** One kind at a time, the same word `GET /api/records?kind=` takes. */
  kind: z.enum(RECORD_KINDS, { error: `kind must be one of: ${RECORD_KINDS.join(', ')}` }).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  /**
   * WHICH PROJECTS ARE SEARCHED. Left out, the project the
   * `x-mole-office-workspace` header names, exactly as before. `all` searches every project the
   * reader may read, and a project id searches that one project. `elsewhere` then counts only the
   * projects that were not searched. Declared once, in src/shared/across-projects.ts. The value is read,
   * trimmed and refused when blank by `theProjectsAsked` alone, as at the records door (problem aLkFgGvcHWIz).
   */
  [PROJECTS_QUERY]: z.string().optional(),
})

/**
 * The record whose ID the query IS, when the query is an id.
 *
 * WHY THIS IS A SEPARATE FIELD AND NOT A RESULT. Measured on 2026-08-12: the owner searched a
 * proposal's id to find the proposal, and got back the records that MENTION that id — a message
 * quoting it in a command, a campaign note citing it — with the record itself indistinguishable
 * among them, because the search reads values and an id in somebody's prose is a value. Every hit
 * was correct and the answer was useless.
 *
 * An id is not a word. Asking for one is asking for a particular record, so it is answered
 * separately and first, and the text matches stay where they were as the different question they
 * are: who talks about this.
 */
export interface ExactRecord {
  id: string
  kind: string
  title: string
  workspaceId: string
  /** Which project it is in, said out loud, because an id is global and a reader may be elsewhere. */
  elsewhere: boolean
  deleted: boolean
  /** Where to go. The point of the whole field: no hunting, one link. */
  path: string
}

export interface SearchReply {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<SearchResultsBucket>[]
  /** The query as it was read, after trimming. What was really looked for. */
  q: string
  /**
   * The record this query names, when the query is exactly a record id. Null otherwise, which is
   * the ordinary case — nobody types an id by accident.
   */
  exact: ExactRecord | null
  /**
   * The project searched, always stated. With `?projects=all` it is `all`, and `projects` names each
   * project that was searched.
   */
  workspace: string
  /** Present only when `?projects=` was asked: the ids of the projects searched. */
  projects?: string[]
  /**
   * How many records in the OTHER projects match, per project. Counts only — never their titles.
   *
   * WHY A SEARCH THAT IS SCOPED TO ONE PROJECT MUST SAY THIS. An independent reviewer, walking the
   * product as a person, typed "force gauge" while reading Mole Office, got two unrelated records, and
   * concluded the thing was not there. It was — in Greenhouse — and nothing on the screen suggested
   * looking. "You must already know which project the thing is in" is not a searchable product.
   *
   * IT IS A COUNT AND NOT A RESULT, and that is the whole of the boundary rule being kept. The reply
   * says a number and a project name; it never carries a record from another project, never its
   * title, never its summary. That is exactly the shape `exact` already has for an id — enough to
   * know where to go, and nothing that would make this a way to read another project.
   */
  elsewhere: { workspaceId: string; title: string; matched: number }[]
  /** Results, best field first. Empty means nothing matched — which is an answer. */
  results: SearchResult<RecordListItem>[]
  counts: {
    /** How many records matched, whatever `limit` returned. The true number either way. */
    matched: number
    returned: number
    /** How many records were read. An empty result over 0 records is a different fact. */
    searched: number
  }
  truncated: boolean
  /** What happened, in words, including the two cases that are not "no". */
  note: string
}

export const SEARCH_ROUTE_NOTE =
  'Which records say this: GET /api/search?q=<the text>, within the project x-mole-office-workspace names. ' +
  'It reads the title, the one-line summary, and every string VALUE inside `data` — a checklist line, a ' +
  'symptom, a consequence — and reports WHERE each match was, as a path like `data.parts[0].items[2].text`, ' +
  'with the text around it. Measured on the live corpus: searching only titles and summaries finds 9 of the ' +
  '20 records that mention one part\'s name and 13 of the 100 that mention "workspace", which is why it reads ' +
  'the body. IT MATCHES VALUES AND NEVER FIELD NAMES — searching `symptom` would otherwise return every problem ' +
  'in the corpus — and it never matches a number, because "18" in a search box means the number eighteen to ' +
  'nobody. Substring, case-folded: `soil` finds `SoilPen`, and `夹具` finds `夹具标定`, which is how you look ' +
  'for a word in a language written without spaces. It does not stem, expand a synonym or score relevance; ' +
  'the only order is where the match is — title, then summary, then the body — and then which record is ' +
  'newer. There is NO MODEL behind it and no key is read; question search is A11a and is not built. ' +
  '?kind= narrows to one kind and ?limit= caps the results at 500, with `counts.matched` the true number ' +
  'either way. An empty q is refused rather than answered with everything, because a request that did not ' +
  'say what to look for is not a search that found nothing. ?projects=all searches every project instead of the ' +
  'header\'s one, and ?projects=<project id> searches that one project; `elsewhere` then counts only the projects ' +
  'that were not searched.'

/** WHAT THE SEARCH THREAD IS ASKED: one search, as the request thread read it from the request. */
export interface SearchAsk {
  /** The project the request's header names. */
  workspaceId: string
  /** The query as it was read, after trimming. */
  q: string
  kind: z.infer<typeof searchQuery>['kind']
  limit: number | undefined
  reader: AMessageReader
  /** The projects `?projects=` asked for, or null when it was not sent. */
  asked: Workspace[] | null
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  prepareTheSearchThread()
  // THE SEARCH THREAD ENDS WITH THE SERVER, and a search still waiting on it is refused with a sentence that says so.
  // THE CLOSE DOES NOT WAIT FOR IT. A thread still loading is stopped only once it has loaded, which took up to 4.4 s
  // in a test process, and until then it keeps the process alive (lib/search-thread.ts).
  app.addHook('onClose', async () => {
    void endTheSearchThread()
  })
  // WHAT THE REQUEST SAYS IS READ HERE, and every refusal of a search is said here, as before. The search itself is
  // answered on a thread of its own, so the server reads other requests meanwhile (src/server/lib/search-thread.ts).
  app.get('/search', route('project.search', 'remote', SEARCH_ROUTE_NOTE), async (req): Promise<SearchReply> =>
    searchOnItsOwnThread(theSearchAsk(workspaceOf(req), req.query, () => actorFrom(req))),
  )
}

/**
 * THE SEARCH A REQUEST ASKS FOR, from the project its header names, its query string and who is reading, with every
 * refusal of a search said here. The door asks this, and so do the tests that count the statements `theSearchAnswer`
 * runs, so they search what the door searches. WHO IS READING IS READ AFTER THE QUERY, as the door read it before, so a
 * request whose query and actor are both wrong is still refused for its query.
 */
export function theSearchAsk(workspaceId: string, rawQuery: unknown, whoReads: () => Parameters<typeof theMessageReader>[0]): SearchAsk {
  const query = parse(searchQuery, rawQuery, 'The query string is not usable:')
  const q = query.q.trim()

  // A query of nothing but spaces passes the schema — it is a string of length 1 — and is not a
  // search. Refused with the same sentence, because the caller's mistake is the same one.
  if (!usableQuery(q)) throw new PanelError(`The query string is not usable: ${NOTHING_TO_LOOK_FOR}`)

  // ONLY WHAT THIS READER MAY READ IS SEARCHED OR COUNTED: a message it may not read is not the
  // exact answer, not a result, and not in any count here or elsewhere.
  const reader = theMessageReader(whoReads())
  // THE PROJECTS SEARCHED: the header's one project, or what `?projects=` asks for, from the one
  // place that says which projects a reader may read (src/server/lib/across-projects.ts).
  const asked = query.projects === undefined ? null : theProjectsAsked(query.projects, reader)
  return { workspaceId, q, kind: query.kind, limit: query.limit, reader, asked }
}

/**
 * THE ANSWER TO ONE SEARCH, worked out on the search thread (src/server/lib/search-thread.ts). It reads and writes
 * nothing else, and awaits nothing.
 */
export function theSearchAnswer(ask: SearchAsk): SearchReply {
  const { workspaceId, q, reader, asked } = ask
  // EACH READER'S NARROWING IS WORKED OUT ONCE FOR THE WHOLE SEARCH (`withEachNarrowingWorkedOutOnce`). Each list of more
  // than fifty messages asked it again for the same reader: the project searched and each project elsewhere, eleven
  // times and about 390 ms for an agent's search for a common word, on the made-up office shaped to the live counts of
  // 31 October 2026 (wave 13y round 114). The search writes nothing and awaits nothing.
  return withEachNarrowingWorkedOutOnce(() => {
    // The same row shape `GET /api/records` serves, built the same way, so a result IS a row.
    // IS THIS AN ID? Asked before anything is searched, because it is a different question. Looked
    // up by primary key across projects — an id is global, so answering "no such record" because
    // the reader is in another project would be false — and the reply says which project it is in.
    const searchedIds = new Set(asked === null ? [workspaceId] : asked.map((project) => project.id))
    const anyRecord = looksLikeId(q) ? recordAnywhere(q) : null
    const exactRow = anyRecord === null || theMessagesHiddenFrom(reader, [anyRecord.id]).size > 0 ? null : anyRecord
    const exact: ExactRecord | null =
      exactRow === null
        ? null
        : {
            id: exactRow.id,
            kind: exactRow.kind,
            title: exactRow.title,
            workspaceId: exactRow.workspaceId,
            elsewhere: !searchedIds.has(exactRow.workspaceId),
            deleted: exactRow.deletedAt !== null,
            path: `/r/${exactRow.id}`,
          }

    // AND A RUN'S HONOUR READING IS SEARCHED AND SHOWN WITHOUT ANY ID OF SUCH A MESSAGE among its evidence,
    // so a search for the id does not find the runs that give it as evidence.
    const kindAsked = ask.kind === undefined ? {} : { kind: ask.kind }
    const which = { workspaceId: asked === null ? workspaceId : asked.length === 1 ? asked[0]!.id : ACROSS_WORKSPACES, ...kindAsked }
    const theOnesTheReaderMaySee = <T extends { id: string; kind: string; workspaceId: string }>(rows: T[]): T[] =>
      asked === null ? onlyTheMessagesThisReaderMayRead(reader, rows) : theRowsTheReaderMaySee(rows, asked, reader)
    const theReadableCountOf = (counted: { notMessages: number; messageIds: string[] }): number =>
      counted.notMessages + theMessagesThisReaderMayRead(reader, counted.messageIds).size
    // THE INDEX OF THE RECORDS' TEXT CHOOSES WHICH RECORDS ARE READ, by id, and the search below still looks in each of
    // them as it looked in every record before (src/server/lib/record-text-index.ts). It may keep too many, never too few.
    const mayHoldIt = theRecordsThatMaySay(theNeedle(q))
    const mayBeSeen = theOnesTheReaderMaySee(listRecords({ ...which, ids: mayHoldIt }))
    // SO HOW MANY RECORDS WERE SEARCHED is counted apart, from every record the reader may see, read without its data:
    // which records a reader may see never depends on their data. When the index was not asked, every record was read
    // above, and reading them again cost about 600 ms a search across every project at the 22 October scale.
    // For the header's one project and every kind, they are counted as the open loops count them (`aProjectCounted`),
    // without reading the records again: read again without their data, they took 163 ms of a 377 ms search for a word
    // few records say, from the second largest project of that made-up office (wave 13y round 114). Otherwise only the id,
    // kind and project of each record are read: every column of every record, each made a record, took 742 to 814 ms on the
    // made-up office of the live shape for a search across every project, and the same rows with only these three, read
    // apart in no order, 153 to 176 ms (round 167).
    const searched =
      mayHoldIt === undefined
        ? mayBeSeen.length
        : asked === null && ask.kind === undefined
          ? theReadableCountOf(aProjectCounted(workspaceId))
          : theOnesTheReaderMaySee(listRecordIdsKindsAndProjects(which)).length
    // A DECISION A LATER ONE REPLACED IS NOT A RESULT (problem ZSWftCSVUP2r): it has left normal content. The note says
    // how many also matched, and an exact id still answers above, so the archive is one id away.
    const replaced = new Set([...searchedIds].flatMap((id) => [...replacedDecisionIds(id)]))
    // EVERY MATCH IS COUNTED AND ORDERED BY ITS BEST FIELD ALONE, and only the results sent are made whole: each with the
    // count a records row carries, and every place it says the query. Every match was made whole before, with its snippets:
    // about 1.0 to 2.4 s of a search for a word 170,067 records say, on the made-up office of the live shape, against
    // 0.16 to 0.21 s to tell only whether each says it (wave 13y round 167). The matches and their order are the same.
    const everyMatch = theRecordsThatSay(recordsWithTheHonourThisReaderMaySee(mayBeSeen, reader), q)
    const all = everyMatch.filter((match) => !replaced.has(match.record.id))
    const replacedMatched = everyMatch.length - all.length
    const limit = ask.limit ?? SEARCH_RESULTS
    const results = all.slice(0, limit).map(({ record }): SearchResult<RecordListItem> => {
      const result = searchRecord<RecordListItem>({ ...record, incompleteCount: incompletenessOf(record).length }, q)
      if (result === null) throw new Error(`The record ${record.id} was found to say "${q}" and then found not to, so the search was not answered.`)
      return result
    })
    const leftOutGroups: LeftOutGroup<SearchResultsBucket>[] = [{
      cause: 'budget', bucket: 'row_limit', count: all.length - results.length,
      ids: all.slice(limit).map((match) => match.record.id),
    }]
    const subtraction: LeftOutCounts = { candidates: all.length, carried: results.length, leftOut: all.length - results.length, shortened: 0 }
    checkSubtraction('search', subtraction, leftOutGroups)

    // WHERE ELSE THIS QUERY MATCHES, as counts. See `elsewhere` on the reply. The projects are listed without the count
    // of each one's records that `readWorkspaces` adds, which nothing here reads: 56 to 91 ms a search, in 72 traced
    // searches on the made-up office at the 22 October scale (wave 13y round 107).
    const elsewhere = listWorkspaces()
      .filter((w) => !searchedIds.has(w.id))
      .map((w) => {
        const rows = recordsWithTheHonourThisReaderMaySee(onlyTheMessagesThisReaderMayRead(reader, listRecords({
          workspaceId: w.id,
          ...kindAsked,
          ids: mayHoldIt,
        })), reader)
        return { workspaceId: w.id, title: w.title, matched: rows.filter((record) => saysIt(record, q)).length }
      })
      .filter((w) => w.matched > 0)
      .sort((a, b) => b.matched - a.matched)

    const scope = ask.kind === undefined ? '' : ` of kind ${ask.kind}`
    const exactLine =
      exact === null
        ? ''
        : `"${q}" IS the id of ${exact.kind} "${exact.title}"` +
          (exact.elsewhere ? `, which is in the project "${exact.workspaceId}"` : '') +
          (exact.deleted ? ', and it has been deleted' : '') +
          `. That record is the answer; anything below merely mentions the id. `
    // THREE ANSWERS AND NOT TWO. "Nothing matched" and "there was nothing to match against" are
    // different facts about this project, and a reader who cannot tell them apart will go looking
    // for a record that was never there — or stop looking for one that is.
    //
    // BOUND TO A NAME rather than written inline after `exactLine +`, and that is the fix for a real
    // defect: `+` binds tighter than `?:`, so `exactLine + records.length === 0 ? …` compared a
    // STRING to 0, was always false, and silently dropped the exact-record sentence. The type
    // checker caught it. The reply had already carried the right `exact` object, so only the words
    // were wrong — which is the half a reader trusts.
    // WHAT WAS SEARCHED, in the sentence: this project for the header's reading, and the projects
    // asked for when `?projects=` was sent, so the sentence never says "this project" about several.
    const searchedWords =
      asked === null
        ? null
        : asked.length === 1
          ? `the project "${asked[0]!.id}"`
          : `the ${String(asked.length)} projects searched`
    const found =
      searched === 0
        ? (searchedWords === null ? 'This project holds' : `${searchedWords.charAt(0).toUpperCase()}${searchedWords.slice(1)} hold${asked!.length === 1 ? 's' : ''}`) +
          ` no records${scope} at all, so there was nothing to search. That is not the same ` +
          `as "${q}" not being here.`
        : all.length === 0
          ? (searchedWords === null ? `Nothing in this project's ${searched}` : `Nothing in the ${searched}`) +
            ` record${searched === 1 ? '' : 's'}${scope}${searchedWords === null ? '' : ` of ${searchedWords}`} says ` +
            `"${q}" — in a title, a summary, or any text inside a record. This reads what is stored, so a word ` +
            `that only appears in a file a record points at is not searched.`
          : `${all.length} of ${searched} record${searched === 1 ? '' : 's'}${scope} say "${q}"` +
            (all.length > results.length
              ? `; the first ${results.length} are here, best match first, and the count is the whole of it. ` +
                leftOutWords(SEARCH_RESULTS_BUCKET_WORDS.row_limit, all.length - results.length)
              : `, best match first — a match in the title before one in the summary before one in the body.`)
    // WHERE ELSE TO LOOK, in the sentence rather than only in a field. A reader who searched the
    // wrong project and read "nothing matched" went away believing the record did not exist.
    const alsoLine =
      elsewhere.length === 0
        ? ''
        : ` ${elsewhere.map((w) => `${w.matched} in "${w.title}"`).join(', ')} — switch project to read ` +
          `${elsewhere.length === 1 && elsewhere[0]?.matched === 1 ? 'it' : 'them'}.`
    const replacedLine =
      replacedMatched === 0
        ? ''
        : ` ${String(replacedMatched)} decision${replacedMatched === 1 ? '' : 's'} that a later decision replaced also ` +
          `${replacedMatched === 1 ? 'says' : 'say'} it and ${replacedMatched === 1 ? 'is' : 'are'} not listed; ` +
          `each is on its own page, naming the one that replaced it.`
    const note = exactLine + found + replacedLine + alsoLine

    return {
      subtraction,
      leftOutGroups,
      q,
      exact,
      workspace: asked === null ? workspaceId : asked.length === 1 ? asked[0]!.id : EVERY_PROJECT,
      ...(asked === null ? {} : { projects: asked.map((project) => project.id) }),
      elsewhere,
      results,
      counts: { matched: all.length, returned: results.length, searched },
      truncated: all.length > results.length,
      note,
    }
  })
}
