// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT NAMES THE PAGE IT IS ABOUT, OR SAYS NO PAGE FITS: HELD AT THE RUN'S FINISH, LISTED AT NIGHT, NEVER REFUSED.
 *
 * What is proved, against a test office of its own:
 *   1. Pure: a report the run filed that is linked about no page and holds no nothingFits entry is named as a certain
 *      item, a fault of form, in the words `whatAReportAboutNoPageIsTold` gives. One linked about a page, one with an
 *      entry, and one whose links were not read are not named.
 *   2. The facts the finish reads say, for each report the run filed, whether it is linked about a live page and
 *      whether it holds a nothingFits entry. A link to a deleted page is not one.
 *   3. A report linked about nothing is written at the record door: it is held at the finish, never refused here.
 *   4. The nightly governs check lists the live reports filed outside a run that name no page and say no page fits
 *      them. A report filed in a run, one about a page and one with an entry are not listed, and a report with no
 *      create row is counted apart as not known. With only reports listed, the secretary is still sent the message.
 *
 * The end-to-end finish of a run over such a report is case 1, R11, of tests/a-fault-of-form-is-listed-not-refused.test.ts.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const reminderSetting = process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES

beforeAll(async () => {
  t = await freshDb()
  ;(await import('../src/server/lib/roles.ts')).readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

afterEach(() => {
  if (reminderSetting === undefined) delete process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES
  else process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = reminderSetting
})

function aReport(workspaceId: string, title: string, data: Record<string, unknown> = {}): string {
  return t.api.createRecord({ kind: 'report', title, workspaceId, data: { blocks: [{ id: 'b-1', type: 'text', text: title }], ...data }, actor: t.api.HUMAN }).id
}

function aModule(workspaceId: string, title: string): string {
  return t.api.createRecord({ kind: 'module', title, workspaceId, data: { context: 'made up' }, actor: t.api.HUMAN }).id
}

const about = (from: string, to: string): void => {
  t.api.createLink({ fromId: from, toId: to, type: 'about', actor: t.api.HUMAN })
}

/** Filed in this run, as the finish reads it: the create row of the change log carries the run. */
function filedIn(run: string, ...ids: string[]): void {
  for (const id of ids) t.client.sqlite.prepare("UPDATE changes SET session_id = ? WHERE record_id = ? AND op = 'create'").run(run, id)
}

const A_NOTHING_FITS_ENTRY = { nothingFits: [{ missing: 'flow', what: 'the order the kiln is fired in' }] }

describe('a report names what it is about, at the finish', () => {
  it('1: pure, the finish names a report about no page with no entry, and only that one', async () => {
    const rules = await import('../src/server/lib/before-the-seal-rules.ts')
    const facts = (reportsFiled: NonNullable<import('../src/server/lib/before-the-seal-rules.ts').TheFactsBeforeTheSeal['reportsFiled']>) => ({
      runTitle: 'Round 1',
      testRuns: [],
      git: { commits: [], existedAtTheForkBase: () => false },
      reports: [],
      sameTitleElsewhere: {},
      mustRead: [],
      checkAlso: [],
      reportsFiled,
    })
    const named = rules.whatAnInspectorWouldMostLikelyRefuse(facts([
      { id: 'R1', aboutARun: true, aboutAPage: false, namesNothingFits: false },
      { id: 'R2', aboutARun: true, aboutAPage: true, namesNothingFits: false },
      { id: 'R3', aboutARun: true, aboutAPage: false, namesNothingFits: true },
      { id: 'R4', aboutARun: true },
    ])).items.filter((one) => one.key.endsWith(':about-a-page'))
    expect(named).toEqual([{ key: 'report:R1:about-a-page', about: 'report', says: rules.whatAReportAboutNoPageIsTold('R1'), mechanical: true }])
    expect(rules.theRuleAFaultOfFormBreaks(named[0]!)).toBe(rules.THE_FAULTS_OF_FORM['report:about-a-page'])
    expect(rules.theRuleAFaultOfFormBreaks(named[0]!)).not.toBeNull()
    // The case reads R5's own items: a report about neither is named twice, once for each.
    const both = rules.whatAnInspectorWouldMostLikelyRefuse(facts([{ id: 'R5', aboutARun: false, aboutAPage: false, namesNothingFits: false }])).items
    expect(both.filter((one) => one.key.startsWith('report:R5:')).map((one) => one.key)).toEqual(['report:R5:about-a-run', 'report:R5:about-a-page'])
  })

  it('2: the finish facts read a live page, a nothingFits entry and a deleted page for each report the run filed', async () => {
    const { theFactsBeforeTheSealOf } = await import('../src/server/lib/before-the-seal.ts')
    const run = t.api.createRecord({ kind: 'session', title: 'A run that filed four reports', workspaceId: 'default', data: { state: 'running', doing: 'made-up work' }, actor: t.api.HUMAN }).id
    const live = aModule('default', 'Test: the kiln module')
    const gone = aModule('default', 'Test: a module that was deleted')
    const onAPage = aReport('default', 'Test: about the kiln module')
    const withAnEntry = aReport('default', 'Test: no page fits', A_NOTHING_FITS_ENTRY)
    const onADeletedPage = aReport('default', 'Test: about a deleted module')
    const onNothing = aReport('default', 'Test: about nothing')
    for (const id of [onAPage, withAnEntry, onADeletedPage, onNothing]) about(id, run)
    about(onAPage, live)
    about(onADeletedPage, gone)
    t.api.deleteRecord(gone, t.api.HUMAN)
    filedIn(run, onAPage, withAnEntry, onADeletedPage, onNothing)

    const read = theFactsBeforeTheSealOf(t.api.getRecord(run)!, { couldNotRead: 'Git is not part of this test' })
    expect(read.reportsFiled).toEqual([
      { id: onAPage, aboutARun: true, aboutAPage: true, namesNothingFits: false },
      { id: withAnEntry, aboutARun: true, aboutAPage: false, namesNothingFits: true },
      { id: onADeletedPage, aboutARun: true, aboutAPage: false, namesNothingFits: false },
      { id: onNothing, aboutARun: true, aboutAPage: false, namesNothingFits: false },
    ])
  })

  it('3: a report linked about nothing is written at the record door', async () => {
    const { THE_PERSON } = await import('../src/shared/person.ts')
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      payload: { kind: 'report', title: 'Test: a report about nothing at all', data: { blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
    expect(reply.json().whatItNames).toBeUndefined()
  })

  it('4: the nightly check lists reports filed outside a run that name no page, and only those', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    const governs = await import('../src/server/lib/governs.ts')
    const ws = 'reports-at-night'
    createWorkspace({ id: ws, title: 'Test project of the nightly reports' })
    const run = t.api.createRecord({ kind: 'session', title: 'A run that files a report', workspaceId: ws, data: { state: 'running' }, actor: t.api.HUMAN }).id
    const module = aModule(ws, 'Test: the kiln module')
    const outside = aReport(ws, 'Test: filed outside a run, about nothing')
    const inARun = aReport(ws, 'Test: filed in a run, about nothing')
    filedIn(run, inARun)
    const onAPage = aReport(ws, 'Test: filed outside a run, about the kiln module')
    about(onAPage, module)
    aReport(ws, 'Test: filed outside a run, no page fits', A_NOTHING_FITS_ENTRY)

    const check = governs.theGovernsCheck(ws)
    expect(check.reportsNamingNothing.map((one) => one.id)).toEqual([outside])
    expect(check.nothingInGoverns).toEqual([])

    // A report with no create row: whether a run filed it is not known, so it is not listed, and the check says so.
    const unplaced = aReport(ws, 'Test: a report with no create row')
    t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(unplaced)
    const after = governs.theGovernsCheck(ws)
    expect(after.reportsNamingNothing.map((one) => one.id)).toEqual([outside])
    expect(after.notCompared).toHaveLength(check.notCompared.length + 1)

    // With only reports listed, the night is not one with nothing to say, and the secretary is sent the message.
    const night = new Date(2026, 9, 5, 3, 5)
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
    expect(governs.sendTheGovernsCheck(ws, night, t.api.HUMAN)).not.toContain(governs.NOTHING_FOR_THE_NIGHTLY_REMINDER)
    const { THE_PERSON } = await import('../src/shared/person.ts')
    const started = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': ws, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      payload: { handle: 'night-clerk', name: 'night-clerk', role: 'secretary' },
    })
    expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=night-clerk`
    governs.sendTheGovernsCheck(ws, night, t.api.HUMAN)
    const sent = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.saidInFull') AS said FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.governsCheck.project') = ?")
      .all(ws) as { said: string }[]
    expect(sent).toHaveLength(1)
    expect(sent[0]!.said).toContain(outside)
    expect(sent[0]!.said).not.toContain(inARun)
  })
})
