// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN A RUN IS SEALED, THE OFFICE SENDS THE RUN'S STARTER ONE MESSAGE. Problem VJom2joVhqjM, part 1.
 *
 * A sealed run's key proves nobody, so the run cannot send its last message after its seal. The office
 * sends the starter the tip, the fork base, the seal id, the files and the files outside src/ and tests/,
 * in the same write as the seal (`sealFinishedRun` in src/server/lib/sealed-tip.ts). A refused finish
 * writes no seal and sends nothing. Where no starter can be named, nobody is told and the seal says why.
 *
 * Every agent, run and file here is made up for the test, in a fresh test database.
 *
 * MUTATIONS THIS FILE CATCHES:
 *   - Delete the `writeASystemLineToOne` call in `sealFinishedRun`: the first case goes red.
 *   - Drop the tip from the sentence in `theSealInWords` (src/shared/groups.ts): the first case goes red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let root = ''
let base = ''
let tip = ''
let starterId = ''
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const asThePerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asTheStarter = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'seal-notice-starter' }

function git(...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root } }).trim()
}

/** Every message the office has written to this participant, oldest first. */
function theOfficesMessagesTo(id: string): { id: string; body: string; saidInFull: string; aboutRun: string }[] {
  const rows = t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY rowid").all() as { id: string; data: string }[]
  return rows
    .map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }))
    .filter((row) => {
      const to = row.data['to'] as { kind: string; id: string }[] | undefined
      const by = row.data['sentBy'] as { kind: string; id: string } | undefined
      return by?.id === theOfficesOwnId(t) && Array.isArray(to) && to.some((one) => one.id === id)
    })
    .map((row) => ({ id: row.id, body: String(row.data['body']), saidInFull: String(row.data['saidInFull']), aboutRun: String(row.data['aboutRun']) }))
}

function aRun(title: string, servingAgent = 'seal-notice-worker'): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    origin: 'fixture',
    actor: person,
    data: { state: 'running', servingAgent, workingDirectory: root, cutFrom: 'main' },
  }).id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'seal-notice-starter', name: 'Synthetic starter', role: 'supervisor', workArea: ['src'] } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asTheStarter, payload: { handle: 'seal-notice-worker', name: 'Synthetic worker', role: 'worker', workArea: ['src', 'tools', 'tests'] } })
  expect(worker.statusCode, worker.body).toBe(201)
  const registered = (JSON.parse(worker.body) as { agent: { startedBy: { kind: string; id: string } } }).agent
  expect(registered.startedBy.kind).toBe('agent')
  starterId = (JSON.parse(starter.body) as { agent: { id: string } }).agent.id

  mkdirSync('.logs', { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs', 'seal-notice-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic seal-notice fixture')
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'tools'))
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  base = git('rev-parse', 'HEAD')
  git('switch', '-q', '-c', 'worker')
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 2\n')
  writeFileSync(join(root, 'tools', 'b.mjs'), 'export const b = 2\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic work')
  tip = git('rev-parse', 'HEAD')
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

describe('a sealed run tells its starter', () => {
  it('sends the starter exactly one message with the tip, the fork base, the seal id, the files and the files outside src/ and tests/', () => {
    // CONTROL: the starter has been told nothing before the finish.
    expect(theOfficesMessagesTo(starterId).filter((one) => one.body.includes('sealed'))).toEqual([])
    const run = aRun('Synthetic sealed run')
    t.api.patchRecord(run, { dataPatch: { state: 'finished', tip } }, person)
    const sealId = t.api.getRecord(run)!.data['sealedTip'] as string
    expect(typeof sealId).toBe('string')

    const told = theOfficesMessagesTo(starterId).filter((one) => one.aboutRun === run)
    expect(told, 'the starter was not sent exactly one message about the seal').toHaveLength(1)
    const said = told[0]!
    expect(said.body).toBe(`Run ${run} sealed`)
    expect(said.saidInFull).toContain(`seal ${sealId}`)
    expect(said.saidInFull).toContain(`Tip: ${tip}.`)
    expect(said.saidInFull).toContain(`Fork base: ${base}.`)
    expect(said.saidInFull).toContain('Files (2): src/a.ts, tools/b.mjs.')
    expect(said.saidInFull).toContain('Files outside src/ and tests/ (1): tools/b.mjs.')

    // AND THE SEAL SAYS WHO WAS TOLD, and the message is linked to the seal.
    const seal = t.api.getRecord(sealId)!
    expect(seal.data['starterNotice']).toEqual({ to: { kind: 'agent', id: starterId } })
    const link = t.client.sqlite.prepare("SELECT 1 FROM links WHERE from_id = ? AND to_id = ? AND type = 'about'").get(said.id, sealId)
    expect(link, 'the message is not linked to the seal').toBeDefined()
  })

  it('sends nothing when the finish is refused', () => {
    const run = aRun('Synthetic refused run')
    const before = theOfficesMessagesTo(starterId).length
    expect(() => t.api.patchRecord(run, { dataPatch: { state: 'finished', tip: base } }, person)).toThrow(`differs from HEAD ${tip}`)
    expect(t.api.getRecord(run)!.data['sealedTip']).toBeUndefined()
    expect(theOfficesMessagesTo(starterId)).toHaveLength(before)
    expect(theOfficesMessagesTo(starterId).filter((one) => one.aboutRun === run)).toEqual([])
  })
})

describe('a seal whose starter cannot be named', () => {
  it('tells nobody and says why on the seal', async () => {
    const orphan = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'seal-notice-orphan', name: 'Synthetic orphan', role: 'worker', workArea: ['src', 'tools', 'tests'] } })
    expect(orphan.statusCode, orphan.body).toBe(201)
    // THE REGISTRY ROW LOSES ITS STARTER AND ITS OWNER, the state of an agent nobody recorded a starter for: the office
    // records a registered agent's starter as its owner, so such an agent has no owner either.
    t.client.sqlite.prepare("UPDATE agents SET started_by_kind = NULL, started_by_id = NULL, owner_kind = NULL, owner_id = NULL WHERE handle = 'seal-notice-orphan'").run()
    const everyMessage = (): number => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
    const before = everyMessage()
    const run = aRun('Synthetic run with no starter', 'seal-notice-orphan')
    t.api.patchRecord(run, { dataPatch: { state: 'finished', tip } }, person)
    const sealId = t.api.getRecord(run)!.data['sealedTip'] as string
    // Since the owner package the seal tells the recorded owner, and says why in that reading's own words.
    const { whoIsToldOfTheRun } = await import('../src/server/lib/who-is-told-of-a-seal.ts')
    const { readParticipant } = await import('../src/server/db/read-participant.ts')
    const orphanId = (JSON.parse(orphan.body) as { agent: { id: string } }).agent.id
    const unowned = whoIsToldOfTheRun(readParticipant({ kind: 'agent', id: orphanId }) as Parameters<typeof whoIsToldOfTheRun>[0])
    expect(unowned).not.toHaveProperty('to')
    expect(unowned).toHaveProperty('because')
    expect(t.api.getRecord(sealId)!.data['starterNotice']).toEqual(unowned)
    expect(everyMessage()).toBe(before)
  })
})

describe('what the message says for each kind of seal', () => {
  it('says a records seal has no tip, no fork base and no files, and names its records', () => {
    const said = SYSTEM_LINES.aRunWasSealed({ run: 'r1', agent: 'w-one', seal: 's1', kind: 'records', git: null, files: null, records: ['rec-a', 'rec-b'] }).said
    expect(said).toBe('Run r1 of w-one was sealed as seal s1, a records seal. It has no tip, no fork base and no files, because a records seal names record revisions and no commit. Records (2): rec-a, rec-b.')
  })

  it('says a files seal has no tip and no fork base, and names its files and the ones outside src/ and tests/', () => {
    const said = SYSTEM_LINES.aRunWasSealed({ run: 'r2', agent: 'w-two', seal: 's2', kind: 'files', git: null, files: { root: '/made/up', files: ['tests/x.ts'] }, records: null }).said
    expect(said).toBe(
      'Run r2 of w-two was sealed as seal s2, a files seal. It has no tip and no fork base, because a files seal is read from a folder and not from git. ' +
        'Files, to land in /made/up (1): tests/x.ts. Files outside src/ and tests/: none.',
    )
  })
})
