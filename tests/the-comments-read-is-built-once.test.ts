// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENTS READ IS BUILT ONE AT A TIME FOR A PROJECT AND A READER, AND NOT AGAIN WHILE NOTHING HAS BEEN WRITTEN.
 * Wave 13y round 18, guards (a) and (b), in src/server/lib/comments-answer.ts.
 *
 * From 10:46 to 11:00 on 10 October 2026 every GET /api/messages/comments took 32 to 48 s on the owner's office, the
 * 304s too, and held the one thread. These tests count the builds through `howManyCommentsAnswersWereBuilt`, so a read
 * that was answered without building is told apart from one that built the same answer again. Every record here is
 * synthetic.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const READER = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let app: FastifyInstance
let builds: () => number
let page = ''
/** The words this case writes second, named apart so a case cannot read another case's copy of it. */
let secondBody = ''
let caseNumber = 0

/**
 * ONE OFFICE FOR THE FILE, and one page and comment of its own for each case. The write in
 * beforeEach is what tells the kept answer that something changed, so a case never starts from the
 * answer another case built.
 */
beforeAll(async () => {
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: false } as never)).app
  await app.ready()
  builds = (await import('../src/server/lib/comments-answer.ts')).howManyCommentsAnswersWereBuilt
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  secondBody = `Synthetic comment two, case ${String(caseNumber)}`
  page = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note' as never, title: 'Synthetic page', data: { body: 'Made-up words.' }, actor: HUMAN }).id
  comment('Synthetic comment one')
})

afterAll(async () => {
  await app.close()
  t.close()
})

function comment(body: string): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'message' as never,
    title: body,
    data: { body, target: { target: { kind: 'record', recordId: page, workspaceId: WORKSPACE } } },
    actor: HUMAN,
  }).id
}

async function read(headers: Record<string, string> = {}): Promise<{ status: number; body: string; tag: string }> {
  const res = await app.inject({ method: 'GET', url: '/api/messages/comments', headers: { ...READER, ...headers } })
  return { status: res.statusCode, body: res.body, tag: String(res.headers.etag ?? '') }
}

const loopRound = (): Promise<void> => new Promise((done) => setImmediate(done))

const words = (body: string): string[] => (JSON.parse(body) as { comments: { data: { body: string } }[] }).comments.map((one) => one.data.body)

describe('one build at a time', () => {
  it('gives requests that arrive together the one answer being built', async () => {
    const before = builds()
    const first = read()
    const second = read()
    const third = read()
    const answers = await Promise.all([first, second, third])
    expect(builds() - before, 'a request that arrived while the answer was being built started a second build').toBe(1)
    for (const one of answers) expect(one.status).toBe(200)
    expect(new Set(answers.map((one) => one.body)).size, 'the requests were given different answers').toBe(1)
  })

  it('does not give the answer from before a write to a request that came after it, however soon', async () => {
    await read()
    comment(secondBody)
    const after = await read()
    expect(words(after.body), 'a read right after a write was given the build from before it').toContain(secondBody)
  })
})

describe('an unchanged answer is not built again', () => {
  it('answers a second read from the kept answer when nothing was written, a 304 included', async () => {
    const first = await read()
    expect(first.status).toBe(200)
    // AFTER THE LOOP HAS GONE ROUND, so the build is no longer in flight and only the kept answer can answer.
    await loopRound()
    await loopRound()
    const before = builds()
    const again = await read()
    expect(again.body).toBe(first.body)
    const tagged = await read({ 'if-none-match': first.tag })
    expect(tagged.status).toBe(304)
    expect(builds() - before, 'the answer was built again though nothing was written').toBe(0)
  })

  it('builds again after a write, and the new answer holds what was written', async () => {
    const first = await read()
    const before = builds()
    comment(secondBody)
    const after = await read()
    expect(builds() - before, 'a write was not noticed').toBe(1)
    expect(words(first.body)).not.toContain(secondBody)
    expect(words(after.body), 'the read after the write gave the answer from before it').toContain(secondBody)
  })
})

/**
 * THE DOOR ITSELF, for the two cases the route cannot set up on its own: an answer that is not kept because its build
 * wrote something, and one that is not kept because it read the clock.
 */
describe('the door, on an answer that is not kept', () => {
  it('gives the requests queued behind a build its answer, even when that answer is not kept', async () => {
    const door = await import('../src/server/lib/comments-answer.ts')
    const before = builds()
    // A BUILD THAT WRITES is not kept, so only the build in flight can answer the request behind it.
    const writing = () => t.client.sqlite.prepare('CREATE TEMP TABLE IF NOT EXISTS written_by_a_build (x)').run() && t.client.sqlite.prepare('INSERT INTO written_by_a_build VALUES (1)').run().changes
    const first = door.theCommentsAnswer('a reader', writing)
    await first
    const second = door.theCommentsAnswer('a reader', writing)
    expect(await second).toBe(await first)
    expect(builds() - before, 'a request queued behind the build started another').toBe(1)
    await loopRound()
    await loopRound()
    await door.theCommentsAnswer('a reader', writing)
    expect(builds() - before, 'the build that wrote was kept and given again').toBe(2)
  })

  it('builds again an answer that read the clock, with nothing written', async () => {
    const door = await import('../src/server/lib/comments-answer.ts')
    const { recipientsFor } = await import('../src/server/lib/recipients.ts')
    const before = builds()
    const readingTheClock = () => JSON.stringify(recipientsFor(null, WORKSPACE)).length
    await door.theCommentsAnswer('a reader of the clock', readingTheClock)
    await loopRound()
    await loopRound()
    await door.theCommentsAnswer('a reader of the clock', readingTheClock)
    expect(builds() - before, 'an answer that read the clock was kept').toBe(2)
  })
})
