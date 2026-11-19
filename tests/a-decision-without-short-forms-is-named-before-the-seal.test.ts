// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION THE RUN RECORDED WITH NO SHORT FORMS IS NAMED BEFORE ITS SEAL. Chapter 10 rule 3 asks every record for its
 * name at reading level 1 in the run that files it. On 8 November two seals were refused for one decision each that had
 * none, and both seal previews had found nothing. Wave 13n (src/server/lib/before-the-seal.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A run that recorded one decision with no short forms is answered, at its first sealing write, with one certain
 *      item about a decision, and the item names that decision.
 *   2. A run that recorded one decision and wrote its short forms is named no decision item.
 *   3. The item's shape, as /api/kinds declares it, lists as what an item can be about exactly the values of the code's
 *      own list, so a value added to one cannot be missing from the other.
 *
 * Both runs are filed by the office's worker over a made-up repository, and both decisions are filed in the run's own
 * session, which is how the check finds the decisions of a run (src/server/lib/inspection.ts).
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WHAT_IT_IS_ABOUT } from '../src/shared/before-the-seal.ts'
import { AGENT_AUTHORITIES, SHAPE_SPECS } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-with-a-decision'

let t: TestDb
let app: FastifyInstance
const directories: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** A run filed by the office's worker at commit A of a made-up repository, with commit B on its branch. */
async function aRun(title: string): Promise<{ id: string; key: string; b: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-a-decision-before-the-seal-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic decision test')
  git(dir, 'config', 'user.email', 'decision@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit B')
  return { id: body.record.id, key, b: git(dir, 'rev-parse', 'HEAD') }
}

/** A made-up decision, filed by the run's agent in the run's own session. */
function aDecisionFiledIn(run: string, title: string): string {
  return t.api.createRecord({
    kind: 'decision',
    title,
    workspaceId: 'default',
    origin: 'fixture',
    actor: { type: 'agent', id: HANDLE, sessionId: run },
    data: {
      decided_by: HANDLE,
      decided_on: '2026-11-08',
      authority: AGENT_AUTHORITIES.at(-1)!,
      because: 'Synthetic: the choice is reversible and a failed trial reopens it.',
      replaces: [],
      revisit_when: 'Synthetic: a failed trial of the choice reopens it.',
      alternatives_rejected: ['Synthetic: the other way, turned down'],
    },
  }).id
}

/** The decision items the run's first sealing write is answered with. */
async function theDecisionItemsAtTheFirstSealingWrite(run: { id: string; key: string; b: string }): Promise<{ about: string; says: string; mechanical?: boolean }[]> {
  const first = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: asTheRun(run.id, run.key), payload: { dataPatch: { state: 'finished', tip: run.b } } })
  expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
  const reminded = first.json() as { beforeTheSeal?: { sealed: boolean; items: { about: string; says: string; mechanical?: boolean }[] } }
  expect(reminded.beforeTheSeal?.sealed, first.body.slice(0, 600)).toBe(false)
  return (reminded.beforeTheSeal?.items ?? []).filter((one) => one.about === 'decision')
}

beforeAll(async () => {
  t = await freshDb()
  // A chapters line is read against the office's chapter records, as a new office copies them at its first start.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('a decision the run recorded, before its seal', () => {
  it('1: one decision with no short forms is named as one certain item about a decision', async () => {
    const run = await aRun('Synthetic run with a decision and no short forms')
    const decision = aDecisionFiledIn(run.id, 'Synthetic choice with no short forms')
    const items = await theDecisionItemsAtTheFirstSealingWrite(run)
    expect(items, JSON.stringify(items)).toHaveLength(1)
    expect(items[0]!.mechanical).toBe(true)
    expect(items[0]!.says).toContain(decision)
  })

  it('2: one decision with its short forms is named no decision item', async () => {
    const run = await aRun('Synthetic run with a decision and its short forms')
    const decision = aDecisionFiledIn(run.id, 'Synthetic choice with its short forms')
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const { writeShortForms } = await import('../src/server/lib/zoom.ts')
    const newest = listRevisions(decision).revisions[0]
    if (newest === undefined) throw new Error('the made-up decision has no revision to write a short form from')
    writeShortForms(decision, 'default', { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Made-up choice' } }, { type: 'agent', id: HANDLE })
    const items = await theDecisionItemsAtTheFirstSealingWrite(run)
    expect(items, JSON.stringify(items)).toEqual([])
  })

  it("3: the item's shape lists as what an item can be about exactly the values of the code's own list", () => {
    const about = SHAPE_SPECS['BeforeTheSealItem']?.fields.find((field) => field.key === 'about')
    expect(about?.type).toBe(WHAT_IT_IS_ABOUT.map((value) => `'${value}'`).join(' | '))
  })
})
