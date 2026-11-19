// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANNEL: a message written through the API reaches an open page without the page asking.
 *
 * Criterion M5 of design/messages/ACCEPTANCE.md: *One server-sent-events route carries: a new
 * message, a delivery mark changing, a presence change … The page subscribes once, reconnects with
 * the last event id, and a test proves a message written through the API reaches an open page in
 * under a second with no polling.*
 *
 * THE MEASUREMENT IS IN THE NAME OF THE TEST THAT TAKES IT, and it is taken against a real server
 * with a real browser: the page is opened, a message is written from outside the browser, and the
 * time until the page has it is measured in the page. Nothing is stubbed, because what is being
 * proved is that the two ends really are connected.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  CONNECTION_IS_COUNTED,
  CONNECTION_TAG_PARAM,
  EVENTS_SENT_TODAY,
  EVENT_NAMES,
} from '../src/shared/events.ts'

let app: LiveApp

/** The headers every request in this file sends: who is asking and which project. */
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-x',
}

beforeAll(async () => {
  app = await liveApp({ name: 'channel', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  // A SECOND PROJECT, so the test below can write into one the page is not watching.
  const other = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: 'somewhere-else', title: 'Somewhere else' }),
  })
  expect(other.status, await other.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

/** Open one stream inside the page and hand back the events it collects. */
async function watchInThePage(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  // THE API'S OWN ADDRESS, HANDED IN. The page calls the API on the host it was served from and the
  // API's port, and Vite no longer proxies `/api/` at all, so a path here would ask Vite for a route
  // it does not have and get the page's own HTML back.
  await app.page.evaluate(async ({ api, ownerId }: { api: string; ownerId: string }): Promise<void> => {
    const held = window as unknown as { seen: { at: number; name: string; body: string }[]; ready?: boolean }
    held.seen = []
    const res = await fetch(`${api}/api/events`, {
      headers: {
        accept: 'text/event-stream',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': ownerId,
      },
    })
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    void (async () => {
      let kept = ''
      for (;;) {
        const next = await reader.read()
        if (next.done) return
        kept += decoder.decode(next.value, { stream: true })
        let at = kept.indexOf('\n\n')
        while (at !== -1) {
          const block = kept.slice(0, at)
          kept = kept.slice(at + 2)
          at = kept.indexOf('\n\n')
          if (block.startsWith(': open')) {
            held.ready = true
            continue
          }
          if (block.startsWith(':')) continue
          const name = /^event: (.+)$/m.exec(block)?.[1] ?? ''
          const body = /^data: (.+)$/m.exec(block)?.[1] ?? ''
          held.seen.push({ at: Date.now(), name, body })
        }
      }
    })()
  }, { api: app.api, ownerId: THE_TEST_OFFICES_OWNER.id })
  await app.page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, undefined, {
    timeout: 10_000,
  })
}

/**
 * Read the stream until the server says this connection is counted as open.
 *
 * WHY NOT THE FIRST LINE. The first line is `: open N missed`, and it is written before the
 * connection joins the list of open pages, because what a page missed has to be worked out before
 * anything is sent. A caller that stopped there could ask about a connection the server has not
 * counted yet, which is exactly the race this file used to lose.
 */
async function readUntilCounted(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder()
  let seen = ''
  for (let reads = 0; reads < 20; reads += 1) {
    const next = await reader.read()
    if (next.done) break
    seen += decoder.decode(next.value, { stream: true })
    if (seen.includes(`: ${CONNECTION_IS_COUNTED}`)) return
  }
  throw new Error(`the stream never said it was counted. What it said: ${JSON.stringify(seen)}`)
}

describe('a message written through the API reaches an open page in under a second, with no polling', () => {
  it('arrives in under a second, and the number is measured in the page', async () => {
    await watchInThePage()

    const wrote = Date.now()
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_AN_AGENT,
      body: JSON.stringify({
        kind: 'message',
        title: 'The sweep is holding',
        data: { body: 'The sweep is holding until you say.', to: [{ kind: 'person', id: THE_PERSON }] },
      }),
    })
    expect(said.status, await said.clone().text()).toBe(201)
    const messageId = ((await said.json()) as { record: { id: string } }).record.id

    await app.page.waitForFunction(
      (id: string) =>
        (window as unknown as { seen: { name: string; body: string }[] }).seen.some(
          (one) => one.name === 'message.new' && one.body.includes(id),
        ),
      messageId,
      { timeout: 5_000 },
    )
    const arrived = (await app.page.evaluate(
      (id: string) =>
        (window as unknown as { seen: { at: number; name: string; body: string }[] }).seen.find(
          (one) => one.name === 'message.new' && one.body.includes(id),
        )?.at ?? 0,
      messageId,
    )) as number

    const took = arrived - wrote
    // THE NUMBER IS IN THE ASSERTION'S OWN MESSAGE, so a run that fails says how long it really
    // took rather than only that it was too long. Measured on 4 September 2026 in this checkout:
    // 24ms from the write returning to the page having the event.
    expect(took, `the message took ${String(took)}ms to reach the page`).toBeLessThan(1000)
    expect(took).toBeGreaterThanOrEqual(0)
  }, 120_000)

  /*
   * ---------------------------------------------------------------------------------------
   * THIS CASE USED TO SAY THE OPPOSITE, UNTIL THE RULE CHANGED
   * ---------------------------------------------------------------------------------------
   *
   * It read *sends nothing to a page watching another project* and wrote a MESSAGE into the second
   * project to prove it. Criterion M55 makes a conversation the person's, whichever project is
   * open, because switching the project changed the contacts and hid a conversation. A message
   * that could not reach the page would leave the panel holding the right rows and not moving —
   * the circle right only after the reader navigated, and a reply arriving in another project
   * invisible until then.
   *
   * SO THE RULE SPLIT IN TWO, and both halves are measured below. A message and the mark saying it
   * was read are about a PERSON and reach every page they have open. Everything else on the stream
   * is about a PROJECT and still goes only to the pages watching it — which is what the second case
   * measures, on the `comment.placed` event that rides along with the very same write.
   */
  it('sends a message written in another project, because a conversation is the person’s', async () => {
    await watchInThePage()
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_AN_AGENT, 'x-mole-office-workspace': 'somewhere-else' },
      body: JSON.stringify({
        kind: 'message',
        title: 'A message in another project',
        data: { body: 'This one is still yours.', to: [{ kind: 'person', id: THE_PERSON }] },
      }),
    })
    expect(said.status, await said.clone().text()).toBe(201)
    // THE EVENT NAMES THE MESSAGE AND DOES NOT CARRY ITS WORDS, so the id is what is looked for —
    // the same thing the case above looks for.
    const messageId = ((await said.json()) as { record: { id: string } }).record.id
    await app.page.waitForFunction(
      (id: string) =>
        (window as unknown as { seen: { name: string; body: string }[] }).seen.some(
          (one) => one.name === 'message.new' && one.body.includes(id),
        ),
      messageId,
      { timeout: 5_000 },
    )
  }, 120_000)

  it('tells a page watching one project nothing about a comment placed in another', async () => {
    await watchInThePage()
    // A COMMENT IS A MESSAGE WITH A TARGET, so this one write raises both events: `message.new`,
    // which is the person's and arrives, and `comment.placed`, which is the project's and does not.
    // Measuring them from a single write is what makes "it did not arrive" mean the filter rather
    // than the stream being asleep.
    const about = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': 'somewhere-else' },
      body: JSON.stringify({ kind: 'note', title: 'A page over there', data: {} }),
    })
    expect(about.status, await about.clone().text()).toBe(201)
    const recordId = ((await about.json()) as { record: { id: string } }).record.id

    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_AN_AGENT, 'x-mole-office-workspace': 'somewhere-else' },
      body: JSON.stringify({
        kind: 'message',
        title: 'A comment in another project',
        data: {
          body: 'A comment over there.',
          to: [{ kind: 'person', id: THE_PERSON }],
          target: { target: { kind: 'record', recordId, workspaceId: 'somewhere-else' } },
        },
      }),
    })
    expect(said.status, await said.clone().text()).toBe(201)
    const commentId = ((await said.json()) as { record: { id: string } }).record.id

    // THE CONTROL: the message half of that write really did arrive, so the stream was awake.
    await app.page.waitForFunction(
      (id: string) =>
        (window as unknown as { seen: { name: string; body: string }[] }).seen.some(
          (one) => one.name === 'message.new' && one.body.includes(id),
        ),
      commentId,
      { timeout: 5_000 },
    )
    // A SECOND IS LONGER THAN THE TEST ABOVE MEASURED, so this is not a race that happened to pass.
    await new Promise((done) => setTimeout(done, 1200))
    const comments = (await app.page.evaluate(
      () =>
        (window as unknown as { seen: { name: string }[] }).seen.filter((one) => one.name.startsWith('comment.'))
          .length,
    )) as number
    expect(comments, 'a page watching one project was told about a comment in another').toBe(0)
  }, 120_000)

  it('gives a page that reconnects everything it missed, and says how many it cannot have', async () => {
    // ONE MESSAGE WHILE NOTHING IS LISTENING, then a fresh connection that names the last event it
    // saw. The server sends what came after it.
    const first = await fetch(`${app.api}/api/events/state`, { headers: AS_THE_OWNER })
    const before = (await first.json()) as { lastId: number }

    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_AN_AGENT,
      body: JSON.stringify({
        kind: 'message',
        title: 'Written while nobody was listening',
        data: { body: 'Nobody was listening.', to: [{ kind: 'person', id: THE_PERSON }] },
      }),
    })
    expect(said.status).toBe(201)
    const messageId = ((await said.json()) as { record: { id: string } }).record.id

    const stream = await fetch(`${app.api}/api/events?lastEventId=${String(before.lastId)}`, {
      headers: { ...AS_THE_OWNER, accept: 'text/event-stream' },
    })
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader()
    const text = new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
    expect(text).toContain(': open 0 missed')
    expect(text, 'the message written while nothing was listening was not sent again').toContain(messageId)
  }, 120_000)

  it('says which world answered on the stream first reply, like every other reply', async () => {
    const stream = await fetch(`${app.api}/api/events`, {
      headers: { ...AS_THE_OWNER, accept: 'text/event-stream' },
    })
    expect(stream.headers.get('x-mole-office-world')).not.toBeNull()
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    await stream.body?.cancel()
  }, 60_000)

  it('says a page is open while it is, and stops saying so when it closes', async () => {
    // THIS TEST USED TO COUNT EVERY PAGE ON THE SERVER AND WAS A RACE, about one run in three
    // (problems `S5otcpQOw0iJ` and `xi0SpPpDxl6j`). Two things were wrong with it. It read
    // `pagesOpen`, which counts every connection on this server, so a stream another test opened or
    // closed late moved the number under it. And it read that number as soon as the first line
    // arrived, and the first line is written BEFORE the connection joins the list of open pages.
    //
    // Both are answered. The connection carries a name of this test's own and the count asked for is
    // the count of connections carrying that name, which nothing else can move. And the server
    // writes a second comment line once the connection is counted, so waiting for it is waiting for
    // the thing being measured rather than for a moment near it.
    //
    // AND THE BROWSER THIS FILE DRIVES NOW HOLDS A CONNECTION OF ITS OWN, since the channel is open
    // on every page rather than only while the messages panel is. A page loaded again leaves its old
    // connection behind until the server notices the socket has gone, so `pagesOpen` moves for a
    // second or two after anything happens to that page. That is the second reason nothing here
    // reads it: the count asked for names this test's stream, and the browser's cannot be in it.
    const tag = `the-channel-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`
    const mine = async (): Promise<number> => {
      const res = await fetch(`${app.api}/api/events/state?${CONNECTION_TAG_PARAM}=${tag}`, { headers: AS_THE_OWNER })
      const held = (await res.json()) as { openWithThisTag: number | null; tag: string | null }
      expect(held.tag, 'the reply says which name it counted').toBe(tag)
      expect(held.openWithThisTag, 'a count of nothing is 0; null would say nobody asked').not.toBeNull()
      return held.openWithThisTag ?? -1
    }
    expect(await mine(), 'nothing of this test is open before it opens one').toBe(0)

    const control = new AbortController()
    const stream = await fetch(`${app.api}/api/events?${CONNECTION_TAG_PARAM}=${tag}`, {
      headers: { ...AS_THE_OWNER, accept: 'text/event-stream' },
      signal: control.signal,
    })
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader()
    await readUntilCounted(reader)
    expect(await mine(), 'the connection this test opened is not counted as open').toBe(1)

    control.abort()
    // The server notices the close on its own socket, which is not instant.
    for (let tries = 0; tries < 40 && (await mine()) !== 0; tries += 1) {
      await new Promise((done) => setTimeout(done, 50))
    }
    expect(await mine(), 'the connection is still counted after it closed').toBe(0)
  }, 60_000)

  it('says nobody asked when nobody named a connection, rather than saying none are open', async () => {
    const res = await fetch(`${app.api}/api/events/state`, { headers: AS_THE_OWNER })
    const held = (await res.json()) as { openWithThisTag: number | null; tag: string | null; pagesOpen: number }
    expect(held.openWithThisTag, 'zero would say none of yours are open, and nobody said which yours are').toBeNull()
    expect(held.tag).toBeNull()
    expect(typeof held.pagesOpen, 'the count of every page is still there').toBe('number')
  }, 60_000)

  it('publishes the whole event vocabulary, and says which of them anything sends today', async () => {
    const res = await fetch(`${app.api}/api/events/state`, { headers: AS_THE_OWNER })
    const state = (await res.json()) as { sends: string[] }
    expect(state.sends).toEqual([...EVENTS_SENT_TODAY])
    // EVERY NAME IN THE VOCABULARY IS SENT BY SOMETHING NOW. The two that were not are part 2c and
    // they landed with it. This still asserts the two lists against each other rather than a
    // literal, so a name added and never sent goes red here.
    expect(EVENT_NAMES.filter((one) => !EVENTS_SENT_TODAY.includes(one))).toEqual([])
  }, 60_000)
})
