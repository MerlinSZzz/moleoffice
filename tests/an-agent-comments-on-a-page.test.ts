// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT LEAVES A COMMENT ON A PART OF A PAGE, THE PAGE DRAWS IT, AND THE PERSON ANSWERS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M7 of design/messages/ACCEPTANCE.md, and the points behind it:
 *
 *   commenting and picking out a semantic block are not
 *   a person's alone.
 *   the agent picks out a region or
 *   a passage, shows its explanation on it, the person answers, and the agent carries on.
 *
 * Four things follow and each has a test here: an agent may name a region through the same door a
 * person's composer uses; it meets the same refusals when it names a bad one; the page draws the
 * agent's words beside that region with its name; and the person's answer is a message to that
 * agent about the same place, waiting in that agent's queue.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE BROWSER HALF IS AGAINST A REAL SERVER
 * ---------------------------------------------------------------------------------------
 *
 * The point of the last two is that a comment written from OUTSIDE the browser reaches the page, so
 * a stub of the write would test the stub. `liveApp` starts an API and a Vite of its own.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let reportId = ''
/** The registry id Reader Y was given. It is not its handle, and a message stores this id. */
let readerId = ''

const PARAGRAPH = 'The gripper closed at 11.8 newtons on every one of the twenty trials.'
const SECOND = 'Nothing was measured about the second gripper at all.'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'reader-y',
}

/** The place the agent's first comment is about: the first block of the report. */
const firstBlock = () => ({ target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-1]' } })

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'agent-comments', viewport: { width: 1440, height: 1000 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Reader Y',
    data: { handle: 'reader-y', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  readerId = agents.find((one) => one.handle === 'reader-y')?.id ?? ''
  expect(readerId, 'reader-y has no registry row').not.toBe('')
  const report = await write(AS_THE_OWNER, {
    kind: 'report',
    title: 'What the force sweep showed',
    data: {
      for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the sweep`,
      date: '2026-09-04',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: PARAGRAPH },
        { id: 'b-2', type: 'text', heading: 'What I did not', text: SECOND },
      ],
    },
  })
  const written = (await report.json()) as { record?: { id: string }; error?: string }
  expect(report.status, JSON.stringify(written)).toBe(201)
  reportId = written.record?.id ?? ''
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('an agent names a part of a record through the door a person uses', () => {
  it('accepts a comment from an agent on a region of a report', async () => {
    const said = await write(AS_AN_AGENT, {
      kind: 'message',
      title: 'The twenty trials',
      data: { body: 'Every one of these twenty trials used the same gripper.', target: firstBlock() },
    })
    expect(said.status, await said.text()).toBe(201)
  })

  it('refuses a region an agent made up, in the sentence a person would be refused with', async () => {
    const madeUp = { target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-99]' } }
    const asAnAgent = await write(AS_AN_AGENT, {
      kind: 'message',
      title: 'About a block that is not there',
      data: { body: 'This points at nothing.', target: madeUp },
    })
    const asAPerson = await write(AS_THE_OWNER, {
      kind: 'message',
      title: 'About a block that is not there',
      data: { body: 'This points at nothing.', target: madeUp },
    })
    expect(asAnAgent.status).toBe(asAPerson.status)
    expect(asAnAgent.status).toBeGreaterThanOrEqual(400)
    // THE SAME SENTENCE, NOT MERELY THE SAME NUMBER. A refusal that named the writer's kind would be
    // a second rule about who may point at what.
    expect(await asAnAgent.text()).toBe(await asAPerson.text())
  })

  it('announces a comment as a comment, and an answer to one as an answer', async () => {
    const heard: { name: string; targetKey?: string; recordId?: string | null }[] = []
    const control = new AbortController()
    const stream = await fetch(`${app.api}/api/events`, {
      headers: { ...AS_THE_OWNER, accept: 'text/event-stream' },
      signal: control.signal,
    })
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    void (async () => {
      let held = ''
      try {
        for (;;) {
          const next = await reader.read()
          if (next.done) return
          held += decoder.decode(next.value, { stream: true })
          for (const line of held.split('\n')) {
            if (!line.startsWith('data: ')) continue
            heard.push(JSON.parse(line.slice(6)) as { name: string })
          }
          held = ''
        }
      } catch {
        // The stream was cancelled at the end of this test, which is how it ends.
      }
    })()

    const placed = await write(AS_AN_AGENT, {
      kind: 'message',
      title: 'About the second block',
      data: {
        body: 'Nothing was measured about the second gripper, and that is worth saying out loud.',
        target: { target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-2]' } },
      },
    })
    expect(placed.status, await placed.text()).toBe(201)

    const answered = await write(AS_THE_OWNER, {
      kind: 'message',
      title: 'An answer',
      data: {
        body: 'Yes. Measure it next week.',
        to: [{ kind: 'agent', id: 'reader-y' }],
        target: { target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-2]' } },
      },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed.
    expect(answered.status, await answered.text()).toBe(409)

    for (let tries = 0; tries < 60 && heard.filter((one) => one.name.startsWith('comment.')).length < 2; tries += 1) {
      await new Promise((wake) => setTimeout(wake, 50))
    }
    control.abort()

    const comments = heard.filter((one) => one.name.startsWith('comment.'))
    expect(comments.map((one) => one.name)).toEqual(['comment.placed', 'comment.replied'])
    // BOTH SAY WHICH RECORD AND WHICH THING, so a page can tell whether it is about what it is
    // drawing without reading the message back.
    for (const one of comments) {
      expect(one.recordId).toBe(reportId)
      expect(one.targetKey).toContain('region/')
    }
  }, 60_000)
})

describe('the page draws what an agent said, and the person answers it there', () => {
  it('draws the agent name and its words beside the part it commented on', async () => {
    await app.page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-said', { timeout: 30_000 })
    const drawn = await app.page.evaluate(() =>
      [...document.querySelectorAll('.px-said')].map((one) => (one as HTMLElement).innerText),
    )
    expect(drawn.join(' | ')).toContain('Reader Y')
    expect(drawn.join(' | ')).toContain('Every one of these twenty trials used the same gripper.')
  }, 90_000)

  it('appears without a reload when an agent comments while the page is open', async () => {
    const before = await app.page.evaluate(() => document.querySelectorAll('.px-said').length)
    const said = await write(AS_AN_AGENT, {
      kind: 'message',
      title: 'A late remark',
      data: {
        body: 'One more thing about the heading of this report.',
        target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
      },
    })
    expect(said.status, await said.text()).toBe(201)
    await app.page.waitForFunction(
      (was: number) => document.querySelectorAll('.px-said').length > was,
      before,
      { timeout: 30_000 },
    )
  }, 90_000)

  it('sends the person answer to that agent, about the same place, and it waits in the queue', async () => {
    const card = app.page.locator('.px-said').first()
    await card.locator('.px-said-write textarea').fill('Measured on Tuesday. Nothing changed.')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed, so the card says the
    // routed line, which the 409 carries as its `error`, and the answer is in the pool all the same.
    const sent = app.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/records' && r.request().method() === 'POST')
    await card.locator('.px-said-send').click()
    const reply = await sent
    expect(reply.status()).toBe(409)
    const said = (await reply.json()) as { error: string; record?: { id?: string } }
    expect(said.record?.id, 'the 409 still carries the stored answer').toBeTruthy()
    await app.page.waitForSelector('.px-said-note, .px-said-fault', { timeout: 30_000 })
    const fault = await app.page.evaluate(() => document.querySelector('.px-said-fault')?.textContent ?? null)
    expect(fault, 'the card says where the answer went').toBe(said.error)

    const pool = (await (
      await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
    ).json()) as {
      messages: {
        id: string
        body: string
        sentBy: { kind: string; id: string } | null
        to: { kind: string; id: string }[]
        target: unknown
        deliveries: { to: { kind: string; id: string }; mark: string }[]
      }[]
    }
    const answer = pool.messages.find((one) => one.body === 'Measured on Tuesday. Nothing changed.')
    expect(answer, 'the answer typed on the page is in the pool').toBeDefined()
    if (answer === undefined) return
    expect(answer.to).toEqual([{ kind: 'agent', id: readerId }])
    // ABOUT THE SAME PLACE. The answer says what on the page it is about, and it is the place the
    // comment it answers named.
    expect(JSON.stringify(answer.target)).toContain(reportId)
    expect(answer.deliveries.map((one) => one.mark)).toEqual(['queued'])

    // AND IT NAMES THE MESSAGE IT ANSWERS. The schema promises that anybody answering in a
    // conversation writes `inReplyTo`, and until 4 September nothing in the browser did, so an agent
    // with two comments on one page could not tell which of them had been answered. Problem
    // `Wjb30lfFs62C`. What it must name is the agent's own remark about this same place.
    const stored = (await (
      await fetch(`${app.api}/api/records/${answer.id}`, { headers: AS_THE_OWNER })
    ).json()) as { record: { data: Record<string, unknown> } }
    const names = stored.record.data['inReplyTo']
    expect(typeof names, JSON.stringify(stored.record.data)).toBe('string')
    const answered = pool.messages.find((one) => one.id === names)
    expect(answered, 'the message it names is in the pool').toBeDefined()
    if (answered === undefined) return
    expect(answered.sentBy).toEqual({ kind: 'agent', id: readerId })
    expect(JSON.stringify(answered.target)).toBe(JSON.stringify(answer.target))
  }, 90_000)
})
