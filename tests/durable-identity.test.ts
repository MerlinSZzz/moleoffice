// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DURABLE AGENT'S INBOX SURVIVES THE PROCESS, PROVED BY STOPPING THE PROCESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE STARTS A SERVER INSTEAD OF CALLING A FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * "Durable" is a claim about what happens when the thing that was serving you dies. A test that
 * writes a message and reads it back through the same in-process app has not asked that question:
 * every open handle, every module-level map and every cached row is still there, and the test would
 * pass identically if the whole inbox were held in memory.
 *
 * So this file starts a real `node` process, sends over HTTP, kills it by process group, starts a
 * SECOND process on the same database file, and asks the same handle. Nothing is shared between the
 * two but the file on disk.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS IMPOSSIBLE BEFORE, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * The only way to address an agent was to name one of its past runs, and `deliveryOf` refuses a run
 * whose transcript is not on this machine. So a comment written on Tuesday to the agent that wrote a
 * report could not be sent on Wednesday: the words were stored and had nowhere to go. The second
 * half of this file drives exactly that comparison — the same words to a dead run and to a durable
 * agent, in one conversation — so the difference is a measurement rather than an assertion.
 *
 * ---------------------------------------------------------------------------------------
 * PROCESS HYGIENE, WHICH THIS REPOSITORY HAS FIVE RECORDED INCIDENTS OF GETTING WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Every server is started with `setsid` and killed by process GROUP, and the port is confirmed free
 * before the next one starts. A server that outlived this file would hold a port and serve a
 * deleted database, which cost an afternoon once.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiServerArguments, thePersonsKeyHeader } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
  'content-type': 'application/json',
}

let dir = ''
let dbFile = ''
let port = 0
let server: ChildProcess | null = null

/** A port nobody is on. Asked of the operating system rather than guessed at. */
async function freePort(): Promise<number> {
  const net = await import('node:net')
  return await new Promise<number>((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const found = probe.address()
      const number = typeof found === 'object' && found !== null ? found.port : 0
      probe.close(() => {
        resolve(number)
      })
    })
  })
}

/** Start a Mole Office server of its own on this database, and wait until it answers. */
async function startServer(): Promise<void> {
  // `tsx` AND NOT `node --experimental-strip-types`. This tree uses path aliases (`@shared/...`)
  // resolved by tsx and by vite, and bare node cannot find them: the first attempt at this file
  // failed with ERR_MODULE_NOT_FOUND before a single test ran. `npm start` uses tsx for the same
  // reason, so this is the product's own way of starting rather than a test's invention.
  server = spawn(join(ROOT, 'node_modules/.bin/tsx'), apiServerArguments([], join(ROOT, 'src/server/index.ts')), {
    cwd: ROOT,
    // setsid, so the whole tree can be killed by process group. `detached` is node's word for it.
    detached: true,
    stdio: 'ignore',
    // MOLE_OFFICE_PORT, which is the name the server reads. `PORT` is not it, and the first attempt at
    // this file spent thirty seconds waiting for a server that had refused to start because 8787
    // was held by the owner's own dev server. `VITEST` is cleared so the child is not taken for a
    // test worker by db/client.ts's refusal.
    env: { ...process.env, MOLE_OFFICE_DB: dbFile, MOLE_OFFICE_PORT: String(port), NODE_ENV: 'test', VITEST: undefined },
  })
  const until = Date.now() + 30_000
  for (;;) {
    if (Date.now() > until) throw new Error(`the server on port ${String(port)} never answered`)
    try {
      const health = await fetch(`http://127.0.0.1:${String(port)}/api/health`)
      if (health.ok) return
    } catch {
      // NOT YET LISTENING IS NOT A FAILURE. It is the ordinary case for the first second, and the
      // deadline above is what turns "not yet" into "never".
    }
    await new Promise((r) => setTimeout(r, 150))
  }
}

/** Stop it by process GROUP, and do not return until the port is free. */
async function stopServer(): Promise<void> {
  const child = server
  server = null
  if (child?.pid === undefined) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // ALREADY GONE IS ALREADY STOPPED. Nothing to report and nothing to clean up.
  }
  const until = Date.now() + 20_000
  for (;;) {
    if (Date.now() > until) throw new Error(`the server on port ${String(port)} would not stop`)
    try {
      await fetch(`http://127.0.0.1:${String(port)}/api/health`)
    } catch {
      return
    }
    await new Promise((r) => setTimeout(r, 150))
  }
}

async function ask(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
    method,
    headers: { ...HUMAN, ...thePersonsKeyHeader(join(dir, 'keys.json')) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('durable')
  dbFile = join(dir, 'panelx.db')
  port = await freePort()
  // THE PRODUCT'S OWN MIGRATION PATH, which is what a real database has been through.
  const { execFileSync } = await import('node:child_process')
  execFileSync(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'src/server/db/migrate.ts')], {
    cwd: ROOT,
    env: { ...process.env, MOLE_OFFICE_DB: dbFile },
    stdio: 'ignore',
  })
  await startServer()
}, 120_000)

afterAll(async () => {
  await stopServer()
  rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('an agent is an identity, and its inbox outlives the process that served it', () => {
  it('reads back the same message from a second server after the first one is killed', async () => {
    // ---- one durable agent
    const made = await ask('POST', '/api/records', {
      kind: 'agent',
      title: 'Round ten',
      data: { handle: 'round-ten', state: 'active', runtime: 'claude-code' },
    })
    expect(made.status, JSON.stringify(made.json)).toBe(201)
    const agentId = (made.json['record'] as { id: string }).id

    // ---- one comment addressed to it, and Send pressed. NOTHING IS LISTENING.
    const thread = await ask('POST', '/api/agent/threads', { title: 'The mount tolerance', mode: 'direct' })
    const threadId = (thread.json['thread'] as { id: string }).id
    const said = await ask('POST', `/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: 'Where did the 0.2 mm come from?',
      recipient: { kind: 'agent', agentId, why: 'It wrote the report this is about.' },
    })
    expect(said.status, JSON.stringify(said.json)).toBe(201)
    const messageId = (said.json['message'] as { id: string }).id
    const sent = await ask('POST', `/api/agent/threads/${threadId}/dispatch`)
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)

    const before = await ask('GET', '/api/agent/inbox?handle=round-ten')
    expect(before.status, JSON.stringify(before.json)).toBe(200)
    const beforeItems = before.json['messages'] as { messageId: string; body: string; dispatch: { state: string; sentAt: string | null } }[]
    expect(beforeItems).toHaveLength(1)
    expect(beforeItems[0]?.dispatch.state).toBe('sent')
    expect(beforeItems[0]?.dispatch.sentAt, 'a comment that went out has no moment it went out').not.toBeNull()
    const sentAt = beforeItems[0]?.dispatch.sentAt

    // ---- THE PROCESS DIES. Not `app.close()`; the operating system kills the group.
    await stopServer()
    await expect(fetch(`http://127.0.0.1:${String(port)}/api/health`)).rejects.toThrow()

    // ---- A SECOND PROCESS, which has never seen any of the above.
    await startServer()
    const after = await ask('GET', '/api/agent/inbox?handle=round-ten')
    expect(after.status, JSON.stringify(after.json)).toBe(200)
    const afterItems = after.json['messages'] as {
      messageId: string
      body: string
      dispatch: { state: string; sentAt: string | null }
    }[]
    expect(afterItems, 'the inbox was empty in the new process').toHaveLength(1)
    expect(afterItems[0]?.messageId).toBe(messageId)
    expect(afterItems[0]?.body, "the person's words came back changed").toBe('Where did the 0.2 mm come from?')
    expect(afterItems[0]?.dispatch.state).toBe('sent')
    expect(afterItems[0]?.dispatch.sentAt, 'the moment it went out moved when the server restarted').toBe(sentAt)

    // ---- AND NO RECORD OF THE AGENT WAS INVENTED OR LOST.
    const agent = after.json['agent'] as { id: string; handle: string; resolvedThrough: string | null }
    expect(agent.id).toBe(agentId)
    expect(agent.handle).toBe('round-ten')
    expect(agent.resolvedThrough).toBeNull()
  }, 120_000)

  it('still resolves through the handle it used to have, so a rename strands nothing', async () => {
    const made = await ask('POST', '/api/records', {
      kind: 'agent',
      title: 'Round nine',
      data: { handle: 'round-9', state: 'active', runtime: 'claude-code' },
    })
    const agentId = (made.json['record'] as { id: string }).id
    const thread = await ask('POST', '/api/agent/threads', { title: 'The older campaign', mode: 'direct' })
    const threadId = (thread.json['thread'] as { id: string }).id
    await ask('POST', `/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: 'What happened to the second measurement?',
      recipient: { kind: 'agent', agentId },
    })
    expect((await ask('POST', `/api/agent/threads/${threadId}/dispatch`)).status).toBe(201)

    const renamed = await ask('PATCH', `/api/records/${agentId}`, { dataPatch: { handle: 'round-nine' } })
    expect(renamed.status, JSON.stringify(renamed.json)).toBe(200)

    const byNew = await ask('GET', '/api/agent/inbox?handle=round-nine')
    expect(byNew.status).toBe(200)
    expect((byNew.json['messages'] as unknown[]).length).toBe(1)

    const byOld = await ask('GET', '/api/agent/inbox?handle=round-9')
    expect(byOld.status, 'listening as the old handle stopped working, so the mail is stranded').toBe(200)
    expect((byOld.json['messages'] as unknown[]).length).toBe(1)
    expect((byOld.json['agent'] as { resolvedThrough: string | null }).resolvedThrough).toBe('round-9')
    expect(byOld.json['says']).toContain('now "round-nine"')
  }, 60_000)

  it('refuses a second agent taking a handle, current or past, naming who holds it', async () => {
    const clash = await ask('POST', '/api/records', {
      kind: 'agent',
      title: 'Somebody else',
      data: { handle: 'round-ten', state: 'active', runtime: 'claude-code' },
    })
    expect(clash.status, JSON.stringify(clash.json)).toBe(409)
    expect(String(clash.json['error'])).toContain('Round ten')

    // AND A HANDLE THAT AGENT USED TO HAVE IS TAKEN TOO, which is what makes the fallback above safe.
    const past = await ask('POST', '/api/records', {
      kind: 'agent',
      title: 'Somebody else again',
      data: { handle: 'round-9', state: 'active', runtime: 'claude-code' },
    })
    expect(past.status, JSON.stringify(past.json)).toBe(409)
  }, 60_000)

  it('refuses deleting an agent with mail waiting, and says to retire it instead', async () => {
    const inbox = await ask('GET', '/api/agent/inbox?handle=round-ten')
    const agentId = (inbox.json['agent'] as { id: string }).id

    const deleted = await ask('DELETE', `/api/records/${agentId}`)
    expect(deleted.status, JSON.stringify(deleted.json)).toBe(409)
    expect(String(deleted.json['error'])).toContain('waiting for "Round ten"')
    expect(String(deleted.json['error'])).toContain('Retire it instead')

    // RETIRING WORKS, AND CHANGES NOTHING ABOUT THE INBOX. That is what makes the refusal fair.
    const retired = await ask('PATCH', `/api/records/${agentId}`, { dataPatch: { state: 'retired' } })
    expect(retired.status, JSON.stringify(retired.json)).toBe(200)
    const still = await ask('GET', '/api/agent/inbox?handle=round-ten')
    expect(still.status).toBe(200)
    expect((still.json['messages'] as unknown[]).length).toBe(1)
    expect((still.json['agent'] as { state: string }).state).toBe('retired')
  }, 60_000)

  it('sends to an agent what it refuses to send to a dead run, in one conversation', async () => {
    // THE COMPARISON THE WHOLE KIND EXISTS FOR, driven rather than asserted.
    //
    // A `session` record that came in through the generated corpus — or whose transcript is simply
    // not on this machine — cannot be picked up, so a comment addressed to it is stored and refused
    // at Send. 66 of the 91 session records in the owner's corpus are that shape. The same words
    // addressed to a durable agent go, because an inbox does not need a live process.
    const run = await ask('POST', '/api/records', {
      kind: 'session',
      title: 'The run that wrote the report',
      data: { state: 'finished', runtime: 'claude-code' },
    })
    const runId = (run.json['record'] as { id: string }).id
    // The comparison uses the other agent, which is still active.
    const inbox = await ask('GET', '/api/agent/inbox?handle=round-nine')
    const agentId = (inbox.json['agent'] as { id: string }).id

    const thread = await ask('POST', '/api/agent/threads', { title: 'Two addresses, same words', mode: 'review' })
    const threadId = (thread.json['thread'] as { id: string }).id
    const toRun = await ask('POST', `/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: 'Which of the two numbers was measured?',
      recipient: { kind: 'session', sessionId: runId },
    })
    const toAgent = await ask('POST', `/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: 'Which of the two numbers was measured?',
      recipient: { kind: 'agent', agentId },
    })
    expect(toRun.status).toBe(201)
    expect(toAgent.status).toBe(201)

    const sent = await ask('POST', `/api/agent/threads/${threadId}/dispatch`)
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)
    expect(sent.json['sent'], 'the comment to the durable agent did not go').toBe(1)
    const held = sent.json['held'] as { messageId: string; why: string }[]
    expect(held, 'the comment to the dead run went, which it cannot').toHaveLength(1)
    expect(held[0]?.messageId).toBe((toRun.json['message'] as { id: string }).id)
    expect(held[0]?.why).toContain('cannot be picked up')

    // AND THE WORDS THAT COULD NOT GO ARE STILL THERE, still queued, still correctable.
    const read = await ask('GET', `/api/agent/threads/${threadId}`)
    const messages = read.json['messages'] as { id: string; state: string; body: string }[]
    const stayed = messages.find((m) => m.id === (toRun.json['message'] as { id: string }).id)
    expect(stayed?.state).toBe('queued')
    expect(stayed?.body).toBe('Which of the two numbers was measured?')

    /**
     * AND THE WIRE SAYS WHICH OF THE TWO EACH ONE IS.
     *
     * A durable agent's id came back under `sessionId` until 25 August 2026, because one column
     * holds whichever id was chosen and the reply served that column under one name. The value was
     * right and the name was not, and the whole point of this kind is that an agent is not a run.
     * Exactly one of the two fields is filled on each, and `kind` says which to read.
     */
    const shape = messages.map((m) => m as unknown as { id: string; recipient: Record<string, unknown> | null })
    const forAgent = shape.find((m) => m.id === (toAgent.json['message'] as { id: string }).id)?.recipient
    expect(forAgent?.['kind']).toBe('agent')
    expect(forAgent?.['agentId'], 'a durable agent is not named on the wire').toBe(agentId)
    expect(forAgent?.['sessionId'], 'a durable agent was served as a run').toBeNull()

    const forRun = shape.find((m) => m.id === (toRun.json['message'] as { id: string }).id)?.recipient
    expect(forRun?.['kind']).toBe('session')
    expect(forRun?.['sessionId']).toBe(runId)
    expect(forRun?.['agentId'], 'a run was served as a durable agent').toBeNull()
  }, 60_000)
})
