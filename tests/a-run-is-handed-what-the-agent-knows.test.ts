// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * WHEN NOBODY HAS THE AGENT OPEN, A RUN ANSWERS, AND IT IS HANDED WHAT THE AGENT KNOWS.
 *
 * Criterion H3 of design/messages/ACCEPTANCE.md section 10. A run is a fresh process that has never
 * heard of the work. Until now it was handed the message and nothing else, so an agent with months
 * of notes answered as though it had none.
 *
 * WHAT IS PROVED HERE. An agent says where its notes are with a field on its record, and a relative
 * path is refused rather than resolved against a directory nobody meant. The bundle carries those
 * notes and the records the agent wrote lately, and names every file it left out with the reason.
 * The real worker writes the bundle beside the run and the prompt names the file. The conversation
 * says which mind is answering. And after a run has answered, the conversation carries a short line
 * saying so.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { promptFor } from '../src/worker/prompt.ts'
import { apiApp, freshDb, one, theOfficesOwnId, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let notesFolder: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'has-notes',
}

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-knows-runs-'))
  notesFolder = mkdtempSync(join(tmpdir(), 'mole-office-knows-notes-'))
  writeFileSync(join(notesFolder, 'MEMORY.md'), '# What I remember\n\nThe gripper drifts after twenty minutes.\n')
  writeFileSync(join(notesFolder, 'project_gripper.md'), '# The gripper\n\nCalibrated on 2 September.\n')
  // A FILE TOO BIG TO CARRY, so the bundle has something real to leave out and name.
  writeFileSync(join(notesFolder, 'enormous.md'), 'x'.repeat(60_000))
  // AND SOMETHING THAT IS NOT A NOTE, which is left out without being named: it was never a note.
  writeFileSync(join(notesFolder, 'a-picture.png'), 'not markdown')
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  rmSync(notesFolder, { recursive: true, force: true })
})

describe('an agent says where it keeps its notes', () => {
  it('refuses a relative path rather than resolving it against a directory nobody meant', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: {
        kind: 'agent',
        title: 'Somewhere relative',
        data: { handle: 'somewhere-relative', state: 'active', runtime: 'claude-code', notes: 'notes/mine' },
      },
    })

    expect(reply.statusCode).toBe(400)
    expect(String(reply.json().error)).toContain('not an absolute path')
    expect(String(reply.json().error)).toContain('Nothing was written')
  })

  it('takes an absolute one', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: {
        kind: 'agent',
        title: 'Has notes',
        data: { handle: 'has-notes', state: 'active', runtime: 'claude-code', notes: notesFolder },
      },
    })

    expect(reply.statusCode).toBe(201)
  })
})

describe('what the agent knows', () => {
  it('carries its notes and names what it left out, with the reason', async () => {
    // A RECORD OF ITS OWN, so the bundle has something recent to carry.
    await post(
      '/api/records',
      { kind: 'note', title: 'What the gripper did on Tuesday', data: { body: 'It drifted.' } },
      AS_THE_AGENT,
    )

    const said = (await get('/api/handles/has-notes/knows')) as {
      notesAt: string
      notesSay: string
      notes: { name: string }[]
      leftOut: { name: string; because: string }[]
      recent: { title: string }[]
      text: string
    }

    expect(said.notesAt).toBe(notesFolder)
    expect(said.notes.map((n) => n.name)).toEqual(['MEMORY.md', 'project_gripper.md'])
    expect(one(said.leftOut, 'the note that was too big').name).toBe('enormous.md')
    expect(one(said.leftOut, 'the note that was too big').because).toContain('60000 bytes')
    expect(said.notesSay).toContain('2 of 3 notes')
    expect(said.recent.map((r) => r.title)).toContain('What the gripper did on Tuesday')
    // AND THE ONE PAGE A RUN READS SAYS ALL OF IT.
    expect(said.text).toContain('The gripper drifts after twenty minutes.')
    expect(said.text).toContain('enormous.md')
    expect(said.text).toContain('What the gripper did on Tuesday')
  })

  it('says nobody has said where an agent keeps notes, rather than being silent about it', async () => {
    await post('/api/records', {
      kind: 'agent',
      title: 'No notes',
      data: { handle: 'no-notes', state: 'active', runtime: 'claude-code' },
    })

    const said = (await get('/api/handles/no-notes/knows')) as { notesAt: string | null; notesSay: string }

    expect(said.notesAt).toBeNull()
    expect(said.notesSay).toContain('Nobody has said where no-notes keeps its notes')
  })
})

describe('the run the worker starts', () => {
  let agentId = ''
  let messageId = ''
  let runSession = ''

  /** Run passes until something is true, or say it never was. */
  async function until(what: () => Promise<boolean>, within = 20_000): Promise<boolean> {
    const deadline = Date.now() + within
    for (;;) {
      await onePass(settings, watching)
      if (await what()) return true
      if (Date.now() >= deadline) return false
      await new Promise((go) => setTimeout(go, 100))
    }
  }

  it('is handed the bundle in a file beside its output', async () => {
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    agentId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'has-notes'),
      'the registry row for has-notes',
    ).id
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'about the gripper',
      data: { body: 'What did the gripper do?', to: [{ kind: 'agent', id: agentId }] },
    })
    messageId = (filed['record'] as { id: string }).id
    // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: this agent is fresh, so the
    // message waits for the owner’s press. What is measured here is what the run is HANDED.
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const report = await onePass(settings, watching)

    const started = one(report.started, 'the run that was started')
    runSession = started.session
    const bundle = readFileSync(join(outputs, runSession, 'what-this-agent-knows.md'), 'utf8')
    expect(bundle).toContain('The gripper drifts after twenty minutes.')
    expect(bundle).toContain('What it has written lately')
    expect(bundle).toContain('enormous.md')
  })

  /**
   * AND THE PROMPT NAMES THAT FILE. Asked of `promptFor` directly, because a run's prompt is an
   * argument to a process and is not written down anywhere a test can read it. The worker builds
   * this argument in one expression out of the path it just wrote, which is the same fact.
   */
  it('and the prompt names the file, and says to read it first', () => {
    const said = promptFor({
      agent: 'has-notes',
      workspace: 'default',
      api,
      messageId: 'abcdefghijkl',
      body: 'What did the gripper do?',
      from: `the person ${THE_TEST_OFFICES_OWNER.id}`,
      carryingOn: false,
      howToLead: '## When somebody asks you to take them to a page',
      knows: { path: '/somewhere/what-this-agent-knows.md', say: '2 of 3 notes are here in full.' },
      brief: null,
    })

    expect(said).toContain('WHAT YOU ALREADY KNOW')
    expect(said).toContain('/somewhere/what-this-agent-knows.md')
    expect(said).toContain('2 of 3 notes are here in full.')
  })

  it('says so plainly when Mole Office could not gather it, rather than naming a file that is not there', () => {
    const said = promptFor({
      agent: 'has-notes',
      workspace: 'default',
      api,
      messageId: 'abcdefghijkl',
      body: 'What did the gripper do?',
      from: `the person ${THE_TEST_OFFICES_OWNER.id}`,
      carryingOn: false,
      howToLead: '## When somebody asks you to take them to a page',
      knows: null,
      brief: null,
    })

    expect(said).toContain('COULD NOT GATHER WHAT YOU ALREADY KNOW')
    expect(said).not.toContain('what-this-agent-knows.md')
  })

  it('leaves a short line in the conversation saying a run answered, not the agent\u2019s own session', async () => {
    const answered = await until(async () => {
      const read = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as {
        messages?: { body: string }[]
      }
      return (read.messages ?? []).some((m) => m.body === SYSTEM_LINES.aRunAnswered.line)
    })
    expect(answered, 'no line ever said a run answered').toBe(true)

    const read = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as {
      messages?: { body: string; saidInFull: string | null; sentBy: { kind: string; id: string } | null }[]
    }
    const line = one(
      (read.messages ?? []).filter((m) => m.body === SYSTEM_LINES.aRunAnswered.line),
      'the line saying a run answered',
    )
    // A FEW WORDS, criterion M34, with the whole sentence behind it.
    expect(line.body).toBe('A run answered')
    expect(String(line.saidInFull)).toContain('Nobody had this agent open in a terminal')
    expect(line.sentBy).toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    // AND IT IS AFTER THE ANSWER, so a reader meets the answer first and then where it came from.
    const bodies = (read.messages ?? []).map((m) => m.body)
    expect(bodies.indexOf('A run answered')).toBe(bodies.length - 1)
    expect(messageId).not.toBe('')
    expect(runSession).not.toBe('')
  })

  it('says in the conversation which mind is answering now', async () => {
    const read = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as {
      answering?: { how: string; says: string }
    }

    // NOT A LIVE SESSION: nobody holds this agent's handle, so a run is what answers.
    expect(read.answering?.how).not.toBe('a live session')
    expect(String(read.answering?.says)).toContain('run')
  })
})
