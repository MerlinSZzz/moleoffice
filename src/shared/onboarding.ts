// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE SMALL READS A NEW AGENT MAKES AT THE START, AND THE ONE PLACE THEY SHARE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/onboarding` is the read a new agent makes first: the doors it will knock on, one
 * sentence each, and which project it should work in. Three facts it needs are worked out here
 * rather than in three places:
 *
 *   `ONBOARDING_DOORS`   which routes are named as doors, so the reply cannot carry a hand-written
 *                        second copy of a route's own sentence. The sentence carried is the one
 *                        the route declared for `GET /api`, taken whole or cut to its first
 *                        sentence.
 *   `compactKindOf`      the cheap form of one kind's field spec — every field's type under its
 *                        key and the keys the kind requires, and no prose — generated from the
 *                        same `KindSpec` the full read is generated
 *                        from. Two reads of one declaration cannot disagree; a cheap read written
 *                        out by hand would.
 *   `directoryMatches`   which project a working directory belongs to, from the repositories and
 *                        work areas registered to each project. The registration door in the
 *                        worktree beside this one needs the same answer, and one fact is worked
 *                        out in one place.
 *
 * NOTHING HERE REACHES A DATABASE OR THE FILE SYSTEM. `src/shared` is loaded by the browser as
 * well as the server, so the matching works on strings: the server resolves a path and gathers
 * the registered directories, and this file decides which of them holds the path.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DOORS COME FROM THE ROUTE TABLE AND NEVER FROM A LIST OF SENTENCES
 * ---------------------------------------------------------------------------------------
 *
 * A second sentence about a route drifts from the route. The route already carries one — the line
 * `GET /api` serves for it — so the onboarding read takes that line and cuts it to its first
 * sentence. A door named here that the server does not serve would be a promise nobody keeps, so
 * the handler refuses to answer rather than quietly leave it out; `tests/onboarding-read.test.ts`
 * walks the live route table and holds the same thing.
 */

/**
 * WHERE A RETURNING AGENT READS WHERE THE PROJECT IS NOW, AND THE ONE PLACE THAT SAYS SO. Problem
 * `NSOa-cFZLg66`.
 *
 * Three hand-written places each said they were the first thing to read after a restart, and they
 * disagreed about which round the project was in. The first read is `GET /api/project/bootstrap`,
 * chosen on three pieces of evidence: CLAUDE.md already starts there; its `now` section is worked
 * out from the records each time it is asked, so it cannot fall behind the way a hand-written note
 * can; and the other office reads answer narrower questions (this one the doors and the project,
 * `GET /api/brief` what to work on). Item 3 of a decision lets a wave choose this way.
 *
 * The onboarding reply carries this so that the session hook's own next step, which is this read,
 * leads to the first read rather than standing beside it.
 */
export const THE_FIRST_READ = {
  ask: 'GET /api/project/bootstrap',
  says:
    'Read GET /api/project/bootstrap first for where the project is now. It is worked out from the records each ' +
    'time it is asked. This reply names only the doors and the project.',
} as const

/** The size `GET /api/onboarding` aims to fit in, in estimated tokens. The owner's ceiling for the start. */
export const ONBOARDING_TOKEN_BUDGET = 3000

/**
 * THE DOORS A NEW AGENT ACTUALLY USES, as `METHOD /path`, in the order it meets them.
 *
 * The route is the whole declaration: the sentence served for it comes from the route table, and
 * naming a route here that the server does not serve is a fault the handler refuses to hide.
 */
export const ONBOARDING_DOORS: readonly string[] = [
  // THE MIDDLE LEVEL, BEFORE THE FULL CATALOGUE. When the door an agent wants is not one of these,
  // GET /api/families is one line per family and GET /api/families/<name> opens one, which is
  // cheap where GET /api with a line for all 370 doors is not. It is a read of the catalogue, so it
  // costs a few hundred bytes and replaces reading the whole list to find one door.
  'GET /api/families',
  // WHAT TO READ FOR SHAPES, before the first write. The compact form is the cheap one; the full
  // form carries the nested shapes the compact form leaves out.
  'GET /api/kinds',
  'GET /api/kinds/:kind/compact',
  'GET /api/kinds/:kind',
  // WHICH PROJECT THE REQUESTS WILL BE ABOUT.
  'GET /api/workspaces',
  // THE WRITE A NEW AGENT MAKES: its own agent record, then its session record, then its work.
  'POST /api/records',
  // FIND AND READ WHAT IS ALREADY FILED.
  'GET /api/records',
  'GET /api/records/:id',
  // CHANGE PART OF ONE RECORD, leaving every other field alone.
  'PATCH /api/records/:id',
  // CONNECT TWO RECORDS THAT ALREADY EXIST.
  'POST /api/links',
  // ITS OWN CARD, WHAT IT MAY DO, AND WHAT IT FILED LATELY.
  'GET /api/participants/:kind/:id/profile',
  // WHAT IT WAS DOING, RESTORED BY WHO IT IS. F15 point 4: the card, the project, the open work it
  // filed, the last session that ran as it, and what changed since. Keyed by the agent's own key, or
  // by a handle with no key.
  'GET /api/restore',
  // THE STATE OF THE PROJECT: what is true of it, what to work on, and where the packaged work is.
  'GET /api/project/bootstrap',
  'GET /api/brief',
  // WHERE A NEW AGENT FINDS ITS FIRST TASK: the packaged tasks, newest first. Criterion F16 point 2:
  // the onboarding read points a new agent at the column as the place its first task is. The sentence
  // served for the door is the route's own, never a second copy written here.
  'GET /api/delegation',
  // THE TOOLS THERE ARE, BEFORE A JOB IS DONE BY HAND: the toolset catalogue, by category, with who
  // each tool is for and whether it is built yet (piece P1 of plan KP0udNekYcAo).
  'GET /api/toolset',
  // THE RULES THEMSELVES, read from this project's own records.
  'GET /api/office-regulations',
]

/**
 * WHAT THE READ DROPS WHEN IT IS OVER BUDGET, IN ORDER, AND WHERE EACH THING COMES BACK FROM.
 *
 * Declared once so `leftOut` cannot announce a rung the handler does not drop, and so the order is
 * a decision somebody made rather than whatever the code happened to do. The doors' routes are the
 * last thing to go: an arriving agent without them has nothing to read.
 */
export const ONBOARDING_LADDER: readonly { rung: string; what: string; ask: string }[] = [
  {
    rung: 'door-sentences',
    what: 'the one sentence describing each door, leaving the route name and nothing else',
    ask: 'GET /api',
  },
  {
    rung: 'project-because',
    what: 'the sentence saying how this project was worked out, leaving which project it is',
    ask: 'GET /api/onboarding?directory=<your working directory>',
  },
]

/**
 * ONE SENTENCE OUT OF A ROUTE'S OWN DESCRIPTION. The first sentence when there is one, the whole
 * line when there is not. It is a cut and not a paraphrase: a second sentence about a route is a
 * second thing that can disagree with the route.
 */
export function firstSentenceOf(text: string): string {
  const trimmed = text.trim()
  const match = /^(.*?[.!?])(?:\s|$)/.exec(trimmed)
  return match === null ? trimmed : match[1] ?? trimmed
}

/**
 * One kind, cheaply: the keys of the fields it needs, and every field's type under the field's key.
 * A field is not a list entry of its own, so each one costs its key and its type and nothing more.
 */
export interface CompactKind {
  kind: string
  required: string[]
  fields: Record<string, string>
}

/**
 * THE COMPACT FORM OF ONE KIND, GENERATED FROM THE DECLARATION THE FULL READ USES.
 *
 * A `KindSpec` holds the prose, the example and the rules, and the full read serves all of it. It
 * also holds the three mechanical facts a caller needs before a write. This takes those three and
 * nothing else, so the cheap read and the true read cannot disagree about a field. Every field
 * keeps its type, the fields only a door writes as well. tests/onboarding-read.test.ts holds the
 * read of `session`, the largest kind, to a thousand estimated tokens; the full read of the same
 * kind costs many times that.
 */
export function compactKindOf(spec: {
  kind: string
  fields: readonly { key: string; type: string; required: boolean }[]
}): CompactKind {
  return {
    kind: spec.kind,
    required: spec.fields.filter((field) => field.required).map((field) => field.key),
    fields: Object.fromEntries(spec.fields.map((field) => [field.key, field.type])),
  }
}

// ------------------------------------------------------------------ which project a directory is

/** One repository registered to a project, as the matcher needs it: a name and an absolute root. */
export interface RegisteredRepository {
  name: string
  root: string | null
}

/** One registered work area, already resolved to an absolute directory on this machine. */
export interface RegisteredWorkArea {
  name: string
  path: string
}

/** One project's directories: where its code lives, and where its agents registered work. */
export interface RegisteredProject {
  workspaceId: string
  repositories: readonly RegisteredRepository[]
  workAreas: readonly RegisteredWorkArea[]
}

/** Why a directory belongs to a project, and which directory it matched. */
export interface DirectoryMatch {
  workspaceId: string
  /** `a repository root` or `a registered work area`, in words a person reads. */
  because: string
  /** The repository name or the agent handle the work area belongs to. */
  name: string
  /** The registered directory that holds the working directory. */
  matchedPath: string
}

/** A path with its trailing slashes gone, so `/a/b/` and `/a/b` are one directory. */
export function normaliseDirectory(directory: string): string {
  const trimmed = directory.trim()
  if (trimmed === '/') return '/'
  const cut = trimmed.replace(/\/+$/, '')
  return cut === '' ? '/' : cut
}

/** Whether `inside` is `holding` or sits under it, on whole path segments. */
export function directoryHolds(holding: string, inside: string): boolean {
  if (holding === inside) return true
  if (holding === '/') return inside.startsWith('/')
  return inside.startsWith(`${holding}/`)
}

/**
 * EVERY PROJECT WHOSE REGISTERED DIRECTORIES HOLD THE WORKING DIRECTORY, deepest match first.
 *
 * A repository root and a work area are both directories a project has registered. The match is on
 * whole path segments: `/work/one` is inside `/work` and `/work/one` is not inside `/work/on`.
 * The deepest match is the most specific fact, so it comes first; the caller can tell a single
 * answer from a tie, and says which project when there is one and asks when there is not.
 */
export function directoryMatches(
  directory: string,
  projects: readonly RegisteredProject[],
): DirectoryMatch[] {
  const target = normaliseDirectory(directory)
  const matches: DirectoryMatch[] = []
  for (const project of projects) {
    for (const repository of project.repositories) {
      if (repository.root === null) continue
      const root = normaliseDirectory(repository.root)
      if (directoryHolds(root, target)) {
        matches.push({
          workspaceId: project.workspaceId,
          because: 'a repository root',
          name: repository.name,
          matchedPath: root,
        })
      }
    }
    for (const area of project.workAreas) {
      const path = normaliseDirectory(area.path)
      if (directoryHolds(path, target)) {
        matches.push({
          workspaceId: project.workspaceId,
          because: 'a registered work area',
          name: area.name,
          matchedPath: path,
        })
      }
    }
  }
  return matches.sort((a, b) => b.matchedPath.length - a.matchedPath.length)
}
