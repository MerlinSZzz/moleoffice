// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP RUN'S RECORDS IN FORM, FOR A TEST THAT SEALS THE RUN BY ITS OWN KEY AND IS NOT ABOUT FORM.
 *
 * A fault of form in the records a seal answers for is listed before the seal and never refused by the hard gate
 * (tests/a-fault-of-form-is-listed-not-refused.test.ts). A test whose claim is something else gives its run what a round
 * in form has, from here: a report linked about the run and about a page, and a label on each record the seal carries.
 * So the reminder names no fault of form, what the test proves is still its own claim, and the shape of a report in
 * form is written in one place.
 *
 * Each function is called after `freshDb`, which resets the modules, so each reads the office's modules when it runs.
 */
import { readFileSync } from 'node:fs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TestDb } from './helpers.ts'

const THE_PERSONS_ACTOR = { type: 'human' as const, id: THE_PERSON }

/** Every chapter the office declares, which is every chapter a run has to read. */
export const EVERY_CHAPTER = (JSON.parse(readFileSync(new URL('../src/config/roles.json', import.meta.url), 'utf8')) as { chapters: { number: number }[] }).chapters.map((one) => one.number)

/** A label written from the record's newest revision, as the short-forms door writes one, in the record's workspace. */
export async function aLabelFor(id: string, workspace = 'default'): Promise<void> {
  const { listRevisions } = await import('../src/server/lib/revisions.ts')
  const { writeShortForms } = await import('../src/server/lib/zoom.ts')
  const newest = listRevisions(id).revisions[0]
  if (newest === undefined) throw new Error(`record ${id} has no revision to write a short form from`)
  writeShortForms(id, workspace, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Made-up record' } }, THE_PERSONS_ACTOR)
}

let reportsFiled = 0

const thePages = new WeakMap<TestDb, Map<string, string>>()

/**
 * THE ONE MADE-UP MODULE EACH OFFICE'S REPORTS IN FORM ARE ABOUT, in each workspace, filed at the first report that asks
 * for it. A run's finish holds a report it filed that is about no page and has no nothingFits entry. One record, so a
 * test that counts what the office holds sees one more and no more. A test that files its report in form by hand links
 * it about this page.
 */
export function thePageOf(t: TestDb, workspaceId = 'default'): string {
  const pages = thePages.get(t) ?? new Map<string, string>()
  thePages.set(t, pages)
  const known = pages.get(workspaceId)
  if (known !== undefined) return known
  const title = 'Synthetic module the reports in form are about'
  const id = t.api.createRecord({ workspaceId, kind: 'module', title, origin: 'fixture', data: {}, actor: THE_PERSONS_ACTOR }).id
  pages.set(workspaceId, id)
  return id
}

/**
 * A report in form, as a round files its own: filed by the run's agent in the run's session and workspace, complete,
 * listing every chapter, saying the audit table is left for the merge queue, linked about the run and about a page,
 * and with its label. Each title is its own, so no report copies another's. Answers the report's id.
 */
export async function aReportInForm(t: TestDb, run: string, agent: string): Promise<string> {
  const workspaceId = t.api.getRecord(run)?.workspaceId
  if (workspaceId === undefined) throw new Error(`no run ${run} to file a report about`)
  reportsFiled += 1
  const id = t.api.createRecord({
    workspaceId,
    kind: 'report',
    title: `Synthetic report number ${String(reportsFiled)} of a run in form`,
    data: {
      for: 'The supervisor of the made-up run',
      date: '2026-11-09',
      chaptersRead: EVERY_CHAPTER,
      blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report of a made-up run. The audit table is left for the merge queue.' }],
    },
    actor: { type: 'agent', id: agent, sessionId: run },
  }).id
  t.api.createLink({ fromId: id, toId: run, type: 'about', actor: THE_PERSONS_ACTOR })
  t.api.createLink({ fromId: id, toId: thePageOf(t, workspaceId), type: 'about', actor: THE_PERSONS_ACTOR })
  await aLabelFor(id, workspaceId)
  return id
}
