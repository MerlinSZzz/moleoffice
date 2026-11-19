// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Link routes: connect two records, or remove a connection.
 *
 * A link is stored once, in one direction. The reverse ("blocked by" for "blocks") is a label
 * shown at the other end, never a second row -- see shared/types.ts for why.
 *
 * The important rule here is that linking by title never invents anything. If you type a name
 * that does not exist, that is an error with the name in it, not a new empty record created
 * behind your back.
 *
 * ---------------------------------------------------------------------------------------
 * EITHER END MAY BE NAMED BY ID OR BY TITLE, AND THE ANSWER SAYS WHAT WAS LINKED
 * ---------------------------------------------------------------------------------------
 *
 * This route used to take `toTitle` and no `fromTitle`, so a caller could type the name of the
 * far end and had to be holding an id for the near one. The asymmetry was arbitrary — a name is
 * a name at both ends — and it put record ids into every log seven agents wrote while recording
 * this pass through the API.
 *
 * It also used to answer `{"id":"…"}` and nothing else. Five of those seven noticed, because the
 * session-link route next door answers with a sentence naming both records. A caller that typed a
 * TITLE had no way to see which record the name resolved to without a second request, which is
 * exactly the case where checking matters. The 201 now carries both ends, the type that was
 * really stored — including the default when none was sent — and the sentence.
 *
 * `id` is still the first field and still means the same thing: it is what DELETE /api/links/:id
 * takes.
 *
 * ---------------------------------------------------------------------------------------
 * A `blocks` LINK MAY SAY HOW MUCH IT BLOCKS
 * ---------------------------------------------------------------------------------------
 *
 * `{"gate":{"kind":"hard"}}` means the blocked record cannot proceed at all until this one
 * finishes. `{"gate":{"kind":"partial","upTo":"…"}}` means it may proceed as far as a named stage
 * and no further. The vocabulary is GATE_KINDS in shared/work.ts and neither word is defined here.
 *
 * The gate is stored on the link itself — it is not a second dependency model and not a new table
 * — so every query that reads links today goes on working and the blocked record gets the gate on
 * its own page without storing anything. Leaving `gate` out is not the same as sending "hard": it
 * means nobody has said how much, which is what every link written before this held.
 *
 * A partial gate with no `upTo` is a 400, not a warning. See `checkGate` in lib/records/link-gates.ts.
 */

import type { FastifyInstance } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { LINK_TYPES, RECORD_KINDS, type LinkType, type PanelRecord, type RecordKind } from '@shared/types.ts'
import {
  LINK_SHAPE_NAMES,
  THE_FIELDS_OF_A_LINK_SHAPE,
  type LinkAnswered,
  type LinkShape,
} from '@shared/link-shapes.ts'
import { GATE_KINDS, gateLabel, type Gate } from '@shared/work.ts'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import {
  allGatedLinks,
  bothEndsMustExist,
  createLink,
  deleteLink,
  getRecord,
  linkByTitle,
  liveRecordByTitle,
  type RevalidationWritten,
  type WorkspaceLink,
} from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { actorFrom, actorWithTheWordsItActsOn, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { refuseAMessageThisReaderMayNotRead, theMessageReader, theMessagesHiddenFrom, type AMessageReader } from '../lib/messages.ts'
import { warrantBody } from './records.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { route } from '../lib/route.ts'

/** The link type names, as a list zod can validate against. */
const LINK_TYPE_NAMES = Object.keys(LINK_TYPES) as [LinkType, ...LinkType[]]

/** The documented default: two things are related, without saying how. */
const DEFAULT_LINK_TYPE: LinkType = 'relates_to'

/**
 * The gate on the wire. SHAPE ONLY — the RULES are in lib/records.ts.
 *
 * This says a gate is an object with a `kind` from GATE_KINDS and an optional `upTo` string.
 * Whether a partial gate has said enough, and whether this link type may carry a gate at all, are
 * checked once, in lib/records.ts, so the seed script and the tests get the same refusal HTTP
 * does. A second copy of the partial rule here is exactly the pair of statements that drift.
 */
const gateBody = z.strictObject({
  kind: z.enum(GATE_KINDS, { error: `gate.kind must be one of: ${GATE_KINDS.join(', ')}` }),
  upTo: z
    .string()
    .trim()
    .min(1, {
      error:
        'gate.upTo must not be empty — it is the furthest stage the blocked record may reach: a checklist ' +
        'item id, a pipeline step id, or a stage named in words',
    })
    .optional(),
})

/**
 * What moves along a `feeds` link, on the wire. SHAPE ONLY: that only a `feeds` link may carry it is checked once, in
 * lib/records.ts. The names are the writer's own words and are never looked up in a list.
 */
const carriesBody = z
  .array(
    z.strictObject({
      out: z.string().trim().min(1, { error: 'carries[].out must not be empty: it names what leaves the step' }),
      in: z.string().trim().min(1, { error: 'carries[].in must not be empty when it is sent' }).optional(),
    }),
  )
  .min(1, { error: 'carries must name at least one thing; leave it out when nobody has said what moves' })

const linkBody = z
  .strictObject({
    fromId: z.string().min(1, { error: 'fromId must not be empty' }).optional(),
    fromTitle: z.string().trim().min(1, { error: 'fromTitle must not be empty' }).optional(),
    toId: z.string().min(1, { error: 'toId must not be empty' }).optional(),
    toTitle: z.string().trim().min(1, { error: 'toTitle must not be empty' }).optional(),
    type: z
      .enum(LINK_TYPE_NAMES, { error: `type must be one of: ${LINK_TYPE_NAMES.join(', ')}` })
      .optional(),
    gate: gateBody.optional(),
    carries: carriesBody.optional(),
    /**
     * THE PERSON'S OWN WORDS, WHEN A SETTLING LINK STANDS ON THEM.
     *
     * A `derived_from` link from a decision to a proposal IS the settling act, so it takes the same
     * warrant a promotion takes. The shape is judged once, by `readWarrant` in @shared/warrant.ts;
     * `warrantBody` here is only "an object", so this route cannot come to accept a warrant that
     * reading refuses. A warrant naming a record other than the proposal is refused there.
     */
    warrant: warrantBody.optional(),
  })
  // Each end, named exactly one way. Accepting both would leave it undefined which one wins
  // when they disagree, and that is the kind of ambiguity that shows up as a wrong link a
  // month later. The same refusal at both ends, because a name is a name whichever end it is on.
  .refine((b) => (b.fromId === undefined) !== (b.fromTitle === undefined), {
    error:
      'send exactly one of fromId or fromTitle: fromId when you already know the id of the record the link starts from, fromTitle when you are typing its name',
  })
  .refine((b) => (b.toId === undefined) !== (b.toTitle === undefined), {
    error:
      'send exactly one of toId or toTitle: toId when you already know the id of the other record, toTitle when you are typing its name',
  })
  // A STEP IS NAMED BY ITS ID. Two steps of two pipelines may share a title, and what moves is said about one of them.
  .refine((b) => b.carries === undefined || b.toId !== undefined, {
    error: 'carries is sent with toId: name the step the flow reaches by its id',
  })

const idParams = z.object({ id: z.string().min(1, { error: 'the URL must contain a link id' }) })

// ---------------------------------------------------------------------------- what comes back

/** One end of the link, as the reply names it. */
export interface LinkEnd {
  id: string
  title: string
}

/** The 201: which link was made, between which two records, and what that now reads as. */
export interface LinkReply {
  nothingWritten?: string
  /** The link's own id. First, and unchanged: it is what DELETE /api/links/:id takes. */
  id: string
  /**
   * The type that was really stored, which is not always the type that was sent.
   *
   * A request with no `type` stores `relates_to`, and until this was served the only way to find
   * out what a link had become was to read one of its two records back.
   */
  type: LinkType
  from: LinkEnd
  to: LinkEnd
  /**
   * What was linked to what, in the words this link type is published under.
   *
   * The same job as the sentence POST /api/sessions/:id/link answers with. It matters most when a
   * caller typed a TITLE: the name it typed is a belief about which record it meant, and this is
   * where that belief is confirmed or shown to be wrong.
   */
  note: string
  /**
   * WHAT A RESOLUTION WROTE, when this link resolved a placeholder or a fallback record.
   *
   * Absent on every other link, because there is nothing to say. Present here rather than left to
   * a second read because a resolution creates rows in a table the caller did not ask about: it
   * marks every record the restriction reached as needing a re-check, and a reply that said only
   * `201` would leave somebody to find that out by opening pages.
   *
   * IT IS NOT A CLAIM THAT ANYTHING BECAME VALID. `written` is the number of records now owed a
   * re-check. Resolving a restriction removes nothing.
   */
  revalidation?: RevalidationWritten
}

/**
 * The record a `fromTitle` names, or a refusal saying which of the three ways the name failed.
 *
 * 404 — nothing goes by that name. 409 — the name belongs only to records that have been
 * soft-deleted, so the link would be broken the moment it was made. 409 — the name belongs to MORE
 * THAN ONE live record, and the refusal names every one of them. The three are told apart because
 * they are fixed differently: a misspelling by typing again, a deleted record by restoring it or by
 * deciding you really did mean the deleted one, and a repeated title by naming the record by id.
 *
 * ONE FUNCTION FOR BOTH ENDS NOW. This used to be its own resolution, written out here in its own
 * words, because `linkByTitle` resolved the far end inside itself and could only answer for that
 * end. Its comment said the merge needed the resolution lifted into src/server/lib/records/link-requests.ts, and
 * that is where `liveRecordByTitle` now is, so this is a call to it. All that differs is the one
 * sentence saying what to send instead, which names a different key at each end.
 */
function startingRecord(title: string, workspaceId: string, reader: AMessageReader): PanelRecord {
  return liveRecordByTitle(
    title,
    (record) => `POST /api/links {"fromId":"${record.id}",…} — which says you have seen which record it is.`,
    workspaceId,
    reader,
  )
}

/**
 * The id one of the two refinements above guarantees is there.
 *
 * TypeScript cannot see a refinement, and a non-null assertion here would be a claim nothing
 * checks. This throws a plain Error rather than a PanelError because reaching it means the schema
 * and this handler disagree, which is a fault in the server and not in the request.
 */
function idFrom(value: string | undefined, which: 'from' | 'to'): string {
  if (value === undefined) {
    throw new Error(`unreachable: neither ${which}Id nor ${which}Title survived validation`)
  }
  return value
}

/** One end read back after the write, so the reply names the record that was really linked. */
function endOf(record: PanelRecord | null, which: 'from' | 'to'): LinkEnd {
  if (record === null) {
    throw new PanelError(`The link was made but its ${which} end could not be read back`, 500)
  }
  return { id: record.id, title: record.title }
}

/**
 * WHICH RECORD A WARRANT ON THIS LINK IS FOR: the proposal the settling link points at.
 *
 * A `derived_from` link from a decision to a proposal IS the settling act, so the warrant's `for` has
 * to name the proposal, which is the link's `to` end. Only an id can be checked before the link
 * exists, so a warrant travels with `toId`; a `toTitle` would leave the warrant naming a name rather
 * than a record, and the refusal says to send the id instead.
 */
function theForkThisWarrantIsFor(body: { toId?: string }): string {
  if (body.toId === undefined) {
    throw new PanelError(
      'A warrant on a link names the record the act is on, and on a settling link that is the proposal the ' +
        "link points at. Send `toId` as that proposal's id rather than `toTitle`, so the warrant can be checked " +
        'against it. Nothing was written.',
      400,
    )
  }
  return body.toId
}

/**
 * What the link now says, in the wording LINK_TYPES publishes.
 *
 * The labels are read from the contract rather than built out of the type name, so the sentence a
 * caller is answered with is the same sentence the record pages draw. A gate is named too: it is
 * part of what this request wrote, and it is shown on the OTHER record, which is the one the
 * caller is not looking at.
 */
function whatItSays(from: LinkEnd, to: LinkEnd, type: LinkType, gate: Gate | undefined): string {
  const labels = LINK_TYPES[type]
  const said = `"${from.title}" now ${labels.forward} "${to.title}".`
  if (gate === undefined) return said
  return `${said} "${to.title}" shows it as ${labels.reverse} "${from.title}" — ${gateLabel(gate)}.`
}

/**
 * Every link in the workspace, in one request.
 *
 * WHAT THIS IS FOR. A page that draws the structure needs the whole link graph, and until this
 * existed the only way to read a link was `GET /api/records/:id`, so those pages asked for one
 * record at a time. The pipeline page bounded that fan-out to eight in flight after a browser
 * refused everything past about 1,356 simultaneous requests; the bound is a fix for the symptom,
 * and this is the fix for the shape.
 *
 * IT IS NOT PAGED, AND A CALLER THAT WANTS LESS NAMES WHAT LESS IS. A page that draws the
 * structure used to read the whole graph because there was no other way to ask; a page that draws
 * one part of it now sends `type`, `toId`, `typeToKind`, `betweenKind` or `touchesKind`, and a
 * shape word keeps only the fields that page reads. A word this office does not know is a 400, not
 * a quiet whole answer: a misspelt filter that answered with everything would look like it worked.
 * With no word the answer is every link, row for row and field for field, exactly as before.
 * The one thing left out is decided by who asks: a link with a message at either end that the
 * caller may not read.
 */
export interface LinksReply {
  links: WorkspaceLink[]
}

/**
 * THE WORDS A BULK LINK READ MAY NAME. `projects` is read by `theProjectsAQueryAsks`, which owns
 * that word's one refusal; the rest are read here. A word that is not listed is refused by zod
 * and no link is read.
 */
const listLinksQuery = z.strictObject({
  projects: z.unknown().optional(),
  type: z.string().optional(),
  toId: z.string().optional(),
  typeToKind: z.string().optional(),
  betweenKind: z.string().optional(),
  touchesKind: z.string().optional(),
  shape: z.enum(LINK_SHAPE_NAMES).optional(),
})

interface TheLinkFilterAQueryAsks {
  types: readonly LinkType[] | null
  toId: string | null
  typeToKinds: readonly (readonly [LinkType, RecordKind])[] | null
  betweenKinds: readonly [RecordKind, RecordKind] | null
  touchesKinds: readonly RecordKind[] | null
}

/** The words of one comma list, refusing an empty word rather than silently dropping it. */
function theWordsOfAQuery(value: string, what: string): string[] {
  const words = value.split(',').map((word) => word.trim())
  if (words.some((word) => word === '')) {
    throw new PanelError(`The query's ${what} has an empty word in it. Nothing was read.`, 400)
  }
  return words
}

/** The link types a `type=` or `typeToKind=` word names, refusing any this office does not have. */
function theLinkTypesAQueryNames(value: string): LinkType[] {
  const named = theWordsOfAQuery(value, 'type')
  const unknown = named.filter((word) => !Object.hasOwn(LINK_TYPES, word))
  if (unknown.length > 0) {
    throw new PanelError(
      `The query names a link type this office does not have: ${unknown.map((one) => `"${one}"`).join(', ')}. ` +
        'Nothing was read.',
      400,
    )
  }
  return [...new Set(named)] as LinkType[]
}

/** The record kinds a kind word names, refusing any this office does not have. */
function theRecordKindsAQueryNames(value: string, what: string): RecordKind[] {
  const named = theWordsOfAQuery(value, what)
  const unknown = named.filter((word) => !(RECORD_KINDS as readonly string[]).includes(word))
  if (unknown.length > 0) {
    throw new PanelError(
      `The query names a record kind this office does not have: ${unknown.map((one) => `"${one}"`).join(', ')}. ` +
        'Nothing was read.',
      400,
    )
  }
  return [...new Set(named)] as RecordKind[]
}

/** The `type:kind` pairs of `typeToKind=`, each end checked before any link is read. */
function theTypeToKindsAQueryNames(value: string): [LinkType, RecordKind][] {
  const pairs = theWordsOfAQuery(value, 'typeToKind').map((word) => {
    const at = word.indexOf(':')
    if (at <= 0 || at === word.length - 1 || word.indexOf(':', at + 1) !== -1) {
      throw new PanelError(
        `The query's typeToKind takes a link type and a record kind joined by a colon, like serves:goal. ` +
          `"${word}" is not one. Nothing was read.`,
        400,
      )
    }
    return [word.slice(0, at), word.slice(at + 1)] as const
  })
  for (const [type, kind] of pairs) {
    theLinkTypesAQueryNames(type)
    theRecordKindsAQueryNames(kind, 'typeToKind')
  }
  return pairs as [LinkType, RecordKind][]
}

/** Every narrowing word a read named, checked here before the projects word and before any link. */
function theLinkFilterAQueryAsks(query: z.infer<typeof listLinksQuery>): TheLinkFilterAQueryAsks {
  if (query.toId !== undefined && query.toId === '') {
    throw new PanelError('The query\'s toId is empty. Name the record at the far end, or leave the word out. Nothing was read.', 400)
  }
  let betweenKinds: readonly [RecordKind, RecordKind] | null = null
  if (query.betweenKind !== undefined) {
    const words = theWordsOfAQuery(query.betweenKind, 'betweenKind')
    if (words.length !== 2) {
      throw new PanelError(
        'The query\'s betweenKind takes exactly two record kinds, like betweenKind=module,problem. Nothing was read.',
        400,
      )
    }
    for (const word of words) theRecordKindsAQueryNames(word, 'betweenKind')
    betweenKinds = [words[0] as RecordKind, words[1] as RecordKind]
  }
  return {
    types: query.type === undefined ? null : theLinkTypesAQueryNames(query.type),
    toId: query.toId ?? null,
    typeToKinds: query.typeToKind === undefined ? null : theTypeToKindsAQueryNames(query.typeToKind),
    betweenKinds,
    touchesKinds: query.touchesKind === undefined
      ? null
      : theRecordKindsAQueryNames(query.touchesKind, 'touchesKind'),
  }
}

/** The fields of one shape, applied to a row the door has already filtered. */
function theLinkAsItsShapeAnswers<S extends LinkShape>(link: WorkspaceLink, shape: S): LinkAnswered<WorkspaceLink, S> {
  const kept: Record<string, unknown> = {}
  for (const field of THE_FIELDS_OF_A_LINK_SHAPE[shape]) {
    // The stored row has every one of these, including `null` and `undefined` where nobody said.
    kept[field] = (link as unknown as Record<string, unknown>)[field]
  }
  return kept as LinkAnswered<WorkspaceLink, S>
}

/**
 * THE KIND OF EVERY RECORD IN THE PROJECTS ASKED, for the three filters that ask what a link's ends
 * are. One read of `id` and `kind`, made once, and only when such a filter is sent.
 *
 * Deleted records are included: a link with a deleted end is still drawn as broken, and its kind is
 * still known. A link whose end has no row at all cannot match a kind filter, which is right: it is
 * a broken row with nothing to join.
 */
function theKindOfEveryRecordIn(workspaces: readonly string[]): Map<string, string> {
  if (workspaces.length === 0) return new Map()
  const rows = workspaces.length === 1
    ? db.select({ id: records.id, kind: records.kind }).from(records)
        .where(eq(records.workspaceId, workspaces[0]!)).all()
    : db.select({ id: records.id, kind: records.kind }).from(records)
        .where(inArray(records.workspaceId, [...workspaces])).all()
  return new Map(rows.map((row) => [row.id, row.kind]))
}

/** The links a read's narrowing words keep. Every word is ANDed; a kind word needs the map above. */
function theLinksAQueryKeeps(
  links: readonly WorkspaceLink[],
  filter: TheLinkFilterAQueryAsks,
  kindOf: ReadonlyMap<string, string>,
): WorkspaceLink[] {
  const kindsNeeded = filter.typeToKinds !== null || filter.betweenKinds !== null || filter.touchesKinds !== null
  return links.filter((link) => {
    if (filter.types !== null && !filter.types.includes(link.type)) return false
    if (filter.toId !== null && link.toId !== filter.toId) return false
    if (!kindsNeeded) return true
    const from = kindOf.get(link.fromId)
    const to = kindOf.get(link.toId)
    if (filter.typeToKinds !== null &&
      !filter.typeToKinds.some(([type, kind]) => link.type === type && to === kind)) return false
    if (filter.betweenKinds !== null) {
      const [a, b] = filter.betweenKinds
      if (!((from === a && to === b) || (from === b && to === a))) return false
    }
    if (filter.touchesKinds !== null) {
      const touches = filter.touchesKinds as readonly string[]
      if (!(from !== undefined && touches.includes(from)) && !(to !== undefined && touches.includes(to))) return false
    }
    return true
  })
}

export async function linkRoutes(app: FastifyInstance): Promise<void> {
  // NO LINK EITHER OF WHOSE ENDS IS A MESSAGE THE CALLER MAY NOT READ: a link names
  // both ends by id, so such a link would say the message is there and what it is linked to. The same
  // filter GET /api/records/:id/around puts on its links.
  // ACROSS PROJECTS WHEN `?projects=` ASKS, for the Goals page: the links of each project asked for, one
  // project after another. Without the word, the header's project as before.
  app.get('/links', route('link.list', 'remote'), async (req): Promise<LinksReply> => {
    // EVERY WORD IS CHECKED BEFORE A LINK IS READ. A misspelt type, kind or shape is refused; it
    // never quietly answers with the whole graph. The project word keeps its own refusal below.
    const asked = parse(listLinksQuery, req.query ?? {}, 'The query string is not usable:')
    const filter = theLinkFilterAQueryAsks(asked)
    const reader = theMessageReader(actorFrom(req))
    const across = theProjectsAQueryAsks(req.query, reader)
    const kindOf =
      filter.typeToKinds !== null || filter.betweenKinds !== null || filter.touchesKinds !== null
        ? theKindOfEveryRecordIn(across === null ? [workspaceOf(req)] : across.map((project) => project.id))
        : new Map<string, string>()
    const every = across === null ? allGatedLinks(workspaceOf(req)) : across.flatMap((project) => allGatedLinks(project.id))
    const hidden = theMessagesHiddenFrom(reader, every.flatMap((link) => [link.fromId, link.toId]))
    const visible = hidden.size === 0 ? every : every.filter((link) => !hidden.has(link.fromId) && !hidden.has(link.toId))
    const kept = theLinksAQueryKeeps(visible, filter, kindOf)
    const shape = asked.shape
    // `LinksReply` is the whole row, which is what no shape answers. A shape answers a subset of it;
    // the shared field list is the promise that the subset is still a link row, and the browser's
    // reader narrows to the fields it asked for.
    return { links: (shape === undefined ? kept : kept.map((link) => theLinkAsItsShapeAnswers(link, shape))) as WorkspaceLink[] }
  })

  app.post('/links', route('link.write', 'remote'), async (req, reply): Promise<LinkReply> => {
    const body = parse(linkBody, req.body, 'The request body is not usable:')
    const workspaceId = workspaceOf(req)
    const type = body.type ?? DEFAULT_LINK_TYPE
    // THE ACTOR, PLUS THE PERSON'S OWN WORDS WHEN THIS LINK CARRIES THEM. A settling link is a
    // `derived_from` from a decision to a proposal, so the record the warrant's `for` has to name is
    // the proposal the link points at. The warrant is read before anything is written, by the same
    // `readWarrant` every other door uses, so a warrant that names some other record is refused here
    // and nothing is stored. A person's own request is refused one, exactly as everywhere else.
    const actor =
      body.warrant === undefined
        ? actorFrom(req)
        : actorWithTheWordsItActsOn(req, body.warrant, theForkThisWarrantIsFor(body))

    // The from end is resolved BEFORE anything is written, and resolving only reads. So a request
    // that types two names and gets one of them wrong stores nothing, whichever one was wrong.
    // A `fromId` is not looked up here: createLink refuses an end that does not exist, in the same
    // words for both ends, and checking it twice would mean two refusals for one mistake.
    //
    // NEITHER END MAY BE A MESSAGE THE CALLER MAY NOT READ: the answer names both
    // ends with their titles. Such a message is answered as a record that is not there. An end named by
    // its id is refused with the words `createLink` refuses an end that does not exist with. An end typed
    // as a name is looked up once, by `liveRecordByTitle`, which does not count such a message among the
    // records of that name, so it is neither found, nor listed when two records share the name.
    const reader = theMessageReader(actorFrom(req))
    const fromId =
      body.fromTitle === undefined ? idFrom(body.fromId, 'from') : startingRecord(body.fromTitle, workspaceId, reader).id

    // linkByTitle throws a 404 naming the title when nothing goes by that name. It is left to
    // throw: creating the missing record here would be exactly the silent guess Mole Office bans.
    //
    // THE FAR END IS RESOLVED ONCE. The reply used to resolve `toTitle` a second time to say what
    // had been linked — one fact worked out in two places — and now that titles may repeat, the
    // record `linkByTitle` chose is the only honest answer to "which record did that name mean".
    if (body.fromTitle === undefined) refuseAMessageThisReaderMayNotRead(reader, fromId, bothEndsMustExist)
    if (body.toTitle === undefined) refuseAMessageThisReaderMayNotRead(reader, idFrom(body.toId, 'to'), bothEndsMustExist)
    let linkId: string
    let toRecord: PanelRecord | null
    let revalidation: RevalidationWritten | null = null
    let nothingWritten: string | undefined
    if (body.toTitle !== undefined) {
      const made = linkByTitle(fromId, body.toTitle, type, actor, workspaceId, body.gate, reader)
      linkId = made.id
      toRecord = made.to
      revalidation = made.revalidation ?? null
      nothingWritten = made.nothingWritten
    } else {
      const toId = idFrom(body.toId, 'to')
      const link = createLink({
        fromId,
        toId,
        type,
        actor,
        // The gate key is left off entirely when there is none rather than passed as undefined:
        // to lib/records.ts "no gate" and "a gate I could not read" must not arrive as the same
        // thing.
        ...(body.gate === undefined ? {} : { gate: body.gate }),
        ...(body.carries === undefined ? {} : { carries: body.carries }),
      })
      linkId = link.id
      revalidation = link.revalidation ?? null
      nothingWritten = link.nothingWritten
      toRecord = getRecord(toId)
    }

    // Read back AFTER the write, so the answer names the records that were really linked whichever
    // way the caller named them. This is what linkSession already does for the session route.
    const from = endOf(getRecord(fromId), 'from')
    const to = endOf(toRecord, 'to')

    reply.status(201)
    return {
      id: linkId,
      type,
      from,
      to,
      note: whatItSays(from, to, type, body.gate),
      ...(revalidation === null ? {} : { revalidation }),
      ...(nothingWritten === undefined ? {} : { nothingWritten }),
    }
  })

  app.delete('/links/:id', route('link.remove', 'remote'), async (req): Promise<{ ok: true }> => {
      takesNoInput(req, 'DELETE /api/links/:id', 'Which link goes is the id in the URL. A gate is changed by deleting the link and making it again.')

    const actor = actorFrom(req)
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    deleteLink(id, actor, workspaceId)
    return { ok: true }
  })
}
