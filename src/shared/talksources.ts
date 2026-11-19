// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATIONS PAGE'S LIST OF WORK TO TALK ABOUT, WORKED OUT IN ONE PLACE FOR THE SERVER AND THE PAGE.
 *
 * The list under the conversations draws the five most recently changed pieces of work, how many match the search, and
 * what it left out by kind. It used to read every record of the project in the narrow shape to work that out in the
 * browser: 7.2 MB on an office of the live size. `GET /api/records/work-to-talk-about` now works it out on the server
 * with the function below and sends the five rows and the counts. A test can call the same function on a list of
 * records, so the two cannot disagree.
 */
/** How many pieces of work are offered to talk about. The rest are found with the search, or on the records page. */
export const TALK_SOURCES_SHOWN = 5

/**
 * THE KINDS THIS LIST LEAVES OUT, AND WHY THEY ARE NAMED RATHER THAN RANKED AWAY.
 *
 * A session record is an agent run. The panel above this list says *Work you can talk about* and the
 * page says *Point at a piece of work*, and a run is neither: it is the thing that does work.
 *
 * IT MATTERS BECAUSE PHASE 10'S OWN PRESCRIBED ACTION FILLS THE CORPUS WITH THEM. Pressing "Look for
 * runs on this computer" on the sessions page files one record per run found. Measured on the
 * owner's corpus on 19 August 2026: 41 new session records in one press, after which all twelve rows
 * here were agent runs and not one was work — "hi", "questionsforreports", "claude-code 40ba1ab7".
 * The heading was still promising work.
 *
 * WHAT WAS LEFT OUT, AND HOW MANY, IS SAID UNDER THE LIST, in both modes: agent runs (session), their
 * flow runs (flow_run, which the office files beside every run), tools (tool) and tool groups
 * (tool_category), each counted. A project holding only these is told it holds
 * no work yet, only those, and never that it holds no records (problem iAoIUjk2YwBh). Filtering
 * quietly would make a corpus of forty-one runs and four records look like a corpus of four.
 */
export const NON_WORK_RECORD_KINDS = ['session', 'flow_run', 'tool', 'tool_category'] as const

export type NonWorkKind = (typeof NON_WORK_RECORD_KINDS)[number]

const NON_WORK = new Set<string>(NON_WORK_RECORD_KINDS)

/** What `GET /api/records/work-to-talk-about` answers. */
export interface WorkToTalkAbout<Row> {
  /** The search as it was read: trimmed and in lower case. Empty when there was none. */
  query: string
  /** The first `TALK_SOURCES_SHOWN` pieces of work whose title holds the search, most recently changed first. */
  rows: Row[]
  /** How many pieces of work hold the search in their title, of which `rows` are the first. */
  matched: number
  /** How many records of each left-out kind the project holds, whatever the search. */
  leftOut: Record<NonWorkKind, number>
}

/** The list from a project's records and a search as a person typed it. The server calls this; so does a test. */
export function workToTalkAbout<Row extends { kind: string; title: string; updatedAt: string }>(records: readonly Row[], search: string): WorkToTalkAbout<Row> {
  const leftOut = Object.fromEntries(NON_WORK_RECORD_KINDS.map((kind) => [kind, 0])) as Record<NonWorkKind, number>
  const query = search.trim().toLocaleLowerCase()
  const matching: Row[] = []
  for (const record of records) {
    if (NON_WORK.has(record.kind)) {
      leftOut[record.kind as NonWorkKind] += 1
      continue
    }
    if (query === '' || record.title.toLocaleLowerCase().includes(query)) matching.push(record)
  }
  matching.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { query, rows: matching.slice(0, TALK_SOURCES_SHOWN), matched: matching.length, leftOut }
}
