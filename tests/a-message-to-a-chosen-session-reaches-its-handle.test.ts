// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE TO A CHOSEN SESSION REACHES THE HANDLE THAT SESSION HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHAT IT COST THE OWNER
 * ---------------------------------------------------------------------------------------
 *
 * At 12:07:23 on 12 September 2026 the owner typed "hi" into the home page's Ask agent box on another
 * machine. The choice named session `ALi7EJl2rpIx`, and the session held the secretary's handle and was
 * answering the whole time. The message was delivered (row `DmZt_mqEn8ft`) to the agent
 * whose handle was a slug of the session's TITLE, with the note
 * "Nothing is answering as … no session holds its handle …". The session never got the words, and
 * the office offered the owner "Start a new agent?" instead of the one that was there. Problem
 * `1QVV5_tLP4ee`.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE TITLE BECAME AN ID
 * ---------------------------------------------------------------------------------------
 *
 * `chosenRecipientAsStored` in src/server/lib/records.ts called `identityForAddressedRun`, which
 * read the session's `ranAs` binding, found none, and MINTED a durable agent from
 * `handleFromTitle(session.title)`. The live `handle_holds` row — the session's own statement of
 * which agent was answering — was never read. `handleFromTitle` is in src/server/db/agent-identity.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. A message whose `chosenRecipient` is a session holding handle X gets a delivery row to
 *      agent X and reaches the waiter holding X. This is the measurement that was missing.
 *   2. A session that holds no handle and names no agent is REFUSED with a sentence saying it
 *      names no agent, and no agent is invented from its title.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN ON 12 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: both cases green. Then `theAgentASessionAnswersAs` in
 * src/server/lib/messages.ts had its live-handle branch removed, so it fell back to `ranAs` and
 * `servingAgent` — the reading that was there before, which meant the run named no agent. Case 1
 * went red (the write was refused instead of delivered to `answering-session`). Case 2 stayed
 * green, because it is about the absence of an agent. The change was put back and both cases were
 * green again. `git diff` after the restore was empty; the sha256 of the file was the same before
 * and after the mutation.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   take the live handle away from the resolver   → case 1
 *   mint an agent from the title again            → case 2
 */

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
let agentRegistryId = ''
let agentRecordId = ''
let keyFile = ''
let session = ''
let noteId = ''
const started: ChildProcess[] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** The waiter, collecting everything it prints, exactly as the M74 test starts it. */
function startTheWaiter(handle: string, forSession: string): { child: ChildProcess; said: () => string; ended: Promise<number> } {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      handle,
      '--session',
      forSession,
      '--api',
      api,
      '--workspace',
      'default',
    ],
    { env: { ...process.env, MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: keyFile, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { child, said: () => printed, ended }
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

/** What the message pool says this message is to, and where its marks stand. */
async function readMessage(id: string): Promise<{
  to: { kind: string; id: string }[]
  deliveries: { mark: string }[]
  chosenRecipient: Record<string, unknown> | null
}> {
  const read = (await get(`/api/messages/${id}`)) as {
    message?: { to?: { kind: string; id: string }[]; deliveries?: { mark: string }[] }
  }
  const record = (await get(`/api/records/${id}`)) as {
    record?: { data?: { chosenRecipient?: Record<string, unknown> | null } }
  }
  return {
    to: read.message?.to ?? [],
    deliveries: read.message?.deliveries ?? [],
    chosenRecipient: record.record?.data?.chosenRecipient ?? null,
  }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  const agent = await post('/api/records', {
    kind: 'agent',
    title: 'Answering a chosen session',
    data: { handle: 'answering-session', runtime: 'claude-code', state: 'active' },
  })
  agentRecordId = ((agent.body['record'] as { id: string }).id)
  keyFile = join(dirname(t.file), 'agent.key')
  writeFileSync(keyFile, (agent.body['whatToGiveIt'] as { key: string }).key, { mode: 0o600 })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  agentRegistryId = one((listed.agents ?? []).filter((a) => a.handle === 'answering-session'), 'the registry row').id

  const filed = await post('/api/records', {
    kind: 'session',
    title: 'A terminal answering as answering-session',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as answering-session' },
  })
  session = ((filed.body['record'] as { id: string }).id)

  // SOMETHING FOR THE MESSAGE TO POINT AT, which the addressing rule needs before a choice can be
  // the only thing on it. A note is the lightest record with a body.
  const note = await post('/api/records', { kind: 'note', title: 'What the message is about', data: { body: 'x' } })
  noteId = (note.body['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
  await app.close()
  t.close()
})

/** One message addressed to the chosen session, written through the real record door. */
async function sendToTheSession(sessionId: string, body: string): Promise<{ status: number; text: string; id: string | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: {
      kind: 'message',
      title: body.slice(0, 40),
      data: {
        body,
        target: { target: { kind: 'record', recordId: noteId, workspaceId: 'default' }, place: { at: 'surface' } },
        chosenRecipient: { kind: 'session', sessionId },
      },
    } as never,
  })
  const text = reply.body
  let id: string | null = null
  try {
    id = ((reply.json() as { record?: { id?: string } }).record?.id) ?? null
  } catch {
    id = null
  }
  return { status: reply.statusCode, text, id }
}

describe('a message to a chosen session reaches the handle that session holds', () => {
  it('is delivered to the held handle, and the waiter holding it is handed the words', async () => {
    const waiter = startTheWaiter('answering-session', session)
    // THE CONTROL: the hold is really there before the message is written, so a delivery that
    // lands on the handle cannot have come from anywhere else.
    expect(
      await until(async () => {
        // THE HOLD LIST, not `/api/handles/:handle`: that door answers `hold: null` when the session
        // behind the hold cannot be read as answering (M106), and this case is about the hold being
        // there at all, which is what the message's recipient follows.
        const read = (await get('/api/handles')) as {
          holds?: { handle: string; session: string; releasedAt: string | null }[]
        }
        return (read.holds ?? []).some(
          (hold) => hold.handle === 'answering-session' && hold.session === session && hold.releasedAt === null,
        )
      }),
      waiter.said(),
    ).toBe(true)

    const sent = await sendToTheSession(session, 'hi, to the terminal that is answering')
    expect(sent.status, sent.text).toBe(201)
    const id = sent.id
    expect(id, sent.text).not.toBeNull()

    // THE DELIVERY ROW NAMES THE HELD HANDLE, not a slug of the session's title.
    const read = await readMessage(id as string)
    expect(read.to, 'the message is not addressed to the handle the session holds').toEqual([
      { kind: 'agent', id: agentRegistryId },
    ])
    expect(read.deliveries, 'no delivery row was written for the held handle').toHaveLength(1)
    expect(
      read.chosenRecipient?.['agentId'],
      'the completed choice was not filed under the agent record the handle names',
    ).toBe(agentRecordId)
    // AND NOTHING WAS INVENTED FROM THE TITLE.
    const invented = await get('/api/participants')
    const handles = ((invented.agents ?? []) as { handle: string }[]).map((one) => one.handle)
    expect(handles, 'an agent was invented from the session title').not.toContain(
      'a-terminal-answering-as-answering-session',
    )

    // AND THE WAITER IS HANDED IT, which is what "reaches the session" means. It is delivered;
    // only the recipient marks read. Mutation: restore the waiter's automatic seen post.
    expect(await until(() => waiter.said().includes(id as string)), waiter.said()).toBe(true)
    expect(await waiter.ended, waiter.said()).toBe(0)
    const after = await readMessage(id as string)
    expect(after.deliveries[0]?.mark, 'the waiter was handed the message and the mark did not move').toBe('delivered')
  }, 120_000)

  it('refuses a session that holds no handle and names no agent, and invents nobody', async () => {
    const before = await get('/api/participants')
    const agentCount = (((before.agents ?? []) as unknown[])).length

    const filed = await post('/api/records', {
      kind: 'session',
      title: 'A run that names no agent at all',
      data: { state: 'idle', runtime: 'claude-code', doing: 'nothing that names an agent' },
    })
    const nameless = (filed.body['record'] as { id: string }).id

    const sent = await sendToTheSession(nameless, 'nobody is here to read this')
    expect(sent.status, 'a session that names no agent was delivered to anyway').toBe(422)
    expect(sent.text, 'the refusal does not say the session names no agent').toContain('names no agent')

    const after = await get('/api/participants')
    const handles = ((after.agents ?? []) as { handle: string }[]).map((one) => one.handle)
    expect(handles.length, 'an agent was invented for a session that names none').toBe(agentCount)
    expect(handles, 'an agent was invented from the session title').not.toContain('a-run-that-names-no-agent-at-all')
  }, 120_000)
})
