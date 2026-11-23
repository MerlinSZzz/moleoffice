// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH OFFICE COPIES THE TEN GENERAL OFFICE FLOWS INTO ITS OWN FLOW RECORDS, ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A new office holds no office flow at all: the Flows page has nothing to show, and an agent
 * entering a flow has nothing to enter. By a decision, a fresh office copies the general office
 * flows into its own flow records at its first run. The set is src/config/default-flows.json: the
 * words of the office's own ten flows, written for any office, with the words true only of the
 * office they came from left out.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY AN OFFICE THAT HAS NEVER HELD A FLOW
 * ---------------------------------------------------------------------------------------
 *
 * The copy runs at every start. It reads whether the office has ever held a flow record: in every
 * project, deleted ones included, because Mole Office never really deletes a record. If it never
 * has, it files the ten in one transaction; otherwise it writes nothing. So:
 *   - a fresh office gets the ten at its first start;
 *   - an existing office that never held a flow gets them at its next start, which is the case of
 *     the person who had no flows at all;
 *   - an office that holds or ever held a flow is not changed, and a deleted flow does not come
 *     back;
 *   - a second start finds a flow held and writes nothing.
 *
 * The flows go into the project a fresh office's default chapters go to (`theProjectOfTheChapters`
 * in chapter-rows.ts), or into `default` when it holds no chapter. All of it is one transaction:
 * the office gets every flow, or none.
 *
 * ---------------------------------------------------------------------------------------
 * THE WRITES AND THE WORDS
 * ---------------------------------------------------------------------------------------
 *
 * Each record's `declared_in` says it was copied from the default flows at the office's first
 * start. The writes are the office's own (`system`, with its live row's id), so each flow's history
 * says who wrote it.
 *
 * The copied stages carry what they do and, where the source had it, their evidence. They carry no
 * `why` or `sources`: those are the source office's second-level words, and every source is a
 * record id of that office, which the copied text may not carry. The flow kind's step check asks
 * for both on a create, so the copy runs under `asTheOfficesCopyOfTheDefaults`, the same guard the
 * default chapters use. That guard lets the step check through for this one write and no other;
 * the kind's shape check and `applies_to` check still read every record.
 *
 * The start prints one line either way, which the server's log keeps.
 */
import { eq, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { asTheOfficesCopyOfTheDefaults, createRecord, type Actor } from './records.ts'
import { theProjectOfTheChapters } from './chapter-rows.ts'
import { moleOffice } from '@shared/participants.ts'
import { FLOW_KIND } from '@shared/flow.ts'
import defaultFlows from '../../config/default-flows.json' with { type: 'json' }

/** The file the start names in its line. */
export const THE_DEFAULT_FLOWS_FILE = 'src/config/default-flows.json'

/** One stage of a default flow, as the shipped file holds it. */
export interface DefaultFlowStage {
  n: number
  does: string
  evidence?: string
}

/** One default flow, as the shipped file holds it. */
export interface DefaultFlow {
  title: string
  declared_in: string
  runs: string
  trigger: string
  stages: DefaultFlowStage[]
  leaves_behind: string
  applies_to: { scope: string; roles: string[]; rung?: number; project?: string }
  starts_on?: string[]
}

/** What one start did, in words. */
export interface WhatTheFlowsCopyDid {
  /** How many flow records it wrote, or zero when none was copied. */
  copied: number
  /** The line the start prints. */
  line: string
}

function theOffice(): Actor {
  return { type: 'system', id: moleOffice().id }
}

/** How many flow records this office has ever held, in any project, deleted ones included. */
export function flowRecordsEverHeld(): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(records).where(eq(records.kind, FLOW_KIND)).get()
  return row?.n ?? 0
}

/**
 * COPY INTO THIS OFFICE THE DEFAULT FLOWS, when it has never held a flow. Called once by every start
 * (src/server/index.ts), after the database is migrated and before anything is served.
 */
export function copyTheDefaultFlowsOnce(): WhatTheFlowsCopyDid {
  const held = flowRecordsEverHeld()
  if (held > 0) return { copied: 0, line: theLineOfTheFlowsCopy({ held, copied: [], project: '' }) }
  const project = theProjectOfTheChapters()
  const flows = defaultFlows.flows as DefaultFlow[]
  // THE OFFICE'S OWN COPY NEEDS NO REASONS OR SOURCES ON ITS STAGES, so it is the one flow write the
  // step check lets through without them (`asTheOfficesCopyOfTheDefaults` in lib/records/served-doors.ts).
  asTheOfficesCopyOfTheDefaults(() =>
    sqlite.transaction(() => {
      for (const flow of flows) copyOneFlow(flow, project)
    })(),
  )
  return { copied: flows.length, line: theLineOfTheFlowsCopy({ held, copied: flows.map((flow) => flow.title), project }) }
}

/**
 * THE LINE A START PRINTS ABOUT THE COPY, from how many flow records the office had ever held before it,
 * the titles it copied, and the project it copied them into. The tests read it from here.
 */
export function theLineOfTheFlowsCopy(copy: { held: number; copied: readonly string[]; project: string }): string {
  const { held, copied, project } = copy
  if (copied.length === 0) {
    return `The default flows were not copied: this office already holds ${String(held)} flow record${held === 1 ? '' : 's'}, deleted ones counted.`
  }
  if (held === 0) {
    return `This office held no flow record, so the ${String(copied.length)} general office flows of the default set (${THE_DEFAULT_FLOWS_FILE}) were copied into its "${project}" project.`
  }
  const one = copied.length === 1
  return `This office held ${String(held)} flow record${held === 1 ? '' : 's'}, so ${one ? 'one flow was' : `${String(copied.length)} flows were`} copied into its "${project}" project.`
}

/** One flow, filed as the office's own write. */
function copyOneFlow(flow: DefaultFlow, project: string): void {
  createRecord({
    kind: FLOW_KIND,
    title: flow.title,
    workspaceId: project,
    actor: theOffice(),
    data: {
      declared_in: flow.declared_in,
      runs: flow.runs,
      trigger: flow.trigger,
      stages: flow.stages.map(({ n, does, evidence }) => ({ n, does, ...(evidence === undefined ? {} : { evidence }) })),
      leaves_behind: flow.leaves_behind,
      applies_to: flow.applies_to,
      ...(flow.starts_on === undefined ? {} : { starts_on: flow.starts_on }),
    },
  })
}
