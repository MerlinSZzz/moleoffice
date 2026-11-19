// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { LightMyRequestResponse } from 'fastify'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'
import { buildTheFirstOfficeInAHook, apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader } from './helpers.ts'
import { MESSAGE_QUOTE_POSITIONS_INVALID, PRIVATE_LOGIN_REFUSAL_CODES, REFUSAL_CODES, type CodedRefusal, type RefusalCode, type TerminalRefusalCode } from '../src/shared/refusal-codes.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Actor } from '../src/server/lib/records.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { HOME_HEADER } from '../src/config/visit-headers.mjs'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

/**
 * The refusals that a test route throws in the doors' own shape: code, status, English, values. Each is a refusal no door
 * here can meet safely. They are read from tests/refusals-a-test-route-throws/, one file for each group of doors, each
 * file saying why its doors cannot be met here. They used to be one list in this file, and two branches that each added
 * a group at its end could not both be merged: wave 13r's office controls bounced at merge entry 87xD5HkWWRRx against
 * main's GPU booking refusals, in wave 13t round 36. A new group adds its own file.
 */
const THROWN_HERE_FOLDER = join(dirname(fileURLToPath(import.meta.url)), 'refusals-a-test-route-throws')
const THROWN_HERE: readonly [RefusalCode, number, string, Record<string, string | number>][] = readdirSync(THROWN_HERE_FOLDER)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .flatMap((name) => {
    const file = JSON.parse(readFileSync(join(THROWN_HERE_FOLDER, name), 'utf8')) as {
      why?: unknown
      refusals?: { code: string; status: number; english: string; values: Record<string, string | number> }[]
    }
    if (typeof file.why !== 'string' || file.why.trim() === '' || !Array.isArray(file.refusals) || file.refusals.length === 0) {
      throw new Error(`tests/refusals-a-test-route-throws/${name} needs a "why" and at least one refusal`)
    }
    return file.refusals.map((one) => {
      if (!(one.code in REFUSAL_CODES)) throw new Error(`tests/refusals-a-test-route-throws/${name}: ${one.code} is no declared refusal code`)
      return [one.code as RefusalCode, one.status, one.english, one.values] as [RefusalCode, number, string, Record<string, string | number>]
    })
  })

/**
 * THE ENGLISH WORDS FILES, read from the folder so a words file added later is read with no new line. A words file that
 * does not declare is not compared, and has no list file.
 */
const THE_WORDS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'words')
const THE_ENGLISH_CORE = 'en' + '.ts'
const THE_DECLARATION = 'THE_WORDS_ARE_THE_SERVERS_SENTENCE'

/** Every server.<code> key a words module holds, from the one export that holds words. */
function theServerKeysIn(module: object): Set<string> {
  const keys = new Set<string>()
  for (const value of Object.values(module)) {
    if (value === null || typeof value !== 'object') continue
    for (const key of Object.keys(value)) if (key.startsWith('server.')) keys.add(key)
  }
  return keys
}

/** en.ts and every en-*.ts beside it except the made-from records, imported by path. */
async function theEnglishWordsFiles(): Promise<ReadonlyMap<string, object>> {
  const files = new Map<string, object>()
  for (const name of readdirSync(THE_WORDS_FOLDER).filter((one) => one === THE_ENGLISH_CORE || (one.startsWith('en-') && one.endsWith('.ts') && !one.endsWith('-made-from.ts'))).sort()) {
    files.set(name.replace(/\.ts$/u, ''), await import(/* @vite-ignore */ join(THE_WORDS_FOLDER, name)) as object)
  }
  return files
}

/**
 * THE REFUSALS WHOSE WORDS DIFFER FROM THE SERVER'S SENTENCE IN A FILE THAT DECLARES ITS ENGLISH IS THAT SENTENCE.
 * One file for each declaring words file, named after it. A list file for a words file that does not declare is red,
 * a listed code that now matches is red, and a listed code its file no longer meets is red.
 */
const WORDS_THAT_DIFFER_FOLDER = join(dirname(fileURLToPath(import.meta.url)), 'refusals-whose-words-differ-on-purpose')
const WORDS_THAT_DIFFER: readonly {
  file: string
  why: string
  refusals: { code: RefusalCode; reason: string }[]
}[] = readdirSync(WORDS_THAT_DIFFER_FOLDER)
  .filter((one) => one.endsWith('.json'))
  .sort()
  .map((name) => {
    const file = JSON.parse(readFileSync(join(WORDS_THAT_DIFFER_FOLDER, name), 'utf8')) as {
      why?: unknown
      refusals?: { code?: unknown; reason?: unknown }[]
    }
    if (typeof file.why !== 'string' || file.why.trim() === '' || !Array.isArray(file.refusals)) {
      throw new Error(`tests/refusals-whose-words-differ-on-purpose/${name} needs a "why" and a list of refusals`)
    }
    const entries = file.refusals.map((one) => {
      if (typeof one.code !== 'string' || !(one.code in REFUSAL_CODES)) {
        throw new Error(`tests/refusals-whose-words-differ-on-purpose/${name}: ${String(one.code)} is no declared refusal code`)
      }
      if (typeof one.reason !== 'string' || one.reason.trim() === '') {
        throw new Error(`tests/refusals-whose-words-differ-on-purpose/${name}: ${one.code} needs a reason`)
      }
      return { code: one.code as RefusalCode, reason: one.reason }
    })
    return { file: name.replace(/\.json$/u, ''), why: file.why, refusals: entries }
  })
const THE_LIST_OF_FILE: ReadonlyMap<string, ReadonlySet<RefusalCode>> = new Map(
  WORDS_THAT_DIFFER.map((one) => [one.file, new Set(one.refusals.map((entry) => entry.code))]),
)

it('keeps the English, status and stored data while sending every declared refusal', async () => {
  const db = await freshDb()
  const { app } = await apiApp()
  const { setWordLanguage, sayInEnglish } = await import('../src/shared/i18n.ts')
  const writer: Actor = { type: 'agent', id: 'test-willow' }
  const { PanelError } = await import('../src/server/lib/panel-error.ts')
  const theEnglishWords = await theEnglishWordsFiles()
  const serverKeysOfFile = new Map([...theEnglishWords].map(([name, module]) => [name, theServerKeysIn(module)]))
  const fileOfServerKey = new Map([...serverKeysOfFile].flatMap(([name, keys]) => [...keys].map((key) => [key, name] as const)))
  const declaringFiles = new Set([...theEnglishWords].filter(([, module]) => (module as Record<string, unknown>)[THE_DECLARATION] === true).map(([name]) => name))
  const sentByTheServer: { code: RefusalCode; message: string; values: Record<string, string | number> }[] = []
  const thisRouteWroteItsOwnSentence = (url: string | undefined): boolean =>
    url !== undefined && (url.startsWith('/e1-thrown-') || url === '/e1-shut-down-runs-changed')
  app.addHook('onError', (request, _reply, error, done) => {
    if (error instanceof PanelError && error.code !== undefined && !thisRouteWroteItsOwnSentence(request.routeOptions.url)) {
      sentByTheServer.push({ code: error.code, message: error.message, values: (error.values ?? {}) as Record<string, string | number> })
    }
    done()
  })
  const { whyThisAddressAsWriteIsRefused } = await import('../src/server/lib/participants.ts')
  const { aTerminalRefusal } = await import('../src/server/lib/terminals.ts')
  const seen = new Set<RefusalCode>()
  const person: ParticipantRef = { kind: 'person', id: 'test-rowan' }
  const agent: ParticipantRef = { kind: 'agent', id: 'test-not-started-yet' }
  const personMay = 'How a person wishes to be addressed is set by that person, with a request proved to be them, or by a secretary with its own key.'
  const agentMay = 'How an agent wishes to be addressed is set by that agent with its own key sent as x-mole-office-key, by the owner, or by a secretary with its own key.'
  const cases: { who: ParticipantRef; actor: Actor; code: RefusalCode; start: string; may: string }[] = [
    { who: person, actor: writer, code: 'addressPersonNeedsSecretary', start: 'An agent that is not a secretary may not set it for a person.', may: personMay },
    { who: person, actor: { type: 'human', id: 'test-sage' }, code: 'addressPersonCannotSetAnother', start: 'One person may not set it for another.', may: personMay },
    { who: person, actor: { type: 'system', id: 'test-system' }, code: 'addressPersonNotProved', start: 'This request is not proved to be that person.', may: personMay },
    { who: agent, actor: { type: 'human', id: 'test-rowan', from: 'another machine' }, code: 'addressOwnerNotProved', start: 'This request is not proved to be the owner.', may: agentMay },
    { who: agent, actor: { type: 'system', id: 'test-system' }, code: 'addressNotFromAgent', start: 'This request is not from that agent.', may: agentMay },
    { who: agent, actor: writer, code: 'addressAgentKeyMissing', start: 'This request names that agent, and no key on it proves that agent.', may: agentMay },
    { who: { kind: 'agent', id: 'test-other-agent' }, actor: writer, code: 'addressAgentCannotSetAnother', start: 'One agent may not set it for another unless it is a secretary.', may: agentMay },
  ]
  for (const [index, sample] of cases.entries()) {
    app.get(`/e1-refusal-${index}`, () => {
      const refused = whyThisAddressAsWriteIsRefused(sample.who, sample.actor)
      if (refused !== null) throw refused
      return { accepted: true }
    })
  }
  // A PERMANENT RESIDENT'S ADDRESS, asked by a person no request proved (the residents' answer 8). The resident's id is
  // filled in below, once the resident exists.
  const theResident: ParticipantRef = { kind: 'agent', id: '' }
  app.get('/e1-resident-owner-not-proved', () => {
    const refused = whyThisAddressAsWriteIsRefused(theResident, { type: 'human', id: 'test-rowan', from: 'another machine' } as Actor)
    if (refused !== null) throw refused
    return { accepted: true }
  })
  // THE TERMINAL, INSTALL AND START-AT-LOGIN REFUSALS NO DOOR HERE CAN SAFELY MEET (the block that sends them says why).
  for (const [code, status, english, values] of THROWN_HERE) {
    const coded = { code, values } as CodedRefusal
    app.get(`/e1-thrown-${code}`, () => {
      throw code.startsWith('terminal') || code.startsWith('pane') ? aTerminalRefusal(code as TerminalRefusalCode, english, status) : new PanelError(english, status, undefined, undefined, undefined, coded)
    })
  }
  // THE SHUTDOWN DOOR'S RUNS-CHANGED REFUSAL needs a run at work and a server with a way out, which no door here has;
  // tests/a-shutdown-pauses-the-runs-at-work.test.ts meets it through the door, case 1.
  app.get('/e1-shut-down-runs-changed', () => {
    throw new PanelError('Test: a run started after the list was read.', 409, undefined, undefined, undefined, { code: 'shutDownRunsChanged', values: { count: 2 } } as CodedRefusal)
  })
  app.get('/e1-uncoded', () => { throw new PanelError('A test refusal remains in English.', 409, 'Test detail.', undefined, 'Test reason.') })
  // AN ID NO AGENT ROW HOLDS, put to the writer of who takes the dead letters (problem 0WUuvB0IhRfb). The door's own
  // resolver refuses a name nobody bears first, so only the writer itself can meet this one.
  app.get('/e1-dead-letter-secretary-not-registered', async () => {
    const { setTheDeadLetterSecretary } = await import('../src/server/lib/dead-letter-secretary.ts')
    return setTheDeadLetterSecretary('test-no-agent-row')
  })
  // THE SAME FOR WHO OWNS THE MERGE QUEUE: only the writer meets an id no agent row holds.
  app.get('/e1-merge-queue-owner-not-registered', async () => {
    const { setTheMergeQueueOwner } = await import('../src/server/lib/merge-queue-owner.ts')
    return setTheMergeQueueOwner('test-no-agent-row')
  })
  // THE PROVIDER TABLE'S PROVED-PERSON REFUSAL needs a request a listener carried, and every request here is app.inject's;
  // tests/a-provider-names-its-address-and-its-key-entry.test.ts meets it through the doors, case 10.
  app.get('/e1-provider-person-not-proved', async () => {
    const { onlyAProvedPersonWritesAProvider } = await import('../src/server/lib/the-provider-table.ts')
    onlyAProvedPersonWritesAProvider({ type: 'human', id: THE_PERSON, from: 'this machine', theKeyWindowCovers: true } as Actor)
    return { accepted: true }
  })
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  try {
    await app.ready()
    const foreignHome = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...headers, [HOME_HEADER]: 'eeeeeeeeeeeeeeee' },
      payload: { kind: 'note', title: 'Test write from another world', data: { body: 'Test.' } },
    })
    expect(foreignHome.statusCode, foreignHome.body).toBe(403)
    expect(foreignHome.json()).toMatchObject({ code: 'fromAnotherWorldWithNoVisit', values: {} })
    expect(foreignHome.json().error).toContain('/api/office/visits')
    expect(foreignHome.json().error).toContain('x-mole-office-visit')
    seen.add('fromAnotherWorldWithNoVisit')
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: writer.id, name: 'Test Willow', role: 'worker' } })
    expect(started.statusCode, started.body).toBe(201)
    agent.id = started.json().agent.id
    // WILLOW'S OWN KEY, for the one refusal below that only an agent proved by its own key can meet.
    const willowKey = String(started.json().whatToGiveIt?.key ?? '')
    setWordLanguage('zh')
    for (const [index, sample] of cases.entries()) {
      const reply = await app.inject({ method: 'GET', url: `/e1-refusal-${index}`, headers })
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ error: `${sample.start} ${sample.may} Nothing was written.`, code: sample.code, values: {} })
      seen.add(sample.code)
    }
    const legacy = await app.inject({ method: 'GET', url: '/e1-uncoded', headers })
    expect(legacy.statusCode).toBe(409)
    expect(legacy.json()).toEqual({ error: 'A test refusal remains in English.', detail: 'Test detail.', reason: 'Test reason.' })
    const missing = await app.inject({ method: 'GET', url: '/api/records/test-missing-record', headers })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({
      error: 'There is no record at this address. It may have been deleted, or the link may be wrong.',
      detail: 'No record with id test-missing-record.', code: 'recordNotFound', values: {},
    })
    seen.add(missing.json().code)
    const relativeFolder = await app.inject({ method: 'GET', url: '/api/report-files/named-inside?folder=relative', headers })
    expect(relativeFolder.statusCode).toBe(400)
    expect(relativeFolder.json()).toEqual({
      error: 'folder must be an absolute path with no ".." segment and no NUL byte. Nothing was written.',
      code: 'reportFilesFolderUnusable', values: {},
    })
    seen.add(relativeFolder.json().code)
    const stored = { symptom: 'Test leaves fell.', cause: 'A test window was open.', state: 'open' }
    const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'problem', title: 'Test conservatory', data: stored } })
    expect(made.statusCode, made.body).toBe(201)
    const id = made.json().record.id as string
    for (const [data, code, values] of [
      [{ cause: stored.cause, state: stored.state }, 'recordFieldWouldBeEmptied', {}],
      [{}, 'recordFieldsWouldBeEmptied', { count: 3 }],
    ] as const) {
      const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { data } })
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain('Nothing was written.')
      expect(reply.json().error).toContain(`PATCH /api/records/${id}`)
      seen.add(code)
    }
    const after = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers })
    expect(after.json().record.data).toEqual(stored)

    // THE OFFICE REGULATIONS' CHANGE-TOGETHER REFUSAL, through the record door: a made-up
    // chapter with its Chinese, and a new English title sent without new Chinese.
    const { englishHash } = await import('../src/shared/english-hash.ts')
    const chapter = await app.inject({ method: 'POST', url: '/api/records', headers, payload: {
      kind: 'module', title: 'Test kettles', summary: 'Test Conclusion.',
      data: { context: 'why', parts: [], extra: { chapter: 1 }, zh: { title: '测试水壶', summary: '测试结论。', from: englishHash(['Test kettles', 'Test Conclusion.', '']) } },
    } })
    expect(chapter.statusCode, chapter.body).toBe(201)
    const retitled = await app.inject({ method: 'PATCH', url: `/api/records/${chapter.json().record.id as string}`, headers, payload: { title: 'Test kettles, renamed' } })
    expect(retitled.statusCode, retitled.body).toBe(400)
    expect(retitled.json()).toMatchObject({ code: 'chineseHalfNotFromThisEnglish', values: {} })
    expect(retitled.json().error).toContain(`"from": "${englishHash(['Test kettles, renamed', 'Test Conclusion.', ''])}"`)
    expect(retitled.json().error).toContain('Nothing was written.')
    seen.add('chineseHalfNotFromThisEnglish')

    // THE MACHINE NAMES DOOR'S SIX (problem 8Kf0hCaK4lQY), through the door itself: the code for the page, and the
    // English sentence kept on the reply, with the word language set to Chinese.
    const asAnAgent = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id }
    const naming = (payload: object, as: Record<string, string> = headers) =>
      app.inject({ method: 'POST', url: '/api/office/machine-names', headers: { ...as, 'content-type': 'application/json' }, payload })
    for (const [reply, status, code, english] of [
      [await naming({ address: 'not an address', name: 'test-loquat' }), 400, 'machineAddressNotAnAddress', 'is not an address'],
      [await naming({ address: '192.0.2.20', name: '   ' }), 400, 'machineNameNotAName', 'The name is empty.'],
      [await naming({ address: '192.0.2.20', name: null }), 404, 'machineNameNothingToRemove', 'there is no name to take away'],
      [await naming({ address: '192.0.2.20', name: 'test-loquat' }, asAnAgent), 403, 'machineNamesOwnerNotProved', "the owner's own table"],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values: {} })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was changed.')
      seen.add(code)
    }
    // A DECISION THAT DOES NOT SAY WHAT IT REPLACES (problem ZSWftCSVUP2r), through the record door: first with no
    // earlier decision on its subject, then with one, whose id the English names and the page's words do not.
    const subject = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, 'content-type': 'application/json' }, payload: { kind: 'module', title: 'Test garden shed', data: { context: 'made up' } } })
    expect(subject.statusCode, subject.body).toBe(201)
    const subjectId = subject.json().record.id as string
    const unsaid = (title: string) =>
      app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, 'content-type': 'application/json' }, payload: { kind: 'decision', title, data: { because: 'Test reason.' }, links: [{ type: 'about', toId: subjectId }] } })
    const first = await unsaid('Test: the shed is painted green')
    expect(first.statusCode, first.body).toBe(400)
    expect(first.json()).toMatchObject({ code: 'decisionReplacesUnsaid', values: {} })
    expect(first.json().error).toContain('data.replaces')
    seen.add('decisionReplacesUnsaid')
    const earlier = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, 'content-type': 'application/json' }, payload: { kind: 'decision', title: 'Test: the shed is painted blue', data: { because: 'Test reason.', replaces: [] }, links: [{ type: 'about', toId: subjectId }] } })
    expect(earlier.statusCode, earlier.body).toBe(201)
    const second = await unsaid('Test: the shed is painted green')
    expect(second.statusCode, second.body).toBe(400)
    expect(second.json()).toMatchObject({ code: 'decisionReplacesUnsaidWithCandidates', values: {} })
    expect(second.json().error).toContain(earlier.json().record.id as string)
    seen.add('decisionReplacesUnsaidWithCandidates')

    // WHAT A WRITE TO A FLOW'S STEPS LACKS, wave 13p round 33: each of the six refusals through
    // the record door, with its code for the page and the English sentence kept on the reply. Round 33b: the short
    // `reason` the uncoded refusals sent before round 33 is still sent, in English and word for word, while the word
    // language is Chinese, so an agent that read it loses nothing.
    const flowJson = { ...headers, 'content-type': 'application/json' }
    const aFlowOf = (stages: object[]) =>
      app.inject({ method: 'POST', url: '/api/records', headers: flowJson, payload: { kind: 'flow', title: 'Test: landing a kettle', data: {
        declared_in: 'tools/test-kettle.mjs', runs: 'the office itself', trigger: 'A kettle is ready.', stages, leaves_behind: 'a served kettle',
      } } })
    const step = { n: 1, does: 'The kettle is checked.', why: 'A cold kettle is served.', sources: [subjectId] }
    const madeFlow = await aFlowOf([step])
    expect(madeFlow.statusCode, madeFlow.body).toBe(201)
    const flowId = madeFlow.json().record.id as string
    const changeTheFlow = (dataPatch: object) => app.inject({ method: 'PATCH', url: `/api/records/${flowId}`, headers: flowJson, payload: { dataPatch } })
    const changed = { ...step, does: 'The kettle is checked twice.' }
    const entry = { at: '2026-10-10', what: 'Checked twice.', why: 'Once missed a cold one.', cause: subjectId }
    for (const [reply, code, english, reason] of [
      [await aFlowOf([{ n: 1, does: 'The kettle is checked.', sources: [subjectId] }]), 'flowStepNoWhy', 'must say why it is there', 'A step that is added or changed must say why it is there.'],
      [await aFlowOf([{ n: 1, does: 'The kettle is checked.', why: 'A cold kettle is served.' }]), 'flowStepNoSources', 'must name its sources', 'A step that is added or changed must name at least one source.'],
      [await aFlowOf([{ ...step, sources: ['test-not-there'] }]), 'flowStepRecordNotThere', '"test-not-there"', 'A source or a cause names a record that is not there.'],
      [await changeTheFlow({ stages: [changed] }), 'flowStepChangeUnrecorded', 'must add an entry to `step_changes`', "A change to a flow's steps must name the record that caused it."],
      [await changeTheFlow({ stages: [changed], step_changes: [{ ...entry, cause: '' }] }), 'flowStepChangeNoCause', 'in `cause`', "A change to a flow's steps must name the record that caused it."],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.json()).toMatchObject({ code, values: {}, reason })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was written.')
      seen.add(code)
    }
    const recorded = await changeTheFlow({ stages: [changed], step_changes: [entry] })
    expect(recorded.statusCode, recorded.body).toBe(200)
    const rewritten = await changeTheFlow({ step_changes: [] })
    expect(rewritten.statusCode, rewritten.body).toBe(400)
    expect(rewritten.json()).toMatchObject({ code: 'flowStepChangesRewritten', values: {}, reason: "Earlier entries in a flow's change record stay as they are." })
    expect(rewritten.json().error).toContain('may only grow at its end')
    seen.add('flowStepChangesRewritten')

    // THE FLOWS PAGE'S WRITE DOORS (wave 13p round 34): the seven refusals they add beside the six, each through its door,
    // with its code, the English sentence, and the short reason in English while the word language is Chinese. And round
    // 40's eighth: whom a flow is for, sent to PATCH /api/flows/<id> naming a role that is not a role card. And round
    // 40b's ninth: a retired mark, sent to the record door, naming a record that is not there.
    const flowVersion = (await app.inject({ method: 'GET', url: `/api/flows/${flowId}`, headers })).json().version as string
    const flowDoor = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: object) => app.inject({ method, url, headers: flowJson, payload })
    const aReason = { why: 'A test reason.', cause: subjectId }
    for (const [reply, code, status, english, reason] of [
      [await flowDoor('POST', `/api/flows/${flowId}/stages`, { ...aReason, ifVersion: 'test-stale', at: 1, does: 'A test stage.', sources: [subjectId] }), 'flowVersionStale', 409, 'has changed since you read it', 'The flow has changed since you read it. Read it again and write from that.'],
      [await flowDoor('POST', '/api/flows', { project: 'test-no-project', title: 'Test: nowhere', runsBy: 'person', trigger: 'A test.', leavesBehind: 'nothing', declaredIn: 'nowhere', stages: [] }), 'flowProjectNotThere', 400, 'No project is called "test-no-project"', 'There is no project with this id.'],
      [await flowDoor('PATCH', `/api/flows/${flowId}/stages/9`, { ...aReason, ifVersion: flowVersion, sources: [subjectId] }), 'flowStageNotThere', 400, 'there is no stage 9', 'The flow has no stage at this number.'],
      [await flowDoor('POST', `/api/flows/${flowId}/stages`, { ...aReason, ifVersion: flowVersion, at: 5, does: 'A test stage.', sources: [subjectId] }), 'flowStagePlaceNotThere', 400, 'from 1 to 2; 5 is not one', 'The flow has no place at this number.'],
      [await flowDoor('POST', `/api/flows/${flowId}/stages/1/move`, { ...aReason, ifVersion: flowVersion, to: 1 }), 'flowStageAlreadyThere', 400, 'already at place 1', 'The stage is already at this place.'],
      [await flowDoor('PATCH', `/api/flows/${flowId}/stages/1`, { ifVersion: flowVersion, why: changed.why, sources: changed.sources, cause: subjectId }), 'flowStageUnchanged', 400, 'exactly as it is', 'This change is the same as the stage. Nothing would change.'],
      [await flowDoor('DELETE', `/api/flows/${flowId}/stages/1`, { ifVersion: flowVersion, cause: subjectId }), 'flowChangeNoWhy', 400, 'must say why', 'A move or a removal must say why.'],
      [
        await flowDoor('PATCH', `/api/flows/${flowId}`, { ifVersion: flowVersion, appliesTo: { scope: 'general', roles: ['test-no-role'] } }),
        'flowAppliesToUnreadable',
        400,
        'test-no-role is not one',
        'Whom the flow is for cannot be read. Name role cards, a rung of the tree, and a project only for a special flow.',
      ],
      [
        await changeTheFlow({ retired: { why: 'A test reason.', at: '2026-10-11', by: 'a test', record: 'test-no-record' } }),
        'flowRetiredUnreadable',
        400,
        '"test-no-record" is not one',
        'The retired mark cannot be read. Say why, the day, who retired it, and what took its place: a record, or a file and a line.',
      ],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values: {}, reason })
      expect(reply.json().error).toContain(english)
      seen.add(code)
    }

    // THE CASTING DOOR'S SIX, and a seventh for the probability cell (wave 13s round 44,
    // migration 0268), through the door itself: the code for the Casting page, and the English sentence kept on the
    // reply, with the word language set to Chinese.
    const filed = async (kind: string, title: string): Promise<string> => {
      const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { replaces: [] } : {} } })
      expect(made.statusCode, made.body).toBe(201)
      return made.json().record.id as string
    }
    const aNote = await filed('note', 'Test note that is not a decision')
    const aGoneDecision = await filed('decision', 'Test decision that is deleted')
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${aGoneDecision}`, headers })
    expect(gone.statusCode, gone.body).toBeLessThan(300)
    const aDecision = await filed('decision', 'Test decision the casting names')
    const casting = (payload: object, as: Record<string, string> = headers) =>
      app.inject({ method: 'POST', url: '/api/casting/worker', headers: { ...as, 'content-type': 'application/json' }, payload })
    for (const [reply, status, code, values, english] of [
      [await casting({ program: { value: 'test-cli' } }), 400, 'castingNotAProgram', { program: 'test-cli' }, 'is not a program the office knows'],
      [await casting({ model: { value: 'test-model', decision: 'test-no-such-id' } }), 400, 'castingNoSuchDecision', { id: 'test-no-such-id' }, 'holds no record with that id'],
      [await casting({ model: { value: 'test-model', decision: aNote } }), 400, 'castingNotADecision', { id: aNote }, 'not a decision'],
      [await casting({ model: { value: 'test-model', decision: aGoneDecision } }), 400, 'castingDecisionDeleted', { id: aGoneDecision }, 'which is deleted'],
      [await casting({ model: { value: null, decision: aDecision } }), 400, 'castingEmptyCellNamesADecision', {}, 'An empty cell names no decision.'],
      [await casting({ model: { value: 'test-model' } }, asAnAgent), 403, 'castingNotOwnerOrSecretary', { card: 'secretary' }, 'Changing the Casting table is for the owner, or for an agent holding the secretary card.'],
      [await casting({ probability: { value: 'test-not-a-number' } }), 400, 'castingNotAProbability', { probability: 'test-not-a-number' }, 'Give a decimal from 0 to 1, or a percentage from 0% to 100%.'],
      // A label the table does not hold, and an Out until that is not a time (migration 0349).
      [await casting({ labels: { value: 'test-no-such-label' } }), 400, 'castingNotALabelOfTheTable', { label: 'test-no-such-label' }, '"test-no-such-label" is not a label of the Casting table. Make it on the Casting page\'s Rules tab first, or give a label the table has. Nothing was written.'],
      [await casting({ out_until: { value: 'test-not-a-time' } }), 400, 'castingNotAnOutUntil', { value: 'test-not-a-time' }, '"test-not-a-time" is not a time. Give a date and time on the office\'s clock, such as 2026-11-18 09:00, or an instant with its offset. Nothing was written.'],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain(english)
      seen.add(code)
    }
    // AND THE TWO OF SEVERAL CASTINGS FOR EACH ROLE: a casting that is not there, and the
    // marked casting while another remains beside it.
    const addOne = async (model: string): Promise<number> => {
      const added = await casting({ model: { value: model } })
      expect(added.statusCode, added.body).toBe(201)
      return added.json().casting.id as number
    }
    const theMarked = await addOne('test-marked-model')
    await addOne('test-other-model')
    for (const [reply, status, code, values, english] of [
      [await app.inject({ method: 'PATCH', url: '/api/casting/rows/999999', headers: { ...headers, 'content-type': 'application/json' }, payload: { model: { value: 'x' } } }), 404, 'castingNoSuchCasting', { id: '999999' }, 'There is no casting with the id 999999.'],
      [await app.inject({ method: 'DELETE', url: `/api/casting/rows/${String(theMarked)}`, headers }), 409, 'castingRemoveTheMarkedRow', {}, 'Mark another casting first, then remove this one.'],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain(english)
      seen.add(code)
    }
    // AND THE CASTING LABELS' FOUR: a name that is not a label, a name the table holds, a label that
    // is not there, and a label a row carries.
    const label = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, headers: { ...headers, 'content-type': 'application/json' }, ...(payload === undefined ? {} : { payload }) })
    const inUse = await label('POST', '/api/casting/labels', { name: 'test-label-in-use' })
    expect(inUse.statusCode, inUse.body).toBe(201)
    const carried = await casting({ model: { value: 'test-labelled-model' }, labels: { value: 'test-label-in-use' } })
    expect(carried.statusCode, carried.body).toBe(201)
    const carrier = String(carried.json().casting.id)
    for (const [reply, status, code, values, english] of [
      [await label('POST', '/api/casting/labels', { name: 'test/label' }), 400, 'castingNotALabel', { label: 'test/label' }, '"test/label" is not a label. A label is 1 to 32 letters, digits or hyphens; spaces become hyphens. Nothing was written.'],
      [await label('POST', '/api/casting/labels', { name: 'Test Label In Use' }), 409, 'castingLabelTaken', { label: 'test-label-in-use' }, 'There is already a label "test-label-in-use". Give another name. Nothing was written.'],
      [await label('PATCH', '/api/casting/labels/999999', { name: 'test-label' }), 404, 'castingNoSuchLabel', { label: '999999' }, 'There is no Casting label with the id 999999. Nothing was written.'],
      [await label('DELETE', `/api/casting/labels/${String(inUse.json().label.id)}`), 409, 'castingLabelInUse', { label: 'test-label-in-use', rows: carrier }, `The label "test-label-in-use" is on Casting rows ${carrier}. Take it off those rows first, then remove it. Nothing was written.`],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain(english)
      seen.add(code)
    }
    // AND A ROW'S OWN PROGRAM SETTINGS (wave 13n round CS): a row with no program, a program that takes none, a name the
    // launcher sets itself, and a Codex name with a part its -c cannot name, each for a new row and for a row
    // that has an id.
    const native = (name: string) => ({ native: { model: 'test-native-model', provider: null, variant: null, settings: [{ name, value: 'test-value' }] } })
    const withSettings = await casting({ program: { value: 'codex' }, ...native('test_option') })
    expect(withSettings.statusCode, withSettings.body).toBe(201)
    const row = String(withSettings.json().casting.id)
    const changeTheRow = (payload: object) =>
      app.inject({ method: 'PATCH', url: `/api/casting/rows/${row}`, headers: { ...headers, 'content-type': 'application/json' }, payload })
    const guards = "the row's own native model, which the row's model fields set"
    const splits = 'Codex splits a -c name at every dot and at its first equals sign, and trims the spaces at its two ends.'
    for (const [reply, status, code, values, english] of [
      [await casting({ model: { value: 'test-office-model' }, ...native('test_option') }), 400, 'castingNewRowSettingsWithNoProgram', {}, 'This new Casting row has no program, so it cannot hold settings, which go to its program. Nothing was changed.'],
      [await casting({ program: { value: 'kimi' }, ...native('test_option') }), 400, 'castingNewRowSettingsNotForProgram', { program: 'kimi' }, 'This new Casting row runs kimi, which takes no settings from a Casting row. Nothing was changed.'],
      [await casting({ program: { value: 'codex' }, ...native('model') }), 400, 'castingNewRowSetsAGuardedName', { name: 'model', program: 'codex', guards },
        `This new Casting row sets model for codex, which the launcher sets itself (${guards}). A row may not set it. Nothing was changed.`],
      [await changeTheRow({ program: { value: null } }), 400, 'castingRowSettingsWithNoProgram', { id: row }, `Casting row ${row} has no program, so it cannot hold settings, which go to its program. Nothing was changed.`],
      [await changeTheRow({ program: { value: 'kimi' } }), 400, 'castingRowSettingsNotForProgram', { id: row, program: 'kimi' }, `Casting row ${row} runs kimi, which takes no settings from a Casting row. Nothing was changed.`],
      [await changeTheRow(native('model')), 400, 'castingRowSetsAGuardedName', { id: row, name: 'model', program: 'codex', guards },
        `Casting row ${row} sets model for codex, which the launcher sets itself (${guards}). A row may not set it. Nothing was changed.`],
      [await casting({ program: { value: 'codex' }, ...native('test_table."test.part"') }), 400, 'castingNewRowSetsAPartCodexCannotName', { name: 'test_table."test.part"', part: 'test.part' },
        `This new Casting row sets test_table."test.part" for codex, and Codex's -c cannot name its part "test.part". ${splits} Nothing was changed.`],
      [await changeTheRow(native('test_table."test=part"')), 400, 'castingRowSetsAPartCodexCannotName', { id: row, name: 'test_table."test=part"', part: 'test=part' },
        `Casting row ${row} sets test_table."test=part" for codex, and Codex's -c cannot name its part "test=part". ${splits} Nothing was changed.`],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain(english)
      seen.add(code)
    }
    // AND THE PROVIDER TABLE BESIDE IT (wave 13n round CT): a body of the wrong shape, an id, name, programs, base
    // address or key name that breaks its rule, an id taken, changed or not there, and the owner not proved.
    const provider = (method: 'POST' | 'PATCH', payload: unknown, id: string | null = null) =>
      app.inject({ method, url: id === null ? '/api/casting/providers' : `/api/casting/providers/${id}`, headers: { ...headers, 'content-type': 'application/json' }, payload: JSON.stringify(payload) })
    const aProvider = { id: 'test-provider', name: 'Test provider', programs: ['opencode'], baseAddress: 'https://test-provider.example/v1', keyName: 'test-provider' }
    const addWith = (fields: object) => provider('POST', { ...aProvider, ...fields })
    const firstProvider = await provider('POST', aProvider)
    expect(firstProvider.statusCode, firstProvider.body).toBe(201)
    const host = { host: 'test-provider.example' }
    for (const [reply, status, code, values, english] of [
      [await provider('POST', ['test-not-an-object']), 400, 'providerBodyNotAnObject', {}, 'The body must be an object with the fields id, name, programs, baseAddress and keyName. Nothing was written.'],
      [await addWith({ test_field: 'test-value' }), 400, 'providerBodyHasOtherFields', { fields: 'test_field' }, 'The body names test_field, which a provider does not have.'],
      [await provider('PATCH', {}, 'test-provider'), 400, 'providerChangeNamesNothing', { id: 'test-provider' }, 'The change to provider test-provider names no field to change.'],
      [await addWith({ id: 'Test_Provider' }), 400, 'providerIdNotValid', {}, "A provider's id is 2 to 40 lowercase letters, digits and dashes. Nothing was written."],
      [await provider('POST', aProvider), 409, 'providerIdTaken', { id: 'test-provider' }, 'A provider with the id test-provider is there already. Nothing was written.'],
      [await provider('PATCH', { id: 'test-other-provider' }, 'test-provider'), 400, 'providerIdChanged', { id: 'test-provider' }, "Provider test-provider keeps its id. A provider's id never changes."],
      [await provider('PATCH', { name: 'Test name' }, 'test-no-such-provider'), 404, 'providerNotFound', { id: 'test-no-such-provider' }, 'No provider has the id test-no-such-provider. Nothing was written.'],
      [await addWith({ name: '   ' }), 400, 'providerNameNotValid', { length: 0 }, "A provider's name is 1 to 120 characters after spaces at its ends are taken off. This one has 0."],
      [await addWith({ programs: [] }), 400, 'providerProgramsNotAList', {}, "A provider's programs are a list of at least one of codex, claude-code, opencode and dsh. Nothing was written."],
      [await addWith({ programs: ['test-cli'] }), 400, 'providerProgramNotKnown', { program: 'test-cli' }, '"test-cli" is not a program a provider can be for.'],
      [await addWith({ programs: ['codex', 'codex'] }), 400, 'providerProgramRepeated', { program: 'codex' }, 'The programs name codex more than once.'],
      [await addWith({ baseAddress: 'test not an address' }), 400, 'providerAddressNotAnAddress', {}, 'The base address cannot be read as an address.'],
      [await addWith({ baseAddress: 'https://' }), 400, 'providerAddressNoHost', { scheme: 'https' }, 'The base address starts with https:// but names no host. Nothing was written.'],
      [await addWith({ baseAddress: 'https://test-user:test-secret@test-provider.example/v1' }), 400, 'providerAddressHasCredentials', host, 'The base address to test-provider.example carries a user name or a password before the host.'],
      [await addWith({ baseAddress: 'ftp://test-provider.example/v1' }), 400, 'providerAddressScheme', { scheme: 'ftp' }, 'The base address starts with ftp:, and a provider takes only https:, or http: on 127.0.0.1 or [::1].'],
      [await addWith({ baseAddress: 'http://test-provider.example/v1' }), 400, 'providerAddressHttpNotLoopback', host, 'The base address to test-provider.example is http:, which is taken only on 127.0.0.1 or [::1].'],
      [await addWith({ baseAddress: 'https://test-provider.example/v1?test=1' }), 400, 'providerAddressHasQuery', host, 'The base address to test-provider.example has a query, the part after "?".'],
      [await addWith({ baseAddress: 'https://test-provider.example/v1#test' }), 400, 'providerAddressHasFragment', host, 'The base address to test-provider.example has a fragment, the part after "#".'],
      [await addWith({ keyName: 'TEST KEY' }), 400, 'providerKeyNameNotValid', {}, "A provider's key name is the name of an entry in the office's key file, never a key"],
      [await addWith({ keyName: 'push-signing-key' }), 400, 'providerKeyNameKeptByTheOffice', { name: 'push-signing-key' }, "The key file's entry push-signing-key is one the office keeps for itself, so a provider may not name it."],
      [await app.inject({ method: 'GET', url: '/e1-provider-person-not-proved', headers }), 403, 'providerPersonNotProved', {}, "This request names the owner and carries no key of the owner's, so it does not add, change or remove a provider."],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain(english)
      expect(reply.body).not.toContain('test-secret')
      seen.add(code)
    }
    // AND THE CASTING GATE WHERE MORE THAN ONE CARD HOLDS THE ACT (problem XCvn6ypadyMT): the test's own cards move "The
    // Casting table" down to the supervisor's step, so the supervisor and the secretary cards both hold it. They are
    // read from a temporary file through the server's reader, and the cards on disk are read back at once.
    {
      const roles = await import('../src/server/lib/roles.ts')
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      const guardActKeys = GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct])
      const decl = JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as { tree: { role: string; adds: string[] }[] }
      for (const step of decl.tree) step.adds = step.adds.filter((one) => one !== 'The Casting table')
      decl.tree.find((step) => step.role === 'supervisor')?.adds.push('The Casting table')
      const dir = mkdtempSync(join(tmpdir(), 'mole-office-coded-refusal-cards-'))
      writeFileSync(join(dir, 'roles.json'), JSON.stringify(decl))
      roles.forgetTheRoleCards()
      roles.readTheRoleCards({ guardActKeys, file: join(dir, 'roles.json') })
      try {
        const reply = await casting({ model: { value: 'test-model' } }, asAnAgent)
        expect(reply.statusCode, reply.body).toBe(403)
        expect(reply.json()).toMatchObject({ code: 'castingNotOwnerOrACardThatHoldsIt', values: {} })
        expect(reply.json().error).toContain('Changing the Casting table is for the owner, or for an agent holding the supervisor or the secretary card.')
        seen.add('castingNotOwnerOrACardThatHoldsIt')
      } finally {
        roles.forgetTheRoleCards()
        roles.readTheRoleCards({ guardActKeys })
        rmSync(dir, { recursive: true, force: true })
      }
    }

    // A REVOKE THAT NAMES NO KEY BY ITS ID (problem yZ71bheXm-Ji), through the revoke door, with the word language
    // still Chinese: the code for the page, and the English kept on the reply.
    const revoke = await app.inject({ method: 'POST', url: '/api/office/held-keys/test-no-such-key/revoke', headers: { ...headers, 'content-type': 'application/json' }, payload: {} })
    expect(revoke.statusCode, revoke.body).toBe(400)
    expect(revoke.json()).toMatchObject({ code: 'embassyKeysNoKeyNamed', values: {} })
    expect(revoke.json().error).toContain('"test-no-such-key", which is not the id of a key this office holds')
    expect(revoke.json().error).toContain('Nothing was revoked.')
    seen.add('embassyKeysNoKeyNamed')

    // A RAISE'S END TIME THE RAISE DOOR CANNOT TAKE (problem OpT-wLSCwlZ-), pressed with the person's key for a secretary, with
    // the word language still Chinese: the code for the page, and the English kept on the reply.
    const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'test-hazel', name: 'Test Hazel', role: 'secretary' } })
    expect(secretary.statusCode, secretary.body).toBe(201)
    for (const [until, code, values, english] of [
      ['tomorrow 7am', 'raiseUntilUnreadable', { typed: 'tomorrow 7am' }, '"tomorrow 7am" does not read as a date and a time'],
      ['2000-01-01 7:00', 'raiseUntilPassed', { until: '2000-01-01 07:00:00' }, 'The end time 2000-01-01 07:00:00 has already come'],
    ] as const) {
      const raised = await app.inject({ method: 'POST', url: '/api/roles/elevation/test-hazel', headers: { ...headers, ...thePersonsKeyHeader(), 'content-type': 'application/json' }, payload: { reason: 'a test raises it', endsWhen: 'at a time', until } })
      expect(raised.statusCode, raised.body).toBe(400)
      expect(raised.json()).toMatchObject({ code, values })
      expect(raised.json().error).toContain(english)
      seen.add(code)
    }
    // AN AGENT, WITH ITS OWN KEY, ASKING TO END A RAISE GIVEN TO ANOTHER.
    const given = await app.inject({ method: 'POST', url: '/api/roles/elevation/test-hazel', headers: { ...headers, ...thePersonsKeyHeader(), 'content-type': 'application/json' }, payload: { reason: 'a test raises it' } })
    expect(given.statusCode, given.body).toBe(201)
    const notYours = await app.inject({ method: 'POST', url: `/api/roles/raises/${String(given.json().elevation.id)}/end`, headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id, 'x-mole-office-key': willowKey } })
    expect(notYours.statusCode, notYours.body).toBe(403)
    expect(notYours.json()).toMatchObject({ code: 'raiseEndNotYours', values: {} })
    expect(notYours.json().error).toContain('An agent may end only its own raise')
    seen.add('raiseEndNotYours')
    // A PLAN WRITE BUILT ON A COPY SOMEBODY HAS SINCE CHANGED (problem GR4LcaNI-XZk).
    const planned = await app.inject({ method: 'POST', url: '/api/plans', headers: { ...headers, 'content-type': 'application/json' }, payload: { title: 'Test week', body: '- one line' } })
    expect(planned.statusCode, planned.body).toBe(201)
    const planPath = `/api/plans/${String(planned.json().plan.id)}`
    const read = await app.inject({ method: 'GET', url: planPath, headers })
    const renamed = await app.inject({ method: 'PATCH', url: planPath, headers: { ...headers, 'content-type': 'application/json' }, payload: { title: 'Test week, renamed', ifVersion: read.json().version } })
    expect(renamed.statusCode, renamed.body).toBe(200)
    const stale = await app.inject({ method: 'PATCH', url: planPath, headers: { ...headers, 'content-type': 'application/json' }, payload: { title: 'Test week, mine', ifVersion: read.json().version } })
    expect(stale.statusCode, stale.body).toBe(409)
    expect(stale.json()).toMatchObject({ code: 'planChangedSinceRead', values: {} })
    expect(stale.json().error).toContain('This plan has changed since you read it, so nothing was written.')
    seen.add('planChangedSinceRead')

    // A COMMENT ON A FACT BESIDE A LINE OF A PLAN (problem ON-vXSmgokHf): a fact the line does not have, and a line
    // that is gone. The code is for the composer; the English stays on the reply.
    const plan = await app.inject({ method: 'POST', url: '/api/plans', headers, payload: { title: 'Test bench week', body: '- Re-level the test bench' } })
    expect(plan.statusCode, plan.body).toBe(201)
    const planId = String(plan.json().plan.id)
    const lineId = String(plan.json().lines[0]?.id)
    for (const [fact, line, status, code, english] of [
      ['note', lineId, 400, 'planLineFactUnknown', 'A line of a plan has no fact called "note"'],
      ['size', 'test-gone-line', 404, 'planLineFactGone', 'There is no fact about a line of a plan to point at'],
    ] as const) {
      const comment = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'annotation', title: 'on the fact', data: { body: 'Is this right?', context: { target: { kind: 'planLineFact', planId, lineId: line, fact } } } } })
      expect(comment.statusCode, comment.body).toBe(status)
      expect(comment.json()).toMatchObject({ code, values: {} })
      expect(comment.json().error).toContain(english)
      seen.add(code)
    }

    // A REVIEW WITH NOTHING IN IT TO READ (wave 13n round 32): the question for its reading is refused with a code, so
    // the review column draws it in the page's language. The English stays on the reply.
    const asJson = { ...headers, 'content-type': 'application/json' }
    const corner = await app.inject({ method: 'POST', url: '/api/records', headers: asJson, payload: { kind: 'note', title: 'Test: an empty corner', data: {} } })
    expect(corner.statusCode, corner.body).toBe(201)
    const begun = await app.inject({
      method: 'POST', url: '/api/reviews', headers: asJson,
      payload: { entry: { target: { kind: 'record', recordId: String(corner.json().record.id), workspaceId: 'default' } } },
    })
    expect(begun.statusCode, begun.body).toBe(201)
    const emptyReview = String(begun.json().review.id)
    const finished = await app.inject({ method: 'POST', url: `/api/reviews/${emptyReview}/finish-collecting`, headers: asJson, payload: {} })
    expect(finished.statusCode, finished.body).toBe(200)
    const nothingToRead = await app.inject({ method: 'GET', url: `/api/reviews/${emptyReview}/organise`, headers })
    expect(nothingToRead.statusCode, nothingToRead.body).toBe(409)
    expect(nothingToRead.json()).toMatchObject({ code: 'reviewNothingToRead', values: {} })
    expect(nothingToRead.json().error).toContain(`There is nothing in review ${emptyReview} that can be read.`)
    seen.add('reviewNothingToRead')

    // WHO TAKES THE DEAD LETTERS (problem 0WUuvB0IhRfb), through the door and, for the one reason the door's resolver
    // answers first, through the writer itself. The English stays on the reply.
    const deadLetters = (payload: object, as: Record<string, string> = headers) =>
      app.inject({ method: 'POST', url: '/api/office/dead-letter-secretary', headers: { ...as, 'content-type': 'application/json' }, payload })
    const retiredOne = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'test-retired-reed', name: 'Test Reed', role: 'worker' } })
    expect(retiredOne.statusCode, retiredOne.body).toBe(201)
    const retiredId = String(retiredOne.json().agent.id)
    db.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'test' WHERE id = ?").run(retiredId)
    for (const [reply, status, code, english] of [
      [await deadLetters({ agent: agent.id }, asAnAgent), 403, 'deadLetterSecretaryOwnerNotProved', "Who takes the dead letters is the owner's own setting"],
      [await deadLetters({ agent: 'test-nobody-bears-this' }), 400, 'deadLetterSecretaryNoSuchAgent', 'No agent here answers to'],
      [await deadLetters({ agent: retiredId }), 400, 'deadLetterSecretaryRetired', 'is retired, so it cannot take the dead letters'],
      [await deadLetters({ agent: agent.id }), 400, 'deadLetterSecretaryNoAct', 'does not hold the act'],
      [await app.inject({ method: 'GET', url: '/e1-dead-letter-secretary-not-registered', headers }), 400, 'deadLetterSecretaryNotRegistered', 'is not a registered agent here'],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values: {} })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was changed.')
      seen.add(code)
    }
    db.client.sqlite.prepare("UPDATE installation SET dead_letter_secretary = '' WHERE only_row = 1").run()
    const deadLettersUnreadable = await app.inject({ method: 'GET', url: '/api/office/dead-letter-secretary', headers })
    expect(deadLettersUnreadable.statusCode, deadLettersUnreadable.body).toBe(500)
    expect(deadLettersUnreadable.json()).toMatchObject({ code: 'deadLetterSecretaryUnreadable', values: {} })
    expect(deadLettersUnreadable.json().error).toContain('installation.dead_letter_secretary')
    seen.add('deadLetterSecretaryUnreadable')
    db.client.sqlite.prepare('UPDATE installation SET dead_letter_secretary = NULL WHERE only_row = 1').run()

    // WHO OWNS THE MERGE QUEUE, the same way: the door, and the writer for the one reason the
    // door's resolver answers first. The retired agent and the agent here are workers, so the retired one is refused
    // for its retirement, which is asked first, and the live one for its card.
    const queueOwner = (payload: object, as: Record<string, string> = headers) =>
      app.inject({ method: 'POST', url: '/api/office/merge-queue-owner', headers: { ...as, 'content-type': 'application/json' }, payload })
    for (const [reply, status, code, english] of [
      [await queueOwner({ agent: agent.id }, asAnAgent), 403, 'mergeQueueOwnerOwnerNotProved', "Who owns the merge queue is the owner's own setting"],
      [await queueOwner({ agent: 'test-nobody-bears-this' }), 400, 'mergeQueueOwnerNoSuchAgent', 'No agent here answers to'],
      [await queueOwner({ agent: retiredId }), 400, 'mergeQueueOwnerRetired', 'is retired, so it cannot own the merge queue'],
      [await queueOwner({ agent: agent.id }), 400, 'mergeQueueOwnerNotASecretary', "does not hold the secretary's card"],
      [await app.inject({ method: 'GET', url: '/e1-merge-queue-owner-not-registered', headers }), 400, 'mergeQueueOwnerNotRegistered', 'is not a registered agent here'],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values: {} })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was changed.')
      seen.add(code)
    }
    db.client.sqlite.prepare("UPDATE installation SET merge_queue_owner = '' WHERE only_row = 1").run()
    const queueOwnerUnreadable = await app.inject({ method: 'GET', url: '/api/office/merge-queue-owner', headers })
    expect(queueOwnerUnreadable.statusCode, queueOwnerUnreadable.body).toBe(500)
    expect(queueOwnerUnreadable.json()).toMatchObject({ code: 'mergeQueueOwnerUnreadable', values: {} })
    expect(queueOwnerUnreadable.json().error).toContain('installation.merge_queue_owner')
    seen.add('mergeQueueOwnerUnreadable')
    db.client.sqlite.prepare('UPDATE installation SET merge_queue_owner = NULL WHERE only_row = 1').run()

    // WHO IS REMINDED ABOUT A PROJECT'S MODULES (wave 13p round 29), through the door: an agent that is not a secretary,
    // a secretary with no reason, a project and an agent nobody has, and agents that cannot be reminded. Then a stored
    // value the reading cannot take. The English stays on the reply.
    const moduleClerk = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'test-module-clerk', name: 'Test Module Clerk', role: 'secretary' } })
    expect(moduleClerk.statusCode, moduleClerk.body).toBe(201)
    const moduleClerkKey = String(moduleClerk.json().whatToGiveIt?.key ?? '')
    const asTheModuleClerk = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-module-clerk', 'x-mole-office-key': moduleClerkKey }
    const moduleReminders = (payload: object, as: Record<string, string> = headers, project = 'default') =>
      app.inject({ method: 'POST', url: `/api/office/module-reminder-secretaries/${project}`, headers: { ...as, 'content-type': 'application/json' }, payload })
    for (const [reply, status, code, english] of [
      [await moduleReminders({ secretary: null, because: 'a test asks' }, asAnAgent), 403, 'moduleReminderSecretaryNotAllowed', 'which is neither'],
      [await moduleReminders({ secretary: null }, asTheModuleClerk), 400, 'moduleReminderSecretaryNeedsAReason', 'gives a reason, in "because"'],
      [await moduleReminders({ secretary: null }, headers, 'test-no-such-project'), 404, 'moduleReminderSecretaryNoSuchProject', 'There is no project "test-no-such-project" here'],
      [await moduleReminders({ secretary: 'test-nobody-bears-this' }), 400, 'moduleReminderSecretaryNoSuchAgent', 'No agent here answers to'],
      [await moduleReminders({ secretary: retiredId }), 400, 'moduleReminderSecretaryRetired', 'is retired, so it cannot be reminded about modules'],
      [await moduleReminders({ secretary: agent.id }), 400, 'moduleReminderSecretaryNotASecretary', 'does not hold the secretary card'],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(status)
      expect(reply.json()).toMatchObject({ code, values: {} })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was changed.')
      seen.add(code)
    }
    db.client.sqlite.prepare("UPDATE workspaces SET module_reminder_secretary = '' WHERE id = 'default'").run()
    const moduleRemindersUnreadable = await app.inject({ method: 'GET', url: '/api/office/module-reminder-secretaries', headers })
    expect(moduleRemindersUnreadable.statusCode, moduleRemindersUnreadable.body).toBe(500)
    expect(moduleRemindersUnreadable.json()).toMatchObject({ code: 'moduleReminderSecretaryUnreadable', values: {} })
    expect(moduleRemindersUnreadable.json().error).toContain('workspaces.module_reminder_secretary')
    seen.add('moduleReminderSecretaryUnreadable')
    db.client.sqlite.prepare("UPDATE workspaces SET module_reminder_secretary = NULL WHERE id = 'default'").run()

    db.client.sqlite.prepare("UPDATE installation SET machine_names = 'not json' WHERE only_row = 1").run()
    const unreadable = await app.inject({ method: 'GET', url: '/api/office/machine-names', headers })
    expect(unreadable.statusCode, unreadable.body).toBe(500)
    expect(unreadable.json()).toMatchObject({ code: 'machineNamesUnreadable', values: {} })
    expect(unreadable.json().error).toContain('installation.machine_names')
    seen.add('machineNamesUnreadable')
    db.client.sqlite.prepare('DELETE FROM installation').run()
    const noRow = await naming({ address: '192.0.2.20', name: 'test-loquat' })
    expect(noRow.statusCode, noRow.body).toBe(500)
    expect(noRow.json()).toMatchObject({ code: 'machineNamesNoInstallationRow', values: {} })
    expect(noRow.json().error).toContain('no installation row')
    seen.add('machineNamesNoInstallationRow')
    const deadLettersNoRow = await deadLetters({ agent: null })
    expect(deadLettersNoRow.statusCode, deadLettersNoRow.body).toBe(500)
    expect(deadLettersNoRow.json()).toMatchObject({ code: 'deadLetterSecretaryNoInstallationRow', values: {} })
    expect(deadLettersNoRow.json().error).toContain('no installation row')
    seen.add('deadLetterSecretaryNoInstallationRow')
    const queueOwnerNoRow = await queueOwner({ agent: null })
    expect(queueOwnerNoRow.statusCode, queueOwnerNoRow.body).toBe(500)
    expect(queueOwnerNoRow.json()).toMatchObject({ code: 'mergeQueueOwnerNoInstallationRow', values: {} })
    expect(queueOwnerNoRow.json().error).toContain('no installation row')
    seen.add('mergeQueueOwnerNoInstallationRow')

    // WHO MAY CHANGE A MESSAGE, through the record door: the agent writes to the person, and
    // each of the five refusals is met once. The last one is a notice Mole Office wrote.
    const badPositions = await app.inject({
      method: 'POST', url: '/api/records', headers: { ...asAnAgent, 'content-type': 'application/json' },
      payload: { kind: 'message', title: 'Test: misplaced quote', data: { body: 'Test.', to: [{ kind: 'person', id: THE_PERSON }], quotePositions: [0] } },
    })
    expect(badPositions.statusCode, badPositions.body).toBe(400)
    expect(badPositions.json()).toMatchObject({ code: MESSAGE_QUOTE_POSITIONS_INVALID, values: {}, error: sayInEnglish('server.quotePositions.needsQuotes') })
    seen.add(MESSAGE_QUOTE_POSITIONS_INVALID)

    const wrote = await app.inject({
      method: 'POST', url: '/api/records', headers: { ...asAnAgent, 'content-type': 'application/json' },
      payload: { kind: 'message', title: 'Test: the pots are in', data: { body: 'Test: the pots are in.', to: [{ kind: 'person', id: THE_PERSON }] } },
    })
    expect(wrote.statusCode, wrote.body).toBe(201)
    const said = wrote.json().record.id as string
    const change = (payload: object, as: Record<string, string>) =>
      app.inject({ method: 'PATCH', url: `/api/records/${said}`, headers: { ...as, 'content-type': 'application/json' }, payload })
    for (const [reply, code, values, english] of [
      [await change({ dataPatch: { body: 'Test: rewritten by the reader.' } }, headers), 'messageNotYourWords', {}, 'Only the writer of a message may change it'],
      [await change({ dataPatch: { urgent: true } }, asAnAgent), 'messageFieldNotAWord', {}, 'names data.urgent'],
      [await change({ kind: 'note' }, asAnAgent), 'messageStaysAMessage', {}, 'A message stays a message'],
    ] as const) {
      expect(reply.statusCode, reply.body).toBe(403)
      expect(reply.json()).toMatchObject({ code, values })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was written.')
      seen.add(code)
    }
    db.client.sqlite.prepare("UPDATE records SET created_at = '2026-01-02 10:00:00' WHERE id = ?").run(said)
    const late = await change({ dataPatch: { body: 'Test: rewritten too late.' } }, asAnAgent)
    expect(late.statusCode, late.body).toBe(403)
    expect(late.json()).toMatchObject({ code: 'messageEditWindowClosed', values: { seconds: 120 } })
    expect(late.json().error).toContain('written at 2026-01-02 10:00:00')
    seen.add('messageEditWindowClosed')

    // THE WORDS OF A NOTE THE PERSON WROTE ARE THEIRS (check ekidFZV6r1Yt): an agent's change of its body is refused.
    const theirNote = await app.inject({
      method: 'POST', url: '/api/records', headers: { ...headers, 'content-type': 'application/json' },
      payload: { kind: 'note', title: 'Test: about the kiln', data: { body: 'Test: fire it on Friday.' } },
    })
    expect(theirNote.statusCode, theirNote.body).toBe(201)
    const rewrite = await app.inject({
      method: 'PATCH', url: `/api/records/${theirNote.json().record.id as string}`, headers: { ...asAnAgent, 'content-type': 'application/json' },
      payload: { dataPatch: { body: 'Test: rewritten by an agent.' } },
    })
    expect(rewrite.statusCode, rewrite.body).toBe(403)
    expect(rewrite.json()).toMatchObject({ code: 'noteWordsAreThePersons', values: {} })
    expect(rewrite.json().error).toContain('only they may change them. You are agent:test-willow. Nothing was written.')
    seen.add('noteWordsAreThePersons')
    const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
    const notice = writeASystemLineToOne({ kind: 'person', id: THE_PERSON }, 'default', { line: 'Test: a notice', said: 'Test: a notice from the office.', notice: 'aCounterFired' }, { type: 'agent', id: 'mole-office/the-api-server' })
    const touched = await app.inject({ method: 'PATCH', url: `/api/records/${notice.id}`, headers: { ...headers, 'content-type': 'application/json' }, payload: { dataPatch: { body: 'Test: rewritten notice.' } } })
    expect(touched.statusCode, touched.body).toBe(403)
    expect(touched.json()).toMatchObject({ code: 'messageIsTheOfficesNotice', values: {} })
    expect(touched.json().error).toContain('Mole Office wrote this message')
    seen.add('messageIsTheOfficesNotice')

    // A COMMENT TURNED INTO ANOTHER KIND GOES TO THE PROJECT IT WAS WRITTEN IN (check FxhxPXzPuOZO), and the two ways that
    // is refused: it was written in no project, or a link would join it to a record in another project.
    const json = { 'content-type': 'application/json' }
    const page = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, ...json }, payload: { kind: 'note', title: 'Test: a page', data: {} } })
    expect(page.statusCode, page.body).toBe(201)
    const target = { target: { kind: 'record', recordId: page.json().record.id as string, workspaceId: 'default' } }
    const { 'x-mole-office-workspace': _unused, ...noProject } = headers
    void _unused
    const homeless = await app.inject({ method: 'POST', url: '/api/records', headers: { ...noProject, ...json }, payload: { kind: 'message', title: 'Test: from no project', data: { body: 'Test: from no project.', target } } })
    expect(homeless.statusCode, homeless.body).toBe(201)
    const opened = await app.inject({ method: 'POST', url: '/api/workspaces', headers: { ...headers, ...json }, payload: { id: 'test-elsewhere', title: 'Test elsewhere' } })
    expect(opened.statusCode, opened.body).toBe(201)
    const there = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, ...json, 'x-mole-office-workspace': 'test-elsewhere' }, payload: { kind: 'note', title: 'Test: elsewhere', data: {} } })
    expect(there.statusCode, there.body).toBe(201)
    const joined = await app.inject({ method: 'POST', url: '/api/records', headers: { ...headers, ...json }, payload: { kind: 'message', title: 'Test: joined', data: { body: 'Test: joined.', target } } })
    expect(joined.statusCode, joined.body).toBe(201)
    const link = await app.inject({ method: 'POST', url: '/api/links', headers: { ...headers, ...json }, payload: { fromId: joined.json().record.id, toId: there.json().record.id, type: 'about' } })
    expect(link.statusCode, link.body).toBe(201)
    for (const [id, code, english] of [
      [homeless.json().record.id as string, 'messageWrittenInNoProject', 'is a message written in no project'],
      [joined.json().record.id as string, 'messageLinkedAcrossProjects', 'would then join it to a record in another project'],
    ] as const) {
      const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: { ...headers, ...json }, payload: { kind: 'note' } })
      expect(reply.statusCode, reply.body).toBe(409)
      expect(reply.json()).toMatchObject({ code, values: {} })
      expect(reply.json().error).toContain(english)
      expect(reply.json().error).toContain('Nothing was written.')
      seen.add(code)
    }
    const kept = await app.inject({ method: 'GET', url: `/api/records/${said}`, headers })
    expect(kept.json().record.data.body).toBe('Test: the pots are in.')

    // PERMANENT RESIDENTS: every refusal a press on the residents' pages can meet, sent from the
    // real doors with the page language set to Chinese, and the English kept on the reply.
    {
      const as = (handle: string, key?: string): Record<string, string> => ({
        ...json,
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': handle,
        ...(key === undefined ? {} : { 'x-mole-office-key': key }),
      })
      const asThePerson = { ...headers, ...json }
      const made = new Map<string, { id: string; key: string }>()
      for (const [handle, role] of [['test-res-sec', 'secretary'], ['test-res-a', 'worker'], ['test-res-b', 'worker'], ['test-res-c', 'worker']] as const) {
        const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle, name: handle, role } })
        expect(reply.statusCode, reply.body).toBe(201)
        made.set(handle, { id: reply.json().agent.id as string, key: String(reply.json().whatToGiveIt?.key ?? '') })
      }
      const key = (handle: string): string => made.get(handle)!.key
      const expectCoded = async (code: RefusalCode, status: number, english: string, reply: { statusCode: number; body: string; json: () => any }): Promise<void> => {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values: {} })
        expect(reply.json().error).toContain(english)
        seen.add(code)
      }
      const propose = async (handle: string): Promise<string> => {
        const reply = await app.inject({ method: 'POST', url: '/api/residents/proposals', headers: as('test-res-sec', key('test-res-sec')), payload: { agentId: handle, because: 'Test: steady work.' } })
        expect(reply.statusCode, reply.body).toBe(201)
        return reply.json().proposal.id as string
      }
      const confirm = (id: string) => app.inject({ method: 'POST', url: `/api/residents/proposals/${id}/confirm`, headers: asThePerson })
      const spaces = join(dirname(db.file), 'personal-spaces')
      const aId = made.get('test-res-a')!.id
      const proposal = await propose('test-res-a')
      await expectCoded('residentProposalHasItsOwnDoors', 409, 'only its own two presses settle it', await app.inject({ method: 'POST', url: `/api/records/${proposal}/promote`, headers: asThePerson, payload: { title: 'Test: settled by the generic door' } }))
      await expectCoded('residentNoSuchProposal', 404, 'No open residency proposal', await confirm('test-no-such-proposal'))
      mkdirSync(join(spaces, aId), { recursive: true })
      await expectCoded('residentFolderAlreadyThere', 409, 'is already there', await confirm(proposal))
      rmSync(spaces, { recursive: true, force: true })
      writeFileSync(spaces, 'test: not a folder')
      await expectCoded('residentFolderNotMade', 500, 'could not be made', await confirm(proposal))
      rmSync(spaces, { force: true })
      expect((await confirm(proposal)).statusCode).toBe(200)
      await expectCoded('residentProposalSettled', 409, 'already settled', await confirm(proposal))
      const forB = await propose('test-res-b')
      expect((await app.inject({ method: 'POST', url: '/api/participants/agent/test-res-b/retire', headers: asThePerson, payload: { because: 'Test: done.' } })).statusCode).toBe(200)
      await expectCoded('residentNoLongerEligible', 409, 'can no longer be confirmed', await confirm(forB))
      theResident.id = aId
      await expectCoded('addressResidentIsItsOwn', 403, 'A secretary may not set it.', await app.inject({ method: 'PUT', url: '/api/participants/agent/test-res-a/address-as', headers: as('test-res-sec', key('test-res-sec')), payload: { name: 'Test' } }))
      await expectCoded('addressResidentKeyMissing', 403, 'no key on it proves that resident', await app.inject({ method: 'PUT', url: '/api/participants/agent/test-res-a/address-as', headers: as('test-res-a'), payload: { name: 'Test' } }))
      await expectCoded('addressResidentOwnerNotProved', 403, 'not proved to be the owner', await app.inject({ method: 'GET', url: '/e1-resident-owner-not-proved', headers }))
      await expectCoded('residentSpaceIsPrivate', 403, 'This space is private.', await app.inject({ method: 'GET', url: '/api/residents/test-res-a/space', headers: as('test-res-c', key('test-res-c')) }))
      const voidIt = (path: string, because: string) => app.inject({ method: 'POST', url: '/api/residents/test-res-a/space/void', headers: asThePerson, payload: { path, because } })
      await expectCoded('residentVoidNeedsAReason', 400, 'Say why the file is void', await voidIt('a.md', ' '))
      await expectCoded('residentOriginsNeverVoid', 403, 'never marked void', await voidIt('session-origins.jsonl', 'Test.'))
      await expectCoded('residentNoSuchFile', 404, 'holds no file', await voidIt('test-none.md', 'Test.'))
      expect((await app.inject({ method: 'PUT', url: '/api/residents/test-res-a/space/file?path=a.md', headers: as('test-res-a', key('test-res-a')), payload: { text: 'Test.' } })).statusCode).toBe(201)
      expect((await voidIt('a.md', 'Test.')).statusCode).toBe(201)
      await expectCoded('residentAlreadyVoid', 409, 'is already void', await voidIt('a.md', 'Test again.'))
      await expectCoded('residentNoSuchGrant', 404, 'gave no leave', await app.inject({ method: 'POST', url: '/api/residents/test-res-a/grants/test-none/end', headers: asThePerson }))
      const given = await app.inject({ method: 'POST', url: '/api/residents/test-res-a/grants', headers: as('test-res-a', key('test-res-a')), payload: { readerAgentId: 'test-res-c', until: '2099-01-01 12:00' } })
      expect(given.statusCode, given.body).toBe(201)
      const end = () => app.inject({ method: 'POST', url: `/api/residents/test-res-a/grants/${String(given.json().grant.id)}/end`, headers: asThePerson })
      expect((await end()).statusCode).toBe(200)
      await expectCoded('residentGrantAlreadyEnded', 409, 'already ended', await end())
      const successor = (agentId: string) => app.inject({ method: 'POST', url: `/api/residents/${aId}/successor`, headers: asThePerson, payload: { agentId } })
      await expectCoded('residentNotRetired', 409, 'is not retired', await successor('test-res-c'))
      expect((await app.inject({ method: 'POST', url: '/api/participants/agent/test-res-a/retire', headers: asThePerson, payload: { because: 'Test: done.' } })).statusCode).toBe(200)
      await expectCoded('residentSuccessorIsItself', 400, 'its own successor', await successor(aId))
      await expectCoded('residentNoSuchSuccessor', 404, 'No agent in this installation answers', await successor('test-no-such-agent'))
      await expectCoded('residentSuccessorNotAnAgent', 409, 'cannot be a successor', await successor(made.get('test-res-b')!.id))
      expect((await successor('test-res-c')).statusCode).toBe(200)
      await expectCoded('residentSuccessorAlreadyNamed', 409, 'is named once', await successor('test-res-sec'))
    }

    // THE ANSWERS TO THE QUESTIONS IN A REPORT: every refusal the questions
    // draw, sent from the answer door with the page language set to Chinese, and the English kept on the reply.
    // MUTATION, after a control run on 2 October 2026: the code taken off the receiver refusal in lib/answers.ts turns
    // this file red, because the code is no longer among those sent.
    {
      const asThePerson = { ...headers, ...json }
      const agentHeaders = { ...json, 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-ans-writer' }
      const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'test-ans-writer', name: 'Test Ans Writer', role: 'worker' } })
      expect(started.statusCode, started.body).toBe(201)
      const question = { id: 'q-a', type: 'choice', question: 'Test: which one?', options: [{ id: 'a', label: 'Test A' }, { id: 'b', label: 'Test B' }] }
      const fileAReport = async (as: Record<string, string>, title: string, blocks: unknown[]): Promise<string> => {
        const filed = await app.inject({ method: 'POST', url: '/api/records', headers: as, payload: { kind: 'report', title, data: { for: 'Test Rowan', date: '2026-10-02', blocks } } })
        expect(filed.statusCode, filed.body).toBe(201)
        return String(filed.json().record.id)
      }
      const byTheAgent = await fileAReport(agentHeaders, 'Test: a report asking a question', [question])
      const byThePerson = await fileAReport(asThePerson, 'Test: a report the person wrote', [{ id: 'q-c', type: 'fillin', asks: 'Test: anything?' }])
      const keep = (report: string, block: string, answer: unknown, as: Record<string, string> = asThePerson) =>
        app.inject({ method: 'PUT', url: `/api/records/${report}/answers/${block}`, headers: as, payload: { answer } })
      const send = (report: string) => app.inject({ method: 'POST', url: `/api/records/${report}/answers/send`, headers: asThePerson, payload: { press: { scope: 'report' } } })
      const expectAnswerCoded = async (code: RefusalCode, status: number, english: string, values: Record<string, string>, reply: { statusCode: number; body: string; json: () => any }): Promise<void> => {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values })
        expect(reply.json().error).toContain(english)
        seen.add(code)
      }
      await expectAnswerCoded('answerNotThePerson', 403, 'Only the person answers the questions in a report', {}, await keep(byTheAgent, 'q-a', { chosen: ['a'] }, agentHeaders))
      await expectAnswerCoded('answerNotAnOption', 400, 'which is not one of its options', {}, await keep(byTheAgent, 'q-a', { chosen: ['z'] }))
      await expectAnswerCoded('answersNothingUnsent', 409, 'Nothing was sent.', {}, await send(byTheAgent))
      expect((await keep(byThePerson, 'q-c', { words: 'Test.' })).statusCode).toBe(200)
      await expectAnswerCoded('answersNobodyToSendTo', 409, 'has nobody to go to', {}, await send(byThePerson))
      expect((await keep(byTheAgent, 'q-a', { chosen: ['b'] })).statusCode).toBe(200)
      const retired = await app.inject({ method: 'POST', url: '/api/participants/agent/test-ans-writer/retire', headers: asThePerson, payload: { because: 'Test: its work is done' } })
      expect(retired.statusCode, retired.body).toBe(200)
      await expectAnswerCoded('answersReceiverCannotTakeAMessage', 409, 'cannot take a message', { agent: 'Test Ans Writer' }, await send(byTheAgent))
    }

    // THE OFFICE'S OWN TERMINAL, ITS INSTALL PRESS AND START AT LOGIN (wave 13u, rounds 2 and 3). Each refusal a real
    // door can give here with nothing on this machine touched is sent from that door: an agent at each person-only door,
    // and install presses refused before anything opens (a line that looks like a key is kept since round 12). The rest need a terminal
    // holder in a given state, a machine with no systemd, no HOME or not Linux, or a unit that is not the office's. A
    // test may not make those here, so each is thrown from a test route with the doors' own shape (their own tests
    // meet them at the doors: tests/the-terminal-doors-are-the-persons.test.ts, tests/typing-in-a-terminal-is-kept-as-the-persons-words.test.ts,
    // tests/the-install-press-installs-the-ticked-tools.test.ts, tests/the-office-starts-at-login-by-the-persons-press.test.ts).
    // No POST reaches the start-at-login press as the person: in a server that is not a test world it would run systemctl.
    {
      const asThePerson = { ...headers, ...json }
      const asWillow = { ...json, 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id, 'x-mole-office-key': willowKey }
      const expectCoded = async (code: RefusalCode, status: number, english: string, reply: { statusCode: number; body: string; json: () => any }): Promise<void> => {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code })
        expect(reply.json().error).toContain(english)
        seen.add(code)
      }
      await expectCoded('terminalsOnlyThePerson', 403, 'Only the person', await app.inject({ method: 'GET', url: '/api/terminals', headers: asWillow }))
      // A PLAIN TERMINAL'S FOLDER (wave 13u, round 7b), at the open door itself: refused before the holder is asked, so
      // nothing is opened. Each names the folder as its value.
      const folders = mkdtempSync(join(tmpdir(), 'test-terminal-folder-'))
      try {
        const aFile = join(folders, 'test-a-file')
        writeFileSync(aFile, 'test')
        for (const [code, folder, english] of [
          ['terminalFolderNotAbsolute', 'test-relative-yard', 'is not one'],
          ['terminalFolderMissing', join(folders, 'test-no-such-yard'), 'There is no folder at'],
          ['terminalFolderIsAFile', aFile, 'is a file, not a folder'],
        ] as const) {
          const reply = await app.inject({ method: 'POST', url: '/api/terminals', headers: asThePerson, payload: { folder } })
          await expectCoded(code, 400, english, reply)
          expect(reply.json().values).toEqual({ folder })
        }
      } finally {
        rmSync(folders, { recursive: true, force: true })
      }
      const install = (harnesses: string[], as: Record<string, string> = asThePerson) => app.inject({ method: 'POST', url: '/api/harnesses/install', headers: as, payload: { harnesses } })
      await expectCoded('harnessesOnlyThePerson', 403, 'Only the person', await install(['codex'], asWillow))
      await expectCoded('harnessNoneTicked', 400, 'No agent tool was ticked', await install([]))
      await expectCoded('harnessUnknown', 400, 'test-no-such-tool', await install(['test-no-such-tool']))
      await expectCoded('harnessHasNoInstaller', 400, 'has no install command here', await install(['kimi']))
      await expectCoded('startAtLoginOnlyThePerson', 403, 'Only the person', await app.inject({ method: 'GET', url: '/api/office/start-at-login', headers: asWillow }))
      await expectCoded('sandboxCapOnlyThePerson', 403, 'Only the person', await app.inject({ method: 'GET', url: '/api/office/sandbox-memory-cap', headers: asWillow }))
      for (const [code, status, english, values] of THROWN_HERE) {
        const reply = await app.inject({ method: 'GET', url: `/e1-thrown-${code}`, headers })
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toEqual({ error: english, code, values })
        seen.add(code)
      }
    }

    // OPENING AN AGENT IN A TERMINAL (wave 13u, round 3: POST /api/terminals/agents). Every refusal the door can give
    // before it reaches the terminal holder, sent with the page language set to Chinese and the English kept on the reply.
    // No holder runs here, and every one of these is refused before the holder is asked, so nothing is opened. The PATH
    // the door looks for programs on is set to a folder of this test's own, so whether a program is installed here
    // decides nothing: it holds a "claude" that is never run, and no "kimi".
    {
      const asThePerson = { ...headers, ...json }
      const expectTerminalCoded = async (code: RefusalCode, status: number, english: string, reply: { statusCode: number; body: string; json: () => any }): Promise<void> => {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values: {} })
        expect(reply.json().error).toContain(english)
        seen.add(code)
      }
      const place = mkdtempSync(join(tmpdir(), 'mole-office-terminal-agent-refusals-'))
      const bin = join(place, 'bin')
      mkdirSync(bin)
      writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      const register = async (handle: string, runtime: string, startFolder: string | null): Promise<string> => {
        const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle, name: handle, role: 'worker', runtime } })
        expect(made.statusCode, made.body).toBe(201)
        if (startFolder !== null) {
          mkdirSync(startFolder, { recursive: true })
          const set = await app.inject({ method: 'POST', url: `/api/participants/agent/${handle}/start-folder`, headers: asThePerson, payload: { startFolder, because: 'Test: a terminal opens here' } })
          expect(set.statusCode, set.body).toBe(200)
        }
        return String(made.json().agent.id)
      }
      const open = (agent: string, resume = false, as: Record<string, string> = asThePerson) =>
        app.inject({ method: 'POST', url: '/api/terminals/agents', headers: as, payload: { agent, ...(resume ? { resume } : {}) } })
      const pathBefore = process.env['PATH']
      process.env['PATH'] = bin
      try {
        await register('test-term-claude', 'claude-code', join(place, 'claude'))
        await register('test-term-kimi', 'kimi', join(place, 'kimi'))
        await register('test-term-dsh', 'dsh', join(place, 'dsh'))
        await register('test-term-nowhere', 'claude-code', null)
        await register('test-term-gone', 'claude-code', join(place, 'gone'))
        rmSync(join(place, 'gone'), { recursive: true })
        const retiredId = await register('test-term-retired', 'claude-code', join(place, 'retired'))
        expect((await app.inject({ method: 'POST', url: '/api/participants/agent/test-term-retired/retire', headers: asThePerson, payload: { because: 'Test: done.' } })).statusCode).toBe(200)
        const noRuntime = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'test-term-plain', name: 'test-term-plain', role: 'worker' } })
        expect(noRuntime.statusCode, noRuntime.body).toBe(201)

        await expectTerminalCoded('terminalsOnlyThePerson', 403, 'Only the person may use the terminal doors of the office', await open('test-term-claude', false, { ...json, 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id }))
        await expectTerminalCoded('terminalAgentNotFound', 404, 'No agent answers to "test-term-nobody"', await open('test-term-nobody'))
        await expectTerminalCoded('terminalAgentRetired', 409, 'is retired', await open(retiredId))
        await expectTerminalCoded('terminalAgentDshNotInteractive', 409, 'does not start dsh interactively', await open('test-term-dsh'))
        // WITH NO START FOLDER AND "resume": refused before anything is made. Without "resume" the office makes the agent a
        // folder of its own, which this in-process office would make beside the test's database and trust in the runner's
        // HOME (wave 13s round 205; tests/an-agent-with-no-start-folder-opens-in-its-own-folder.test.ts opens one).
        await expectTerminalCoded('terminalAgentNoStartFolder', 409, 'has no start folder recorded in this project', await open('test-term-nowhere', true))
        await expectTerminalCoded('terminalAgentStartFolderGone', 409, 'is not a folder on this computer now', await open('test-term-gone'))
        await expectTerminalCoded('terminalAgentProgramMissing', 409, 'no "kimi" is on the PATH', await open('test-term-kimi'))
        await expectTerminalCoded('terminalAgentNothingToResume', 409, 'there is no conversation to continue', await open('test-term-claude', true))
        // A malformed settings file in a made-up home refuses before the holder, preserving the helper's English.
        const home = join(place, 'trust-home')
        mkdirSync(home)
        writeFileSync(join(home, '.claude.json'), '{')
        const homeBefore = process.env['HOME']
        process.env['HOME'] = home
        try {
          const { trustTheRecordedClaudeFolder } = await import('../src/server/lib/terminals/claude-folder-trust.ts')
          let because = ''
          try { trustTheRecordedClaudeFolder({ folder: join(place, 'claude'), recordedFolder: join(place, 'claude'), env: { HOME: home } }) }
          catch (error) { if (!(error instanceof Error)) throw error; because = error.message }
          expect(because).not.toBe('')
          await expectTerminalCoded('terminalAgentTrustUnsafe', 409, because, await open('test-term-claude'))
        } finally {
          if (homeBefore === undefined) delete process.env['HOME']
          else process.env['HOME'] = homeBefore
        }
        // AN AGENT REGISTERED WITH NO RUNTIME: its record names none (POST /api/agents/started writes none).
        await expectTerminalCoded('terminalAgentNoRuntime', 409, 'names no runtime', await open('test-term-plain'))
        // PAST EVERY CHECK, THE HOLDER IS ASKED, and none runs here: the round-2 refusal, with its code, and nothing opens.
        await expectTerminalCoded('terminalHolderNotRunning', 503, 'So no terminal can be opened', await open('test-term-claude'))

        // THE WAY BACK'S PRESS (wave 13u, round 10: POST /api/terminals/agents/:agent/way-back). Each refusal is met with
        // a run filed in the shape the session hook files one, and each comes before anything is filed or opened.
        await register('test-wb-claude', 'claude-code', null)
        await register('test-wb-norun', 'claude-code', null)
        const aRun = async (data: Record<string, unknown>, servingAgent = 'test-wb-claude'): Promise<string> => {
          const filed = await app.inject({
            method: 'POST',
            url: '/api/records',
            headers: { ...asThePerson, ...thePersonsKeyHeader() },
            payload: { kind: 'session', title: 'Test run', data: { state: 'running', servingAgent, runtime: 'claude-code', ...data } },
          })
          expect(filed.statusCode, filed.body).toBe(201)
          return String(filed.json().record?.id ?? filed.json().id)
        }
        const conversation = '00000000-test-4000-8000-00000000000a'
        const noConversation = await aRun({ workingDirectory: place })
        const inASandbox = await aRun({ providerSession: conversation, workingDirectory: '/workspace/test', sandbox: { template: 'test-template', folder: '/test/sandboxes/test-instance' } })
        const held = await aRun({ providerSession: conversation, workingDirectory: place, extra: { inATerminal: { terminal: 'test-terminal', holder: { pid: 1 } } } })
        const folderGone = await aRun({ providerSession: conversation, workingDirectory: join(place, 'test-no-such-folder') })
        const bringBack = (agent: string, session: string) =>
          app.inject({ method: 'POST', url: `/api/terminals/agents/${agent}/way-back`, headers: asThePerson, payload: { session } })
        await expectTerminalCoded('wayBackNoRun', 404, 'has no record of a run', await bringBack('test-wb-norun', noConversation))
        await expectTerminalCoded('wayBackNotThisAgents', 409, 'is not a run of test-wb-claude', await bringBack('test-wb-claude', 'testNoSuchRun'))
        await expectTerminalCoded('wayBackNone', 409, 'Nobody recorded which conversation', await bringBack('test-wb-claude', noConversation))
        await expectTerminalCoded('wayBackInASandbox', 409, 'ran in a sandbox', await bringBack('test-wb-claude', inASandbox))
        await expectTerminalCoded('wayBackStillRunning', 409, "in the office's terminal test-terminal", await bringBack('test-wb-claude', held))
        await expectTerminalCoded('wayBackFolderGone', 409, 'is not a folder on this computer now', await bringBack('test-wb-claude', folderGone))

        // AN AGENT'S TMUX PANE (wave 13u, round 10, way B), refused before any process or tmux is asked.
        await register('test-pane-sandbox', 'claude-code', null)
        await aRun({ providerSession: conversation, workingDirectory: '/workspace/test', sandbox: { template: 'test-template', folder: '/test/sandboxes/test-instance' } }, 'test-pane-sandbox')
        const showThePane = (agent: string) => app.inject({ method: 'POST', url: `/api/terminals/agents/${agent}/pane`, headers: asThePerson, payload: {} })
        await expectTerminalCoded('paneNoRun', 404, 'No session record serves this agent', await showThePane('test-wb-norun'))
        await expectTerminalCoded('paneInASandbox', 409, 'works in a sandbox', await showThePane('test-pane-sandbox'))
        await expectTerminalCoded('paneNotRunning', 409, 'no process names its conversation', await showThePane('test-wb-claude'))
      } finally {
        if (pathBefore === undefined) delete process.env['PATH']
        else process.env['PATH'] = pathBefore
        rmSync(place, { recursive: true, force: true })
      }
    }

    // A MESSAGE THAT SEEMS TO HOLD A KEY is no longer refused: it is stored and its answer carries a
    // reminder. This is proved in
    // tests/a-message-that-seems-to-hold-a-key-is-stored-with-a-reminder.test.ts. The messageHolds*
    // codes went with the refusal.

    // WHAT A DECISION GOVERNS, through its two doors: a lookup that sends both of `path` and
    // `record`, and a decision whose governs names a task. The English stays on the reply and nothing is written.
    {
      const task = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'task', title: 'Test: a task to govern', data: {} } })
      expect(task.statusCode, task.body).toBe(201)
      const both = await app.inject({ method: 'GET', url: '/api/decisions/governing?path=src&record=test-module', headers })
      expect(both.statusCode, both.body).toBe(400)
      expect(both.json()).toMatchObject({ error: 'Which decisions govern a place: send exactly one of `path` or `record`.', code: 'governingAskExactlyOne', values: {} })
      seen.add('governingAskExactlyOne')
      const decision = await app.inject({ method: 'POST', url: '/api/records', headers, payload: {
        kind: 'decision', title: 'Test: a decision over a task', data: { option_taken: 'Test.', because: 'Test.', replaces: [], governs: [{ record: task.json().record.id }] },
      } })
      expect(decision.statusCode, decision.body).toBe(400)
      expect(decision.json()).toMatchObject({ code: 'governsNamesRecordsItCannotGovern', values: {} })
      expect(decision.json().error).toContain('Nothing was written.')
      seen.add('governsNamesRecordsItCannotGovern')
    }

    // THE FLOW FOR PLANNING A BIG PIECE OF WORK, through its two doors, the checklist door that ticks
    // its item and the record door that may not write module.planning, in wave 13j round
    // 49. The English stays.
    // CONTROL: 1 passed. MUTATION: the submit door's planNotOpen refusal sent planStepAlreadyDone; red. RESTORE: 1 passed.
    {
      const thePerson: Actor = { type: 'human', id: THE_PERSON }
      const startedIds: string[] = []
      for (const handle of ['test-planner', 'test-not-the-planner']) {
        const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: 'worker' } })
        expect(started.statusCode, started.body).toBe(201)
        startedIds.push(String(started.json().agent.id))
      }
      const plannerId = startedIds[0]!
      const make = (kind: RecordKind, title: string, data: Record<string, unknown>) => db.api.createRecord({ workspaceId: 'default', kind, title, data, actor: thePerson }).id
      const run = make('session', 'Test run of test-planner', { state: 'running', servingAgent: 'test-planner', doing: 'Test: planning' })
      const otherRun = make('session', 'Test run of test-not-the-planner', { state: 'running', servingAgent: 'test-not-the-planner', doing: 'Test' })
      const asPlanner = (session?: string) => ({
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'test-planner',
        ...(session === undefined ? {} : { 'x-mole-office-session': session }),
      })
      const asOther = { ...asPlanner(otherRun), 'x-mole-office-actor-id': 'test-not-the-planner' }
      const planned = make('module', 'Test module: planned', { state: 'active', planner: { kind: 'agent', id: plannerId } })
      const noPlanner = make('module', 'Test module: no planner', { state: 'active' })
      const noPipeline = make('module', 'Test module: no pipeline', { state: 'active', planner: { kind: 'agent', id: plannerId } })
      const pipeline = make('pipeline', 'Test pipeline: planned', { blockIds: [] })
      const stray = make('pipeline', 'Test pipeline: stray', { blockIds: [] })
      db.api.createLink({ fromId: pipeline, toId: planned, type: 'relates_to', actor: thePerson })
      const othersList = await app.inject({ method: 'POST', url: '/api/checklists', headers: asOther, payload: { title: 'Test: not the planner\'s' } })
      expect(othersList.statusCode, othersList.body).toBe(201)
      const step = (module: string, as: Record<string, string>, payload: object) =>
        app.inject({ method: 'POST', url: `/api/modules/${module}/plan-step-done`, headers: as, payload })
      const submit = (as: Record<string, string>) =>
        app.inject({ method: 'POST', url: `/api/modules/${planned}/plan`, headers: as, payload: { answers: { againstHisDecisions: 'Test.', alreadyDone: 'Test.', localFix: 'Test.', leastSure: 'Test.' } } })
      const cases: [Awaited<ReturnType<typeof step>>, number, RefusalCode, string][] = [
        [await step(pipeline, asPlanner(run), { pipeline }), 409, 'planNotAModule', 'the planning flow runs on a module'],
        [await step(noPlanner, asPlanner(run), { pipeline }), 409, 'planModuleNamesNoPlanner', 'names no planner'],
        [await step(planned, asOther, { pipeline }), 403, 'planCallerIsNotThePlanner', 'may use the planning doors on it'],
        [await step(planned, asPlanner(), { pipeline }), 400, 'planNeedsARun', 'names none that this project holds'],
        [await step(noPipeline, asPlanner(run), { pipeline }), 409, 'planModuleHasNoPipeline', 'has no pipeline'],
        [await step(planned, asPlanner(run), { pipeline: stray }), 409, 'planPipelineNotTheModules', 'is not one of the pipelines'],
        [await step(planned, asPlanner(run), { pipeline, checklist: othersList.json().checklist.id }), 409, 'planChecklistNotThePlanners', "is not one of"],
        [await submit(asPlanner(run)), 409, 'planNotOpen', 'waits to be submitted'],
      ]
      const done = await step(planned, asPlanner(run), { pipeline })
      expect(done.statusCode, done.body).toBe(201)
      const { checklist, item } = done.json().planning.checklistItem
      cases.push(
        [await step(planned, asPlanner(run), { pipeline }), 409, 'planStepAlreadyDone', 'has not been submitted'],
        [
          await app.inject({ method: 'PATCH', url: `/api/checklists/${checklist}/items/${item}`, headers: asOther, payload: { state: 'done', addEvidence: [{ kind: 'run', record: otherRun }] } }),
          403,
          'planItemTickedByAnother',
          'Only the person or the module\'s planner',
        ],
        [
          await app.inject({ method: 'PATCH', url: `/api/records/${planned}`, headers: { ...headers, 'content-type': 'application/json' }, payload: { dataPatch: { planning: null } } }),
          403,
          'planWrittenOutsideItsDoors',
          'written only by the planning doors',
        ],
        // WAVE 13J ROUND 51 ADDED THIS CODE AND NO CASE HERE, so this test was red on that round's branch (found in round 52).
        [
          await app.inject({ method: 'PATCH', url: `/api/records/${planned}`, headers: asOther, payload: { dataPatch: { planner: { kind: 'agent', id: startedIds[1]! } } } }),
          403,
          'plannerNamedByAnother',
          'is named only by the person',
        ],
      )
      for (const [reply, status, code, english] of cases) {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values: {} })
        expect(reply.json().error).toContain(english)
        expect(reply.json().error).toMatch(/Nothing was (changed|written)\./)
        seen.add(code)
      }
    }

    // THE SHUTDOWN DOOR, in wave 13n round 58: an agent's press, through the door, and a
    // list that changed, thrown above.
    {
      const byAnAgent = await app.inject({ method: 'POST', url: '/api/office/shut-down', headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-willow' }, payload: {} })
      expect(byAnAgent.statusCode, byAnAgent.body).toBe(403)
      expect(byAnAgent.json()).toMatchObject({ code: 'shutDownOnlyTheOwner', values: {} })
      expect(byAnAgent.json().error).toContain("Only the owner may shut the office down, or a secretary holding the owner's grant where this office's list of what the grant carries says so. Any other agent is refused.")
      seen.add('shutDownOnlyTheOwner')
      const changed = await app.inject({ method: 'GET', url: '/e1-shut-down-runs-changed', headers })
      expect(changed.statusCode).toBe(409)
      expect(changed.json()).toEqual({ error: 'Test: a run started after the list was read.', code: 'shutDownRunsChanged', values: { count: 2 } })
      seen.add('shutDownRunsChanged')
    }

    // ENTERING A FLOW, in wave 13j round 52: the door and the hand tick of the item it puts
    // on the agent's checklist. The English stays.
    // CONTROL: green (.logs/named-tests-2026-10-11T05-48-14-267.log). MUTATION: flowAlreadyEntered sent as flowNotAFlow, red
    // (.logs/named-tests-2026-10-11T05-52-03-229.log). RESTORE: green (.logs/named-tests-2026-10-11T05-54-47-929.log).
    // Round 52b adds flowItemChangedByAnother: another agent taking the flow run's link off the item. CONTROL: green
    // (07-00-22-326). MUTATION: the guard lets another's change that is not a tick through, red (07-01-04-263); the guard
    // handed the item as changed, red (07-00-49-148). RESTORE: green (07-01-50-377).
    {
      const thePerson: Actor = { type: 'human', id: THE_PERSON }
      const ids: Record<string, string> = {}
      for (const handle of ['test-enterer', 'test-bystander']) {
        const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: 'worker' } })
        expect(started.statusCode, started.body).toBe(201)
        ids[handle] = String(started.json().agent.id)
      }
      const make = (kind: RecordKind, title: string, data: Record<string, unknown>) => db.api.createRecord({ workspaceId: 'default', kind, title, data, actor: thePerson }).id
      const run = make('session', 'Test run of test-enterer', { state: 'running', servingAgent: 'test-enterer', doing: 'Test: entering a flow' })
      const otherRun = make('session', 'Test run of test-bystander', { state: 'running', servingAgent: 'test-bystander', doing: 'Test' })
      const lonely = make('session', 'Test run that serves nobody', { state: 'running', doing: 'Test' })
      const as = (handle: string, session?: string) => ({
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': handle,
        ...(session === undefined ? {} : { 'x-mole-office-session': session }),
      })
      const source = make('report', 'Test source of the flow', { blocks: [] })
      const aFlow = (title: string, extra: Record<string, unknown>) =>
        make('flow', title, {
          declared_in: 'a made-up flow of this test',
          runs: 'a made-up worker',
          trigger: 'Test.',
          stages: [{ n: 1, does: 'Test.', evidence: 'Test.', why: 'Test.', sources: [source] }],
          leaves_behind: 'Test.',
          governed_by: 'this test file',
          reviewed_at: '2026-10-11',
          ...extra,
        })
      const flow = aFlow('Test flow: entered', {})
      const planningFlow = aFlow('Test flow: the planning flow', { governed_by: 'src/server/lib/planning-flow.ts' })
      const about = make('note', 'Test note: what the flow is about', { body: 'Test.' })
      const bystanders = await app.inject({ method: 'POST', url: '/api/checklists', headers: as('test-bystander', otherRun), payload: { title: 'Test: the bystander\'s' } })
      expect(bystanders.statusCode, bystanders.body).toBe(201)
      const enter = (id: string, by: Record<string, string>, payload: object) => app.inject({ method: 'POST', url: `/api/flows/${id}/enter`, headers: by, payload })
      const cases: [Awaited<ReturnType<typeof enter>>, number, RefusalCode, string][] = [
        [await enter(about, as('test-enterer', run), { about }), 409, 'flowNotAFlow', 'is not a live flow record'],
        [await enter(planningFlow, as('test-enterer', run), { about }), 409, 'flowEnteredByItsOwnDoor', 'entered by its own door'],
        [await enter(flow, as('test-enterer', run), { about: 'no-such-record' }), 409, 'flowAboutNotHere', 'names no live record in this project'],
        [await enter(flow, as('test-enterer'), { about }), 400, 'flowNeedsARun', 'names no run this project holds'],
        [await enter(flow, { ...headers, 'content-type': 'application/json' }, { about, run: lonely }), 409, 'flowRunServesNoAgent', 'names no agent this office knows'],
        [await enter(flow, as('test-bystander', otherRun), { about, run }), 403, 'flowEnteredForAnother', 'only that agent or the person may enter'],
        [await enter(flow, as('test-enterer', run), { about, checklist: bystanders.json().checklist.id }), 409, 'flowChecklistNotTheirs', 'is not one of'],
      ]
      const entered = await enter(flow, as('test-enterer', run), { about })
      expect(entered.statusCode, entered.body).toBe(201)
      const { checklist, item } = entered.json().entered.checklistItem
      cases.push(
        [await enter(flow, as('test-enterer', run), { about }), 409, 'flowAlreadyEntered', 'has not ended'],
        [
          await app.inject({ method: 'PATCH', url: `/api/checklists/${checklist}/items/${item}`, headers: as('test-bystander', otherRun), payload: { state: 'done' } }),
          403,
          'flowItemTickedByAnother',
          'Only the person or that agent',
        ],
        [
          await app.inject({ method: 'PATCH', url: `/api/checklists/${checklist}/items/${item}`, headers: as('test-bystander', otherRun), payload: { links: [about] } }),
          403,
          'flowItemChangedByAnother',
          'only the person or the agent in the flow may change the item',
        ],
      )
      for (const [reply, status, code, english] of cases) {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values: {} })
        expect(reply.json().error).toContain(english)
        expect(reply.json().error).toContain('Nothing was changed.')
        seen.add(code)
      }
      void ids
    }

    // A CHANGE TO AN ITEM SENT WITH A VERSION THE CHECKLIST NO LONGER HAS (wave 13j round loop-8): another item changed
    // after the read. The code is for the press on the page; the English, which names both versions, stays on the reply.
    {
      const asThePerson = { ...headers, 'content-type': 'application/json' }
      const made = await app.inject({ method: 'POST', url: '/api/checklists', headers: asThePerson, payload: { title: 'Test: two items', items: [{ words: 'Test item one' }, { words: 'Test item two' }] } })
      expect(made.statusCode, made.body).toBe(201)
      const list = made.json().checklist
      const [one, two] = list.items as { id: string }[]
      const read = await app.inject({ method: 'GET', url: `/api/checklists/${list.id}`, headers })
      const version = String(read.json().checklist.version)
      const moved = await app.inject({ method: 'PATCH', url: `/api/checklists/${list.id}/items/${one!.id}`, headers: asThePerson, payload: { state: 'in progress', ifVersion: version } })
      expect(moved.statusCode, moved.body).toBe(200)
      const stale = await app.inject({ method: 'PATCH', url: `/api/checklists/${list.id}/items/${two!.id}`, headers: asThePerson, payload: { state: 'in progress', ifVersion: version } })
      expect(stale.statusCode, stale.body).toBe(409)
      expect(stale.json()).toMatchObject({ code: 'checklistChangedSinceRead', values: {} })
      expect(stale.json().error).toContain('has changed since you read it, so nothing was written.')
      expect(stale.json().error).toContain(`You sent ifVersion "${version}"`)
      seen.add('checklistChangedSinceRead')
      const after = await app.inject({ method: 'GET', url: `/api/checklists/${list.id}`, headers })
      expect((after.json().checklist.items as { id: string; state: string }[]).find((item) => item.id === two!.id)!.state).toBe('open')
    }

    // THE STARTER'S ITEMS FOR THE REMINDER BEFORE THE SEAL (wave 13j round 54): PUT /api/records/<run>/check-also, and the
    // record door refusing `checkAlso`. The run is filed by the office's worker, so it holds a key of its own.
    {
      const asTheWorker = { ...headers, 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', ...theOfficesKeyHeader() }
      const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asTheWorker, payload: { kind: 'session', title: 'Test run with items', data: { state: 'running', startedByMoleOffice: true, servingAgent: writer.id, doing: 'Test' } } })
      expect(filed.statusCode, filed.body).toBe(201)
      const run = String(filed.json().record.id)
      const asTheRun = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id, 'x-mole-office-session': run, 'x-mole-office-key': String(filed.json().runKey.key) }
      const note = db.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Test note, not a run', data: { body: 'Test.' }, actor: { type: 'human', id: THE_PERSON } }).id
      const asThePerson = { ...headers, 'content-type': 'application/json' }
      const put = (on: string, by: Record<string, string>, items: unknown) => app.inject({ method: 'PUT', url: `/api/records/${on}/check-also`, headers: by, payload: { items } })
      const cases: [Awaited<ReturnType<typeof put>>, number, RefusalCode, string][] = [
        [await put(note, asThePerson, ['Test.']), 409, 'checkAlsoNotARun', 'Only a run carries items'],
        [await put(run, asThePerson, Array.from({ length: 21 }, () => 'Test.')), 400, 'checkAlsoTooMany', 'at most 20 items'],
        [await put(run, asThePerson, ['x'.repeat(301)]), 400, 'checkAlsoItemTooLong', 'at most 300 characters'],
        [await put(run, asTheRun, ['Test.']), 403, 'checkAlsoByTheRunItself', 'may not choose what the run is reminded of'],
        [await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asThePerson, payload: { dataPatch: { checkAlso: null } } }), 403, 'checkAlsoWrittenOutsideItsDoor', 'is written only by PUT'],
      ]
      for (const [reply, status, code, english] of cases) {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values: {} })
        expect(reply.json().error).toContain(english)
        expect(reply.json().error).toContain('Nothing was changed.')
        seen.add(code)
      }
      expect(db.api.getRecord(run)!.data['checkAlso']).toBeUndefined()
    }

    // A made-up note cannot become an observed suite receipt. The active language is still Chinese.
    {
      const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'note', title: 'Made-up note for the receipt refusal', data: {} } })
      expect(filed.statusCode, filed.body).toBe(201)
      const id = String(filed.json().record.id)
      const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { kind: 'whole_suite_receipt' } })
      expect(reply.statusCode, reply.body).toBe(409)
      expect(reply.json()).toMatchObject({ code: 'receiptNeedsOriginalRun', values: {} })
      expect(reply.json().error).toContain('A receipt needs an original cloud run.')
      expect((await app.inject({ method: 'GET', url: `/api/records/${id}`, headers })).json().record.kind).toBe('note')
      seen.add(reply.json().code as RefusalCode)
    }

    // QUICK INPUTS (wave 13u, round 21: api/quick-inputs.ts). Every refusal the doors give before the terminal holder
    // types anything. No holder runs here: the runs are session records that say they work in a terminal, and the one ask
    // whose three conditions all hold is refused because no holder answers, so nothing is typed anywhere. The three that
    // need a holder that typed are thrown by a test route instead (tests/refusals-a-test-route-throws/quick-inputs.json).
    {
      const asThePerson = { ...headers, 'content-type': 'application/json', ...thePersonsKeyHeader() }
      const asTheWorker = { ...headers, 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', ...theOfficesKeyHeader() }
      const asTheAsker = { ...headers, 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-quick-asker' }
      const expectQuick = async (code: RefusalCode, status: number, english: string, reply: { statusCode: number; body: string; json: () => any }): Promise<void> => {
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json().code, reply.body).toBe(code)
        expect(reply.json().error).toContain(english)
        seen.add(code)
      }
      const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'test-quick-asker', name: 'test-quick-asker', role: 'worker', runtime: 'claude-code' } })
      expect(made.statusCode, made.body).toBe(201)
      const asker = String(made.json().agent.id)

      const setTheList = (payload: Record<string, unknown>, by: Record<string, string> = asThePerson) => app.inject({ method: 'POST', url: '/api/office/quick-inputs', headers: by, payload })
      await expectQuick('quickInputListOnlyThePerson', 403, "The list of quick inputs is the owner's own setting", await setTheList({ inputs: ['/context'] }, asTheAsker))
      await expectQuick('quickInputBadBody', 400, 'The list of quick inputs:', await setTheList({ inputs: ['/context'], test: true }))
      // ONE CODE FOR EACH BROKEN RULE OF THE LIST (wave 13u round 31), carrying the input it concerns: its place in the
      // list and what a person can see of it. A rule about the whole list names what was wrong with the list instead.
      const refusedLists: [Record<string, unknown>, RefusalCode, string, Record<string, string | number>][] = [
        [{ inputs: 'words, not a list' }, 'quickInputListNotAList', 'A list of quick inputs is a list of words', {}],
        [{ inputs: null }, 'quickInputListNotAList', 'A list of quick inputs is a list of words', {}],
        [{ inputs: [] }, 'quickInputListEmpty', 'holds at least one input', {}],
        [{ inputs: Array.from({ length: 21 }, (_, n) => `/in-${String(n)}`) }, 'quickInputListTooMany', 'this one holds 21', { most: 20, count: 21 }],
        [{ inputs: ['/context', 7] }, 'quickInputListItemNotWords', 'Input 2 of the list is not words', { place: 2 }],
        [{ inputs: ['/context', ''] }, 'quickInputListItemEmpty', 'Input 2 of the list is empty', { place: 2 }],
        [{ inputs: ['/context', `/${'a'.repeat(200)}`] }, 'quickInputListItemTooLong', 'Input 2 of the list is longer than the 200 characters', { place: 2, longest: 200, input: `/${'a'.repeat(39)}` }],
        [{ inputs: ['/context', '/x\ny'] }, 'quickInputListItemHoldsAKey', 'Input 2 of the list holds a key', { place: 2, input: '/x' }],
        [{ inputs: ['/context', 'yes'] }, 'quickInputListItemNoSlash', 'which does not begin with "/"', { place: 2, input: 'yes' }],
        [{ inputs: ['/context', '/context'] }, 'quickInputListItemTwice', 'Input 2 of the list repeats', { place: 2, input: '/context' }],
      ]
      for (const [payload, code, english, values] of refusedLists) {
        const refused = await setTheList(payload)
        await expectQuick(code, 400, english, refused)
        expect(refused.json().values, refused.body).toEqual(values)
      }

      const theAsks = (query: string) => app.inject({ method: 'GET', url: `/api/office/quick-inputs/asks?${query}`, headers })
      await expectQuick('quickInputAsksNoOffset', 400, 'takes no offset', await theAsks('agent=test-quick-asker&offset=25'))
      await expectQuick('quickInputAsksBadLimit', 400, 'The limit is a whole number from 1 to 25', await theAsks('agent=test-quick-asker&limit=26'))
      await expectQuick('quickInputAsksUnknownAgent', 404, 'No agent answers to "test-no-such-agent"', await theAsks('agent=test-no-such-agent'))

      const inATerminal = { inATerminal: { terminal: 'test-quick-terminal', holder: { pid: 1 } } }
      const aRun = async (data: Record<string, unknown>, by: Record<string, string> = asThePerson): Promise<{ id: string; key: string | null }> => {
        const filed = await app.inject({ method: 'POST', url: '/api/records', headers: by, payload: { kind: 'session', title: 'Test run', data } })
        expect(filed.statusCode, filed.body).toBe(201)
        return { id: String(filed.json().record.id), key: filed.json().runKey?.key ?? null }
      }
      const ask = (run: { id: string; key: string | null } | null, input: string) =>
        app.inject({
          method: 'POST',
          url: '/api/terminals/quick-input',
          headers: { ...asTheAsker, ...(run === null ? {} : { 'x-mole-office-session': run.id }), ...(run?.key == null ? {} : { 'x-mole-office-key': run.key }) },
          payload: { input },
        })
      await expectQuick('quickInputNoRun', 400, 'sent no x-mole-office-session', await ask(null, '/context'))
      await expectQuick('quickInputRunNotFound', 404, 'No session record has the id "testNoSuchRun"', await ask({ id: 'testNoSuchRun', key: null }, '/context'))
      const notInATerminal = await aRun({ state: 'running', servingAgentId: asker, runtime: 'claude-code' })
      await expectQuick('quickInputRunNotInATerminal', 409, "does not work in one of the office's terminals", await ask(notInATerminal, '/context'))
      const ended = await aRun({ state: 'finished', servingAgentId: asker, runtime: 'claude-code', extra: inATerminal })
      await expectQuick('quickInputRunEnded', 409, 'has ended', await ask(ended, '/context'))
      const nobodys = await aRun({ state: 'running', runtime: 'claude-code', extra: inATerminal })
      await expectQuick('quickInputRunServesNoAgent', 409, 'names no agent it serves', await ask(nobodys, '/context'))
      const keyless = await aRun({ state: 'running', servingAgentId: asker, runtime: 'claude-code', extra: inATerminal })
      await expectQuick('quickInputNotTheAgent', 403, 'was given no run key', await ask(keyless, '/context'))

      // A RUN WITH A KEY OF ITS OWN, filed by the office's worker as it files a run it starts.
      const keyed = await aRun({ state: 'running', startedByMoleOffice: true, servingAgent: 'test-quick-asker', servingAgentId: asker, doing: 'Test', extra: inATerminal }, asTheWorker)
      expect(keyed.key).not.toBeNull()
      await expectQuick('quickInputNotOnTheList', 409, "is not on the owner's list of quick inputs", await ask(keyed, '/test-not-listed'))
      await expectQuick('quickInputNotTyped', 503, 'The ten minutes did not start.', await ask(keyed, '/context'))
      const cleared = await setTheList({ clear: true })
      expect(cleared.statusCode, cleared.body).toBe(200)
      await expectQuick('quickInputNoList', 409, 'There is no list of quick inputs now', await ask(keyed, '/context'))
    }

    // A malformed history page request keeps its technical English and its page code.
    {
      const count = (): number => (db.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n
      const before = count()
      const reply = await app.inject({ method: 'GET', url: '/api/office/upgrades?limit=26', headers })
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.json()).toMatchObject({ code: 'upgradeHistoryReadRefused', values: {} })
      expect(reply.json().error).toBe('Upgrade history takes a limit from 1 to 25 and an optional valid older cursor, with no other options.')
      expect(count()).toBe(before)
      seen.add(reply.json().code as RefusalCode)
    }

    // The personal notice refusal is met through its real door, with no saved choice changed.
    const badNotice = await app.inject({method:'PUT',url:'/api/messages/notice-rules',headers,payload:{mutedKinds:['not-a-notice'],because:'Made-up invalid notice choice',ifVersion:null}})
    expect(badNotice.statusCode,badNotice.body).toBe(400)
    expect(badNotice.json()).toMatchObject({code:'noticeRulesRefused',values:{reason:'Choose only notice kinds the office knows. No rules were saved.'}})
    expect(badNotice.json().error).toContain('Nothing was changed.')
    const stillDefault = await app.inject({method:'GET',url:'/api/messages/notice-rules',headers})
    expect(stillDefault.statusCode,stillDefault.body).toBe(200)
    expect(stillDefault.json()).toMatchObject({recordId:null,mutedKinds:[]})
    seen.add('noticeRulesRefused')

    // The editable word table refuses an incomplete choice before it saves any word or audit.
    const badWord = await app.inject({ method: 'POST', url: '/api/words/table', headers, payload: {} })
    expect(badWord.statusCode, badWord.body).toBe(400)
    expect(badWord.json()).toMatchObject({ code: 'wordSettingRefused', values: { reason: 'Send a word key, the version you read, a reason and the complete choice. Do not send extra fields.' } })
    expect(badWord.json().error).toContain('Nothing was changed.')
    expect(db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM runtime_settings WHERE name LIKE 'office.word:%'").get()).toEqual({ n: 0 })
    expect(db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id LIKE 'setting:word:%'").get()).toEqual({ n: 0 })
    seen.add('wordSettingRefused')

    // The sidebar refuses an incomplete choice through its real door, before any setting or history changes.
    {
      const before = db.client.sqlite.prepare("SELECT * FROM runtime_settings WHERE name='office.sidebar'").get()
      const count = db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id='setting:sidebar'").get()
      const refused = await app.inject({ method: 'POST', url: '/api/sidebar', headers, payload: {} })
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'sidebarSettingRefused', values: { reason: 'Send the sidebar version you read, a reason and the complete arrangement or the version to put back. Do not send extra fields.' } })
      expect(refused.json().error).toBe('Send the sidebar version you read, a reason and the complete arrangement or the version to put back. Do not send extra fields. Nothing was changed.')
      expect(db.client.sqlite.prepare("SELECT * FROM runtime_settings WHERE name='office.sidebar'").get()).toEqual(before)
      expect(db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id='setting:sidebar'").get()).toEqual(count)
      seen.add('sidebarSettingRefused')
    }

    // Home's layout refuses an incomplete choice through its real door, before any person's row or change is written.
    {
      const kept = () => db.client.sqlite.prepare("SELECT (SELECT COUNT(*) FROM runtime_settings WHERE name LIKE 'home.layout%') AS rows, (SELECT COUNT(*) FROM changes WHERE record_id LIKE 'setting:home.layout%') AS changes").get()
      const before = kept()
      const refused = await app.inject({ method: 'PUT', url: '/api/home-layout', headers, payload: {} })
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'homeLayoutRefused', values: { reason: 'Send the Home layout to keep, and nothing else.' } })
      expect(refused.json().error).toBe('Send the Home layout to keep, and nothing else. Nothing was changed.')
      expect(kept()).toEqual(before)
      seen.add('homeLayoutRefused')
    }

    // The pages in front of the sidebar refuse an incomplete choice through their real door, before any person's row or change is written.
    {
      const kept = () => db.client.sqlite.prepare("SELECT (SELECT COUNT(*) FROM runtime_settings WHERE name LIKE 'sidebar.pins%') AS rows, (SELECT COUNT(*) FROM changes WHERE record_id LIKE 'setting:sidebar.pins%') AS changes").get()
      const before = kept()
      const refused = await app.inject({ method: 'PUT', url: '/api/sidebar-pins', headers, payload: {} })
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'sidebarPinsRefused', values: { reason: 'Send the pages in front to keep, and nothing else.' } })
      expect(refused.json().error).toBe('Send the pages in front to keep, and nothing else. Nothing was changed.')
      expect(kept()).toEqual(before)
      seen.add('sidebarPinsRefused')
    }

    // The chapter preview refuses an incomplete request without changing its records or either ledger.
    {
      const before = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
      const initial = before()
      const refused = await app.inject({ method: 'POST', url: '/api/office-regulations/chapters/preview', headers, payload: {} })
      const reason = 'Send a chapter to preview or a shipped or historical source to restore, with its chapter number. Do not send both or extra fields.'
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'chapterEditRefused', values: { reason }, error: reason + ' Nothing was changed.' })
      expect(before()).toBe(initial)
      seen.add('chapterEditRefused')
    }

    // The added-role door refuses an incomplete card before any row, ledger entry or joined card changes.
    {
      const { THE_TEST_OFFICES_OWNER } = await import('./a-page-of-a-test-office.ts')
      const { theRoleCards } = await import('../src/server/lib/roles.ts')
      const before = () => JSON.stringify({ rows: db.client.sqlite.prepare("SELECT * FROM runtime_settings WHERE name LIKE 'office.role:%' ORDER BY name").all(), ledger: db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id LIKE 'setting:role:%'").get(), cards: theRoleCards() })
      const initial = before()
      const badRole = await app.inject({ method: 'POST', url: '/api/roles/added', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: {} })
      const reason = 'Send the complete card or restore choice, the version you read, and a reason of 1 to 500 characters. Do not send extra fields.'
      expect(badRole.statusCode, badRole.body).toBe(400)
      expect(badRole.json()).toMatchObject({ code: 'addedRoleRefused', values: { reason }, error: reason + ' Nothing was changed.' })
      expect(before()).toBe(initial)
      seen.add('addedRoleRefused' as RefusalCode)
    }

    // OLD: no first-handoff authority codes. NEW: each is met through its keyed read door.
    // WHY: fixture-only throw routes cannot prove the real authority door keeps its English and writes nothing.
    {
      // The earlier no-installation-row cases deliberately removed it. This new fixture needs its own closed window.
      db.client.sqlite.prepare("INSERT OR IGNORE INTO installation (only_row, id, how, written_at) VALUES (1, 'made-up-bootstrap-installation', 'Made-up coded refusal fixture', '2026-10-17 00:00:00')").run()
      const fixturePath = './stable-bootstrap-authority-fixture.ts'
      const sharedPath = '../src/shared/whole-suite-receipt.ts'
      const { fixtureBootstrapAuthority, fixtureBootstrapKeys } = await import(fixturePath)
      const { WHOLE_SUITE_RECEIPT_EXAMPLE } = await import(sharedPath)
      const controller = (handle: string, role: string): Actor => {
        const record = db.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up authority agent', data: { handle, runtime: 'codex', state: 'active' }, actor: db.api.HUMAN })
        const registered = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
        db.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, registered.id)
        const run = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up authority run', data: { state: 'running', servingAgent: registered.id }, actor: db.api.HUMAN })
        return { type: 'agent', id: registered.id, keyHolder: registered.id, provedBy: 'an-agent-key', sessionId: run.id }
      }
      const initiator = controller('coded-bootstrap-initiator', 'worker'), approving = controller('coded-bootstrap-secretary', 'secretary')
      const pin = (id: string) => ({ id, seq: 1, contentHash: (db.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(id) as any).content_hash })
      const commit = 'a'.repeat(40), tree = 'b'.repeat(40)
      const from = { commit, repository: '/fixture/development', database: '/fixture/data/office.db', port: 29991 }, to = { ...from, repository: '/fixture/stable' }
      const notices = Object.fromEntries(['before', 'after'].map(stage => {
        const text = `Made-up first handoff ${stage}: the stable checkout serves the same code. No feature changed.`
        const note = db.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up exact approval', data: { body: text }, actor: approving })
        return [stage, { text, approval: pin(note.id) }]
      }))
      const receipt = db.api.createRecord({ workspaceId: 'default', kind: 'whole_suite_receipt', title: 'Made-up original receipt', data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: from.repository, clone: '/fixture/cloud-suite', commit, tree }, actor: initiator })
      const announcement = { candidateTag: 'stable-2026-10-17-coded', from, to, tree, evidence: pin(receipt.id), notices }
      const f = await fixtureBootstrapAuthority(db, announcement, initiator, approving)
      const ownKey = await fixtureBootstrapKeys(db, initiator.id)
      const keyed = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': initiator.id, 'x-mole-office-session': initiator.sessionId!, 'x-mole-office-key': ownKey }
      const request = { scope: f.scope, authority: f.authority, sendId: 'coded-bootstrap-before' }
      const askRefusal = async (code: string, value: any, changed: Record<string, string> = {}) => {
        const count = () => (db.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as any).n
        const before = count()
        const refused = await app.inject({ method: 'GET', url: `/api/office/bootstrap-stop-authority?request=${encodeURIComponent(JSON.stringify(value))}`, headers: { ...keyed, ...changed } })
        expect(refused.statusCode, refused.body).toBeGreaterThanOrEqual(400)
        expect(refused.json()).toMatchObject({ code, values: {} })
        expect(refused.json().error).not.toMatch(/[\u4e00-\u9fff]/)
        expect(count()).toBe(before)
        seen.add(code as RefusalCode)
      }
      await askRefusal('bootstrapStopShapeRefused', {})
      await askRefusal('bootstrapStopCallerRefused', request, { 'x-mole-office-session': 'not-an-owned-running-run' })
      await askRefusal('bootstrapStopPreparedRefused', { ...request, authority: { ...f.authority, prepared: { ...f.authority.prepared, contentHash: '0'.repeat(16) } } })
      await askRefusal('bootstrapStopDecisionRefused', { ...request, authority: { ...f.authority, decision: { ...f.authority.decision, contentHash: '0'.repeat(16) } } })
      await askRefusal('bootstrapStopScopeRefused', { ...request, scope: { ...f.scope, candidateTag: 'stable-2026-10-17-another' } })
      db.client.sqlite.prepare('UPDATE revisions SET proved_by=NULL WHERE record_id=? AND seq=1').run(f.message)
      await askRefusal('bootstrapStopWarrantRefused', request)
      db.client.sqlite.prepare("UPDATE revisions SET proved_by='the-person-key' WHERE record_id=? AND seq=1").run(f.message)
      db.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(f.when, f.prepared)
      await askRefusal('bootstrapStopTimeRefused', request)
      db.client.sqlite.prepare('UPDATE revisions SET at=? WHERE record_id=? AND seq=1').run(f.preparedAt, f.prepared)
      const noticePath = '../src/server/lib/stable-upgrade-notices.ts'
      const lib = await import(noticePath)
      const first = lib.fileStableUpgradeNotice('default', { kind: 'first-handoff', stage: 'before', sendId: request.sendId, announcement: { ...announcement, authority: f.authority } }, initiator, () => from)
      await askRefusal('bootstrapStopReservationRefused', { ...request, expectedBefore: { ...first.original, contentHash: '0'.repeat(16) } })

      // OLD: no data-folder move codes. NEW: each is met through a door tools/stable/move-the-data-folder.mjs calls: the authority
      // read, its reservation and the notice. WHY: the move tool reads these refusals by code, so each must keep its
      // English and write nothing (wave 13q round 12). The decisions are made up, as the first handoff's above are.
      const wordsPath = '../src/shared/words/en-wave-13q.ts', officePath = './a-page-of-a-test-office.ts', timePath = '../src/shared/time.ts'
      const { enWave13q } = await import(wordsPath)
      const { THE_TEST_OFFICES_OWNER } = await import(officePath)
      const { localStamp } = await import(timePath)
      const moveScope = (targetFolder: string) => ({ version: 1, action: 'stop-to-move-the-data-folder', database: '/fixture/checkout/data/office.db',
        port: 29991, checkout: '/fixture/checkout', targetFolder, targetMode: '700',
        backup: { path: '/fixture/backup/office.db', sha256: Buffer.alloc(32, 7).toString('base64') } })
      let moves = 0
      const moveDecision = (targetFolder: string) => {
        const scope = moveScope(targetFolder), words = `Made-up owner: move the data folder to ${targetFolder}.`, n = ++moves
        const message = db.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up move words',
          data: { body: words, to: [{ kind: 'agent', id: approving.id }] }, actor: { ...db.api.HUMAN, provedBy: 'the-person-key' } })
        const title = `Made-up move decision ${String(n)}`
        const decision = db.api.createRecord({ workspaceId: 'default', kind: 'decision', title,
          data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: scope } },
          actor: { ...approving, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: `message:${message.id}`, when: localStamp(new Date()), for: [title] } } })
        return { request: { scope, decision: pin(decision.id), sendId: `coded-move-${String(n)}` }, message: message.id }
      }
      const askMove = async (code: string, method: 'GET' | 'POST', url: string, payload?: object, changed: Record<string, string> = {}) => {
        const count = () => (db.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as any).n
        const before = count()
        const refused = await app.inject({ method, url, headers: { ...keyed, ...changed }, ...(payload === undefined ? {} : { payload }) })
        expect(refused.statusCode, refused.body).toBeGreaterThanOrEqual(400)
        expect(refused.json()).toMatchObject({ code, values: {} })
        expect(refused.json().error).toContain(enWave13q[`server.${code}`])
        expect(refused.json().error).not.toMatch(/[一-鿿]/)
        expect(count()).toBe(before)
        seen.add(code as RefusalCode)
      }
      const authorityRead = (value: unknown) => `/api/office/bootstrap-stop-authority?request=${encodeURIComponent(JSON.stringify(value))}`
      const nowhere = { action: 'stop-to-move-the-data-folder', targetFolder: '/fixture/no-act-names-this' }
      await askMove('dataMoveShapeRefused', 'POST', '/api/office/bootstrap-stop-authority', {})
      await askMove('dataMoveCallerRefused', 'GET', authorityRead(nowhere), undefined, { 'x-mole-office-session': 'not-an-owned-running-run' })
      await askMove('dataMoveActMissing', 'GET', authorityRead(nowhere))
      moveDecision('/fixture/two-acts'); moveDecision('/fixture/two-acts')
      await askMove('dataMoveActAmbiguous', 'GET', authorityRead({ action: 'stop-to-move-the-data-folder', targetFolder: '/fixture/two-acts' }))
      const move = moveDecision('/fixture/one-act')
      await askMove('dataMoveDecisionRefused', 'GET', authorityRead({ ...move.request, decision: { ...move.request.decision, contentHash: '0'.repeat(16) } }))
      await askMove('dataMoveScopeRefused', 'GET', authorityRead({ ...move.request, scope: { ...move.request.scope, port: 29992 } }))
      db.client.sqlite.prepare('UPDATE revisions SET proved_by=NULL WHERE record_id=? AND seq=1').run(move.message)
      await askMove('dataMoveWarrantRefused', 'GET', authorityRead(move.request))
      db.client.sqlite.prepare("UPDATE revisions SET proved_by='the-person-key' WHERE record_id=? AND seq=1").run(move.message)
      // Ending a move that was never reserved.
      await askMove('dataMoveReservationRefused', 'POST', '/api/office/bootstrap-stop-authority', { ...move.request, reservation: move.request.decision, outcome: 'moved' })
      await askMove('dataMoveNoticeRefused', 'POST', '/api/office/upgrades/notice', { kind: 'data-folder-move' })
    }

    // Real count doors refuse without changing counters, and keep their English while the page language is Chinese.
    {
      const { enWave13r } = await import('../src/shared/words/en-wave-13r.ts')
      const personCount = { ...headers, ...thePersonsKeyHeader() }
      const officeCount = { ...headers, ...theOfficesKeyHeader(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
      const counts = () => db.client.sqlite.prepare('SELECT * FROM gate_counts ORDER BY gate, day').all()
      setWordLanguage('zh')
      for (const [id, position, caller, status, code] of [
        ['whole-suite-fix-round', '0', personCount, 403, 'gateCountNotAllowed'],
        ['made-up-gate', '0', officeCount, 404, 'gateCountUnknown'],
        ['house-rule-reds', 'block', officeCount, 409, 'gateCountAlreadyInServer'],
        ['whole-suite-fix-round', 'block', officeCount, 400, 'gateCountBadPosition'],
        ['old-setting-names-stop-the-office', 'block', officeCount, 409, 'gateCountNobodyCounts'],
      ] as const) {
        const before = counts()
        const refused = await app.inject({ method: 'POST', url: `/api/office/gates/${id}/met`, headers: caller, payload: { position } })
        expect(refused.statusCode, refused.body).toBe(status)
        expect(refused.json()).toEqual({ error: enWave13r[`server.${code}`], code, values: {} })
        expect(counts()).toEqual(before)
        seen.add(code)
      }
      // The gate door's one-row read refuses an id no gate has, and names it. Its code and words are read by name, so
      // this case compiled before they were declared.
      const readUnknown: string = 'gateReadUnknown'
      const unknown = await app.inject({ method: 'GET', url: '/api/office/gates?gate=made-up-gate', headers })
      expect(unknown.statusCode, unknown.body).toBe(404)
      expect(unknown.json()).toEqual({ error: String((enWave13r as Record<string, unknown>)[`server.${readUnknown}`]).replace('{id}', 'made-up-gate'), code: readUnknown, values: { id: 'made-up-gate' } })
      seen.add(readUnknown as RefusalCode)
    }

    // Match private-sign-in.json through the real guarded routes, independently of the serializer fixtures.
    // Only the holder transport is replaced: actual doors, holder state and pool handoff still run.
    {
      const { createPrivateLogin } = await import('../src/holder/private-sandbox-login.mjs')
      const { PRIVATE_LOGIN_MS } = await import('../src/config/private-sandbox-login.mjs')
      const { privatePoolFixture, runPoolStandIn, clearPrivatePoolFixtures } = await import('./private-sandbox-login-pool-stand.ts')
      const terminals = await import('../src/server/lib/terminals.ts')
      const { settings, originsAPageMayBeOn } = await import('../src/config/settings.mjs')
      const { enWave13q } = await import('../src/shared/words/en-wave-13q.ts')
      const base = '/api/office/sandbox-logins/claude'
      const privateSeen = new Set<RefusalCode>()
      const fixture = THROWN_HERE.filter(([code]) => Object.hasOwn(PRIVATE_LOGIN_REFUSAL_CODES, code))
      const owner = { ...headers, ...thePersonsKeyHeader(), origin: originsAPageMayBeOn(settings())[0]! }
      setWordLanguage('zh')
      // Each retained code must have both its fixture and actual-route evidence.
      expect(fixture.map(([code]) => code).sort()).toEqual(Object.keys(PRIVATE_LOGIN_REFUSAL_CODES).sort())
      const refused = (reply: LightMyRequestResponse, code: keyof typeof PRIVATE_LOGIN_REFUSAL_CODES) => {
        const sample = fixture.find(([declared]) => declared === code)!
        expect(sample, code).toBeDefined()
        expect(sample[2], code).toBe(enWave13q[`server.${code}`])
        expect(reply.statusCode, reply.body).toBe(sample[1])
        expect(reply.json()).toEqual({ error: sample[2], code, values: sample[3] })
        expect(reply.headers['cache-control']).toBe('no-store')
        privateSeen.add(code)
        seen.add(code)
      }
      try {
        for (const scenario of ['unavailable', 'guards', 'interaction', 'expired', 'unsupported', 'Cancelled', 'PoolUnsafe', 'PoolChanged', 'PoolUnsaved', 'PoolFull', 'PoolDuplicate', 'PoolUnknown'] as const) {
          const f = scenario === 'PoolFull' ? privatePoolFixture(['Z']) : privatePoolFixture()
          const activeBefore = readFileSync(f.active)
          let clock = Date.now()
          let native: { output(channel: string, bytes: Uint8Array): void; exit(code: number): void } | undefined
          let buffered = ''
          const child = { pgid: 987654, identity: 'invented-private-start', matchesIdentity: () => true, signalGroup: vi.fn(), clear: vi.fn(), disposeScratch: vi.fn(), writeCode: vi.fn() }
          const adapter = {
            version: 1, executable: '/invented/private-setup', args: ['setup-token'], allowedSignInOrigins: ['https://signin.invalid'],
            verified: { protocol: true, callback: true, code: true, storageIsolation: true, dumpPrevention: true, ownerWatch: true },
            createParser: () => ({ feed: (_channel: string, chunk: Uint8Array) => { buffered += Buffer.from(chunk).toString(); if (!buffered.endsWith('\n')) return []; const event = JSON.parse(buffered); buffered = ''; return [event] }, clear: () => { buffered = '' } }),
            start: vi.fn(async (callbacks: typeof native) => { native = callbacks; return child }),
          }
          const service = scenario === 'unavailable' ? createPrivateLogin() : createPrivateLogin({ adapter, pool: f.pool, now: () => clock, schedule: () => () => {} })
          const transport = vi.spyOn(terminals, 'askPrivateLoginHolder').mockImplementation(async request => {
            const answer = await service.handle(request)
            // A malformed transport response, not a fabricated refusal reason.
            return scenario === 'unsupported' && request.op === 'privateLoginStatus' ? { ...answer, state: 'invented-invalid-state' } : answer
          })
          const h = { ...owner, 'x-private-login-binding': 'a'.repeat(32) }
          try {
            const cap = await app.inject({ method: 'GET', url: base + '/capability', headers: h })
            expect(cap.statusCode, cap.body).toBe(200)
            expect(cap.json().available).toBe(scenario !== 'unavailable')
            const bound = { ...h, 'x-private-login-generation': cap.json().generation as string }
            const start = (nonce = 'c'.repeat(32), changed: Record<string, string> = {}) => app.inject({ method: 'POST', url: base + '/attempts', headers: { ...bound, ...changed }, payload: { nonce } })
            if (scenario === 'unavailable') {
              refused(await start(), 'privateLoginUnavailable')
              expect(adapter.start).not.toHaveBeenCalled()
            } else if (scenario === 'guards') {
              transport.mockClear()
              refused(await app.inject({ method: 'GET', url: base + '/capability', headers: { ...h, ...theOfficesKeyHeader(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' } }), 'privateLoginPerson')
              refused(await start('invalid-nonce'), 'privateLoginShape')
              refused(await start('c'.repeat(32), { 'x-private-login-generation': '0'.repeat(32) }), 'privateLoginBinding')
              expect(transport).not.toHaveBeenCalled()
              expect(adapter.start).not.toHaveBeenCalled()
            } else {
              const started = await start()
              expect(started.statusCode, started.body).toBe(200)
              expect(started.json().state).toBe('waiting')
              expect(adapter.start).toHaveBeenCalledTimes(1)
              const path = base + '/attempts/' + started.json().attempt
              const ask = (suffix: string, payload?: object, changed: Record<string, string> = {}) => app.inject({ method: payload === undefined ? 'GET' : 'POST', url: path + suffix, headers: { ...bound, ...changed }, ...(payload === undefined ? {} : { payload }) })
              const emit = (event: object) => native!.output('stdout', Buffer.from(JSON.stringify(event) + '\n'))
              if (scenario === 'interaction') {
                // Same nonce is idempotent; a new nonce and another binding both hit real Busy guards.
                expect((await start()).json().attempt).toBe(started.json().attempt)
                refused(await start('d'.repeat(32)), 'privateLoginBusy')
                refused(await start('c'.repeat(32), { 'x-private-login-binding': 'b'.repeat(32) }), 'privateLoginBusy')
                refused(await ask('/status', undefined, { 'x-private-login-binding': 'b'.repeat(32) }), 'privateLoginBinding')
                refused(await ask('/sign-in'), 'privateLoginBinding')
                emit({ type: 'sign-in', url: 'https://signin.invalid/authorize?state=invented-private-state' })
                expect((await ask('/sign-in')).json()).toMatchObject({ url: 'https://signin.invalid/authorize?state=invented-private-state' })
                refused(await ask('/sign-in'), 'privateLoginBinding')
                emit({ type: 'code' })
                const entered = await ask('/code', { code: 'invented-short-code' })
                expect(entered.statusCode, entered.body).toBe(200)
                expect(child.writeCode).toHaveBeenCalledExactlyOnceWith('invented-short-code')
                refused(await ask('/code', { code: 'invented-short-code' }), 'privateLoginInputUsed')
                expect(adapter.start).toHaveBeenCalledTimes(1)
                expect(child.writeCode).toHaveBeenCalledTimes(1)
              } else if (scenario === 'expired') {
                clock += PRIVATE_LOGIN_MS
                const expired = await ask('/status')
                expect(expired.statusCode, expired.body).toBe(200)
                expect(expired.json()).toMatchObject({ state: 'refused', reason: 'Expired' })
                refused(await ask('/code', { code: 'invented-short-code' }), 'privateLoginExpired')
                refused(await ask('/sign-in'), 'privateLoginExpired')
                expect(child.writeCode).not.toHaveBeenCalled()
              } else if (scenario === 'unsupported') {
                refused(await ask('/status'), 'privateLoginUnsupported')
              } else {
                if (scenario === 'Cancelled') {
                  const cancelled = await ask('/cancel', {})
                  expect(cancelled.statusCode, cancelled.body).toBe(200)
                  expect(cancelled.json()).toMatchObject({ state: 'cancelled', reason: 'Cancelled' })
                } else {
                  if (scenario === 'PoolUnsafe') chmodSync(join(f.root, 'A.token'), 0o644)
                  // The invented host adapter reports a changed-writer receipt; holder and pool still handle it.
                  if (scenario === 'PoolChanged') f.tool.execute.mockResolvedValue({ outcome: 'refused', reason: 'PoolChanged' })
                  if (scenario === 'PoolUnsaved' || scenario === 'PoolUnknown') f.tool.execute.mockImplementation(request => runPoolStandIn(f.root, request, scenario === 'PoolUnsaved' ? 'create' : 'after-value'))
                  emit({ type: 'token', value: scenario === 'PoolDuplicate' ? 'invented-existing-A' : 'invented-new-private-subscription' })
                  native!.exit(0)
                  await service.settled()
                  const progress = await ask('/status')
                  expect(progress.statusCode, progress.body).toBe(200)
                  expect(progress.json()).toMatchObject({ state: scenario === 'PoolUnknown' ? 'unknown' : 'refused', reason: scenario })
                  expect(progress.json()).not.toHaveProperty('error')
                  expect(progress.json().code).toBe(false)
                  expect(f.tool.execute).toHaveBeenCalledTimes(1)
                  if (scenario === 'PoolUnknown') {
                    refused(await start('d'.repeat(32), { 'x-private-login-binding': 'b'.repeat(32) }), 'privateLoginPoolUnknown')
                    expect(adapter.start).toHaveBeenCalledTimes(1)
                    expect(f.tool.execute).toHaveBeenCalledTimes(1)
                  }
                }
                // These terminal progress reasons never become identically named HTTP refusals.
                refused(await ask('/code', { code: 'invented-short-code' }), 'privateLoginBinding')
                refused(await ask('/sign-in'), 'privateLoginBinding')
                expect(child.writeCode).not.toHaveBeenCalled()
              }
            }
            if (['unavailable', 'guards', 'interaction', 'expired', 'unsupported', 'Cancelled'].includes(scenario)) expect(f.tool.execute).not.toHaveBeenCalled()
            expect(readFileSync(f.active)).toEqual(activeBefore)
          } finally {
            service.close()
            transport.mockRestore()
          }
        }
      } finally {
        clearPrivatePoolFixtures()
      }
      expect([...privateSeen].sort()).toEqual(Object.keys(PRIVATE_LOGIN_REFUSAL_CODES).sort())
    }

    // A PERSON'S OWN AGENT TAGS (wave 13y round 169), through their two doors: an agent asking to keep tags, each part of
    // a list the writer cannot keep, and a stored list the reading cannot take. A refusal stores nothing, and the reply's
    // English is the sentence the server threw.
    {
      const storedTags = () => db.client.sqlite.prepare('SELECT agent_tags FROM people WHERE id = ?').get(THE_PERSON)
      const before = storedTags()
      expect(before).toEqual({ agent_tags: null })
      const keepTags = (tags: unknown, as: Record<string, string>) =>
        app.inject({ method: 'PUT', url: '/api/agent-tags', headers: { ...as, 'content-type': 'application/json' }, payload: { tags } })
      const tag = { name: 'Test mark', colour: '#7860a8', agents: [] }
      for (const [tags, as, status, code] of [
        [[tag], asAnAgent, 403, 'agentTagsNeedPerson'],
        ['not a list', headers, 400, 'agentTagsNeedList'],
        [[null], headers, 400, 'agentTagsBadTag'],
        [[{ ...tag, name: '' }], headers, 400, 'agentTagsBadName'],
        [[tag, tag], headers, 400, 'agentTagsDuplicateName'],
        [[{ ...tag, colour: '#ffffff' }], headers, 400, 'agentTagsBadColour'],
        [[{ ...tag, agents: ['test-nobody-bears-this'] }], headers, 400, 'agentTagsUnknownAgent'],
      ] as const) {
        const reply = await keepTags(tags, as)
        expect(reply.statusCode, reply.body).toBe(status)
        expect(reply.json()).toMatchObject({ code, values: {} })
        expect(sentByTheServer.at(-1)).toMatchObject({ code })
        expect(reply.json().error).toBe(sentByTheServer.at(-1)!.message)
        expect(storedTags()).toEqual(before)
        seen.add(code)
      }
      db.client.sqlite.prepare("UPDATE people SET agent_tags = 'not json' WHERE id = ?").run(THE_PERSON)
      const unreadable = await app.inject({ method: 'GET', url: '/api/agent-tags', headers })
      expect(unreadable.statusCode, unreadable.body).toBe(500)
      expect(unreadable.json()).toMatchObject({ code: 'agentTagsUnreadable', values: {} })
      expect(sentByTheServer.at(-1)).toMatchObject({ code: 'agentTagsUnreadable' })
      expect(unreadable.json().error).toBe(sentByTheServer.at(-1)!.message)
      seen.add('agentTagsUnreadable')
      db.client.sqlite.prepare('UPDATE people SET agent_tags = NULL WHERE id = ?').run(THE_PERSON)
    }

    // THE TWO CONVERSATION CURSOR REFUSALS, through their door: a cursor that cannot be read, and a cursor made for a
    // project other than the one asked. The second needs a real cursor, so this block gives the office a made-up
    // project with more than one page of pairs in it: eight test agents and one message for each of their pairs. The
    // messages are put in directly, with the record columns and delivery rows the between-agents reader reads, as the
    // cursor test's own office is built, so the block stands on a known office and not on the message door's write
    // rules. A page of 25 then has three pairs after it and says "next".
    {
      const { AGENT_CONVERSATIONS_CURSOR_INVALID, AGENT_CONVERSATIONS_CURSOR_PROJECT } = await import('../src/shared/refusal-codes.ts')
      const cursorPage = (query: Record<string, string>) =>
        app.inject({ method: 'GET', url: `/api/messages/between-agents?${new URLSearchParams(query).toString()}`, headers })
      const written = 'made-up-cursor-written'
      const asked = 'made-up-cursor-asked'
      const cursorAgents: string[] = []
      for (const letter of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: `test-cursor-${letter}`, name: `Test Cursor ${letter.toUpperCase()}`, role: 'worker' } })
        expect(started.statusCode, started.body).toBe(201)
        cursorAgents.push(started.json().agent.id as string)
      }
      const sqlite = db.client.sqlite
      const addCursorMessage = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
      const addCursorDelivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
      let cursorMessages = 0
      sqlite.transaction(() => {
        for (const [index, from] of cursorAgents.entries()) {
          for (const to of cursorAgents.slice(index + 1)) {
            const id = `made-up-cursor-message-${String(cursorMessages)}`
            const at = `2026-01-01 10:00:${String(cursorMessages).padStart(2, '0')}`
            addCursorMessage.run(id, THE_PERSON, at, at, 'Made-up cursor message', JSON.stringify({ body: 'Made-up cursor message', sentBy: { kind: 'agent', id: from }, to: [{ kind: 'agent', id: to }], writtenIn: { project: written } }))
            addCursorDelivery.run(`made-up-cursor-delivery-${String(cursorMessages)}`, id, to, at)
            cursorMessages++
          }
        }
      })()
      const unreadable = await cursorPage({ shape: 'page', limit: '25', cursor: 'plain words' })
      const unreadableSent = sentByTheServer.at(-1)
      const first = await cursorPage({ shape: 'page', limit: '25', project: written })
      expect(first.statusCode, first.body).toBe(200)
      const cursor = first.json().page.next as string | null
      expect(cursor, 'the made-up project has more than one page, so its first page has a cursor').not.toBeNull()
      const crossed = await cursorPage({ shape: 'page', limit: '25', project: asked, cursor: cursor! })
      const crossedSent = sentByTheServer.at(-1)
      for (const [reply, sent, code, values] of [
        [unreadable, unreadableSent, AGENT_CONVERSATIONS_CURSOR_INVALID, {}],
        [crossed, crossedSent, AGENT_CONVERSATIONS_CURSOR_PROJECT, { from: written, to: asked }],
      ] as const) {
        expect(reply.statusCode, reply.body).toBe(400)
        expect(reply.json()).toMatchObject({ code, values })
        expect(sent).toMatchObject({ code })
        expect(reply.json().error).toBe(sent!.message)
        seen.add(code)
      }
    }

    // EVERY CODED REFUSAL THE SERVER SENT, whose words file declares its server.* English is the server's own
    // sentence, is whole that sentence, unless the list says why it differs. This reads the thrown PanelError, never
    // the reply: a word the owner saved replaces the reply's English, and would hide a difference. A code the test
    // wrote itself is not compared: its route is above.
    const notOnTheList = new Map<RefusalCode, { code: RefusalCode; server: string; words: string }>()
    for (const one of sentByTheServer) {
      const file = fileOfServerKey.get(`server.${one.code}`)
      if (file === undefined || !declaringFiles.has(file)) continue
      const words = sayInEnglish(`server.${one.code}`, one.values)
      if (words === one.message) continue
      if (THE_LIST_OF_FILE.get(file)?.has(one.code) === true) continue
      if (!notOnTheList.has(one.code)) notOnTheList.set(one.code, { code: one.code, server: one.message, words })
    }
    const listedBad: { code: RefusalCode; file: string; why: string; server?: string; words?: string }[] = []
    const orphanLists: { file: string; why: string }[] = []
    for (const list of WORDS_THAT_DIFFER) {
      if (!declaringFiles.has(list.file)) {
        orphanLists.push({ file: `${list.file}.ts`, why: 'This words file does not declare its server.* English is the server sentence.' })
        continue
      }
      for (const entry of list.refusals) {
        const key = `server.${entry.code}` as Parameters<typeof sayInEnglish>[0]
        if (serverKeysOfFile.get(list.file)?.has(key) !== true) {
          listedBad.push({ code: entry.code, file: `${list.file}.ts`, why: 'This words file does not hold this code.' })
          continue
        }
        const met = sentByTheServer.filter((one) => one.code === entry.code)
        if (met.length === 0) {
          listedBad.push({ code: entry.code, file: `${list.file}.ts`, why: 'The test met no server sentence for this code.' })
          continue
        }
        if (!met.some((one) => sayInEnglish(key, one.values) !== one.message)) {
          listedBad.push({
            code: entry.code,
            file: `${list.file}.ts`,
            why: 'The words now match the server sentence.',
            server: met[0]!.message,
            words: sayInEnglish(key, met[0]!.values),
          })
        }
      }
    }
    expect({ notOnTheList: [...notOnTheList.values()], listedBad, orphanLists },
      'a coded refusal whose words differ is on its words file’s list, and a code on the list still differs')
      .toEqual({ notOnTheList: [], listedBad: [], orphanLists: [] })
    expect([...seen].sort()).toEqual(Object.keys(REFUSAL_CODES).sort())
  } finally {
    setWordLanguage('en')
    await app.close()
    db.close()
  }
}, 60_000)
