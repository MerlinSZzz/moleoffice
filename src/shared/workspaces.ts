// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKSPACE: Mole Office's project boundary, and the only one it has.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A WORKSPACE IS, AND WHAT IT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * One Mole Office installation holds several isolated projects — this product's own development
 * record, a greenhouse study, and whatever comes next. A WORKSPACE is one of those projects. Every
 * project-owned fact belongs to exactly one of them: records, the links between them, the change
 * log, attention, reader anchors, presentation intent, sessions, resources, the source index, and
 * the export.
 *
 * IT IS NOT A USER, AN ORGANISATION, A ROLE OR AN ACCESS RULE. Nothing here authenticates anybody
 * and nothing here grants or withholds anything: Mole Office runs on one machine for one person, and a
 * workspace answers "which project is this" rather than "who may see it". The shape is chosen so
 * that an access model, if one is ever needed, attaches a user to a workspace that already exists
 * instead of having to redefine what a project is — but no part of one is built here.
 *
 * IT IS NOT A RECORD KIND. `workspace_id` has been the leading column of every key in this
 * database since the first migration — records_title_idx is (workspace_id, title),
 * reader_anchors is keyed (workspace_id, reader), and so on down. That title index was UNIQUE until
 * 17 August 2026 and is a plain index now, since `0030_titles_may_repeat`; what mattered here was
 * never the uniqueness but which column comes first. The identity already existed and
 * every row already carried it; what was missing was any way to name a second one, and any query
 * that respected the boundary. A `project` record would have been a second identity beside the one
 * the storage layer already uses, which is this codebase's recurring defect — two places that must
 * agree with nothing making them agree.
 *
 * ---------------------------------------------------------------------------------------
 * ORIGIN IS NOT WORKSPACE
 * ---------------------------------------------------------------------------------------
 *
 * `records.origin` says HOW a row got here: `authored` by a person or an agent doing real work, or
 * `fixture` from the seed. A workspace says WHICH PROJECT it belongs to. They are different facts
 * and neither may stand in for the other: the seeded greenhouse corpus is fixture content about a
 * real project, and Mole Office's own development record contains fixture rows too. A rule that read
 * `fixture` as the name of one project would be a guess reported as a measurement.
 */

import { KNOWLEDGE_WORKSPACE } from './knowledge/constants.ts'

/**
 * The workspace a request means when it does not say, and the workspace a fresh database has.
 *
 * A STATED DEFAULT, NOT A GUESS. `x-mole-office-workspace` is how a caller names the project it is
 * working in; a request that sends no such header is answered from this one, and `GET /api` says
 * so in the same words. That is what the browser and a bare `curl` get, and it is the only thing
 * absence buys — a header that arrives present and blank is refused, exactly as the actor headers
 * are, because an unset variable in a client's header template produces precisely that.
 *
 * THE VALUE IS 'default' BECAUSE THAT IS WHAT EVERY EXISTING ROW ALREADY SAYS. `workspace_id` has
 * carried the SQL default `'default'` since the first migration, so every row of every Mole Office
 * database on disk is in it. Choosing any other word for the default would have meant rewriting
 * every row of every table in the name of a nicer string.
 *
 * IT IS NOT A PROJECT AND MUST NOT BE GIVEN ONE'S NAME. Hand the corpus migration a measurement and
 * it moves the measured records out into the projects that measurement names, leaving in here only
 * what nothing measured — so a row still in `default` after that migration is a row nobody has
 * assigned, and calling this workspace "Mole Office" would have made every one of them read as
 * Mole Office work.
 *
 * NO MEASUREMENT SHIPS WITH THE CODE, so a fresh database establishes no project but this one. A
 * workspace is established only when the measurement moves a record into it, and with no measurement
 * nothing moves: every row is still in `default`, and a project name here would claim the whole
 * database for that project. See src/server/db/workspace-migration.ts.
 */
export const DEFAULT_WORKSPACE = 'default'

/**
 * Where a record goes when the evidence is silent or the evidence disagrees.
 *
 * THE EXPLICITLY NAMED UNASSIGNED BOUNDARY. The corpus migration had 92 records it could not place
 * truthfully — nothing said which project they belong to, or two lines of evidence said different
 * things — and putting them in either project would have been the guess this whole exercise exists
 * to refuse. They are here instead, counted, with the reason recorded per row.
 *
 * IT IS A REAL WORKSPACE, not a null. Its rows can be read, listed, exported and moved, and
 * "nobody has said which project this belongs to" is a real answer rather than a gap in a table.
 */
export const UNASSIGNED_WORKSPACE = 'unassigned'

/**
 * THE OFFICE'S MESSAGE CENTRE: the one home every message is stored in, and nothing else. A message belongs to no
 * project, as problem cxRB633r_N37 records, and keeps a mark of the project and page where it was written (`writtenIn`)
 * and, when its writer says so, the project it is about (`aboutProject`), as a decision says.
 *
 * IT IS A REAL ROW IN THE PROJECT REGISTRY, as `unassigned` is, and not an empty column, for three reasons: every record's
 * `workspace_id` is required, backups and exports go project by project from the registry, and the office's own loops over
 * every project still reach the messages. The project lists served to a person or an agent leave it out
 * (`isAProjectOnAList`), and no project may be created or renamed to its id.
 */
export const MESSAGE_CENTRE = 'message-centre'
export const MESSAGE_CENTRE_TITLE = 'Message centre'
export const MESSAGE_CENTRE_NOTE =
  'Every message is kept here and in no project. Each keeps the project and page where it was written ' +
  'as data.writtenIn, and a project it is about as data.aboutProject when its writer says one.'
/** What `writtenIn.recordedBy` says on a message the move into the message centre marked, so the mark says who wrote it. */
export const WRITTEN_IN_BY_THE_MOVE = 'the move into the message centre: the project this message was filed in before messages left projects'

/** Whether this project belongs on a list of projects a person or an agent reads. The message centre does not. */
export function isAProjectOnAList(id: string): boolean {
  return id !== MESSAGE_CENTRE && id !== KNOWLEDGE_WORKSPACE
}

/**
 * THE ADDRESS OF THE ONE ROUTE THAT MOVES A RECORD INTO ANOTHER PROJECT, under `/api`.
 *
 * `src/server/api/records.ts` registers the route with this path, and the notes the workspace
 * migration writes on `unassigned` and `general` build their instruction from it. So renaming the
 * route renames the instruction too. Problem JwtgCLiccj7N: those notes named
 * `PATCH /api/records/:id`, which refuses the move.
 */
export const THE_PATH_THAT_MOVES_A_RECORD = '/records/:id/workspace'

/** The same route as a reader writes it: the method, `/api` and the path. */
export const THE_REQUEST_THAT_MOVES_A_RECORD = `POST /api${THE_PATH_THAT_MOVES_A_RECORD}`

/**
 * A project boundary, as the API serves it.
 *
 * `id` is what a request sends and what every row stores. `title` is what a person reads. `note`
 * is what the workspace holds, in the words of whoever established it — the migration writes the
 * evidence there, so a reader can see why a workspace exists at all.
 */
export interface Workspace {
  id: string
  title: string
  note: string | null
  /**
   * HOW MUCH REVIEW A FINISHED RUN GETS IN THIS PROJECT, or null because nobody has chosen.
   *
   * NULL IS A REAL ANSWER AND IT IS NOT THE SAME AS `full`. Null says nobody has opened Settings and
   * picked one; `full` says somebody picked the level that happens to be today's behaviour. Read it
   * through `reviewLevelOf` below, which is the one place the value before anybody chooses is named.
   */
  reviewLevel: ReviewLevel | null
  /** Whether an inspector reads the points of handed-back packages; null means nobody chose. */
  packageInspection: boolean | null
  createdAt: string
  updatedAt: string
}

// ============================================================ how much review a finished run gets

/**
 * THE THREE REVIEW LEVELS, SET PER PROJECT. The answers of 11
 * September 2026 say how the levels meet the chain that exists today.
 *
 *   none   The office starts no inspector, and the secretary confirms the finished run directly.
 *   light  The report goes to the secretary, who answers. No inspector.
 *   full   The inspector runs exactly as it does today.
 *
 * THE SEAL STAYS AND BLOCKS NOBODY AT ANY LEVEL. The level decides who reads a
 * finished run, not whether the work is sealed. The one exception is a run that changed only
 * records, which is neither sealed nor checked at `none` and `light` — criterion C35.
 *
 * IT IS PER PROJECT AND NOT PER INSTALLATION, which is why it is a column on `workspaces` rather
 * than a key in src/config/settings.mjs: one installation holds this product's own development
 * record and a greenhouse study, and how much review each wants is a fact about that project.
 */
export const REVIEW_LEVELS = ['none', 'light', 'full'] as const
export type ReviewLevel = (typeof REVIEW_LEVELS)[number]

/**
 * THE LEVEL A PROJECT IS AT BEFORE ANYBODY CHOOSES ONE, which is today's behaviour.
 *
 * `full` DELIBERATELY, so that nothing changes on the day the column lands. A migration that arrived
 * with `none` as the value before anybody chooses would have turned the inspector off on every
 * project in the database without anybody having asked, and the change would have been invisible:
 * runs would simply stop being checked. Confirmed by the secretary on 11 September 2026.
 */
export const REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES: ReviewLevel = 'full'

/** What each level is called on a screen. A label, not a sentence. */
export const REVIEW_LEVEL_WORDS: Readonly<Record<ReviewLevel, string>> = {
  none: 'None',
  light: 'Light',
  full: 'Full',
}

/** What each level does, beside its press. A label, for the reason `MESSAGE_LINK_PANEL_WORDS` gives. */
export const REVIEW_LEVEL_SAYS: Readonly<Record<ReviewLevel, string>> = {
  none: "No inspector reads a finished run; the secretary confirms the run, and its sealed code lands on the merge queue's tests alone",
  light: 'No inspector reads a finished run; the secretary answers the report, and its sealed code lands once the secretary confirms it',
  full: 'An inspector reads a finished run, and its sealed code lands after that inspector releases it',
}

/**
 * THE STORED VALUE, READ. The ONE place the level before anybody chooses is applied.
 *
 * A NULL IS NOBODY HAVING CHOSEN and reads as the stated value above. A NON-NULL VALUE THAT IS NOT
 * ONE OF THE THREE THROWS, and does not quietly read as the default: a row holding `strict` got
 * there outside the door that validates, and answering "full" for it would be a silent semantic
 * substitution — the second invariant. Fail loudly and name what was found.
 */
export function reviewLevelOf(stored: string | null | undefined): ReviewLevel {
  if (stored === null || stored === undefined) return REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES
  if (!(REVIEW_LEVELS as readonly string[]).includes(stored)) {
    throw new Error(
      `This project's stored review level is "${stored}", which is not one of ${REVIEW_LEVELS.join(', ')}. ` +
        'Nothing can say how much review its finished runs get. The value did not come through ' +
        'PATCH /api/workspaces, which refuses anything but those three.',
    )
  }
  return stored as ReviewLevel
}

/** Existing projects without a choice keep their previous behavior. */
export function packageInspectionOf(stored: boolean | null): boolean {
  return stored === null ? true : stored
}

/**
 * A workspace and how much is in it. What `GET /api/workspaces` answers, because "which exist" is
 * not usable without "which one has the work in it".
 */
export interface WorkspaceReading extends Workspace {
  /** Live records in it. Deleted rows are not counted; they are still in it. */
  records: number
  /** True for the workspace a request that names none is answered from. Exactly one is. */
  isDefault: boolean
}

/**
 * The shape of a workspace id: lowercase letters, digits, hyphen and underscore, 1..40 characters.
 *
 * NARROW ON PURPOSE. An id travels in an HTTP header, is compared literally in every WHERE clause
 * in the product, and names a directory in the per-workspace export. A value with a slash, a space
 * or a newline in it would be all three of a path traversal, an unreadable header and a row nobody
 * can address. The title carries whatever a person wants to read, including spaces and any script.
 */
const ID_SHAPE = /^[a-z0-9][a-z0-9_-]{0,39}$/

/**
 * Why this string cannot be a workspace id, or null when it can be.
 *
 * ONE FUNCTION, USED BY BOTH THE HEADER READER AND THE CREATE ROUTE, so that the id a request may
 * name and the id a request may establish cannot drift apart.
 */
export function workspaceIdFault(id: string): string | null {
  if (id.trim() === '') return 'a workspace id cannot be blank'
  if (id !== id.trim()) return `"${id}" has whitespace around it`
  if (!ID_SHAPE.test(id))
    return (
      `"${id}" is not a workspace id. Use lowercase letters, digits, hyphen and underscore, up to 40 ` +
      `characters, starting with a letter or a digit — it travels in a header, it is compared exactly in ` +
      `every query, and it names a directory in the export. The title is where spaces and any script go.`
    )
  return null
}

/**
 * Why this string cannot be a workspace title, or null when it can be.
 *
 * ONE FUNCTION, USED BY THE CREATE ROUTE, THE RENAME ROUTE AND THE CONTROL A PERSON TYPES INTO, so
 * that what may be established and what may be renamed to cannot drift apart. A title is what a
 * person reads, so the only rule is that there has to be one: spaces, punctuation and any script
 * are all fine, and the id beside it is where the narrow shape lives.
 */
export function workspaceTitleFault(title: string): string | null {
  if (title.trim() === '')
    return 'A workspace needs a title. The id is what a request sends; the title is what a person reads.'
  return null
}
