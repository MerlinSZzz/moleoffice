// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER READING A CONVERSATION BETWEEN TWO AGENTS, AS EITHER OF THEM SEES IT.
 *
 * Criterion M12 of design/messages/ACCEPTANCE.md: a user with high rights can switch to an agent's view,
 * say of an agent in a work conflict, to see how it works it out with the other. *A person with the owner row may open an
 * agent-to-agent conversation and read it as either agent sees it. Reading writes nothing and is
 * recorded as a read, not as participation.*
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { join } from 'node:path'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
/** Every real child this file started, stopped by its own group afterwards. */
const started: ChildProcess[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE REGISTRY ID OF AN AGENT, asked of the participant door by its handle. Since the mint (criterion
 * I1) a new agent's id is not its handle, and what the office stores about an agent is its id.
 */
async function idOf(handle: string): Promise<string> {
  const res = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_OWNER })
  return ((await res.json()) as { participant: { id: string } }).participant.id
}

/** The pair as the office stores it: the two registry ids, sorted, with a tilde between them. */
async function storedPairOf(a: string, b: string): Promise<string> {
  return [await idOf(a), await idOf(b)].sort().join('~')
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function say(from: string, body: string, to: string, expected = 201): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(from),
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: to }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(expected)
  return ((await said.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'owner-reads', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }
  // BOTH AGENTS CAN BE REACHED, so this is a conversation the owner really is not in.
  //
  // Since the responsibility routing landed, a letter to an agent nothing is
  // answering as is also delivered to the first participant up its chain of starters who can be
  // reached, and these two are started by nobody, so that is the owner. The owner would then be a recipient
  // of the very conversation this file says the owner is outside of, and the delivery marks below would
  // hold a row of the owner's. Decision murJ5IMWDOXR is what settles which way this goes: a conversation
  // between agents that reach each other never counts as the owner's, so the fixture gives each of them a
  // running session and a live process of this test's own, exactly as
  // tests/a-sandbox-run-counts-as-going.test.ts does.
  for (const handle of ['builder-x', 'checker-y']) await makeReachable(handle)
  await say('builder-x', 'I have the mount claimed. Are you in the same files?', 'checker-y')
  await say('checker-y', 'Yes. Let us take it to the owner.', 'builder-x')
}, 180_000)

afterAll(async () => {
  // BY THE GROUP ID THIS TEST WROTE DOWN, never by a command-line pattern (chapter 2, rule 1).
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file measures.
    }
  }
  await app.stop()
})

/** One agent's registry id, which is what a session record names as the agent it serves. */
async function theRegistryIdOf(handle: string): Promise<string> {
  const res = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_OWNER })
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { participant: { id: string } }).participant.id
}

/**
 * A running session serving this agent, and a real process of this test's own registered against it.
 *
 * That pair is what the office's one reach reading asks for, so the chat's answering mark and the
 * routing both read this agent as one somebody is answering as.
 */
async function makeReachable(handle: string): Promise<void> {
  const session = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title: `A run answering as ${handle}`,
      data: { state: 'running', runtime: 'claude-code', servingAgent: await theRegistryIdOf(handle) },
    }),
  })
  expect(session.status, await session.clone().text()).toBe(201)
  const sessionRecordId = ((await session.json()) as { record: { id: string } }).record.id

  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below would be measuring anything').toBeDefined()
  const registered = await fetch(`${app.api}/api/resources`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      type: 'process',
      key: String(child.pid),
      sessionRecordId,
      detail: `A live process of this test, so ${handle} reads as one somebody is answering as.`,
    }),
  })
  expect(registered.status, await registered.clone().text()).toBe(201)
}

/**
 * Every durable read of one pair, oldest first, straight out of the table: each reader's newest, since a reader
 * keeps one read point in a conversation.
 *
 * READ WITH SQL AND NOT THROUGH A ROUTE, because no route lists them: what the product draws is the
 * newest one, on the conversation the reader is looking at. The row is what this file is about, so
 * the row is what it reads.
 */
async function readsOf(pair: string): Promise<{ readerKind: string; readerId: string; pair: string; asSide: string; at: string; id: string }[]> {
  const { default: Database } = await import('better-sqlite3')
  const held = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    return held
      .prepare(
        'SELECT id, reader_kind AS readerKind, reader_id AS readerId, pair, as_side AS asSide, at ' +
          // BY `rowid`, WHICH RISES WITH EVERY INSERT. A stamp is whole seconds, so two reads in
          // one second tie and `id` is a nanoid; ordering by that would put them in a random order
          // and this file would then be asserting about whichever one won. The library reads them
          // the same way.
          'FROM conversation_reads WHERE pair = ? ORDER BY at, rowid',
      )
      .all(pair) as { readerKind: string; readerId: string; pair: string; asSide: string; at: string; id: string }[]
  } finally {
    held.close()
  }
}

describe('who may read a conversation they are not part of', () => {
  it('lists the pairs for a person, with the last thing said in each', async () => {
    const res = await fetch(`${app.api}/api/messages/between-agents`, { headers: AS_THE_OWNER })
    expect(res.status).toBe(200)
    const held = (await res.json()) as {
      mayRead: boolean
      conversations: { between: { id: string }[]; last: { body: string } }[]
    }
    expect(held.mayRead).toBe(true)
    expect(held.conversations).toHaveLength(1)
    expect(held.conversations[0]?.between.map((one) => one.id).sort()).toEqual([await idOf('builder-x'), await idOf('checker-y')].sort())
    expect(held.conversations[0]?.last.body).toContain('take it to the owner')
  })

  it('refuses an agent, and says why rather than answering an empty list', async () => {
    const res = await fetch(`${app.api}/api/messages/between-agents`, { headers: asAgent('builder-x') })
    const held = (await res.json()) as { mayRead: boolean; because: string; conversations: unknown[] }
    expect(held.mayRead).toBe(false)
    expect(held.because).toContain('Only a person')
    expect(held.conversations).toEqual([])
  })

  it('refuses an agent asking to read one, with the same sentence', async () => {
    const res = await fetch(`${app.api}/api/messages/between/builder-x~checker-y?as=builder-x`, {
      headers: asAgent('builder-x'),
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toContain('Only a person')
  })
})

describe('reading it as either side', () => {
  it('gives the same messages from both sides, and says which side it is being read as', async () => {
    const sides = []
    for (const side of ['builder-x', 'checker-y']) {
      const res = await fetch(`${app.api}/api/messages/between/builder-x~checker-y?as=${side}`, {
        headers: AS_THE_OWNER,
      })
      expect(res.status, await res.clone().text()).toBe(200)
      const held = (await res.json()) as {
        asSide: { id: string }
        messages: { body: string }[]
        says: string
      }
      expect(held.asSide.id).toBe(await idOf(side))
      expect(held.says).toBe(CHAT_WORDS.readingSomebodyElses)
      sides.push(held.messages.map((one) => one.body))
    }
    expect(sides[0], 'the two sides see the same conversation').toEqual(sides[1])
    expect(sides[0]).toHaveLength(2)
  })

  it('refuses a side that is not one of the two, naming both', async () => {
    const res = await fetch(`${app.api}/api/messages/between/builder-x~checker-y?as=somebody-else`, {
      headers: AS_THE_OWNER,
    })
    expect(res.status).toBe(400)
    const said = ((await res.json()) as { error: string }).error
    expect(said).toContain('builder-x')
    expect(said).toContain('checker-y')
  })

  it('refuses a pair that is not two agents', async () => {
    const res = await fetch(`${app.api}/api/messages/between/only-one?as=only-one`, { headers: AS_THE_OWNER })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('two agent ids')
  })

  it('refuses one agent named once by its id and once by its handle, which is not a pair either', async () => {
    const pair = `${await idOf('builder-x')}~builder-x`
    const res = await fetch(`${app.api}/api/messages/between/${pair}`, { headers: AS_THE_OWNER })
    expect(res.status, await res.clone().text()).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('two agent ids')
  })
})

describe('reading writes nothing on any message', () => {
  it('leaves every delivery mark exactly where it was', async () => {
    // A MESSAGE OF THIS TEST'S OWN, written now. Reading the pool as it stands would measure marks
    // the tests above have already read past, and a mutation that moved one would have moved it
    // before the first measurement — which is exactly what happened when this was written that way.
    const fresh = await say('builder-x', 'One more thing about the mount.', 'checker-y')
    const marksOf = async (): Promise<string> => {
      const res = await fetch(`${app.api}/api/messages/${fresh}`, { headers: AS_THE_OWNER })
      const held = (await res.json()) as { message: { deliveries: { to: { id: string }; mark: string }[] } }
      return held.message.deliveries.map((one) => `${one.to.id}:${one.mark}`).sort().join(' ')
    }
    const was = await marksOf()
    expect(was, 'a message nothing has taken is queued for its recipient').toBe(`${await idOf('checker-y')}:queued`)

    for (const side of ['builder-x', 'checker-y']) {
      const read = await fetch(`${app.api}/api/messages/between/builder-x~checker-y?as=${side}`, {
        headers: AS_THE_OWNER,
      })
      expect(read.status).toBe(200)
    }

    expect(await marksOf(), 'reading somebody else conversation moved a delivery mark').toBe(was)
  })

  it('records the read on the ledger, with who asked, when, and which pair', async () => {
    await fetch(`${app.api}/api/messages/between/builder-x~checker-y?as=checker-y`, { headers: AS_THE_OWNER })
    const res = await fetch(`${app.api}/api/usage/operations?days=1`, { headers: AS_THE_OWNER })
    expect(res.status, await res.clone().text()).toBe(200)
    const held = (await res.json()) as { operations?: { operation: string; calls: number }[] }
    const row = (held.operations ?? []).find((one) => one.operation === 'message.as-a-side')
    expect(row, 'the read left no row on the ledger').toBeDefined()
    expect(row?.calls).toBeGreaterThan(0)
  })
})

describe('the record of the read outlives the traffic it was written into', () => {
  it("keeps the reader's newest read, with who, which pair, which side and when", async () => {
    // THE READ WAS RECORDED ONLY ON `api_calls` UNTIL 4 SEPTEMBER 2026. The browser sends no trace
    // header and `pruneUsage` deletes untraced rows after fourteen days with no summary, so after a
    // fortnight nothing anywhere said the read had happened. Problem `xdcPntH9rxw_`.
    //
    // ONE ROW FOR THIS READER IN THIS CONVERSATION, AND IT IS THIS READ, since a decision of wave 13s round
    // 64. Until then every read was a row of its own, and this case was named "keeps one row
    // per read" and counted one row more than before the read.
    const pair = 'builder-x~checker-y'
    const stored = await storedPairOf('builder-x', 'checker-y')
    const read = await fetch(`${app.api}/api/messages/between/${pair}?as=builder-x`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)

    const after = (await readsOf(stored)).filter((one) => one.readerKind === 'person' && one.readerId === THE_PERSON)
    expect(after.length, 'the read wrote no durable row, or kept an older one beside it').toBe(1)
    const newest = after[0]
    expect(newest?.readerKind).toBe('person')
    expect(newest?.readerId).toBe(THE_PERSON)
    expect(newest?.pair).toBe(stored)
    expect(newest?.asSide).toBe(await idOf('builder-x'))
    expect(newest?.at, 'the row says when, as local wall-clock time').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('tells the reader when they last read this conversation, and never that it was a moment ago', async () => {
    const pair = 'builder-x~checker-y'
    // A PAIR NOBODY HAS READ, so the first answer is the honest "you have not read this before"
    // rather than a blank. Two agents of this test's own, so no earlier test can have read them.
    for (const [handle, title] of [
      ['nobody-read-a', 'Nobody Read A'],
      ['nobody-read-b', 'Nobody Read B'],
    ] as const) {
      await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: AS_THE_OWNER,
        body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
      })
    }
    // NOTHING HOLDS NOBODY READ B, unlike the two agents above, so the office stores the message, routes it and answers
    // 409. The message is stored all the same, and the reads below are of its pair.
    await say('nobody-read-a', 'Is the mount yours?', 'nobody-read-b', 409)
    const fresh = 'nobody-read-a~nobody-read-b'
    const first = (await (
      await fetch(`${app.api}/api/messages/between/${fresh}?as=nobody-read-a`, { headers: AS_THE_OWNER })
    ).json()) as { readBefore: unknown }
    expect(first.readBefore, 'nobody had read it, and that is an answer').toBeNull()

    const again = (await (
      await fetch(`${app.api}/api/messages/between/${fresh}?as=nobody-read-b`, { headers: AS_THE_OWNER })
    ).json()) as { readBefore: { asSide: string; at: string } | null }
    expect(again.readBefore, 'the second read does not know about the first').not.toBeNull()
    expect(again.readBefore?.asSide, 'it names the side the earlier read was made from').toBe(await idOf('nobody-read-a'))

    // AND IT IS THE READ BEFORE THIS ONE, NOT THIS ONE. A reply that reported the row it had just
    // written would be telling the reader they read this a moment ago, which they can see. The read
    // before is taken from the table first, because the read made now replaces it there.
    const stored = await storedPairOf('builder-x', 'checker-y')
    const before = await readsOf(stored)
    expect(before.length, 'this pair has not been read before, so this proves nothing').toBe(1)
    const theOneBefore = before[0]
    const held = (await (
      await fetch(`${app.api}/api/messages/between/${pair}?as=checker-y`, { headers: AS_THE_OWNER })
    ).json()) as { readBefore: { asSide: string; at: string } | null }
    const rows = await readsOf(stored)
    expect(rows.length, 'the read kept an older one beside it').toBe(1)
    expect(rows[0]?.asSide, 'the read just made is the newest row').toBe(await idOf('checker-y'))
    expect(held.readBefore?.at, 'the reply reported the read it had just written').toBe(theOneBefore?.at)
    expect(held.readBefore?.asSide).toBe(theOneBefore?.asSide)
  })
})

describe('the panel', () => {
  it('draws the pairs under their own tab, and reads one as either side', async () => {
    await app.page.goto(`${app.site}/#/`)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')

    await app.page.waitForFunction(
      (heading: string) => document.body.textContent?.includes(heading) === true,
      CHAT_WORDS.betweenAgents,
      { timeout: 20_000 },
    )
    // SINCE M18 THE THREE LISTS ARE THREE TABS, so the pairs are behind the third one rather than
    // under a heading further down the same column. Pressing it is what a reader now does.
    await app.page.click('.px-chat-tab[data-tab="between"]')
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })
    // AND WAIT FOR THE PAIR ITSELF. The tab is drawn the moment it is pressed; what fills it is a
    // separate read, so the panel between the two is a tab with nothing under it yet.
    //
    // THE PAIR IS FOUND BY ITS TWO NAMES. A case above adds a second pair, Nobody Read A and Nobody
    // Read B, in which only one side has written. The order of the rows changes from run to run, and
    // the order of the two names in a row follows the agents' registry ids, which are new on every
    // run. Taking the first row with a "·" in it opened that second pair on some runs, and then the
    // side pressed below could be the one that wrote nothing, so nothing on the screen changed (the
    // merge queue's run zvMSAii34s5e; 3 of 24 runs of this file alone on 27 September 2026).
    const isThePair = (name: string | null | undefined): boolean =>
      name !== null && name !== undefined && name.includes('Builder X') && name.includes('Checker Y')
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.px-chat-contact .px-chat-name')].some(
          (one) => one.textContent?.includes('Builder X') === true && one.textContent.includes('Checker Y'),
        ),
      undefined,
      { timeout: 20_000 },
    )
    const rows = await app.page.$$eval('.px-chat-contact .px-chat-name', (all) => all.map((one) => one.textContent))
    const pair = rows.find(isThePair)
    expect(pair, 'the pair of agents is not drawn').toBeTruthy()

    await app.page.click(`.px-chat-contact:has-text("${String(pair)}")`)
    await app.page.waitForSelector('.px-chat-side', { timeout: 20_000 })
    // THREE PRESSES SINCE M72, not two: the neutral view and then the two viewpoints. A row opens
    // in the neutral one, because the owner is a third party to these conversations.
    const sides = await app.page.$$eval('.px-chat-side', (all) => all.map((one) => one.textContent))
    expect(sides).toHaveLength(3)
    expect(sides[0]).toBe(CHAT_WORDS.bothSides)
    expect(await app.page.textContent('.px-chat-side[data-chosen="yes"]')).toBe(CHAT_WORDS.bothSides)
    expect(await app.page.textContent('.px-chat-watching')).toBe(CHAT_WORDS.readingBothSides)

    // AND THE HEADER SAYS WHEN THE OWNER LAST READ IT. The tests above have read this pair, so what is
    // drawn is the sentence naming a side and a time rather than the one saying the owner never has.
    await app.page.waitForSelector('.px-chat-read-before', { timeout: 20_000 })
    const readLine = (await app.page.textContent('.px-chat-read-before')) ?? ''
    expect(readLine, 'the header says nothing about the read this product records').not.toBe('')
    expect(readLine).not.toBe(CHAT_WORDS.firstTimeReadingThis)
    expect(readLine, 'it names when').toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)

    // THE SIDE THE READER IS ON DECIDES WHICH MESSAGES ARE DRAWN AS THAT SIDE'S OWN, and in the
    // neutral view none of them are.
    const asFirst = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.getAttribute('data-mine')))
    expect(asFirst.every((one) => one === 'no'), 'the neutral view draws neither side as the owner\'s').toBe(true)
    // AS BUILDER X, who has written in this pair, so taking that side must draw its messages as its own.
    await app.page.click(`.px-chat-side:text-is("${CHAT_WORDS.asSide('Builder X')}")`)
    await app.page.waitForSelector(`.px-chat-side[data-chosen="yes"]:text-is("${CHAT_WORDS.asSide('Builder X')}")`, {
      timeout: 20_000,
    })
    await app.page.waitForFunction(
      (was: string) =>
        [...document.querySelectorAll('.px-chat-one')].map((one) => one.getAttribute('data-mine')).join(',') !== was,
      asFirst.join(','),
      { timeout: 20_000 },
    )
    const asSecond = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.getAttribute('data-mine')))
    expect(asSecond, 'switching side changed nothing on the screen').not.toEqual(asFirst)
  }, 120_000)
})
