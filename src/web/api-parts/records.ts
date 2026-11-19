// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the person's authority. The browser's doors to the record model: records, their blocks,
// revisions, links, annotations, composition, forks, answers, implementation, restrictions, bundles and folder
// readings. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new
// doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type BundleAsked, type ChangesReply, type DischargeReply, ESTIMATE_FIELD, type JudgementReply, type LinkReply, type RecordDetail, type RecordHistoryReply, type RecordListReply, type RecordChangeReply, type RecordPatchReply, type RecordReply, type RecordsPageAsk, type RestrictionReading, type ScreeningOnTheWire, type TheBytesThatAnswered, bundleAsked, json, rememberRevision, request, withoutNulls } from '../api.ts'
import type { ZipExportAnswer } from '@shared/zip-export/manifest.ts'
import { t } from '@shared/i18n.ts'
import type { FolderPieceDecision, FolderPieceReply, FolderReading } from '@shared/folderreading.ts'
import type { LinkShape } from '@shared/link-shapes.ts'
import type { AnAnswer, ReportAnswers, ThePress } from '@shared/answers.ts'
import type { ObligationState } from '@shared/kinds.ts'
import type { Gate, KindFamily } from '@shared/work.ts'
import type { ReportsAndNotesReply } from '../../server/api/records.ts'
import type { DetailSupply } from '@shared/detailsupply.ts'
import type { WorkToTalkAbout } from '@shared/talksources.ts'
import type { ReportsPageShow } from '@shared/reports-page.ts'
import type { MyNotesChoice, MyNotesReply, NoteLastWrittenIn } from '@shared/my-notes.ts'
import { theApiUrlFor } from '../lib/api-address.ts'
import type { ForksReply } from '../../server/api/forks.ts'
import type { AcceptedReply, DeclaredReply, RebuiltReply, RecordImplementationReply, RepositoriesReply, RepositoryRegisteredReply } from '../../server/api/implementation.ts'
import type { Repointed } from '../../server/lib/repositories.ts'
import type { LinksReply } from '../../server/api/links.ts'
import type { RecordAround, RevokedAct } from '../../server/lib/records.ts'
import type { TitleOption } from '@shared/blocks.ts'
import type { MoveReport } from '../../server/lib/move.ts'
import type { ActOnTheirWords } from '../../server/lib/warrants.ts'
import type { MessageContext } from '../../server/lib/agents.ts'
import type { AnnotationReadings, AnnotationView } from '../../server/lib/annotations.ts'
import type { OneRevision, RestoredRevision, RevisionComparison, RevisionListing } from '../../server/lib/revisions.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { EVERY_PROJECT, PROJECTS_QUERY, type ProjectChoice, projectsQuery } from '@shared/across-projects.ts'
import { annotationTitle } from '../components/agent/context.ts'
import type { ItemState, LinkType, PanelRecord, RecordKind } from '@shared/types.ts'

/**
 * WHAT A BUNDLE EXPORT ANSWERS: the text answer the press has always given, or one zip.
 *
 * THE TEXT ANSWER IS NOT WRAPPED IN A SECOND SHAPE. It keeps the server's own `text` and `export`,
 * with `kind` added so a caller can tell which of the two it has. The zip's counts come from the
 * export entry, not from a second count of the zip.
 */
export type BundleExportAnswer = { kind: 'text'; text: string; export: { n: number } } | ZipExportAnswer

/**
 * WHAT THE EXPORT ENTRY JUST WRITTEN SAYS, read back from the bundle the press wrote it on.
 *
 * THE ENTRY IS THE ONE PLACE THE FILE AND SCREEN FACTS ARE WORKED OUT. The zip holds the same file
 * facts in its manifest, but reading a zip in the page to count its entries would be a second reader
 * of the same format. So this reads the record the server patched: the last entry of `data.exports`,
 * its number, the lengths of the three lists the entry keeps, and the screen's answer a zip press
 * records there. A bundle whose last entry has no `files` was recorded by a path that did not carry
 * the files, and this says so rather than inventing zeros. `screening` is null when the entry has
 * none, which is what a bundle's own zip press and every text press record.
 *
 * IT READS IN THE BUNDLE'S OWN PROJECT when one is named. A kept bundle may be in another project
 * than the page's, and the export door takes that project already; a read-back in the page's project
 * answered 404 after the door had recorded the export and handed over the zip.
 */
export async function theExportEntryJustWritten(
  bundleId: string,
  workspaceId?: string,
): Promise<{
  n: number
  title: string
  included: number
  missing: number
  leftOut: number
  screening: ScreeningOnTheWire | null
}> {
  const detail = await request<RecordDetail>(`/api/records/${encodeURIComponent(bundleId)}`, {
    ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
  })
  const list = detail.record.data['exports']
  const entries = Array.isArray(list) ? list : []
  const last = entries[entries.length - 1] as
    | { n?: unknown; files?: { included?: unknown; missing?: unknown; leftOut?: unknown }; screening?: unknown }
    | undefined
  const files = last?.files
  if (
    last === undefined ||
    typeof last.n !== 'number' ||
    files === undefined ||
    !Array.isArray(files.included) ||
    !Array.isArray(files.missing) ||
    !Array.isArray(files.leftOut)
  ) {
    throw new Error(t('zipExport.notRecorded'))
  }
  return {
    n: last.n,
    title: detail.record.title,
    included: files.included.length,
    missing: files.missing.length,
    leftOut: files.leftOut.length,
    screening: isTheScreenAnswer(last.screening) ? last.screening : null,
  }
}

/** Whether one stored value is the screen's answer, so an entry written before this field is read as none. */
function isTheScreenAnswer(raw: unknown): raw is ScreeningOnTheWire {
  if (typeof raw !== 'object' || raw === null) return false
  const bag = raw as { findings?: unknown; ranChecks?: unknown; summary?: unknown }
  return Array.isArray(bag.findings) && Array.isArray(bag.ranChecks) && typeof bag.summary === 'string'
}

/**
 * A COMMENT'S NEW WORDS AS A WRITE: the words, and the title made from them. `rewriteAnnotation` sends it, and so does
 * the comment's own record page, through the page's write, which carries the version the box was opened on.
 */
export function aCommentsNewWords(body: string): { title: string; dataPatch: { body: string } } {
  return { title: annotationTitle(body), dataPatch: { body } }
}

/**
 * WHAT A PAGE MAY ASK THE BULK LINK READ TO NARROW BY. Every word is optional: with none the read is
 * the whole workspace graph, as it always was. The words mean what `GET /api/links` says they mean,
 * and a word this office does not know is refused rather than ignored.
 */
export interface ListLinksQuery {
  projects?: ProjectChoice
  type?: readonly LinkType[]
  toId?: string
  typeToKind?: readonly (readonly [LinkType, RecordKind])[]
  betweenKind?: readonly [RecordKind, RecordKind]
  touchesKind?: readonly RecordKind[]
  shape?: LinkShape
}

export const recordsDoors = {

  /**
   * WHAT A PIPELINE OR A MODULE WAS MADE OF AT A TIME, with the provenance of every element.
   *
   * Two calls and one projection behind them. `composition` answers what it was made of at a time
   * and hands back the walk; `compositionChange` answers what changed between two times. Both come
   * from `compositionAt` in shared/composition.ts, so a test, the server and this browser cannot
   * disagree about what a pipeline was made of.
   *
   * THEY ARE HERE RATHER THAN IN THE COMPONENT because every request this browser makes says which
   * project it is about, and `tests/workspace-switcher.test.ts` is what keeps that true: it fails
   * on a `fetch` written anywhere else in src/web. A drawing that asked for itself would have been
   * the one screen answering about whichever project the last one was.
   */
  composition: (id: string, asOf?: string) =>
    request<unknown>(
      `/api/composition/${encodeURIComponent(id)}${asOf === undefined ? '' : `?asOf=${encodeURIComponent(asOf)}`}`,
    ),

  compositionChange: (id: string, from: string, to?: string) =>
    request<unknown>(
      `/api/composition/${encodeURIComponent(id)}/change?from=${encodeURIComponent(from)}` +
        (to === undefined ? '' : `&to=${encodeURIComponent(to)}`),
    ),

  /** What is in one pipeline and not in the other. Both ends are pipelines and they must differ. */
  compositionAgainst: (id: string, other: string) =>
    request<unknown>(`/api/composition/${encodeURIComponent(id)}/against?other=${encodeURIComponent(other)}`),

  /**
   * WHERE THIS RECORD'S CODE IS, which is the read the Module, Block and Pipeline pages draw.
   *
   * ONE ASK PER RECORD PAGE. The reply already carries everything the three surfaces draw — the
   * repositories, the stated patterns folded to directories, the resolvers' candidates, the
   * proposals waiting on a person, and the sources nothing in this build has looked with. A page
   * that asked once per repository would have to know the repositories before it could ask.
   *
   * `page` IS THE ROUTE'S OWN DISCLOSURE ARITHMETIC and not a convenience. The candidate list is
   * budgeted, the reply says how many it left out and in which group, and `checkSubtraction` on the
   * server throws rather than reporting, so a short list can never arrive looking whole.
   */
  implementationForRecord: (id: string, page?: number) =>
    request<RecordImplementationReply>(
      `/api/implementation/record/${encodeURIComponent(id)}` + (page === undefined ? '' : `?page=${page}`),
    ),

  /**
   * SAY WHICH CODE A RECORD IS — the act `implementation-map.md` §7.2 calls **Add code**.
   *
   * IT IS THE OTHER HALF OF THE WAY IN. Registering a repository gives a pattern a tree to be
   * relative to; this is what puts a pattern there. Without it, a person who has registered a
   * repository still has no way to make a Module page draw anything, because the record read
   * answers about the repositories THIS record has rows in and a record with no rows has none.
   *
   * NO CHECK OF THE PATTERN HERE. `claimProblem` refuses an absolute path, a backslash and a `..`
   * with the sentence it already writes; the unique index refuses an exact repeat and names the row
   * it clashes with. A second copy of either in the browser is the same rule in two places.
   *
   * `proposing` IS NOT SENT BY THIS APP. A person pressing this is stating a fact, so the row is
   * `declared`. The flag is on the route for an agent that has read the code and is guessing, and
   * an agent sends it directly — the browser has no reader who would mean it.
   */
  declareImplementation: (body: {
    recordId: string
    repositoryId: string
    pattern: string
    relation?: string
    note?: string | null
  }) =>
    request<DeclaredReply>('/api/implementation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /**
   * A PERSON ACCEPTS A GUESS. The one act wave 6's governance guard exists to protect.
   *
   * There is no browser-side check that the reader is a person, deliberately. `assertMayAcceptAGuess`
   * is registered in GOVERNANCE_GUARDS and refuses at the write, and a second copy of the rule in
   * the browser is the "same permission in two places" defect this repository keeps meeting. What
   * the surface does with a refusal is DRAW THE SERVER'S OWN SENTENCE, so a person switched to an
   * agent identity is told why by the thing that actually refused.
   */
  acceptImplementationGuess: (rowId: string) =>
    request<AcceptedReply>(`/api/implementation/${encodeURIComponent(rowId)}/accept`, { method: 'POST' }),

  /**
   * DELETE ONE RELATIONSHIP. Criterion M118.
   *
   * `DELETE /api/implementation/:id` has existed since wave 6 and no screen called it, so a person
   * could only take back their own statement about their code with `curl`. The route soft-deletes,
   * the way records does: the row keeps its date and its author, so the change log can say what
   * happened.
   *
   * `assertMayRetireSomebodyElsesRow` is the gate and it will not let an agent delete what a person
   * stated. A refusal arrives here as the server's own sentence, which is what the panel draws.
   */
  deleteImplementation: (rowId: string) =>
    request<{ note: string }>(`/api/implementation/${encodeURIComponent(rowId)}`, { method: 'DELETE' }),

  /**
   * EVERY REPOSITORY IN THIS PROJECT — the Repositories panel in Settings.
   *
   * A REPOSITORY IS THE TREE A STATED PATH IS RELATIVE TO, and until one is registered every
   * pattern anybody writes has nothing to be relative to. Wave 6 built the twelve routes and no
   * screen called this one, so on the owner's own corpus `repositories` held no rows and the only
   * way to a first one was `curl`. That is the fault this call exists to close.
   */
  repositories: () => request<RepositoriesReply>('/api/implementation/repositories'),

  /**
   * POINT A REPOSITORY AT A DIFFERENT FOLDER, OR RENAME IT. The highest-consequence write in the
   * implementation map: everything derived from the old tree is dropped, and the reply says how
   * much. The panel shows that number after the fact rather than guessing it before.
   */
  repointRepository: (id: string, body: { name?: string; root?: string | null; note?: string | null }) =>
    request<{ repository: unknown; wasRoot: Repointed['wasRoot']; dropped: { indexedFiles: number; findings: number }; note: string }>(`/api/implementation/repositories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** FORGET A REPOSITORY. The rows derived from it go with it, and the reply says how many. */
  forgetRepository: (id: string) =>
    request<{ note: string }>(`/api/implementation/repositories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  /**
   * REGISTER ONE. It does NOT scan, and the reply says so in the server's own words.
   *
   * `root` IS THE FOLDER ON THIS MACHINE AND MAY BE LEFT OUT, which is a real state and not a
   * missing value: the repository is named, there is no checkout of it here, it can hold
   * relationships and be read, and it cannot be scanned. The panel draws that as an absence.
   *
   * There is no browser-side check of the name or the folder. `registerRepository` refuses a
   * duplicate name naming the other row, and `checkedRoot` refuses a path that is not a directory
   * naming the value — a second copy of either rule here is the same rule in two places.
   */
  registerRepository: (body: { name: string; root?: string | null; note?: string | null }) =>
    request<RepositoryRegisteredReply>('/api/implementation/repositories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /**
   * SCAN ONE REPOSITORY, or every one in this project that has a folder on this machine.
   *
   * IT IS A SEPARATE ACT FROM REGISTERING ONE, on purpose. A scan started by a write would make
   * the index's own date mean *when somebody last saved a form*, which is the argument the route
   * makes in its own reply and the same one the coverage read has made for months.
   */
  rebuildRepositories: (repository?: string) =>
    request<RebuiltReply>('/api/implementation/rebuild', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(repository === undefined ? {} : { repository }),
    }),

  /**
   * Every live record, each carrying its own `incompleteCount` — see RecordListItem.
   *
   * `shape` names how much of each body comes back. `light` is a screen that lists records without
   * reading them; `home` is the home page's own narrower list; `session` is the session records the
   * Running now block and the sessions page read, carrying only `id`, `kind`, `data.state` and
   * `data.detail` (see `sessionRecord` in src/server/api/records.ts); `narrow` is ids, titles and
   * stamps, which is what a caller that reads only names passes. NO SHAPE ASKS FOR THE FULL RECORD,
   * because the door's default is now narrow: the URL below always writes a shape, so a call that
   * names none asks `shape=full`. The reply's row type is the same either way: the fields this
   * narrows are inside `data`, which is declared `Record<string, unknown>`.
   */
  listRecords: (
    kind?: RecordKind,
    shape?: 'light' | 'home' | 'session' | 'narrow' | 'full',
    limit?: number,
    offset?: number,
    // WHICH PROJECTS, for a page under All projects (src/shared/across-projects.ts). Left out, the
    // list is the project in the switcher, as it always was.
    projects?: ProjectChoice,
  ) =>
    request<RecordListReply>(
      '/api/records?' +
        [
          kind ? `kind=${encodeURIComponent(kind)}` : '',
          `shape=${shape ?? 'full'}`,
          limit === undefined ? '' : `limit=${String(limit)}`,
          offset === undefined ? '' : `offset=${String(offset)}`,
          projects === undefined ? '' : projectsQuery(projects),
        ]
          .filter(Boolean)
          .join('&'),
    ),

  /**
   * THE RECORDS NAMED BY ID, in the narrow row: what a page that draws a handful of names asks for.
   * `GET /api/records?ids=…&shape=narrow` reads those ids only, never the project.
   */
  recordsNamed: (ids: readonly string[]) =>
    request<RecordListReply>(
      `/api/records?${new URLSearchParams({ ids: ids.join(','), shape: 'narrow' }).toString()}`,
    ),

  /**
   * THE RECORDS ONE PAGE DRAWS AND NO OTHERS: one kind or one family, with the records one link away when the page
   * draws them (`farEnds`). A family page asked for the whole project and kept a few; on the live office that was
   * 142 MB (round 15). With no limit the family comes whole, which is what a page counting over its family needs.
   */
  recordsOf: (ask: { kind: RecordKind; shape?: 'light' } | { family: KindFamily; farEnds?: 'light' }) => {
    const params = new URLSearchParams()
    if ('kind' in ask) {
      params.set('kind', ask.kind)
      params.set('shape', ask.shape ?? 'full')
    } else {
      params.set('family', ask.family)
      params.set('shape', 'full')
      if (ask.farEnds !== undefined) params.set('farEnds', ask.farEnds)
    }
    return request<RecordListReply>(`/api/records?${params.toString()}`)
  },

  /**
   * WHAT THE SETTINGS PAGE'S DETAIL GRID DRAWS: how many records have each length written, the first
   * records that have none, and one record per row to preview, counted on the server over this
   * project's records with src/shared/detailsupply.ts.
   */
  detailSupply: () => request<DetailSupply>('/api/records/detail-supply'),

  /**
   * THE CONVERSATIONS PAGE'S LIST OF WORK: the first records whose title holds `search`, newest change
   * first, in the narrow shape, with how many match and what was left out by kind. Worked out on the
   * server with src/shared/talksources.ts.
   */
  workToTalkAbout: (search: string) =>
    request<WorkToTalkAbout<PanelRecord>>(
      '/api/records/work-to-talk-about' + (search.trim() === '' ? '' : `?q=${encodeURIComponent(search)}`),
    ),

  /**
   * ONE PAGE OF THE REPORTS PAGE: reports and notes of every project, grouped, with every count
   * worked out over every row before the page is cut. It sends no project, because it reads them all.
   */
  reportsAndNotes: (ask: { show: ReportsPageShow; limit: number; offset: number }) =>
    request<ReportsAndNotesReply>(
      `/api/records/reports-and-notes?${new URLSearchParams({ show: ask.show, limit: String(ask.limit), offset: String(ask.offset) }).toString()}`,
    ),

  /**
   * ONE PAGE OF MY NOTES: the quick notes of every project, searched, chosen and counted by the door, with the weeks
   * counted in this browser's own time zone. It sends no project, because it reads them all.
   */
  myNotes: (ask: { q: string; only: MyNotesChoice; zone: string; limit: number; offset: number }) => {
    const params = new URLSearchParams({ only: ask.only, zone: ask.zone, limit: String(ask.limit), offset: String(ask.offset) })
    if (ask.q.trim() !== '') params.set('q', ask.q)
    return request<MyNotesReply>(`/api/records/my-notes?${params.toString()}`)
  },

  /** The note this person last wrote in, among the notes My notes lists for them, or no note. It sends no project. */
  noteLastWrittenIn: () => request<NoteLastWrittenIn>('/api/records/my-notes/last-written-in'),

  /**
   * ONE PAGE OF THE EVERYTHING PAGE, with the group counts. The search, the
   * group and the order are worked out by the door over every row before it cuts the page. The rows
   * come in the light shape, which carries everything the table draws.
   */
  recordsPage: (ask: RecordsPageAsk) => {
    const params = new URLSearchParams({ shape: 'light', tally: 'family' })
    if (ask.kind !== undefined) params.set('kind', ask.kind)
    if (ask.family !== undefined) params.set('family', ask.family)
    if (ask.q !== undefined) params.set('q', ask.q)
    params.set('sort', ask.sort)
    params.set('direction', ask.direction)
    params.set('limit', String(ask.limit))
    params.set('offset', String(ask.offset))
    if (ask.projects !== undefined) params.set(PROJECTS_QUERY, ask.projects)
    return request<RecordListReply & { tally: NonNullable<RecordListReply['tally']> }>(`/api/records?${params.toString()}`)
  },
  /**
   * THE NEWEST DECISIONS OF EVERY PROJECT, newest first, `limit` of them after the first `offset`. The Settings panel
   * "Usage notices" lists them to choose the usage decision from (wave 13y round 140, item 79d). The door leaves out a
   * decision a later one replaced, and orders two filed in the same second by id, so the next page starts where the
   * last one ended.
   */
  newestDecisions: (limit: number, offset: number) => {
    const params = new URLSearchParams({ kind: 'decision', shape: 'narrow', sort: 'created', direction: 'desc', limit: String(limit), offset: String(offset) })
    params.set(PROJECTS_QUERY, EVERY_PROJECT)
    return request<RecordListReply>(`/api/records?${params.toString()}`)
  },
  /**
   * THE SAME FORKS, WHOLE — the question, the options, what each is holding up, and the record's own
   * fields — so that one reply is enough to settle one. No workspace header for the same reason
   * `needsYou` has none: a fork waiting on you does not stop waiting because you are reading a
   * different project today.
   *
   * It is a read. Settling still goes through `promoteProposal` below, which is the one door.
   */
  forks: () => request<ForksReply>('/api/forks'),
  /**
   * Settle a fork. The SAME route an agent is refused at — this is not a second write path, and the
   * browser only succeeds because the actor selector says human. Set it to an agent and the server
   * refuses, which is the guard working.
   *
   * `workspaceId` names the project the FORK is in, and the caller passes it when that is not the
   * project on screen. The decision belongs where the fork is; a settle that took the project from
   * the switcher would depend on the reader having navigated somewhere first, which is exactly what
   * the decision desk exists not to make them do. Left out, the request says nothing and is answered
   * about the project in the switcher, like every other write.
   */
  promoteProposal: (
    id: string,
    body: { title: string; summary?: string; data?: Record<string, unknown> },
    workspaceId?: string,
  ) =>
    request<{ decision: { id: string; title: string }; note?: string }>(`/api/records/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify(body),
      ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
    }),

  /**
   * SAY THE WORK ITSELF IS FINISHED. This is the Done press on the schedule.
   *
   * IT WRITES THE RECORD'S OWN STATE AND NOTHING ELSE. Completing a slice of time is a different
   * fact and has its own write — `changeAllocation` above, whose rule is that `done` finishes that
   * slice and says nothing about the work. This is the other direction, and it is not an inference:
   * a person pressed a button that says the work is done, which is them saying so.
   *
   * `state` IS THE CALLER'S ANSWER AND THERE IS NO DEFAULT, because the finishing word is the
   * kind's. A task and a block finish at `done`, an obligation at `fulfilled`, a problem at `fixed`
   * or `worked_around` or `accepted`. Guessing one would be Mole Office making the judgement.
   *
   * `workspaceId` IS REQUIRED AND HAS NO DEFAULT, for the same reason as `setEstimateHours`: the
   * schedule is a cross-project surface, so the project in the switcher is not the answer. Every
   * plan row carries `work.workspaceId`, which is what to pass here.
   */
  setWorkState: (id: string, state: string, workspaceId: string) =>
    request<RecordPatchReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json({ dataPatch: { state } }),
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }),

  /**
   * SAY HOW BIG A PIECE OF WORK IS, in hours. This is the "How big" cell on the planning table.
   *
   * It writes the estimate ON THE RECORD, which is where every other surface reads it from, so a
   * number typed in the table is the same number the schedule, the deadline report and the record's
   * own page show. `hours: null` clears it, and clearing is not writing zero — see ESTIMATE_FIELD.
   *
   * `workspaceId` IS REQUIRED AND HAS NO DEFAULT, because this is a cross-project surface. A record
   * is patched in the project that owns it, and the work list deliberately shows every project at
   * once, so the project on screen is not the answer. Every row of `api.work()` carries the
   * `workspaceId` to pass here. Get it wrong and the server refuses with a 404 that names the project
   * the record is really in.
   *
   * It goes through PATCH /api/records/:id like every other record change, as a merge, so nothing
   * else stored on the record is touched. The whole reply comes back, `dataPatch` included: clearing
   * the estimate is a successful write that made the record less finished, and that report is the
   * only place it is visible.
   */
  setEstimateHours: (id: string, hours: number | null, workspaceId: string) =>
    request<RecordPatchReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json({ dataPatch: { [ESTIMATE_FIELD]: hours } }),
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }),

  /**
   * SAY WHAT SORT OF THING A PIECE OF WORK IS. This is the Type cell of the planning table, once the
   * line is tracked.
   *
   * The owner, 17 August 2026: *"A mistaken first choice must not permanently lock the record. Allow
   * the type to be changed from the normal surface."*
   *
   * NOTHING STORED IS DISCARDED, and the reply is where that is visible. A field the new kind has no
   * place for is moved into `extra` and `kindChange.kept` names every one of them and where it went.
   * A screen that shows the new kind and drops that report has hidden a person's own answers.
   *
   * `workspaceId` IS REQUIRED AND HAS NO DEFAULT, for the same reason as `setEstimateHours`: the
   * plan table is a cross-project surface, so the project in the switcher is not the answer.
   */
  setWorkKind: (id: string, kind: RecordKind, workspaceId: string) =>
    request<RecordPatchReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json({ kind }),
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }),

  /**
   * MOVE A PIECE OF WORK INTO ANOTHER PROJECT. This is the Project cell of the planning table, once
   * the line is tracked.
   *
   * IT IS NOT `PATCH`. A move carries the record's links, its change rows, its ledger rows and its
   * arrangement, and it may have to carry OTHER RECORDS with it; the route's own header says why
   * that is its own verb. So the Project column before tracking and the Project column after
   * tracking write to two different places, which is the whole of the owner's rule: the value is
   * planning intent until it is tracked and canonical after.
   *
   * `from` IS THE PROJECT THE RECORD IS IN NOW and it is the header, not the body. The plan table
   * is a cross-project surface — a plan legitimately holds work from several projects — so the
   * project in the switcher is not the answer. Every filed row carries `work.workspaceId`, which is
   * what to pass here.
   *
   * IT REFUSES WITH 409 WHEN SOMETHING ELSE WOULD HAVE TO MOVE, naming every record and the
   * relationship that forces it. Show the server's sentence: it is the whole of what a reader needs,
   * and `also` — the confirmation that carries them — is deliberately not offered from a table cell.
   * A move of several records is a move somebody should read the list of first, on the record's own
   * page.
   */
  moveWorkToProject: (id: string, from: string, to: string) =>
    request<MoveReport>(`/api/records/${encodeURIComponent(id)}/workspace`, {
      method: 'POST',
      body: json({ to }),
      headers: { [WORKSPACE_HEADER]: from },
    }),

  /**
   * File a record. The whole 201 comes back — the record, the fields it is still missing, and the
   * one-sentence version of that — plus `id`, the new record's id at the top level.
   *
   * WHY THE ALIAS. This used to answer `r.record` and throw the rest away, which is how a caller
   * ends up unable to tell a finished module from an empty one. Widening it to the whole reply
   * would have been a compile error in the create form, which navigates to `record.id` the moment
   * this resolves and is not this file's to change. So the id is lifted to the top level: the
   * form keeps working, and every field the server sends — including the ones it grows later —
   * arrives with it. tests/panels-follow.test.ts checks the alias against the record's own id, so
   * it can never quietly shadow a field of the same name.
   */
  createRecord: (
    input: {
      kind: RecordKind
      title: string
      summary?: string
      data?: Record<string, unknown>
    },
    // THE PROJECT IT IS FILED IN, when the caller names one: All records reads across projects and
    // says which project a new record goes into. Left out, the project in the switcher.
    workspaceId?: string,
  ) =>
    request<RecordReply>('/api/records', {
      method: 'POST',
      body: json(input),
      ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
    }).then(
      (r): RecordReply & { id: string } => ({ ...r, id: r.record.id }),
    ),

  /**
   * One record, whole — and the read a page is drawn from.
   *
   * It remembers which revision this reply held, so a comment written on this page can say which
   * revision it was written against. See `revisionDrawn` above. Nothing else writes that memory.
   */
  getRecord: (id: string, options?: { workspaceId?: string }) => {
    const init = options?.workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: options.workspaceId } }
    const path = `/api/records/${encodeURIComponent(id)}`
    // THE WHOLE RECORD, SECOND LEVEL INCLUDED: the page folds a flow's reasons
    // and a decision's basis itself, closed, so it asks for them. It asks again with ?secondLevel=show only when the
    // reply says it held something back, which the server says only of a flow or a decision. Every other record is read
    // at the address it always had, so a page or a test that answers that address still answers this read (round 43b).
    return request<RecordDetail>(path, init)
      .then((reply) => (reply.secondLevel === undefined ? reply : request<RecordDetail>(`${path}?secondLevel=show`, init)))
      .then(rememberRevision)
  },

  /**
   * THE DECISIONS ALREADY MADE THAT NAME THIS OPEN FORK, read off the record's own reply and nothing else of it. The
   * Decisions page's card asks this when it is opened, so it offers the same press to close the fork by one that the
   * proposal's own page offers (problem lZ8mjvbb4fxl). Like `recordNow`, it does not remember the revision: the card
   * draws no comment composer. A settled fork, which the reply sends no list for, answers an empty list.
   */
  decisionsThatNameIt: (id: string, workspaceId: string) =>
    request<RecordDetail>(`/api/records/${encodeURIComponent(id)}`, { headers: { [WORKSPACE_HEADER]: workspaceId } }).then(
      (reply) => reply.decisionsThatNameIt ?? [],
    ),

  /** The same reading of earlier decisions that the promote door refuses with. */
  forkReplaceCandidates: (id: string, workspaceId?: string) =>
    request<RecordDetail>(
      `/api/records/${encodeURIComponent(id)}`,
      workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } },
    ).then((reply) => reply.replacesCandidates ?? []),

  /**
   * WHAT A RECORD IS RIGHT NOW, asked without changing what the pages have drawn.
   *
   * The composer asks this at the moment somebody writes a comment, and compares it with what the
   * page was drawn from. It deliberately does NOT remember its answer: a read made to check a
   * comment draws nothing, and letting it overwrite the memory would make a stale page look current
   * the second time somebody commented on it.
   */
  recordNow: (id: string) =>
    request<RecordDetail>(`/api/records/${encodeURIComponent(id)}`).then(
      (reply): { seq: number | null; contentHash: string; record: PanelRecord } => ({
        seq: reply.revisionSeq,
        contentHash: reply.version,
        // THE RECORD ITSELF, for the question a form asks when another writer changed it: the person may keep their
        // version, and the form then shows it.
        record: reply.record,
      }),
    ),

  /**
   * WHAT KIND OF RECORD THIS IS AND WHAT IT IS CALLED. Two facts, asked by id.
   *
   * The composer asks it about the record a comment is about, and about the record whose page the
   * comment was written on. A link row on a report names another record, and a person reading the
   * composer — or an agent deciding who should receive the comment — needs to know that the thing
   * pointed at is a problem called X, met on a report called Y. The row draws the kind as a tag and
   * the page draws its own title, but the composer outlives both: it stays open when the page
   * changes, and it is opened from a stored comment on screens that never drew either. So the two
   * facts are asked for by id rather than read off whatever happens to be drawn.
   *
   * IT DOES NOT REMEMBER THE REVISION IT SAW, for the reason `recordNow` above gives: a read made
   * to fill in a chip has drawn no page, and letting it overwrite that memory would make a stale
   * page look current the moment somebody right-clicked on it.
   *
   * `workspaceId` names the project to read it in, when that is not the reader's own. A lead may name
   * a page in another project (criterion M60), and its offer names what that page shows.
   */
  whatARecordIs: (id: string, options?: { workspaceId?: string }) =>
    request<RecordDetail>(
      `/api/records/${encodeURIComponent(id)}`,
      options?.workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: options.workspaceId } },
    ).then(
      (reply): { kind: RecordKind; title: string } => ({
        kind: reply.record.kind,
        title: reply.record.title,
      }),
    ),

  /**
   * THE LINKS A PAGE DRAWS, and only those (wave 14c, AT-5). With no argument it is the whole
   * workspace's graph, as before. A page that draws a part of it names the part: `type`, `toId`,
   * `typeToKind`, `betweenKind` and `touchesKind` keep the links, and `shape` keeps the fields the
   * page reads (`draw`, `answer` or `ends`). The door refuses a word it does not know, so a
   * misspelt filter cannot quietly answer with everything.
   *
   * The alternative to a bulk read is `getRecord` per record, which is how a page ends up creating
   * one `fetch` per structural record and finding out that a browser refuses everything past about
   * 1,356 of them. A page that wants part of the graph asks for that part.
   */
  listLinks: (query: ListLinksQuery = {}) => {
    const words = new URLSearchParams()
    if (query.projects !== undefined) words.set(PROJECTS_QUERY, query.projects)
    if (query.type !== undefined) words.set('type', query.type.join(','))
    if (query.toId !== undefined) words.set('toId', query.toId)
    if (query.typeToKind !== undefined) words.set('typeToKind', query.typeToKind.map(([type, kind]) => `${type}:${kind}`).join(','))
    if (query.betweenKind !== undefined) words.set('betweenKind', query.betweenKind.join(','))
    if (query.touchesKind !== undefined) words.set('touchesKind', query.touchesKind.join(','))
    if (query.shape !== undefined) words.set('shape', query.shape)
    const address = words.size === 0 ? '/api/links' : `/api/links?${words.toString()}`
    return request<LinksReply>(address).then((r) => r.links)
  },

  /**
   * THE OTHER RECORDS AND THE LINKS ONE RECORD PAGE DRAWS, and nothing else. `recordsAround` in
   * src/server/lib/records.ts says which records and why. The rows and their order are those of the
   * whole listing and of `listLinks`, only fewer.
   */
  recordAround: (id: string) => request<RecordAround>(`/api/records/${encodeURIComponent(id)}/around`),

  /** The rows a record picker offers: every live record's title, id and telling-apart note. */
  recordTitleOptions: () =>
    request<{ options: TitleOption[] }>('/api/records/title-options').then((r) => r.options),

  /**
   * Change a record. The whole reply comes back, `dataPatch` included: a merge that DELETED a
   * key is a successful write that made the record less finished, and the only place that is
   * visible is the report the server sends with it.
   */
  /**
   * CHANGE A DECISION THEY HAVE ALREADY MADE. Criterion M83.
   *
   * It writes a NEW decision that supersedes the old one and edits nothing; `data.because` carries
   * their words for why they are changing it.
   */
  chooseAgain: (decisionId: string, write: { title: string; data: Record<string, unknown> }) =>
    request<{ decision: PanelRecord }>(`/api/records/${encodeURIComponent(decisionId)}/choose-again`, {
      method: 'POST',
      body: json(write),
    }),

  updateRecord: (
    id: string,
    patch: {
      title?: string
      summary?: string | null
      data?: Record<string, unknown>
      dataPatch?: Record<string, unknown>
      /**
       * Sent with `data` to say a whole-object rewrite is meant, including the fields it does not
       * carry. Without it the route refuses one that would empty a stored field. Nothing in this
       * app sends it: every write from a screen is a merge.
       */
      replace?: true
      /**
       * The version this write was built on. The server refuses the write with 409 and stores nothing when the record
       * holds another version now, while the gate for writes from a stale copy blocks. The record page's edit form and the
       * saves drawn beside it send it; src/web/components/AnotherWriter.tsx names them.
       */
      ifVersion?: string
    },
    // THE RECORD'S OWN PROJECT, when a page reading across projects changes a record of a project
    // other than the one in the switcher. Left out, the switcher's project, as always.
    workspaceId?: string,
  ) =>
    request<RecordChangeReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(patch),
      ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
    }),

  /**
   * KEEP ONE ANSWER TO A QUESTION IN A REPORT, NOT SENT YET.
   *
   * The answer door keeps it as the question's draft and answers with the report's whole `answers`
   * map after the write. An empty answer removes the draft. Only the person may answer; the door
   * refuses anybody else, and the page draws that refusal.
   */
  keepAnAnswer: (recordId: string, blockId: string, answer: Pick<AnAnswer, 'chosen' | 'words'>) =>
    request<{ answers: ReportAnswers }>(
      `/api/records/${encodeURIComponent(recordId)}/answers/${encodeURIComponent(blockId)}`,
      { method: 'PUT', body: json({ answer }) },
    ),

  /**
   * SEND WHAT IS UNSENT IN ONE PRESS'S SCOPE: a box, a button, or the whole report. The door sends one
   * message to each agent named, records each choice as the person's decision, and answers with the
   * messages, the decisions and the report's whole `answers` map after the send.
   */
  sendAnswers: (recordId: string, press: ThePress) =>
    request<{ messages: { id: string; to: string }[]; decisions: string[]; answers: ReportAnswers }>(
      `/api/records/${encodeURIComponent(recordId)}/answers/send`,
      { method: 'POST', body: json({ press }) },
    ),

  /**
   * Add a block to a pipeline: the record and the pipeline's new order, in one transaction.
   *
   * `name` is the block's OWN name, not its title. The server builds the title as
   * `<pipeline title> › <name>` and it is the only thing that may — a block's title carries the
   * pipeline it belongs to, so that two pipelines can each have a step called "Plan the approach"
   * and every block stays addressable by typing its name.
   *
   * A bare `createRecord({kind:'block'})` is refused by the server with this route in the refusal.
   */
  addBlock: (
    pipelineId: string,
    input: { name: string; state: ItemState; measured?: string; at?: number },
  ) =>
    request<RecordReply & { pipeline: PanelRecord; at: number }>(
      `/api/records/${encodeURIComponent(pipelineId)}/blocks`,
      { method: 'POST', body: json(input) },
    ),

  /** Change one block: its name, its state, what was measured. `measured: null` clears it. */
  patchBlock: (
    pipelineId: string,
    blockId: string,
    patch: { name?: string; state?: ItemState; measured?: string | null },
  ) =>
    request<RecordPatchReply>(
      `/api/records/${encodeURIComponent(pipelineId)}/blocks/${encodeURIComponent(blockId)}`,
      { method: 'PATCH', body: json(patch) },
    ),

  /**
   * Put a pipeline's blocks in a new order. THE WHOLE ORDER, every time.
   *
   * A list that leaves a block out is refused rather than dropping it — a caller that has not seen
   * a block somebody added a minute ago would otherwise remove it by saying nothing about it.
   */
  reorderBlocks: (pipelineId: string, blockIds: readonly string[]) =>
    request<{ pipeline: PanelRecord }>(`/api/records/${encodeURIComponent(pipelineId)}/blocks`, {
      method: 'PUT',
      body: json({ blockIds }),
    }),

  /** Take a block out of this order; delete it only if no other live pipeline lists it. */
  removeBlock: (pipelineId: string, blockId: string) =>
    request<{ ok: true; pipeline: PanelRecord; deleted: boolean; stillListedBy: { id: string; title: string }[] }>(
      `/api/records/${encodeURIComponent(pipelineId)}/blocks/${encodeURIComponent(blockId)}`,
      { method: 'DELETE' },
    ),

  deleteRecord: (id: string) =>
    request<{ ok: true }>(`/api/records/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** Undo a soft delete. A record that was incomplete when it went is still incomplete now. */
  restoreRecord: (id: string) =>
    request<RecordReply>(`/api/records/${encodeURIComponent(id)}/restore`, { method: 'POST' }),

  createLink: (input: {
    fromId: string
    toId?: string
    toTitle?: string
    type?: LinkType
    gate?: Gate
  }) => request<LinkReply>('/api/links', { method: 'POST', body: json(input) }),

  deleteLink: (id: string) => request<{ ok: true }>(`/api/links/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * The change log, WITH the block that says which session each row belongs to.
   *
   * `sessions` is not optional garnish. Change rows store a session RECORD ID, so a page that
   * prints the raw field shows an identifier where the run's name should be; this block is the
   * server's own join back to the record, and every page that draws a change row reads it.
   *
   * `session` — the filter report — comes back only when `session` is passed here, and it says
   * how the reference was matched and how many rows still carry a run name rather than an id.
   */
  listChanges: (opts: { recordId?: string; session?: string; since?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (opts.recordId) q.set('recordId', opts.recordId)
    if (opts.session) q.set('session', opts.session)
    if (opts.since) q.set('since', opts.since)
    if (opts.limit !== undefined) q.set('limit', String(opts.limit))
    const suffix = q.toString()
    return request<ChangesReply>(`/api/changes${suffix ? `?${suffix}` : ''}`)
  },

  /**
   * Record that a promise was kept, so it stops being owed.
   *
   * `note` is required by this action even though `fulfilledNote` is optional on the record: this
   * is the only moment the person who knows what settled it is still here to say so. `state`
   * defaults to `fulfilled`; `cancelled` means it stopped being owed, which is different news from
   * being met.
   *
   * THIS IS THE FIELD NOTHING EVER WROTE. `data.done` has been declared and read since the first
   * slice and no interface ever set it, so every obligation in the database looked permanent.
   */
  fulfilObligation: (id: string, input: { note: string; at?: string; state?: ObligationState }) =>
    request<DischargeReply>(`/api/records/${encodeURIComponent(id)}/fulfil`, {
      method: 'POST',
      body: json(input),
    }),

  // -------------------------------------------------------------------------- a note on something

  /**
   * WRITE DOWN WHAT SOMEBODY POINTED AT AND SAID. This is the atomic durable fact of a review.
   *
   * IT NEEDS NO RECIPIENT AND NO CONVERSATION, and that is the whole point of it. Round seven wrote
   * a review comment as a row in `agent_messages`, so a comment existed only inside a conversation
   * with an agent: it died with the thread, no second review could collect it, and it was refused
   * outright when the agent it named was a fixture row. An annotation is a record. It survives the
   * thread, the agent and the review, and nothing about who it might be sent to can refuse it.
   *
   * A MESSAGE IS WHAT CARRIES ONE TO SOMEBODY, later and separately. See ReviewBar.tsx, which turns
   * the ones a person has said who they are for into messages at the moment they are sent.
   *
   * THE TITLE IS THE FIRST WORDS OF THE BODY, and it is written from the body every time the body
   * is written — `annotationTitle` is the one place that rule lives, so the two cannot drift into
   * saying different things.
   *
   * NO `state` IS WRITTEN, AND THAT IS THE SCHEMA'S OWN INSTRUCTION. `annotation.state` in
   * GET /api/kinds reads "NOTHING DECIDES ANYTHING FROM THIS FIELD, AND IT IS ON ITS WAY OUT …
   * Do not write it." Where a comment has got to is `agent_messages.state`, worked out from the
   * messages that carried its words. This wrote `queued` there until 25 August 2026, which is the
   * browser writing a field the schema forbids while another browser file decided from it — the one
   * fact stored in two places, which is this repository's own recurring defect.
   */
  writeAnnotation: (input: {
    body: string
    context: MessageContext
    recipientHint?: string
    /**
     * WHO THE COMPOSER'S TO CONTROL WAS SET TO, kept exactly as it was chosen.
     *
     * Left out when the comment is only being written down. It is the person's choice and not the
     * address: the server works the address out from it and stores both, so what they picked and what
     * it was taken to mean stay side by side. Criterion M16 and invariant 8 of USER.md.
     */
    chosenRecipient?: { kind: string; sessionId: string | null; said: string | null; why: string | null }
  }) =>
    request<RecordReply>('/api/records', {
      method: 'POST',
      body: json({
        // A COMMENT IS A MESSAGE THAT SAYS WHAT ON A PAGE IT IS ABOUT. Criterion M1.
        // A comment written to nobody carries no recipient,
        // because who a comment should reach is a later and separate question and most comments are
        // written before anybody has thought about it. One written to somebody carries the choice —
        // until 4 September 2026 it did not, and the two comments they sent at Full went to nobody and
        // were then read as addressed to them. Problem `Kyr3b1hr3jjR`. Comments written before this
        // build are records of kind "annotation"; they are kept exactly as they were and are read
        // beside these by GET /api/messages/comments.
        kind: 'message',
        title: annotationTitle(input.body),
        data: {
          body: input.body,
          target: input.context,
          ...(input.recipientHint === undefined ? {} : { recipientHint: input.recipientHint }),
          ...(input.chosenRecipient === undefined ? {} : { chosenRecipient: withoutNulls(input.chosenRecipient) }),
        },
      }),
    }),

  /**
   * CHANGE THE WORDS OF A MESSAGE THIS READER WROTE: a note nobody has been sent yet, at any age, or a sent message
   * while the edit window is open, as point 2 of a decision says. The title follows the words.
   * The record door asks who wrote it and the window, writes the edit mark with the words as first written, and refuses
   * after the window.
   */
  rewriteAnnotation: (id: string, body: string, markedParts?: readonly import('@shared/intent-mark.ts').AMarkedPart[]) =>
    request<RecordPatchReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(markedParts === undefined ? aCommentsNewWords(body) : { ...aCommentsNewWords(body), dataPatch: { body, markedParts } }),
    }),

  /**
   * SAY WHO THIS COMMENT IS FOR, AND STORE IT. `null` unchooses.
   *
   * IT IS A WRITE, AND THAT IS THE POINT OF IT. The choice used to live in React state in the
   * review pane and nowhere else: a person chose agents for two comments, reloaded, and the pane
   * said nobody had been chosen for either — the one thing on that screen that did not survive a
   * reload, and the one thing with no mark saying it was not stored. Now it is a declared field of
   * the comment, `annotation.chosenRecipient`, and the send reads it from there.
   *
   * NOTHING IS SENT BY THIS. Choosing and sending stay two acts. The comment says where it WOULD
   * go, and the line under it is `readDelivery`'s answer about that choice — so a person is told at
   * the moment of choosing that an agent cannot be picked up, rather than at the moment of sending.
   */
  chooseWhoItIsFor: (
    id: string,
    recipient: {
      kind: 'agent' | 'session' | 'new' | 'unresolved'
      agentId?: string | null
      sessionId: string | null
      said: string | null
      why: string | null
    } | null,
  ) =>
    request<RecordPatchReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json({
        dataPatch: {
          // THE KEYS WITH NOTHING IN THEM ARE LEFT OUT RATHER THAN SENT AS null. `GET /api/kinds`
          // says so for every optional string in this product: a blank value renders as a gap that
          // reads as missing data. The whole field is null when nobody is chosen, which is how a
          // patch takes a field away.
          chosenRecipient:
            recipient === null
              ? null
              : {
                  kind: recipient.kind,
                  ...(recipient.agentId === undefined || recipient.agentId === null ? {} : { agentId: recipient.agentId }),
                  ...(recipient.sessionId === null ? {} : { sessionId: recipient.sessionId }),
                  ...(recipient.said === null ? {} : { said: recipient.said }),
                  ...(recipient.why === null ? {} : { why: recipient.why }),
                },
        },
      }),
    }),

  /**
   * CHANGE WHAT MOLE OFFICE MADE OF A COMMENT, or take that reading away. `null` takes it away.
   *
   * IT NEVER TOUCHES `body`. What the person wrote is the record; this writes the one field beside
   * it that holds a reading of those words, which `GET /api/kinds` declares as shown beside them and
   * never instead of them. `POST /api/reviews/<id>/organise` is what puts a reading there in the
   * first place, and its own note names this patch as the way to take one away.
   *
   * WHAT THIS CANNOT DO, AND EVERY SCREEN THAT OFFERS IT HAS TO SAY SO. `interpretation` is one
   * string with no author on it, so a sentence a person wrote here is stored in the same place and
   * the same shape as the one Mole Office kept, and nothing can tell the two apart afterwards. Reading
   * the review again replaces it without saying that it did.
   */
  setInterpretation: (id: string, sentence: string | null) =>
    request<RecordPatchReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json({ dataPatch: { interpretation: sentence } }),
    }),

  /** One remark: which record or plan it is in, which words, and whether they are still there. */
  annotation: (id: string) => request<AnnotationView>(`/api/annotations/${encodeURIComponent(id)}`),

  /**
   * WHETHER EACH OF THESE REMARKS HAS GONE STALE, IN ONE REQUEST.
   *
   * A POST that writes nothing, because the input is a list. The review pane asks it for every row
   * it draws: asking per row is one request per comment, and what goes wrong then is not that it is
   * slow — it is that a list which cannot afford to ask stops asking, and every row draws the quote
   * and nothing else. That was measured on 18 August 2026 with two of seven quotes stale.
   *
   * One entry comes back per id, in the order asked. An id that answers nothing is reported.
   */
  annotationReadings: (ids: readonly string[]) =>
    request<AnnotationReadings>('/api/annotations/readings', { method: 'POST', body: json({ ids: [...ids] }) }),

  /**
   * WHAT THIS RECORD USED TO HOLD, one entry per write, newest first.
   *
   * Two callers, and they want different halves of the same list. The panel a person opens from a
   * record page draws the whole of it. The short-form editor reads only the newest entry, to name
   * the version its words were written from: `seq` and `contentHash` go together and are sent
   * together, because the pair is what the write route checks, and a hash from one entry beside a
   * number from another names a version nobody wrote.
   */
  revisions: (recordId: string) =>
    request<RevisionListing>(`/api/records/${encodeURIComponent(recordId)}/revisions`),

  /**
   * WHAT HAPPENED TO THIS RECORD AND TO THE WORK IT CARRIES. Newest first.
   *
   * NOT `revisions` ABOVE, AND THE DIFFERENCE IS THE SCOPE. `revisions` is this record's own stored
   * versions. This is every stored row about it OR about a block it carries: revisions, change
   * rows, the link and unlink rows filed at it from the other end, and the rows of the
   * implementation map that say which files it claims. A module's claims moving is the case wave
   * ten built this for, and it is invisible in the versions list because no revision was written.
   *
   * IT WAS SERVED AND UNCALLED. The route landed with the wave titled *History a person can find*
   * and nothing under src/web asked for it, so the answer existed for an agent with curl and for
   * nobody with a browser. `WhatHappenedHere` in components/RecordHistory.tsx is what asks now.
   */
  recordHistory: (recordId: string) =>
    request<RecordHistoryReply>(`/api/records/${encodeURIComponent(recordId)}/history`),

  /**
   * SAY WHETHER ONE PIECE OF WORK STILL STANDS, once a restriction has been resolved.
   *
   * KEYED ON THE PAIR AND NOT ON A ROW ID, so a record that became a dependency AFTER the
   * resolution can be judged too — that call makes the row. `note` is REQUIRED for `not_affected`,
   * because that takes somebody else's restriction off this record and a dismissal with no reason
   * is a deletion. The refusal, when there is one, is the server's own sentence.
   */
  /**
   * EVERY RESTRICTION IN THIS PROJECT, whether or not it reaches anything.
   *
   * `?everything=true` on the read that already answers *what may not be claimed here*. It is the
   * fourth answer on that route rather than a fourth route, because it is the same question under a
   * different scope. A restriction with no `about` link reaches nothing and is on this list: it is
   * still a slot somebody deliberately left, and a surface that lost it would quietly exclude the
   * case the kind's own rules call out.
   */
  everyRestriction: () => request<unknown>('/api/restrictions?everything=true'),

  /**
   * WHAT RESTRICTS EACH OF THESE RECORDS, ANSWERED PER RECORD, IN ONE REQUEST.
   *
   * THIS IS WHAT A DRAWING ASKS, AND IT ASKS ABOUT THE CARDS ON SCREEN. Not about the project: a
   * canvas showing 19 of 727 records that read the whole project on every draw would do 700
   * records' work to draw 19 marks, and the wave that asked for this said so in those words.
   *
   * `byRecord` HOLDS A KEY FOR EVERY ID ASKED ABOUT, including the ones nothing reaches. A card
   * with no mark because nothing restricts it and a card with no mark because nobody looked are
   * different facts, and an absent key would make them the same one.
   */
  restrictionsOnThese: (recordIds: readonly string[]) =>
    request<{
      byRecord: Record<string, RestrictionReading[]>
      couldNotCheck: { what: string; because: string }[]
      note: string
    }>(`/api/restrictions?records=${encodeURIComponent(recordIds.join(','))}`),

  /** Every folder an agent has read in this project, with how many pieces still wait for a person. */
  folderReadings: () => request<{ drafts: FolderReading[] }>('/api/import/drafts'),

  /** One folder reading, whole. */
  folderReading: (id: string) => request<unknown>(`/api/import/drafts/${encodeURIComponent(id)}`),

  /**
   * A PERSON ACCEPTS, REJECTS OR UNDOES THE REJECTION OF ONE PIECE. Refused to every agent by the server, which is the whole
   * point of a reading being a draft: nothing an agent read enters the project without this press.
   */
  decideAboutAPiece: (id: string, pieceId: string, body: FolderPieceDecision) =>
    request<FolderPieceReply>(`/api/import/drafts/${encodeURIComponent(id)}/pieces/${encodeURIComponent(pieceId)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * The bundles kept in the projects chosen, with what has actually left the building. Each row
   * names the project it is kept in. Left out, the project the header names, as it always was.
   */
  bundles: (projects?: ProjectChoice) =>
    request<unknown>(projects === undefined ? '/api/bundles' : `/api/bundles?${projectsQuery(projects)}`),

  /**
   * THE MODULES AND PIPELINES OF ONE PROJECT, for the bundle page's control that names which of them
   * go in. The project is the one the copy is about, named in the header, because a copy may only
   * carry the modules and pipelines of its own project.
   */
  /**
   * THE RECORDS OF THE PROJECTS CHOSEN THAT SAY THESE WORDS, best match first, each naming its project:
   * the bundle page's search for the record a copy is about and for the records added to it. It reads
   * GET /api/records with `?q=` and `?projects=`, which searches by the rule GET /api/search reads
   * (src/shared/search.ts), so the two doors cannot disagree about which records say a word.
   */
  recordsSaying: (q: string, projects: ProjectChoice, limit: number) =>
    request<RecordListReply>(
      `/api/records?${new URLSearchParams({ q, shape: 'light', limit: String(limit) }).toString()}&${projectsQuery(projects)}`,
    ),

  bundleStructure: async (workspaceId: string) => {
    const inIt = { headers: { [WORKSPACE_HEADER]: workspaceId } }
    const [modules, pipelines] = await Promise.all([
      request<RecordListReply>('/api/records?kind=module&shape=full', inIt),
      request<RecordListReply>('/api/records?kind=pipeline&shape=full', inIt),
    ])
    return [...modules.records, ...pipelines.records]
  },

  /**
   * FILE A BUNDLE — THE CALL THIS FILE DID NOT HAVE, AND WITHOUT WHICH THE PAGE WAS A READING ONLY.
   *
   * `#/bundles` drew, previewed and copied, and every `Copy it` button on it existed only because
   * somebody had filed the bundle with `curl` first. `design/round-ten/verification/wave-12.json`
   * measured that and called it fatal, against this run's own standard: a feature whose only door
   * is an HTTP client is not built. This is the door.
   *
   * IT IS `POST /api/records` AND NOT A ROUTE OF ITS OWN, because a bundle IS a record — that is
   * the whole of `a bundle adds no table`. Writing a fourth bundle route here would have been a
   * second way to file one, free to disagree with the first about what a bundle may hold.
   *
   * IT NEVER SENDS `exports`, and the type is what says so rather than a comment: the shape below
   * has no key for it. An export is written by the server, at the moment text actually leaves the
   * building, and `assertMayWriteAnExportList` refuses a create that carries one — so a caller that
   * added the key here would be answered 403 rather than quietly believed.
   */
  fileBundle: (input: {
    title: string
    /** The whole project, or one record named by id. */
    scope: 'project' | 'record'
    scopeRecordId?: string
    preset: string
    /** The parts to include. Only with the preset that takes a list; refused beside any other. */
    slots?: readonly string[]
    /** How far from the scope record to reach, in links. Meaningless for a project scope. */
    reach?: number
    /** Which modules and pipelines go in, by id. Left out, the copy carries every one of them. */
    modulesAndPipelines?: readonly string[]
    /** Records somebody named by hand, by id, carried under a part of their own. Left out, none. */
    additionalRecords?: readonly string[]
    /** How detailed each record is, as one position of the ladder. Left out, the whole thing. */
    detail?: string
    /** How far every part moves from the level its share chose, negative for less. B31. */
    shift?: number
  }, workspaceId: string) =>
    // FILED INTO THE PROJECT THE COPY IS ABOUT, named here, never the project the page was opened from.
    request<RecordReply>('/api/records', {
      method: 'POST',
      headers: { [WORKSPACE_HEADER]: workspaceId },
      body: json({
        kind: 'context_bundle',
        title: input.title,
        data: {
          scope: input.scope,
          ...(input.scopeRecordId === undefined ? {} : { scopeRecordId: input.scopeRecordId }),
          preset: input.preset,
          ...(input.slots === undefined ? {} : { slots: [...input.slots] }),
          ...(input.reach === undefined ? {} : { reach: input.reach }),
          ...(input.modulesAndPipelines === undefined
            ? {}
            : { modulesAndPipelines: [...input.modulesAndPipelines] }),
          ...(input.additionalRecords === undefined
            ? {}
            : { additionalRecords: [...input.additionalRecords] }),
          ...(input.detail === undefined ? {} : { detail: input.detail }),
          ...(input.shift === undefined ? {} : { shift: input.shift }),
        },
      }),
    }),

  /**
   * THE TEXT A BUNDLE WOULD PRODUCE RIGHT NOW. Writes nothing and records no export, so pressing
   * this is not evidence that anything left.
   */
  bundlePreview: (query: BundleAsked, workspaceId: string) =>
    request<unknown>(`/api/bundles/preview?${bundleAsked(query)}`, { headers: { [WORKSPACE_HEADER]: workspaceId } }),

  /**
   * THE SAME COPY AS A PAGE OF PLAIN TEXT, as an address rather than as a request. Criterion B29.
   *
   * IT IS AN ADDRESS AND NOT A CALL because the whole point is that the browser opens it: a tab
   * showing text/plain needs no clipboard, and the page can be saved, bookmarked or read on a
   * machine that has no Mole Office. Nothing here fetches it.
   *
   * THE PROJECT IS IN THE ADDRESS. A tab opened from a link sends none of this app's headers, so
   * the door takes the project as a query and refuses without one rather than answering about the
   * default project. `currentWorkspace()` is the project `theProjectARequestNames` gives every call
   * that names none.
   */
  bundleTextAddress: (query: BundleAsked, workspace: string) =>
    theApiUrlFor(`/api/bundles/as-text?workspace=${encodeURIComponent(workspace)}&${bundleAsked(query)}`),

  /**
   * THE SAME PAGE FOR A BUNDLE ALREADY FILED. Criterion B29.
   *
   * NO PROJECT IN THE ADDRESS, on purpose: a bundle is a record and a record knows which project it
   * is in, so the server reads it there instead of trusting a link.
   */
  filedBundleTextAddress: (bundleId: string) =>
    theApiUrlFor(`/api/bundles/${encodeURIComponent(bundleId)}/as-text`),

  /**
   * HAND THIS CONTEXT OVER, and record that it happened. Answers 409 when a validity restriction
   * could not be read for a record in scope — that refusal is the point of the route.
   *
   * THE TEXT ANSWER IS THE PRESS AS IT WAS: the same request, with no `withFiles`, and the same
   * JSON answer. The files answer asks for the zip, and the entry the server wrote is read back so
   * the page can say the export number and the three counts. `kind` tells the two apart and nothing
   * else does, because a zip has no `text` to read and a text answer has no bytes.
   */
  exportBundle: async (bundleId: string, workspaceId: string, withFiles = false): Promise<BundleExportAnswer> => {
    // THE PROJECT THE BUNDLE IS KEPT IN. The door resolves the copy in the project the header names,
    // so a bundle kept in another project than the page's is read in its own project.
    const headers = { 'content-type': 'application/json', [WORKSPACE_HEADER]: workspaceId }
    if (!withFiles) {
      const answer = await request<{ text: string; export: { n: number } }>('/api/bundles/export', {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId }),
      })
      return { kind: 'text', ...answer }
    }
    const answer = await request<TheBytesThatAnswered>(
      '/api/bundles/export',
      { method: 'POST', headers, body: JSON.stringify({ bundleId, withFiles: true }) },
      'bytes',
    )
    const entry = await theExportEntryJustWritten(bundleId, workspaceId)
    return { kind: 'zip', bytes: answer.bytes, ...entry }
  },

  judgeRestriction: (restrictionId: string, recordId: string, body: { state: 'checked' | 'not_affected' | 'needs_review'; note: string | null }) =>
    request<JudgementReply>(
      `/api/revalidations/${encodeURIComponent(restrictionId)}/${encodeURIComponent(recordId)}`,
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    ),

  /**
   * ONE VERSION, WHOLE, AS THE RECORD WAS: its kind, title, summary, `data` and delete stamp.
   *
   * It carries only what a version stores. When the record was created, who owns it and which
   * project it is in are not kept per version, so they are absent here rather than filled in from
   * today — which would be showing a value from now as a value from then.
   */
  revision: (recordId: string, seq: number) =>
    request<OneRevision>(`/api/records/${encodeURIComponent(recordId)}/revisions/${String(seq)}`),

  /**
   * WHAT IS DIFFERENT BETWEEN TWO VERSIONS OF ONE RECORD, as field paths with what each went from
   * and to.
   *
   * `before` is the first number and `after` is the second, in the order asked, and the server
   * never swaps them: comparing backwards is a real question — *what would putting this one back
   * undo?* — and it is the question the panel asks when somebody presses a version older than the
   * one on screen.
   *
   * THE COMPARISON IS MADE ON THE SERVER, by the same reader the change log uses. The browser draws
   * the answer and never works one out, so a record's history and its change log cannot end up
   * disagreeing about which field moved.
   */
  compareRevisions: (recordId: string, seq: number, otherSeq: number) =>
    request<RevisionComparison>(
      `/api/records/${encodeURIComponent(recordId)}/revisions/${String(seq)}/compare/${String(otherSeq)}`,
    ),

  /**
   * PUT BACK WHAT THIS RECORD HELD AT ONE VERSION, by writing that content forward as a new one.
   *
   * NOTHING IS REMOVED AND NOTHING IS REWRITTEN. The version being put back stays where it is, and
   * so does everything after it; the count only ever goes up. A put-back that changes nothing
   * writes nothing at all, and the reply says so with `newSeq` null.
   *
   * NOT `restoreRecord` BELOW, WHICH IS A DIFFERENT ACT. That one is the undelete —
   * `POST /api/records/:id/restore` — and it takes a soft-deleted record out of the bin. This one
   * is `POST /api/records/:id/revisions/:seq/restore` and it is about content. The two routes have
   * been confused by their names before, so they are named apart here.
   */
  putRevisionBack: (recordId: string, seq: number, said?: { note?: string; ifVersion?: string }) =>
    request<RestoredRevision>(
      `/api/records/${encodeURIComponent(recordId)}/revisions/${String(seq)}/restore`,
      { method: 'POST', body: json(said ?? {}) },
    ),

  /**
   * TAKE BACK SOMETHING AN AGENT DID ON YOUR OWN WORDS.
   *
   * ONE PRESS, AND NOTHING IS LOST. The record goes back to what it held before the act — or, for a
   * promotion, the decision it filed is retracted and the fork is open again. The act itself stays
   * in the ledger with your words on it, and the undo is a new version naming what it took back.
   *
   * NOT `putRevisionBack` ABOVE. That one is somebody putting an earlier version back for any
   * reason at all. This is you saying an agent read your words wrongly, and the two are told apart
   * everywhere: the route, the guard, the ledger and this list.
   */
  revokeAct: (recordId: string, seq: number) =>
    request<RevokedAct & { onThePersonsWords: ActOnTheirWords[] }>(
      `/api/records/${encodeURIComponent(recordId)}/revisions/${String(seq)}/revoke`,
      { method: 'POST' },
    ),
}
