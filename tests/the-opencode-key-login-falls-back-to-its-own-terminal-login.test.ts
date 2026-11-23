// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPENCODE KEY LOGIN FALLS BACK TO OPENCODE'S OWN LOGIN IN A TERMINAL, AND IS NEVER TRIED ANOTHER WAY. Wave 13u,
 * round 242.
 *
 * OpenCode takes a key on standard input ended with a carriage return. That is not documented, and it was checked only
 * on OpenCode 1.18.31 (`giveTheKeyToTheToolsOwnLogin`, src/server/lib/setting-up-an-agent-tool.ts). So:
 *
 *   1. An OpenCode of another version is refused 409 with the code harnessKeyLoginNotThisVersion, the version found and
 *      the version checked, and words saying to sign in with OpenCode's own login in a terminal. Nothing is sent: the
 *      tool's login never runs.
 *   2. An OpenCode at the version checked, whose login fails, is refused 502 with the code harnessKeyLoginFailed, in
 *      words saying it did not work and that OpenCode's own login in a terminal is the way. The key was sent once, and
 *      nothing was tried another way.
 *
 * WHAT IS MADE UP. Two made-up opencodes, each the only program on its own made-up PATH in this test's temp folder
 * (tests/made-up-agent-tools.ts): one at 1.18.30, and one at 1.18.31 whose login ends with 1. The key is made up.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let another: MadeUpTools
let failing: MadeUpTools

/** A key made up for this run, and never a real key. */
const A_MADE_UP_KEY = `made-up-key-for-a-test-only-${randomBytes(6).toString('hex')}`

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function giveTheKey(tools: MadeUpTools) {
  const reply = await withThePath(tools.dir, () =>
    app.inject({ method: 'POST', url: '/api/harnesses/opencode/key', headers: PERSON, payload: { provider: 'opencode', key: A_MADE_UP_KEY } }),
  )
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  another = writeTheMadeUpTools(join(dirname(t.file), 'an-opencode-of-another-version'), { programs: ['opencode'], versions: { opencode: '1.18.30' } })
  failing = writeTheMadeUpTools(join(dirname(t.file), 'an-opencode-whose-login-fails'), { programs: ['opencode'], failsItsLogin: ['opencode'] })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("OpenCode's key login, where it cannot be trusted", () => {
  it('1. an OpenCode of another version gets the plain answer, and nothing is sent', async () => {
    const refused = await giveTheKey(another)
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['code'], refused.raw).toBe('harnessKeyLoginNotThisVersion')
    expect(refused.body['values'], refused.raw).toEqual({ found: '1.18.30', checked: '1.18.31' })
    expect(String(refused.body['error'])).toContain('No key was sent')
    expect(String(refused.body['error'])).toContain('in a terminal')
    expect(another.logins()).toEqual([])
    expect(another.runs().map((one) => one.args.join(' '))).toEqual(['--version'])
    expect(refused.raw).not.toContain(A_MADE_UP_KEY)
  })

  it('2. a login that fails is said plainly, and was tried once and no other way', async () => {
    const refused = await giveTheKey(failing)
    expect(refused.status, refused.raw).toBe(502)
    expect(refused.body['code'], refused.raw).toBe('harnessKeyLoginFailed')
    expect(String(refused.body['error'])).toContain('did not work')
    expect(String(refused.body['error'])).toContain('in a terminal')
    expect(failing.logins()).toEqual([{ program: 'opencode', args: ['auth', 'login', '-p', 'opencode', '-m', 'API key'], stdin: `${A_MADE_UP_KEY}\r` }])
    expect(failing.runs().map((one) => one.args.join(' '))).toEqual(['--version', 'auth login -p opencode -m API key'])
    expect(refused.raw).not.toContain(A_MADE_UP_KEY)
  })
})
