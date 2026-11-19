// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic runs and decisions; no model, provider, container or real office is used. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT_AUTHORITIES } from '../src/shared/kinds.ts'
import { eachFieldOfAVerdict, whatTheVerdictDoorWouldSay } from '../src/shared/the-verdict-door.ts'
import { THE_MOST_DECISIONS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { explain } from '../src/shared/zod-words.ts'

const authority = AGENT_AUTHORITIES.at(-1)!

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let inspection: typeof import('../src/server/lib/inspection.ts')
const person = { type: 'human' as const, id: THE_PERSON }
const worker = 'synthetic-decision-worker'
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: worker, name: 'Synthetic decision worker', role: 'worker', workArea: ['src'] } })
  expect(registered.statusCode, registered.body).toBe(201)
})

/** A stand-in executable supplies fixed answers and records its own invocations. */
function model(home: string, answers: unknown[]) {
  const bin = join(home, 'model-bin')
  const calls = join(home, 'model-calls')
  mkdirSync(bin)
  mkdirSync(calls)
  const answerFile = join(home, 'model-answers.json')
  writeFileSync(answerFile, JSON.stringify(answers))
  const executable = join(bin, 'claude')
  writeFileSync(executable, [
    `#!${process.execPath}`,
    "import { readFileSync, readdirSync, writeFileSync } from 'node:fs'",
    'let prompt = ""; process.stdin.on("data", p => prompt += p)',
    'process.stdin.on("end", () => {',
    `const n = readdirSync(${JSON.stringify(calls)}).length`,
    `writeFileSync(${JSON.stringify(calls)} + '/' + n + '.json', JSON.stringify({ argv: process.argv.slice(2), prompt }))`,
    `const answers = JSON.parse(readFileSync(${JSON.stringify(answerFile)}, 'utf8'))`,
    'process.stdout.write(JSON.stringify(answers[Math.min(n, answers.length - 1)]))',
    '})',
  ].join('\n'))
  chmodSync(executable, 0o755)
  return { bin, calls }
}

describe('the check asks for missing decisions and keeps them through an older door', () => {
  it('hands on a decision’s named evidence so the check can inspect it', async () => {
    const f = await inspectorFixture()
    try {
      const evidence = 'evidence0012'
      ;(f.state.reading as any).decisions = [{ id: 'decisionEvid1', kind: 'decision', title: 'Synthetic choice', decided_by: worker, authority, authority_reference: evidence, because: 'Synthetic supporting evidence.', replaces: [], foundBy: ['session'] }]
      f.state.records[evidence] = { status: 200, body: { record: { id: evidence, kind: 'note', title: 'Synthetic evidence', data: { body: 'Evidence available to the check.' } } } }
      const result = await f.inspect(['--check', aMadeUpCheckSession()])
      expect(result.code, result.err).toBe(0)
      const sent = f.state.writes.find((one) => one.path.endsWith('/prompt'))?.body
      expect(sent?.['carries'].map((one: { id: string }) => one.id)).toContain(evidence)
    } finally { await f.close() }
  }, 60_000)

  it('asks its own session once for a missing judgment and posts that judgment', async () => {
    const f = await inspectorFixture()
    try {
      const id = 'decisionAsk01'
      ;(f.state.reading as any).decisions = [{ id, kind: 'decision', title: 'Synthetic choice', decided_by: worker, authority, because: 'Synthetic reversible choice.', foundBy: ['session'] }]
      const judgment = { id, holds: true, restsOn: 'Synthetic evidence.', authorityFits: true, authorityWhy: 'Synthetic engineering choice.' }
      const session = 'synthetic-check-session'
      const fake = model(f.home, [
        { session_id: session, result: JSON.stringify({ verdict: 'released', check: 'Synthetic check.', chaptersRead: [] }) },
        { session_id: session, result: JSON.stringify({ decisions: [judgment] }) },
      ])
      const result = await f.inspect(['--check', aMadeUpCheckSession()], { HOME: f.home, PATH: `${fake.bin}:${process.env['PATH'] ?? ''}` }, true)
      expect(result.code, result.err).toBe(0)
      const calls = readdirSync(fake.calls).sort().map((file) => JSON.parse(readFileSync(join(fake.calls, file), 'utf8')))
      expect(calls).toHaveLength(2)
      expect(calls[1].argv).toEqual(expect.arrayContaining(['--resume', session]))
      expect(calls[1].prompt).toContain(id)
      const posted = f.state.writes.find((one) => one.path === `/api/checks/${f.run}`)?.body
      expect(posted?.['decisions']).toEqual([judgment])
    } finally { await f.close() }
  }, 60_000)

  it('keeps every judgment when the old door rejects the new key', async () => {
    const f = await inspectorFixture()
    try {
      const { decisions: _newField, ...oldFields } = eachFieldOfAVerdict
      const oldDoor = z.object(oldFields).strict()
      const posts: Record<string, any>[] = []
      f.state.onRequest = (request, reply) => {
        if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
        let raw = ''
        request.on('data', (part) => { raw += String(part) })
        request.on('end', () => {
          const body = JSON.parse(raw)
          posts.push(body)
          const parsed = oldDoor.safeParse(body)
          reply.statusCode = parsed.success ? 201 : 400
          reply.setHeader('content-type', 'application/json')
          reply.end(JSON.stringify(parsed.success ? { verdict: 'released', toTheWorker: 'Synthetic', toTheStarter: '', group: null } : { error: `The check ${explain(parsed.error)}` }))
        })
        return true
      }
      const judgment = { id: 'decisionOld01', holds: true, restsOn: 'Synthetic supporting evidence.', authorityFits: true, authorityWhy: 'Synthetic choice within the task.' }
      const fake = model(f.home, [{ session_id: 'synthetic-session', result: JSON.stringify({ verdict: 'released', check: 'Synthetic check.', chaptersRead: [], decisions: [judgment] }) }])
      const result = await f.inspect(['--check', aMadeUpCheckSession()], { HOME: f.home, PATH: `${fake.bin}:${process.env['PATH'] ?? ''}` }, true)
      expect(result.code, result.err).toBe(0)
      expect(posts).toHaveLength(2)
      expect(posts[0]!['decisions']).toEqual([judgment])
      expect(posts[1]!['decisions']).toBeUndefined()
      expect(posts[1]!['check']).toContain(JSON.stringify([judgment]))
    } finally { await f.close() }
  }, 60_000)
})
afterAll(async () => { await app?.close(); db?.close() })

function run(startedAt: string | undefined = '2000-01-01 00:00:00') {
  return db.api.createRecord({ kind: 'session', title: 'Synthetic decision review run', workspaceId: 'default', origin: 'fixture', actor: person,
    data: { state: 'running', servingAgent: worker, ...(startedAt === undefined ? {} : { startedAt }) } }).id
}

/** What reopens each made-up decision, and what it turned down: a check judges a reversible choice by what would reopen it. */
const REOPENS = 'Synthetic: a failed trial of the choice reopens it.'
const REJECTED = ['Synthetic: the other way, turned down']

function decision(title: string, decidedBy: string, filedAt: string, sessionId?: string) {
  const made = db.api.createRecord({ kind: 'decision', title, workspaceId: 'default', origin: 'fixture',
    actor: { ...person, ...(sessionId === undefined ? {} : { sessionId }) },
    data: { decided_by: decidedBy, decided_on: '2001-01-01', authority, because: 'Synthetic: the choice is reversible and a failed trial reopens it.', replaces: [],
      revisit_when: REOPENS, alternatives_rejected: REJECTED } })
  db.client.sqlite.prepare('UPDATE revisions SET at = ? WHERE record_id = ? AND seq = 1').run(filedAt, made.id)
  return made.id
}

function prompt(reads: ReturnType<typeof inspection.whatTheInspectorReads>) {
  return inspection.assembleTheInspectorsPrompt({ reads, changes: inspection.changesInTheWorkArea([], []), workspaceId: 'default' }).text
}

describe('the run’s decisions are part of its check', () => {
  it('finds session filings and in-window decisions once, with their own date and filing time', async () => {
    const id = run()
    const both = decision('Synthetic: both routes', worker, '2001-01-02 12:00:00', id)
    const filed = decision('Synthetic: this run filed it', 'the owner', '1999-01-01 00:00:00', id)
    const byHandle = decision('Synthetic: in this run', worker, '2001-01-03 12:00:00')
    const tooEarly = decision('Synthetic: before this run', worker, '1999-01-01 00:00:00')
    const another = decision('Synthetic: another agent', 'another-synthetic-worker', '2001-01-03 12:00:00')
    const reads = inspection.whatTheInspectorReads(id, 'default') as any
    const ids = reads.decisions.map((one: { id: string }) => one.id)
    expect(ids.filter((one: string) => one === both)).toHaveLength(1)
    expect(ids).toEqual(expect.arrayContaining([both, filed, byHandle]))
    expect(ids).not.toContain(tooEarly)
    expect(ids).not.toContain(another)
    const found = reads.decisions.find((one: { id: string }) => one.id === both)
    expect(JSON.stringify(found)).toContain('2001-01-01')
    expect(JSON.stringify(found)).toContain('2001-01-02 12:00:00')
    expect(JSON.stringify(found)).toContain(authority)
    expect(found).toMatchObject({ revisit_when: REOPENS, alternatives_rejected: REJECTED })
    expect(prompt(reads)).toContain(both)
    const response = await app.inject({ method: 'GET', url: `/api/checks/${id}`, headers })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().decisions).toEqual(reads.decisions)
    expect(response.json().decisionsComplete).toBe(reads.decisionsComplete)
  })

  it('says none for a known empty run, and does not claim all decisions hold', () => {
    const id = run('2099-01-01 00:00:00')
    const reads = inspection.whatTheInspectorReads(id, 'default') as any
    expect(reads.decisions).toEqual([])
    const words = prompt(reads)
    expect(words).toMatch(/no decisions|recorded none/i)
    expect(words).not.toMatch(/all (?:of (?:the|its) )?decisions hold/i)
  })

  it('does not turn an older office’s missing list into an empty one', () => {
    const reads = { ...inspection.whatTheInspectorReads(run(), 'default') } as any
    delete reads.decisions
    const words = prompt(reads)
    expect(words).toMatch(/(?:did not|does not|could not).{0,50}(?:list|decisions)/i)
    expect(words).not.toMatch(/no decisions|recorded none/i)
  })

  it('requires the verdict to carry the authority judgment as well as its basis', () => {
    const base = { verdict: 'released', check: 'Synthetic check.', decisions: [{ id: 'decision0001', holds: true, restsOn: 'Synthetic measurement', authorityFits: true, authorityWhy: 'Synthetic engineering choice.' }] }
    expect(whatTheVerdictDoorWouldSay(base)).toBeNull()
    const { authorityFits: _removed, ...withoutFit } = base.decisions[0]!
    expect(whatTheVerdictDoorWouldSay({ ...base, decisions: [withoutFit] })).not.toBeNull()
  })

  it('treats an owner-only choice made without fitting authority as a finding', () => {
    const decision = { id: 'decision0002', holds: false, restsOn: 'Synthetic: the agent chose a matter reserved to the owner.', authorityFits: false, authorityWhy: 'Synthetic: the agent had no authority to make that choice.' }
    const release = { verdict: 'released', check: 'Synthetic check.', decisions: [decision] }
    expect(whatTheVerdictDoorWouldSay(release)).not.toBeNull()
    expect(whatTheVerdictDoorWouldSay({ ...release, verdict: 'refused', missing: [decision.restsOn], says: { chapter: 8 } })).toBeNull()
  })

  it('hands each decision to the model once and names each decision beyond the bound', async () => {
    const fixture = await inspectorFixture()
    try {
      const id = aMadeUpCheckSession()
      const decisions = Array.from({ length: THE_MOST_DECISIONS_A_CHECK_CARRIES + 1 }, (_, n) => ({
        id: `decision${String(n).padStart(5, '0')}`, kind: 'decision', title: `Synthetic decision ${n}`,
        decided_by: worker, decided_on: '2001-01-01', authority,
        authority_reference: null, because: 'Synthetic reversible choice.', replaces: [], filedAt: '2001-01-02 12:00:00', foundBy: ['session'],
      }))
      ;(fixture.state.reading as any).decisions = decisions
      const files = new Map<string, any>()
      fixture.state.onPrompt = async () => {
        const body = fixture.state.writes.find((one) => one.path.endsWith('/prompt'))?.body
        for (const one of body?.['carries'] ?? []) files.set(one.id, JSON.parse(readFileSync(one.path, 'utf8')))
      }
      const result = await fixture.inspect(['--check', id])
      expect(result.code, result.err).toBe(0)
      const sent = fixture.state.writes.find((one) => one.path.endsWith('/prompt'))?.body
      const carried = sent?.['carries'].filter((one: { as: string }) => one.as === 'decision') ?? []
      const omitted = sent?.['couldNotCarry'].filter((one: { as: string }) => one.as === 'decision') ?? []
      expect(carried.length).toBeGreaterThan(0)
      expect(omitted.length).toBeGreaterThan(0)
      expect(carried.length + omitted.length).toBe(decisions.length)
      expect(new Set([...carried, ...omitted].map((one: { id: string }) => one.id)).size).toBe(decisions.length)
      expect(omitted.every((one: { why: string }) => one.why.length > 0)).toBe(true)
      const first = carried[0]!
      expect(JSON.stringify(files.get(first.id))).toContain(decisions[0]!.because)
    } finally { await fixture.close() }
  }, 60_000)
})
