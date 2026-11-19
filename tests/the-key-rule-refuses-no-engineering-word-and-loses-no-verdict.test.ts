// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY RULE REFUSES NO ORDINARY ENGINEERING WORD, AND A CHECK'S VERDICT IS NEVER LOST TO IT (problem 0VsAlpkCl6LF,
 * wave 13w round 3).
 *
 * On 5 October 2026 the verdict door refused a check (POST /api/checks/RFP3G6FH_6pm, 400 messageHoldsGeneratedWord) because
 * the check named a word-list key, g6b.profile.noWorkArea. Counted on a copy of the office's database, 2,312 stored
 * messages would have been refused, nearly all of them for a dotted name, a long code name or a setting name. The rule
 * now splits a word at every character that is not a letter, a digit, an underscore or a plus, and a long run is a key
 * only when it holds a digit and a letter. The verdict door no longer refuses a verdict for a key-shaped piece. From
 * round 3 to round 9 it left the piece out, marked by its shape and length; since round 10 it stores the verdict as the
 * inspector wrote it, and the worker's message is stored whole with it.
 *
 * EVERY KEY HERE IS MADE UP, and each is put together when the test runs, so this file holds nothing of a key's shape.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · three dotted word-list keys with a wave prefix are not keys.
 *     MUTATION: put the old split back, A_WORD_SPLITS_AT = /[/,\-]/ (src/shared/terminals.ts).
 *   · a call with its arguments, a test file's name and a record id followed by Chinese punctuation are not keys.
 *     MUTATION: the same old split. All six go red.
 *     MUTATION: split at the listed ASCII characters only, /[/,\-.:()[\]{}<>"'`=]/. The Chinese case goes red.
 *   · a camelCase name of 32 letters or more is not a key.
 *     MUTATION: in whatLooksLikeASecret, drop `!aRunWithADigitAndALetter(found[0])`.
 *   · a setting name in capitals and underscores, 32 characters or more with a digit, and a migration's file name are not
 *     keys. MUTATION: put the underscore back into the long-run shape, /[A-Za-z0-9+_=]{32,}/g.
 *   · an office key, a sha256, an sk-… key, a ghp_… token, an AWS key, a JWT and a 32-character base64 token with digits
 *     are each still caught, with the expected shape.
 *     MUTATION: make aRunWithADigitAndALetter answer false. The hex, the JWT and the base64 token go red.
 *     MUTATION: take the apiKey, githubToken and awsKey lines out of SECRET_SHAPES. Those three go red.
 *   · a released verdict whose check holds a 64-hex run is taken (201), the run is released, and the worker's message
 *     holds the check whole, the run included. A refusal whose missing line holds one is taken the same way, and the
 *     stored refusal holds the line whole.
 *     MUTATION: in src/server/api/inspection.ts, put the round 9 leaving-out back: replace each piece
 *     `whatLooksLikeASecret` finds in the check and its missing lines with a marker before it is parsed. Both go red.
 *
 * Every record here is synthetic, in a fresh database. Nothing reaches the live office.
 */
import { createHash } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { whatLooksLikeASecret } from '../src/shared/terminals.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const NOT_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['the word-list key the verdict door refused', 'g6b.profile.noWorkArea'],
  ['a dotted word-list key with a wave prefix', 'w13u.terminal.keepingRefusedALine'],
  ['another dotted word-list key with a wave prefix', 'g4c.checkPanel.theRunHasNoSealYet'],
  ['a call with its arguments', 'expect(seal.readRunSeal(run2)).toBeNull()'],
  ["a test file's name", 'tests/argusRound3Checks.test.ts'],
  ['a record id followed by Chinese punctuation', '见 Madeup200008）、计划书的第三部分说'],
  ['a camelCase name of 32 letters or more', 'theInspectorReadsTheRunAndItsSealWhole'],
  ['a setting name in capitals and underscores', 'W13W_KEY_SEND_SHOTS_AT_FOUR_WIDTHS'],
  ["a migration's file name", '0006_workspaces_and_change_workspace'],
]

function base64url(text: string): string {
  return Buffer.from(text).toString('base64url')
}

/** One made-up piece of each real shape, and the shape it must be caught as. */
const STILL_KEYS: ReadonlyArray<readonly [string, string, string]> = [
  ['an office key', '0123456789abcdef'.repeat(4), 'longRun'],
  ['a sha256', createHash('sha256').update('a made-up file').digest('hex'), 'longRun'],
  ['an sk-… key', 'sk-' + 'proj' + 'a1'.repeat(10), 'apiKey'],
  ['a ghp_… token', 'ghp_' + 'Ab1'.repeat(8), 'githubToken'],
  ['an AWS key', 'AKIA' + 'EXAMPLE' + '0'.repeat(9), 'awsKey'],
  ['a JWT', [base64url('{"alg":"HS256","typ":"JWT"}'), base64url('{"sub":"made-up","iat":1}'), 'c2lnbmF0dXJl'].join('.'), 'longRun'],
  ['a 32-character base64 token with digits', 'k3j9x0q2'.repeat(4), 'longRun'],
]

describe('the key rule', () => {
  for (const [what, text] of NOT_KEYS) {
    it(`does not take ${what} for a key`, () => {
      expect(whatLooksLikeASecret(text)?.shape ?? null).toBeNull()
    })
  }
  for (const [what, piece, shape] of STILL_KEYS) {
    it(`still catches ${what}, with words around it`, () => {
      expect(whatLooksLikeASecret(`the value is ${piece} for now`)?.shape ?? null).toBe(shape)
    })
  }
})

const WORKSPACE = 'default'
const STARTER = 'kv-starter'
const WORKER = 'kv-worker'
const INSPECTOR = 'kv-inspector'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string, session?: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

let t: TestDb
let app: FastifyInstance

/** A finished run of the worker's, with nothing sealed, filed by its starter. */
async function aFinishedRun(title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(STARTER),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: WORKER, workingDirectory: process.cwd(), doing: 'Test: the work under check' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const run = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  return run
}

async function theWorkersMessage(run: string, verdict: 'released' | 'refused'): Promise<string> {
  const { getRecord } = await import('../src/server/lib/records.ts')
  const stored = getRecord(run)?.data[verdict] as { check: string } | undefined
  expect(stored, `the run holds no ${verdict}`).toBeDefined()
  return (getRecord(stored!.check)?.data as { body: string }).body
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, as] of [[STARTER, AS_THE_PERSON], [WORKER, asAgent(STARTER)]] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: as, payload: { handle, name: handle, runtime: 'claude-code', workArea: ['work'] } })
    expect(reply.statusCode, reply.body).toBe(201)
  }
  const inspector = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: INSPECTOR, name: INSPECTOR, role: 'inspector' } })
  expect(inspector.statusCode, inspector.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a check's verdict that holds a key-shaped piece", () => {
  const AN_OFFICE_KEY = 'fedcba9876543210'.repeat(4)

  it('is released, and the worker is told the check whole', async () => {
    const run = await aFinishedRun('Test: a run whose check quotes a hex run')
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent(STARTER),
      payload: { verdict: 'released', check: `Test: the hash read was ${AN_OFFICE_KEY}, and it matched.`, chaptersRead: [] },
    })
    expect(answered.statusCode, answered.body).toBe(201)
    const body = await theWorkersMessage(run, 'released')
    expect(body).toContain('You are released.')
    expect(body, 'the check is stored as the inspector wrote it').toContain(`Test: the hash read was ${AN_OFFICE_KEY}, and it matched.`)
    expect(body).not.toContain('left out')
  })

  it('is refused as its checker meant, with what is missing stored whole', async () => {
    const run = await aFinishedRun('Test: a run whose refusal quotes a hex run')
    // The inspector's own check session, and the check assembled in it, as the inspector tool does.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(INSPECTOR),
      payload: { kind: 'session', title: 'Test: the check of that run', data: { state: 'running', servingAgent: INSPECTOR, doing: 'Test: checking' } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const check = (filed.json() as { record: { id: string } }).record.id
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(INSPECTOR, check), payload: { changes: [] } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent(INSPECTOR, check),
      payload: { verdict: 'refused', check: 'Test: read the run.', missing: [`Test: the file's hash ${AN_OFFICE_KEY} does not match.`], says: { invariant: 1 }, chaptersRead: [] },
    })
    expect(answered.statusCode, answered.body).toBe(201)
    const { getRecord } = await import('../src/server/lib/records.ts')
    const refused = getRecord(run)?.data['refused'] as { missing: string[] }
    expect(refused.missing).toEqual([`Test: the file's hash ${AN_OFFICE_KEY} does not match.`])
    const body = await theWorkersMessage(run, 'refused')
    expect(body).toContain(AN_OFFICE_KEY)
    expect(body).not.toContain('left out')
  })
})
