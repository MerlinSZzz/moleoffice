// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION NAMES WHAT IT GOVERNS AT EVERY DOOR, AND A RECORD THAT NO PAGE FITS IS SAID TO SOMEBODY AT ONCE.
 *
 * What is proved, against a test office started once for the file, with a project of its own for each case:
 *   1. The kinds a decision may name in `governs` are the nine page kinds. The record door stores a records part, a
 *      files part and a nothingFits entry as they were sent, and the whole project alone.
 *   2. The one reader reads a stored list as two parts: a path stored in `governs` before the files part is read as a
 *      file, and each entry it could not read is named in `skipped`, never dropped silently.
 *   3. POST /api/records/check and POST /api/records refuse each of the five shapes with its code and its English, and
 *      write nothing. A patch that sends `governs`, `governsFiles` or `nothingFits` is checked; a patch that sends none
 *      of them is not, so an old decision that names nothing can still be changed.
 *   4. A decision that names only the whole project, with files, is written; with the source index never built, the
 *      answer says that nothing was read rather than that no module was found.
 *   5. A new nothingFits entry is sent at once: to the nearest module's owner; to the module reminder secretary when the
 *      owner's name is not an address, and the message names that owning line; to nobody, and the answer says why. A
 *      patch that adds one entry sends one line, for that entry only.
 *
 * The words are read from src/server/lib/what-a-record-names.ts and the word lists, never copied here.
 * Not held here: a built source index naming a module, and the owners of the modules implementing a nearest pipeline
 * or block. Both are read by the same functions this file calls.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, expectPanelError, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
// Each case files into a project of its own, so a reminder secretary named for one project reaches no other case.
let ws: string
let caseNumber = 0
const reminderSetting = process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  ws = `names-case-${String(caseNumber)}`
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ws, title: `Test project ${ws}` })
})

afterEach(() => {
  if (reminderSetting === undefined) delete process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES
  else process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = reminderSetting
})

async function asThePerson(): Promise<Record<string, string>> {
  const { THE_PERSON } = await import('../src/shared/person.ts')
  return { 'content-type': 'application/json', 'x-mole-office-workspace': ws, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

function aPage(kind: 'module' | 'block' | 'tool_category', title: string, data: Record<string, unknown> = {}): string {
  if (kind === 'block') {
    const pipeline = t.api.createRecord({
      kind: 'pipeline',
      title: `${title} pipeline`,
      summary: `${title}, written by a test`,
      data: { blockIds: [] },
      workspaceId: ws,
      actor: t.api.HUMAN,
    })
    return t.blocks.addBlock(pipeline.id, { name: title, state: 'todo' }, t.api.HUMAN).block.id
  }
  const shaped = kind === 'module' ? { context: 'made up', ...data } : { says: 'Made up.', ...data }
  return t.api.createRecord({ kind, title, data: shaped, workspaceId: ws, actor: t.api.HUMAN }).id
}

/** A decision through the record door, as a person files one. */
async function file(title: string, data: Record<string, unknown>, url = '/api/records') {
  return app.inject({
    method: 'POST',
    url,
    headers: await asThePerson(),
    payload: { kind: 'decision', title, data: { option_taken: title, because: 'A made-up reason.', replaces: [], ...data } },
  })
}

/** The decisions of this case's project with this title. */
function filedAs(title: string): unknown[] {
  return t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'decision' AND workspace_id = ? AND title = ?").all(ws, title)
}

/** The office's nothingFits messages about one record, oldest first. */
function theRemindersAbout(record: string): { id: string; data: { to: unknown; body: string; saidInFull: string; notice: unknown } }[] {
  return (
    t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.nothingFits.record') = ? ORDER BY rowid")
      .all(record) as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, data: JSON.parse(row.data) }))
}

/** An agent registered by the person, by its handle; its registry id. */
async function anAgent(handle: string): Promise<string> {
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: await asThePerson(), payload: { handle, name: handle, role: 'secretary' } })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  return (started.json() as { agent: { id: string } }).agent.id
}

describe('a decision names what it governs, at every door', () => {
  it('1: the nine page kinds are governed, and the door stores the two parts and nothingFits as sent', async () => {
    const { GOVERNED_KINDS } = await import('../src/server/lib/assert-the-governed-places-are-real.ts')
    const { PAGE_KINDS } = await import('../src/shared/what-a-record-names.ts')
    expect([...GOVERNED_KINDS]).toEqual([...PAGE_KINDS])
    expect([...PAGE_KINDS].sort()).toEqual(['block', 'department', 'flow', 'module', 'pipeline', 'regulation', 'role_card', 'tool', 'tool_category'])

    const module = aPage('module', 'Test: the kiln module')
    const block = aPage('block', 'Test: the firing step')
    const category = aPage('tool_category', 'Test: kiln tools')
    const sent = {
      governs: [{ record: module }, { record: block }, { record: category }],
      governsFiles: ['src/shared/paths.ts'],
      nothingFits: [{ missing: 'flow', what: 'the order of firing', nearest: module }],
    }
    const placed = await file('Test: the kiln is fired at night', sent)
    expect(placed.statusCode, placed.body.slice(0, 400)).toBe(201)
    const stored = t.api.getRecord(placed.json().record.id as string)?.data ?? {}
    expect({ governs: stored['governs'], governsFiles: stored['governsFiles'], nothingFits: stored['nothingFits'] }).toEqual(sent)

    const whole = await file('Test: every kiln is fired at night', { governs: [{ wholeProject: true }] })
    expect(whole.statusCode, whole.body.slice(0, 400)).toBe(201)
    expect(t.api.getRecord(whole.json().record.id as string)?.data?.['governs']).toEqual([{ wholeProject: true }])
  })

  it('2: the reader reads a stored path as a file, and names each entry it could not read', async () => {
    const { theGovernedPlaces } = await import('../src/shared/governs.ts')
    const read = theGovernedPlaces([{ record: 'AModuleId123' }, { path: './src/kiln/' }, {}, 'not an entry'], ['src/shared/paths.ts', ''])
    expect(read.records).toEqual(['AModuleId123'])
    expect(read.wholeProject).toBe(false)
    expect(read.files).toEqual(['src/kiln', 'src/shared/paths.ts'])
    expect(read.places).toEqual([{ record: 'AModuleId123' }, { path: 'src/kiln' }, { path: 'src/shared/paths.ts' }])
    expect(read.skipped.map((one) => one.at)).toEqual(['governs[2]', 'governs[3]', 'governsFiles[1]'])
    for (const one of read.skipped) expect(one.why, one.at).not.toBe('')

    const whole = theGovernedPlaces([{ wholeProject: true }])
    expect(whole).toMatchObject({ records: [], wholeProject: true, files: [], places: [], skipped: [] })
    expect(theGovernedPlaces('src/kiln').skipped.map((one) => one.at)).toEqual(['governs'])
  })

  it('3: both create doors refuse each shape with its code and write nothing; a patch is checked when it sends a field', async () => {
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    const { REFUSAL_CODES } = await import('../src/shared/refusal-codes.ts')
    const module = aPage('module', 'Test: the kiln module')
    const shapes = [
      [{}, 'decisionNamesNothingItGoverns', {}],
      [{ governs: [] }, 'decisionGovernsIsEmpty', {}],
      [{ governs: [{ path: 'src/kiln.ts' }] }, 'decisionGovernsNamesAPath', { path: 'src/kiln.ts' }],
      [{ governs: [{ wholeProject: true }, { record: module }] }, 'decisionGovernsTheWholeProjectBesideOthers', {}],
      [{ nothingFits: [{ missing: 'module', what: 'the kiln', nearest: 'NoSuchPage12' }] }, 'decisionNearestIsNotALivePage', { nearest: 'NoSuchPage12' }],
    ] as const
    for (const [data, code, values] of shapes) {
      expect(Object.hasOwn(REFUSAL_CODES, code), `${code} is not a refusal code`).toBe(true)
      for (const url of ['/api/records/check', '/api/records']) {
        const title = `Test: refused for ${code} at ${url}`
        const reply = await file(title, data, url)
        expect(reply.statusCode, `${url} ${reply.body.slice(0, 300)}`).toBe(400)
        expect(reply.json()).toMatchObject({ code, values })
        expect(reply.json().error).toBe(sayInEnglish(`server.${code}`, values))
        expect(filedAs(title), `${url} wrote the decision it refused`).toEqual([])
      }
    }
    // A deleted page is not live: a nearest page that was deleted is refused as one that never was.
    const gone = aPage('module', 'Test: a module that was deleted')
    t.api.deleteRecord(gone, t.api.HUMAN)
    const deleted = await file('Test: nearest a deleted module', { nothingFits: [{ missing: 'module', what: 'the kiln', nearest: gone }] })
    expect(deleted.statusCode, deleted.body.slice(0, 300)).toBe(400)
    expect(deleted.json()).toMatchObject({ code: 'decisionNearestIsNotALivePage', values: { nearest: gone } })

    // A PATCH: refused when it sends one of the three fields into a shape the door refuses, and nothing changes.
    const placed = await file('Test: the kiln is fired at night', { governs: [{ record: module }] })
    expect(placed.statusCode, placed.body.slice(0, 300)).toBe(201)
    const id = placed.json().record.id as string
    for (const [dataPatch, code] of [
      [{ governs: [] }, 'decisionGovernsIsEmpty'],
      [{ governs: [{ path: 'src/kiln.ts' }] }, 'decisionGovernsNamesAPath'],
      [{ governs: [{ wholeProject: true }, { record: module }] }, 'decisionGovernsTheWholeProjectBesideOthers'],
    ] as const) {
      const error = expectPanelError(t, () => t.api.patchRecord(id, { dataPatch }, t.api.HUMAN), 400)
      expect((error as { code?: string }).code, JSON.stringify(dataPatch)).toBe(code)
      expect(t.api.getRecord(id)?.data?.['governs'], `the refused patch ${JSON.stringify(dataPatch)} wrote`).toEqual([{ record: module }])
    }
    // A files part sent alone is checked against what the decision would hold, which names a page, so it is taken.
    t.api.patchRecord(id, { dataPatch: { governsFiles: ['src/kiln'] } }, t.api.HUMAN)
    expect(t.api.getRecord(id)?.data?.['governsFiles']).toEqual(['src/kiln'])

    // A decision stored before the door asked, naming nothing, takes a patch that sends none of the three.
    const old = t.api.createRecord({ kind: 'decision', title: 'Test: an old decision naming nothing', data: { option_taken: 'Old.', because: 'Made up.' }, workspaceId: ws, actor: t.api.HUMAN }).id
    t.api.patchRecord(old, { dataPatch: { because: 'Still made up.' } }, t.api.HUMAN)
    expect(t.api.getRecord(old)?.data?.['because']).toBe('Still made up.')
    // And the first patch that sends one of them must say what it governs.
    const error = expectPanelError(t, () => t.api.patchRecord(old, { dataPatch: { governsFiles: ['src/kiln'] } }, t.api.HUMAN), 400)
    expect((error as { code?: string }).code).toBe('decisionNamesNothingItGoverns')
  })

  it('4: a whole-project decision with files is written, and told nothing was read when the source index was never built', async () => {
    const names = await import('../src/server/lib/what-a-record-names.ts')
    const reply = await file('Test: every kiln file is checked', { governs: [{ wholeProject: true }], governsFiles: ['src/kiln.ts'] })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
    const said = reply.json().whatItNames as { says: string[]; modulesToName: { notRead?: string; found?: unknown } }
    expect(said.modulesToName.notRead, 'the answer did not say the source index was not read').toEqual(expect.any(String))
    expect(said.modulesToName.found).toBeUndefined()
    expect(said.says).toEqual([names.theModulesToNameSaid(said.modulesToName as { notRead: string })])
    // What it would say once modules were found, and when none holds the files: each module named, or none.
    expect(names.theModulesToNameSaid({ found: [{ id: 'AModuleId123', title: 'Kiln', files: ['src/kiln.ts'] }] })).toContain('AModuleId123')
    expect(names.theModulesToNameSaid({ found: [] })).not.toBe(names.theModulesToNameSaid({ notRead: 'x' }))

    // A decision that names a page as well is not told to name one.
    const module = aPage('module', 'Test: the kiln module')
    const placed = await file('Test: the kiln files are checked', { governs: [{ record: module }], governsFiles: ['src/kiln.ts'] })
    expect(placed.statusCode, placed.body.slice(0, 400)).toBe(201)
    expect(placed.json().whatItNames).toBeUndefined()
  })

  it('5: a new nothingFits entry is sent at once to the first receiver, or the answer says why nobody', async () => {
    const names = await import('../src/server/lib/what-a-record-names.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    type Said = {
      whatItNames: {
        says: string[]
        reminders: {
          entry: import('../src/shared/what-a-record-names.ts').ANothingFitsEntry
          sentTo: { id: string; handle: string } | null
          message: string | null
          says: string
        }[]
      }
    }

    // THE NEAREST MODULE'S OWNER.
    const keeperHandle = `keeper-${ws}`
    const keeper = await anAgent(keeperHandle)
    const owned = aPage('module', 'Test: the kiln module', { owner: { kind: 'agent', id: keeperHandle } })
    const entry = { missing: 'flow', what: 'the order of firing', nearest: owned }
    const toTheOwner = await file('Test: the firing order has no page', { nothingFits: [entry] })
    expect(toTheOwner.statusCode, toTheOwner.body.slice(0, 400)).toBe(201)
    const first = toTheOwner.json() as Said & { record: { id: string; kind: string; title: string } }
    const sent = theRemindersAbout(first.record.id)
    expect(sent).toHaveLength(1)
    expect(first.whatItNames.reminders).toEqual([{ entry, sentTo: { id: keeper, handle: keeperHandle }, message: sent[0]!.id, says: expect.any(String) }])
    expect(first.whatItNames.reminders[0]!.says).toBe(names.theReminderSaid(first.whatItNames.reminders[0]!))
    const receiver = names.theReceiverOf(entry, ws)
    if (!('agent' in receiver)) throw new Error(`the owner was not the receiver: ${receiver.nobody}`)
    expect(sent[0]!.data.to).toEqual([{ kind: 'agent', id: keeper }])
    expect(sent[0]!.data.body).toBe(SYSTEM_LINES.nothingFitsAPage('').line)
    expect(sent[0]!.data.saidInFull).toBe(names.theNothingFitsMessage(first.record, entry, receiver))
    expect(sent[0]!.data.notice).toBe('nothingFitsAPage')

    // AN OWNER WHOSE NAME IS NOT AN ADDRESS: the secretary is sent it, and the message names the owning line.
    const clerkHandle = `clerk-${ws}`
    const clerk = await anAgent(clerkHandle)
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=${clerkHandle}`
    const line = `line-nobody-registered-${ws}`
    const unaddressed = aPage('module', 'Test: the glaze module', { owner: { kind: 'agent', id: line } })
    const glaze = { missing: 'block', what: 'the glazing step', nearest: unaddressed }
    const toTheClerk = await file('Test: the glazing step has no page', { nothingFits: [glaze] })
    expect(toTheClerk.statusCode, toTheClerk.body.slice(0, 400)).toBe(201)
    const second = toTheClerk.json() as Said & { record: { id: string; kind: string; title: string } }
    const clerkSent = theRemindersAbout(second.record.id)
    expect(clerkSent).toHaveLength(1)
    expect(second.whatItNames.reminders[0]!.sentTo).toEqual({ id: clerk, handle: clerkHandle })
    const viaTheClerk = names.theReceiverOf(glaze, ws)
    if (!('agent' in viaTheClerk)) throw new Error(`the secretary was not the receiver: ${viaTheClerk.nobody}`)
    expect(viaTheClerk.owningLines).toEqual([line])
    expect(clerkSent[0]!.data.saidInFull).toBe(names.theNothingFitsMessage(second.record, glaze, viaTheClerk))
    expect(clerkSent[0]!.data.saidInFull).toContain(line)

    // NOBODY: no page near it and no secretary; nothing is sent, the decision is written, and the answer says why.
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
    const alone = { missing: 'other', what: 'the colour of the smoke' }
    const toNobody = await file('Test: the smoke has no page', { nothingFits: [alone] })
    expect(toNobody.statusCode, toNobody.body.slice(0, 400)).toBe(201)
    const third = toNobody.json() as Said & { record: { id: string } }
    expect(theRemindersAbout(third.record.id)).toEqual([])
    const nobody = names.theReceiverOf(alone, ws)
    if (!('nobody' in nobody)) throw new Error('somebody was named for a project with nobody')
    expect(third.whatItNames.reminders).toEqual([{ entry: alone, sentTo: null, message: null, says: names.theReminderSaid({ entry: alone, sentTo: null, message: null }, nobody.nobody) }])

    // A PATCH THAT ADDS ONE ENTRY sends one line, for that entry only.
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=${clerkHandle}`
    const added = { missing: 'module', what: 'the chimney' }
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${third.record.id}`,
      headers: await asThePerson(),
      payload: { dataPatch: { nothingFits: [alone, added] } },
    })
    expect(patched.statusCode, patched.body.slice(0, 400)).toBe(200)
    const fourth = patched.json() as Said
    expect(fourth.whatItNames.reminders.map((one) => one.entry)).toEqual([added])
    expect(fourth.whatItNames.reminders[0]!.sentTo).toEqual({ id: clerk, handle: clerkHandle })
    expect(theRemindersAbout(third.record.id)).toHaveLength(1)
    expect(names.theNewEntries([alone], [alone, added])).toEqual([added])
  })
})
