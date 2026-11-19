// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK SAYS WHICH RECORDS IT COULD NOT HAND ITS MODEL, AND WHY, AND HANDS THEM TO THE PROMPT DOOR TOO.
 *
 * Problems iVfuq3VBSnih and 7vaMy2NYnNQc, the inspector's two notes on run BptXJ4McCKrR (29 September 2026). The check
 * tool reads the run's reports and its agent's newest message whole, with its own key, and writes each into a file for
 * its model (problem YxzFRQIpx9Pz). A read the office refused was said only in the tool's output, and a 200 reply with no
 * record in it was dropped without a word; the prompt named neither, so the model could not tell a record it was not
 * given from one that was never filed. What the prompt says of them is T2 of
 * tests/a-checks-model-has-no-office-address.test.ts.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --dry against tests/inspector-tool-fixture.ts, a labelled
 * stand-in office that answers each record read as this file sets it: one report whole, one report with no record in the
 * reply, one report refused, and the newest message whole. No model runs and no live office is reached.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - Drop a 200 reply with no record without a word, as before: the first case.
 *   - Keep the failed reads to the tool's output, handing the prompt door none: the first case.
 *   - Leave them off the stored assembly, so its size is not the size the model is given: the first case.
 *   - Drop a record whose id is not a plain name without a word, whether the tool was to read it or the reading held it
 *     whole: the second case (problem TR5IUTTVCrPg).
 *   - Carry none of the reports a carried report names by id, as before: the third case (problem D884ZlvZz3A7).
 *   - Count a named word the office answered with no record as a record of another kind, as before: the fourth case
 *     (problem 1tas7k2LG9Db).
 *   - Carry only the reports a carried report names, and count the rest as records of another kind, as before: the third
 *     case, its named problem left out, the fifth, its decisions and earlier check left out, and the sixth, its decision
 *     from another project left out (problem ZTS6soSziHJ-).
 *   - Read a named record in the check's own project only, never in the project the office names: the sixth case.
 *   - Carry twenty named records of other kinds, as before: the seventh case, only twenty of its fifty problems carried,
 *     and the eighth, only twenty of its ninety (message oHkKuNZOP1xC).
 *   - Ask forty words of the reports, as before: the seventh case, only forty of its fifty problems carried, and the
 *     eighth, only fifteen of its ninety, its twenty-five reports taking the first words.
 *   - Drop a record past a cap without naming it: the eighth case, the five reports and ten problems past the caps
 *     missing from what the prompt names (the inspector's refusal of run oYuto-vGDqvp).
 *   - Name the cap of twenty in the reason a record of another kind past its cap is not carried: the eighth case, at
 *     that reason.
 *   - Read the records the whys name without the server first saying which paths this check keeps. The tool read no
 *     why at all before the filtered read, so that is a source mutation of the new read and not its old behavior:
 *     the ninth case reads the record a dropped path's why names (uQMufaAoVuVs).
 *   - Collect the records of the reports' words only, and none of the kept whys' words: the ninth, tenth, eleventh
 *     and twelfth cases (uQMufaAoVuVs).
 *   - Ask a word the reports and a kept why both name twice, or spend a second budget on it: the tenth case.
 *   - Read a why-named record in the check's own project only: the eleventh case.
 *   - Ask more than the one hundred and twenty words of the reports, and ask every word the kept whys name beside:
 *     the twelfth case, where ten of the why's words are asked past that shared cap.
 *   - Answer no kept-path list for a list that was asked, and read the whys anyway instead of stopping: the
 *     thirteenth case.
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const CHECK = aMadeUpCheckSession()
const WHOLE = 'reportWholeA'
const EMPTY = 'reportEmptyA'
const REFUSED = 'reportGoneAA'
const MESSAGE = 'messageNewst'

describe('a check that could not read every record it meant to hand its model', () => {
  it('writes the ones it read, and names the others with why, to the prompt door and the stored assembly alike', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.reading = {
      reports: [
        { id: WHOLE, title: 'A report read whole' },
        { id: EMPTY, title: 'A report answered with no record' },
        { id: REFUSED, title: 'A report the office refused' },
      ],
      wrote: [{ id: MESSAGE, kind: 'message', title: 'The newest message', when: '2026-09-29 01:00:00' }],
    }
    f.state.records = {
      [WHOLE]: { status: 200, body: { record: { id: WHOLE, kind: 'report', title: 'A report read whole', data: { proofs: 'Each mutation went red.' } } } },
      [EMPTY]: { status: 200, body: {} },
      [REFUSED]: { status: 404, body: { error: 'No record has this id.' } },
      [MESSAGE]: { status: 200, body: { record: { id: MESSAGE, kind: 'message', title: 'The newest message', data: { body: 'Ready for its check.' } } } },
    }
    // WHAT THE RECORDS FOLDER HELD when the tool asked for the prompt: the files it wrote, and only those.
    const folder = join(f.home, '.cache/mole-office/worktrees', `a-check-of-${f.run}-${CHECK}-records`)
    let inTheFolder: string[] = []
    f.state.onPrompt = async () => {
      inTheFolder = readdirSync(folder).sort()
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    expect(inTheFolder).toEqual([`${MESSAGE}.json`, `${WHOLE}.json`])

    const bodyOf = (door: string) => f.state.writes.find((one) => one.path === `/api/checks/${f.run}/${door}`)?.body
    const prompt = bodyOf('prompt')
    expect(prompt?.['carries']?.map((one: { id: string }) => one.id)).toEqual([WHOLE, MESSAGE])
    expect(prompt?.['couldNotCarry']).toEqual([
      { id: EMPTY, as: 'report', why: 'the office answered HTTP 200 with no record in its reply' },
      { id: REFUSED, as: 'report', why: 'the office refused the read (HTTP 404)' },
    ])
    // THE STORED ASSEMBLY IS HANDED THE SAME, so the size it keeps is the size the model would be given.
    const assembled = bodyOf('assembled')
    expect(assembled?.['carries']).toEqual(prompt?.['carries'])
    expect(assembled?.['couldNotCarry']).toEqual(prompt?.['couldNotCarry'])
    // AND THE TOOL SAYS IT WHERE IT HAPPENS.
    expect(ran.out).toContain(
      `Not written, and named in the prompt: ${EMPTY} (the office answered HTTP 200 with no record in its reply); ${REFUSED} (the office refused the read (HTTP 404))`,
    )
  })

  it('names a record whose id is not a plain name, and writes no file for it', async () => {
    // THE OFFICE'S IDS ARE PLAIN, so this is the stand-in's reading alone: a report the tool would read by an id that is
    // not a plain name, and a brief whose record, held whole, has one (problem TR5IUTTVCrPg).
    fixture = await inspectorFixture()
    const f = fixture
    f.state.reading = {
      reports: [{ id: 'not a plain id', title: 'A report named oddly' }],
      brief: { startedFor: { id: 'also not/plain', kind: 'task', title: 'A task named oddly' } },
    }
    const folder = join(f.home, '.cache/mole-office/worktrees', `a-check-of-${f.run}-${CHECK}-records`)
    let inTheFolder: string[] = []
    f.state.onPrompt = async () => {
      inTheFolder = readdirSync(folder).sort()
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    expect(inTheFolder).toEqual([])
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    expect(prompt?.['carries']).toEqual([])
    expect(prompt?.['couldNotCarry']).toEqual([
      { id: 'not a plain id', as: 'report', why: 'its id is not a plain name, so it was not asked for' },
      { id: 'also not/plain', as: 'started-for', why: 'its id is not a plain name, so no file can be named after it' },
    ])
  })

  it('carries the reports a carried report names by id, and names any it could not read', async () => {
    // PROBLEM D884ZlvZz3A7: a supervisor's round report names its workers' reports by id, and they are linked to the plan
    // and to the workers' own runs, not to the round. The stand-in's round report names two workers' reports, a problem,
    // a report the office refuses, and two words that name no record. The problem is carried too, as a named record,
    // since problem ZTS6soSziHJ-.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt01'
    const text =
      'The workers filed their reports:\nworkerRept01 and workerRept02. Problem aProblemId12 is filed. ' +
      'A word like readTheWhole names nothing, nor does notARecord1x. The report refusedRep01 is not readable here.'
    f.state.reading = { reports: [{ id: ROUND, title: "The round's report" }] }
    const aReport = (id: string, title: string) => ({ status: 200, body: { record: { id, kind: 'report', title, data: { blocks: [{ id: 'b-1', type: 'text', text: `The proofs of ${id}.` }] } } } })
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The round's report", data: { blocks: [{ id: 'b-1', type: 'text', text }] } } } },
      workerRept01: aReport('workerRept01', "A worker's report"),
      workerRept02: aReport('workerRept02', "Another worker's report"),
      aProblemId12: { status: 200, body: { record: { id: 'aProblemId12', kind: 'problem', title: 'A problem' } } },
      refusedRep01: { status: 403, body: { error: 'Not for this reader.' } },
      readTheWhole: { status: 404, body: { error: 'No record has this id.' } },
      notARecord1x: { status: 404, body: { error: 'No record has this id.' } },
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    expect(prompt?.['carries']?.map((one: { id: string; as: string }) => [one.id, one.as])).toEqual([
      [ROUND, 'report'],
      ['workerRept01', 'named-report'],
      ['workerRept02', 'named-report'],
      ['aProblemId12', 'named-record'],
    ])
    expect(prompt?.['couldNotCarry']).toEqual([{ id: 'refusedRep01', as: 'named-record', why: 'the office refused the read (HTTP 403)' }])
    expect(ran.out).toContain('Of 6 words in the reports that may be ids, 2 named a report that is carried, 1 named a record of another kind that is carried, and 2 named no record.')
    // A WORD THAT NAMES NO RECORD IS NO ID, and no refusal: nothing about it goes to the error channel.
    expect(ran.err).not.toContain('readTheWhole')
  })

  it('names a word the office answered with no record as a read that gave nothing, not as a record of another kind', async () => {
    // PROBLEM 1tas7k2LG9Db, the inspector's note on run d82cvhhBlrev: a 200 reply with no record, for a word the carried
    // report names, was counted as a record of another kind and never named in the prompt.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt02'
    f.state.reading = { reports: [{ id: ROUND, title: "The round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The round's report", data: { blocks: [{ id: 'b-1', type: 'text', text: 'The worker filed emptyReply01.' }] } } } },
      emptyReply01: { status: 200, body: {} },
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    expect(prompt?.['couldNotCarry']).toEqual([{ id: 'emptyReply01', as: 'named-record', why: 'the office answered HTTP 200 with no record in its reply' }])
    expect(ran.out).toContain('Of 1 word in the reports that may be ids, 0 named a report that is carried, 0 named a record of another kind that is carried, and 0 named no record.')
  })

  it('carries the decisions and the earlier check a carried report names, as named records', async () => {
    // PROBLEM ZTS6soSziHJ-: check 1m54plR7y05x (30 September 2026) said it could not read two decisions and the earlier
    // check its round's report named. The tool had read them, answered 200, and carried only reports.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt03'
    const text = 'It answers decisions decisionA012 and decisionB012, and the earlier check earlierChk01.'
    f.state.reading = { reports: [{ id: ROUND, title: "The round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The round's report", data: { blocks: [{ id: 'b-1', type: 'text', text }] } } } },
      decisionA012: { status: 200, body: { record: { id: 'decisionA012', kind: 'decision', title: 'A decision the round answers', data: { decision: 'Cast the secretary on more models.' } } } },
      decisionB012: { status: 200, body: { record: { id: 'decisionB012', kind: 'decision', title: 'Another decision the round answers' } } },
      earlierChk01: { status: 200, body: { record: { id: 'earlierChk01', kind: 'session', title: 'The earlier check of this round' } } },
    }
    const folder = join(f.home, '.cache/mole-office/worktrees', `a-check-of-${f.run}-${CHECK}-records`)
    let inTheFolder: string[] = []
    f.state.onPrompt = async () => {
      inTheFolder = readdirSync(folder).sort()
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    expect(inTheFolder).toEqual(['decisionA012.json', 'decisionB012.json', 'earlierChk01.json', `${ROUND}.json`])
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    expect(prompt?.['carries']?.map((one: { id: string; as: string }) => [one.id, one.as])).toEqual([
      [ROUND, 'report'],
      ['decisionA012', 'named-record'],
      ['decisionB012', 'named-record'],
      ['earlierChk01', 'named-record'],
    ])
    expect(prompt?.['couldNotCarry'] ?? []).toEqual([])
    expect(ran.out).toContain('Of 3 words in the reports that may be ids, 0 named a report that is carried, 3 named a record of another kind that is carried, and 0 named no record.')
  })

  it('reads a record a carried report names in the project that holds it, and names a read refused there with why', async () => {
    // PROBLEM ZTS6soSziHJ-: decisions filed in project ai-news answered 404, because the tool read under the check's one
    // project. The office answers such a read with a 404 that names the record's project, and the tool asks there.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt04'
    const text = 'It answers decision elsewhere012, and decision refusedThr01 of the same project.'
    const inAnother = (id: string, title: string) => ({ status: 404, body: { error: `"${title}" is in another project.`, elsewhere: { title, workspaceId: 'another-one', recordId: id } } })
    f.state.reading = { reports: [{ id: ROUND, title: "The round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The round's report", data: { blocks: [{ id: 'b-1', type: 'text', text }] } } } },
      elsewhere012: inAnother('elsewhere012', 'A decision in another project'),
      'another-one:elsewhere012': { status: 200, body: { record: { id: 'elsewhere012', kind: 'decision', title: 'A decision in another project' } } },
      refusedThr01: inAnother('refusedThr01', 'A decision this check may not read'),
      'another-one:refusedThr01': { status: 403, body: { error: 'Not for this reader.' } },
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    expect(prompt?.['carries']?.map((one: { id: string; as: string }) => [one.id, one.as])).toEqual([
      [ROUND, 'report'],
      ['elsewhere012', 'named-record'],
    ])
    expect(prompt?.['couldNotCarry']).toEqual([{ id: 'refusedThr01', as: 'named-record', why: 'the office refused the read (HTTP 403)' }])
    // ASKED FIRST IN THE CHECK'S OWN PROJECT, AND THEN IN THE ONE THE OFFICE NAMED.
    expect(f.state.recordReads.filter((one) => one.id === 'elsewhere012').map((one) => one.project)).toEqual(['panelx', 'another-one'])
  })

  it('carries all fifty problems a triage report names, past the twenty records and forty words it stopped at before', async () => {
    // MESSAGE oHkKuNZOP1xC: check dwwpG2NYGqFR of wave 13k (30 September 2026, 07:11) could not read seven problems
    // its triage round named, because the tool carried twenty records of other kinds and asked forty words.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt05'
    const problems = Array.from({ length: 50 }, (_, n) => `problemN${String(n).padStart(2, '0')}AB`)
    const text = `The triage round fixed ${problems.join(', ')}.`
    f.state.reading = { reports: [{ id: ROUND, title: "The triage round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The triage round's report", data: { blocks: [{ id: 'b-1', type: 'text', text }] } } } },
      ...Object.fromEntries(problems.map((id) => [id, { status: 200, body: { record: { id, kind: 'problem', title: `Problem ${id}` } } }])),
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    const carried = (prompt?.['carries'] ?? []).filter((one: { as: string }) => one.as === 'named-record').map((one: { id: string }) => one.id)
    expect(carried, 'not every problem the report names was carried').toEqual(problems)
    expect(prompt?.['couldNotCarry'] ?? []).toEqual([])
    expect(ran.out).toContain('Of 50 words in the reports that may be ids, 0 named a report that is carried, 50 named a record of another kind that is carried, and 0 named no record.')
  })

  it('names in the prompt every named record past a cap, with the cap it went past', async () => {
    // THE INSPECTOR'S REFUSAL OF RUN oYuto-vGDqvp: case 7 is all under the caps, so no case reached the branch that names
    // a record past a cap. A round's report here names 25 reports and 90 problems: twenty and eighty are carried, and
    // each of the rest is named, with the cap it went past.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt06'
    const reports = Array.from({ length: 25 }, (_, n) => `reportN${String(n).padStart(2, '0')}ABC`)
    const problems = Array.from({ length: 90 }, (_, n) => `problemN${String(n).padStart(2, '0')}CD`)
    const text = `The round's workers filed ${reports.join(', ')}. It fixed ${problems.join(', ')}.`
    f.state.reading = { reports: [{ id: ROUND, title: "A large round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "A large round's report", data: { blocks: [{ id: 'b-1', type: 'text', text }] } } } },
      ...Object.fromEntries(reports.map((id) => [id, { status: 200, body: { record: { id, kind: 'report', title: `Report ${id}` } } }])),
      ...Object.fromEntries(problems.map((id) => [id, { status: 200, body: { record: { id, kind: 'problem', title: `Problem ${id}` } } }])),
    }
    const ran = await f.inspect(['--check', CHECK])
    expect(ran.code, ran.err).toBe(0)
    const prompt = f.state.writes.find((one) => one.path === `/api/checks/${f.run}/prompt`)?.body
    const carried = (as: string) => (prompt?.['carries'] ?? []).filter((one: { as: string }) => one.as === as).map((one: { id: string }) => one.id)
    expect(carried('named-report')).toEqual(reports.slice(0, 20))
    expect(carried('named-record')).toEqual(problems.slice(0, 80))
    expect(prompt?.['couldNotCarry'], 'a record past a cap is not named with the cap it went past').toEqual([
      ...reports.slice(20).map((id) => ({ id, as: 'named-report', why: 'more reports are named than the 20 carried' })),
      ...problems.slice(80).map((id) => ({ id, as: 'named-record', why: 'more records of other kinds are named than the 80 carried' })),
    ])
  })

  it('reads the record a kept path\'s why names, and reads nothing a dropped path\'s why names', async () => {
    // FROM uQMufaAoVuVs: a path the server drops is not in the sealed change, so its why is about some other round,
    // and the records that why names are not about this run. The tool keeps the whys the server keeps, and no others.
    fixture = await inspectorFixture()
    const f = fixture
    const KEPT = 'recordKeptA1'
    const DROPPED = 'recordDropB2'
    f.state.records = {
      [KEPT]: { status: 200, body: { record: { id: KEPT, kind: 'problem', title: 'A record the kept why names' } } },
      [DROPPED]: { status: 200, body: { record: { id: DROPPED, kind: 'problem', title: 'A record only the dropped why names' } } },
    }
    const list = join(f.home, 'kept-and-dropped.json')
    writeFileSync(list, JSON.stringify({ needsJudgment: [
      { path: 'work', why: `It is protected, and the earlier check names ${KEPT}.` },
      { path: 'design/elsewhere.md', why: `It is protected, and the earlier check names ${DROPPED}.` },
    ] }))
    const ran = await f.inspect(['--check', CHECK, '--needs-judgment', list])
    expect(ran.code, ran.err).toBe(0)
    const prompts = f.state.writes.filter((one) => one.path === `/api/checks/${f.run}/prompt`)
    expect(prompts, 'the tool did not ask the server which paths the list keeps first, and assemble after').toHaveLength(2)
    const sent = prompts[prompts.length - 1]!.body
    expect(sent['carries']?.map((one: { id: string }) => one.id)).toContain(KEPT)
    expect(sent['carries']?.map((one: { id: string }) => one.id), 'the record a dropped why names was carried').not.toContain(DROPPED)
    // THE RECORD A DROPPED WHY NAMES IS NOT EVEN READ.
    expect(f.state.recordReads.map((one) => one.id), 'the record a dropped why names was read').not.toContain(DROPPED)
    expect(f.state.recordReads.map((one) => one.id)).toContain(KEPT)
    // THE LIST GOES TO THE FINAL ASSEMBLY AS ASKED, and the path the server dropped is still said.
    expect(sent['needsJudgment']?.map((one: { path: string }) => one.path)).toEqual(['work', 'design/elsewhere.md'])
    expect(ran.out).toContain('dropped from the needs-judgment list, not in the sealed change: design/elsewhere.md')
    // AND THE TOOL SAYS THE EXTRA WORD CAME FROM THE KEPT WHY.
    expect(ran.out).toContain('Of 1 word in the reports and the kept whys that may be ids, 0 named a report that is carried, 1 named a record of another kind that is carried, and 0 named no record. The whys kept for work added 1 of them.')
  })

  it('asks a word a report and a kept why both name once, and spends one named-record budget on both', async () => {
    // THE WHY WORDS GO THROUGH THE SAME BUDGETS (uQMufaAoVuVs): after the reports' words, in the whys' order,
    // first occurrence wins. The report names SHARED first, so the why's naming of it is not a second read.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt07'
    const SHARED = 'sharedRec012'
    const problems = (prefix: string, count: number) => Array.from({ length: count }, (_, n) => `${prefix}${String(n).padStart(2, '0')}AB`)
    const inTheReport = problems('problemP', 75)
    const inTheWhy = problems('problemQ', 10)
    const reportText = `${inTheReport.join(', ')}, and ${SHARED} is the shared one.`
    f.state.reading = { reports: [{ id: ROUND, title: "The round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The round's report", data: { blocks: [{ id: 'b-1', type: 'text', text: reportText }] } } } },
      ...Object.fromEntries([...inTheReport, SHARED, ...inTheWhy].map((id) => [id, { status: 200, body: { record: { id, kind: 'problem', title: `Problem ${id}` } } }])),
    }
    const list = join(f.home, 'the-shared-word.json')
    writeFileSync(list, JSON.stringify({ needsJudgment: [{ path: 'work', why: `Another round fixed ${inTheWhy.join(', ')} and ${SHARED}.` }] }))
    const ran = await f.inspect(['--check', CHECK, '--needs-judgment', list])
    expect(ran.code, ran.err).toBe(0)
    // THE SHARED WORD IS ASKED ONCE.
    expect(f.state.recordReads.filter((one) => one.id === SHARED)).toHaveLength(1)
    const sent = f.state.writes.filter((one) => one.path === `/api/checks/${f.run}/prompt`).at(-1)!.body
    const carried = (sent['carries'] ?? []).filter((one: { as: string }) => one.as === 'named-record').map((one: { id: string }) => one.id)
    // EIGHTY IS THE ONE BUDGET: seventy-five problems and the shared word from the report, four more from the why,
    // and the last six named with the cap they went past.
    expect(carried).toEqual([...inTheReport, SHARED, ...inTheWhy.slice(0, 4)])
    expect(sent['couldNotCarry']).toEqual(inTheWhy.slice(4).map((id) => ({ id, as: 'named-record', why: 'more records of other kinds are named than the 80 carried' })))
    expect(ran.out).toContain('Of 86 words in the reports and the kept whys that may be ids, 0 named a report that is carried, 80 named a record of another kind that is carried, and 0 named no record. The whys kept for work added 10 of them.')
  })

  it('reads a record a kept why names in the project that holds it, and names a why-named read refused there with why', async () => {
    // THE WHYS' READS TAKE THE SAME WAY ACROSS PROJECTS AS THE REPORTS' (problem ZTS6soSziHJ-): a 404 that names
    // another project is asked there once more with the same key, and a refused read is named with why.
    fixture = await inspectorFixture()
    const f = fixture
    const CROSS = 'whyCross0001'
    const GONE = 'whyGone00001'
    const inAnother = (id: string, title: string) => ({ status: 404, body: { error: `"${title}" is in another project.`, elsewhere: { title, workspaceId: 'another-one', recordId: id } } })
    f.state.records = {
      [CROSS]: inAnother(CROSS, 'A decision in another project'),
      'another-one:whyCross0001': { status: 200, body: { record: { id: CROSS, kind: 'decision', title: 'A decision in another project' } } },
      [GONE]: { status: 403, body: { error: 'Not for this reader.' } },
    }
    const list = join(f.home, 'a-why-in-another-project.json')
    writeFileSync(list, JSON.stringify({ needsJudgment: [{ path: 'work', why: `It answers decision ${CROSS}, and decision ${GONE} is not readable here.` }] }))
    const ran = await f.inspect(['--check', CHECK, '--needs-judgment', list])
    expect(ran.code, ran.err).toBe(0)
    const sent = f.state.writes.filter((one) => one.path === `/api/checks/${f.run}/prompt`).at(-1)!.body
    expect(sent['carries']?.map((one: { id: string; as: string }) => [one.id, one.as])).toContainEqual([CROSS, 'named-record'])
    expect(sent['couldNotCarry']).toEqual([{ id: GONE, as: 'named-record', why: 'the office refused the read (HTTP 403)' }])
    // ASKED FIRST IN THE CHECK'S OWN PROJECT, AND THEN IN THE ONE THE OFFICE NAMED.
    expect(f.state.recordReads.filter((one) => one.id === CROSS).map((one) => one.project)).toEqual(['panelx', 'another-one'])
  })

  it('spends the one hundred and twenty words of the reports and the kept whys together', async () => {
    // ONE LOOKUP BUDGET, ONE HUNDRED AND TWENTY WORDS (uQMufaAoVuVs): the kept whys' words come after the
    // reports' words into the same cap, so the words past it are never asked. The report's and the why's words here
    // name no record, so only the cap decides which are asked.
    fixture = await inspectorFixture()
    const f = fixture
    const ROUND = 'roundReprt08'
    const junk = (prefix: string, count: number) => Array.from({ length: count }, (_, n) => `junkWord${prefix}${String(n).padStart(3, '0')}`)
    const inTheReport = junk('R', 110)
    const inTheWhy = junk('Q', 20)
    f.state.reading = { reports: [{ id: ROUND, title: "The round's report" }] }
    f.state.records = {
      [ROUND]: { status: 200, body: { record: { id: ROUND, kind: 'report', title: "The round's report", data: { blocks: [{ id: 'b-1', type: 'text', text: inTheReport.join(', ') }] } } } },
      ...Object.fromEntries([...inTheReport, ...inTheWhy].map((id) => [id, { status: 404, body: { error: 'No record has this id.' } }])),
    }
    const list = join(f.home, 'past-the-word-cap.json')
    writeFileSync(list, JSON.stringify({ needsJudgment: [{ path: 'work', why: `Another round named ${inTheWhy.join(', ')}.` }] }))
    const ran = await f.inspect(['--check', CHECK, '--needs-judgment', list])
    expect(ran.code, ran.err).toBe(0)
    const asked = new Set(f.state.recordReads.map((one) => one.id))
    // THE FIRST TEN OF THE WHY'S WORDS FIT THE ONE HUNDRED AND TWENTY; THE LAST TEN DO NOT.
    expect(inTheWhy.slice(0, 10).filter((id) => asked.has(id))).toEqual(inTheWhy.slice(0, 10))
    expect(inTheWhy.slice(10).filter((id) => asked.has(id))).toEqual([])
    expect(ran.out).toContain('Of 130 words in the reports and the kept whys that may be ids, 0 named a report that is carried, 0 named a record of another kind that is carried, and 120 named no record; 10 past the first 120 were not asked. The whys kept for work added 20 of them.')
  })

  it('stops without reading the whys when the office does not say which paths the list keeps', async () => {
    // A REPLY WITH NO KEPT LIST IS NOT AN ANSWER (uQMufaAoVuVs): the tool stops rather than read the whys it
    // asked for, so a why about a path the sealed change does not touch can never reach its model.
    fixture = await inspectorFixture()
    const f = fixture
    const RECORD = 'recordUnkept'
    f.state.records = { [RECORD]: { status: 200, body: { record: { id: RECORD, kind: 'problem', title: 'A record no kept why names' } } } }
    f.state.judgedPaths = null
    const list = join(f.home, 'no-kept-list.json')
    writeFileSync(list, JSON.stringify({ needsJudgment: [{ path: 'work', why: `It is protected, and the earlier check names ${RECORD}.` }] }))
    const ran = await f.inspect(['--check', CHECK, '--needs-judgment', list])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('The prompt door did not say which paths of the needs-judgment list this check keeps')
    // NO FALLBACK: no why is collected, no record is read, and no assembly follows.
    expect(f.state.recordReads).toEqual([])
    expect(f.state.writes.filter((one) => one.path === `/api/checks/${f.run}/prompt`)).toHaveLength(1)
    expect(f.state.writes.some((one) => one.path.endsWith('/assembled'))).toBe(false)
  })
})
