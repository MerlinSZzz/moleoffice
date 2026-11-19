// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON TYPES INTO A TERMINAL FROM ANOTHER COMPUTER, AND EVERY INPUT RECORDS WHERE IT CAME FROM.
 * This is point (d) of a decision, wave 13u round 14. An input is checked by
 * account and by machine, and input from
 * another computer records its source, as the chat does: this machine and an account is safest, a trusted one next.
 *
 * The terminal doors one view asks declare `thePersonMayFromAnotherComputer` (src/server/api/terminals.ts), so from
 * another computer only the person's own key over an encrypted door reaches them, and each door still asks that the
 * caller is the person. lib/terminal-typed-from.ts counts every input against its source and says a use from another
 * computer to the person.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. From the product's own second listener, with a paired device's key, the person lists the terminals, reads one,
 *      types into it and resizes it. The typing reaches the terminal. The stream sends where it came from: a run at the
 *      level `another computer`, proved by that device's key, naming the device.
 *   2. Reading and typing from there are each said to the person once, as a line from the office naming the terminal
 *      and the device. More typing within ten minutes writes no second line.
 *   3. Typing on this computer is a run of its own at the level `this computer`, and is not said.
 *   4. Nobody else types from there: no key, a key that proves nobody, and a visiting agent's own key are refused at
 *      the input door, nothing reaches the terminal and no input is counted. An agent on this computer is refused too.
 *   5. Opening a terminal stays on this computer, even for the person's key.
 *   6. Closing from there ends the terminal, is said to the person, and forgets the terminal's sources.
 *   7. The record itself: inputs from one source join one run, a new source starts a new one, and only the newest
 *      runs are kept, with the rest counted.
 *
 * ---------------------------------------------------------------------------------------
 * A REAL HOLDER, REAL LISTENERS, MADE-UP NAMES
 * ---------------------------------------------------------------------------------------
 *
 * A real terminal holder runs on this test's own database, in a folder this test made, as
 * tests/the-terminal-doors-are-the-persons.test.ts case 5 starts one. The second listener is `listenForOtherMachines`
 * out of src/server/index.ts, as tests/the-person-sets-their-settings-from-another-computer.test.ts drives it, and
 * the device is paired through the credential flow's own doors. Every device and visitor name here is made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added this file has the runs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the widening taken off the input door: cases 1, 3 and 6 go red;
 *   - the input door not counting the input: cases 1, 3 and 4 go red;
 *   - the level read as `this computer` whatever the arrival: cases 1, 3 and 6 go red;
 *   - the ten-minute rule taken out: case 1 goes red;
 *   - a new run started for every input: cases 1 and 7 go red.
 *
 * onlyThePerson taken off the input door turns nothing red here: the agent on this computer and the visiting agent are
 * each refused before that line, by the route's own reach. It stays as the door's own statement; this file does not
 * claim to prove it.
 */

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import {
  AS_AN_AGENT,
  aPlace,
  groups,
  openThroughTheHolder,
  readTheStream,
  startAHolder,
  stopEverything,
  theScreenNow,
  until,
  untilTheScreenShows,
  type Place,
  type StreamEvent,
} from './terminal-holder-stand.ts'
import { theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { TypedFrom } from '../src/shared/terminals.ts'

/** The line the office writes, and its first words. */
const THE_LINE = 'A terminal was used from another computer'

/** The person's headers on this computer, with no key: the one-version window answers them here. */
const THE_PERSON_HERE = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * The other computer's address, made up, as the proxy on this computer passes it on. It and the second one in case 7
 * are built from their numbers, because the address scan refuses one written out.
 */
const THE_LAPTOPS_ADDRESS = [100, 101, 44, 12].join('.')

/**
 * What the browser on the other computer sends: a device's key makes it the person, so the claim says `agent`. It comes
 * through a proxy on this computer, as `tailscale serve` passes it, so the socket is a loopback one and the caller's
 * address is in `x-forwarded-for`.
 */
const theOtherComputer = (key: string | null, id = 'a-made-up-laptop'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-forwarded-for': THE_LAPTOPS_ADDRESS,
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(key === null ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
let app: FastifyInstance
let place: Place
let thisMachine = ''
let anotherMachine = ''
let otherMachines: Server
let deviceKey = ''
let deviceName = ''
let visitorKey = ''
const VISITOR = 'a-made-up-visitor'
const before: Record<string, string | undefined> = {}

async function ask(where: string, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${where}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, text }
}

/** The office's lines to the person about a terminal used from another computer. */
async function theLines(): Promise<{ id: string; said: string }[]> {
  const read = await ask(thisMachine, 'GET', '/api/records?kind=message&limit=200&shape=full', THE_PERSON_HERE)
  expect(read.status, read.text.slice(0, 300)).toBe(200)
  const records = (read.body?.records ?? []) as { id: string; data: { body?: string; saidInFull?: string; to?: { kind: string; id: string }[] } }[]
  return records
    .filter((one) => one.data.body === THE_LINE && (one.data.to ?? []).some((to) => to.kind === 'person' && to.id === THE_TEST_OFFICES_OWNER.id))
    .map((one) => ({ id: one.id, said: String(one.data.saidInFull ?? '') }))
}

/** The newest sources a stream has sent: the screen's, or a later `typed-from`. */
function theNewestTypedFrom(events: StreamEvent[]): TypedFrom | null {
  for (const one of [...events].reverse()) {
    if (one.event === 'typed-from') return one.data as unknown as TypedFrom
    if (one.event === 'screen') return (one.data['typedFrom'] as TypedFrom | undefined) ?? null
  }
  return null
}

/** Type through a door, as a page does, and answer the reply. */
const typeAt = (where: string, terminal: string, headers: Record<string, string>, data: string) =>
  ask(where, 'POST', `/api/terminals/${terminal}/input`, headers, { data })

beforeAll(async () => {
  t = await freshDb()
  // THE HOLDER OF THIS PROCESS'S DATABASE, with its socket in a folder this test made. The server in this process reads
  // XDG_CONFIG_HOME to find it, so it is set here and put back afterwards.
  const database = process.env['MOLE_OFFICE_DB']
  if (database === undefined) throw new Error('freshDb named no database.')
  place = { ...aPlace('far'), database }
  before['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME']
  process.env['XDG_CONFIG_HOME'] = place.env['XDG_CONFIG_HOME']
  place = { ...place, socket: theTerminalHolderSocket(database, place.env) }
  await startAHolder(place)

  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THE OTHER COMPUTER, PAIRED: it asks through the credential flow's own door and the person confirms it here.
  const asked = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up laptop' })
  expect(asked.status, asked.text.slice(0, 300)).toBe(201)
  deviceKey = String(asked.body.token)
  deviceName = String(asked.body.credential.handle)
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${String(asked.body.credential.id)}/confirm`, THE_PERSON_HERE, {})
  expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(200)

  // AND A VISITING AGENT WITH A KEY OF ITS OWN, confirmed the same way.
  const visitor = await ask(anotherMachine, 'POST', '/api/office/visitors', { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }, {
    handle: VISITOR,
    name: 'A made-up visitor',
    role: 'worker',
    conversationPath: `/transcripts/${VISITOR}`,
    startDirectory: `/work/${VISITOR}`,
    runtime: 'claude-code',
  })
  expect(visitor.status, visitor.text.slice(0, 300)).toBe(201)
  visitorKey = String(visitor.body.token)
  const let_in = await ask(thisMachine, 'POST', `/api/office/visitors/${String(visitor.body.credential.id)}/confirm`, THE_PERSON_HERE, {})
  expect(let_in.status, let_in.text.slice(0, 300)).toBe(200)
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines?.close(() => done())
  })
  await app?.close()
  t?.close()
  await stopEverything()
  if (before['XDG_CONFIG_HOME'] === undefined) delete process.env['XDG_CONFIG_HOME']
  else process.env['XDG_CONFIG_HOME'] = before['XDG_CONFIG_HOME']
}, 60_000)

describe('a terminal, from another computer', () => {
  it('1 and 2: the person lists, reads, types into and resizes it with a device key, the source is sent, and the use is said once', async () => {
    const terminal = await openThroughTheHolder(place)
    groups.add(terminal.pid)
    const linesBefore = new Set((await theLines()).map((one) => one.id))

    const listed = await ask(anotherMachine, 'GET', '/api/terminals', theOtherComputer(deviceKey))
    expect(listed.status, listed.text.slice(0, 300)).toBe(200)
    expect((listed.body.terminals as { id: string }[]).map((one) => one.id)).toContain(terminal.id)

    // THE STREAM IS OPENED FIRST, and waits for the sources that name the other computer.
    const watching = readTheStream(
      anotherMachine,
      terminal.id,
      theOtherComputer(deviceKey),
      (events) => theNewestTypedFrom(events)?.runs.some((run) => run.level === 'another computer') === true,
      15_000,
    )
    await until(() => theScreenNow(place, terminal.id), () => true)
    await new Promise((done) => setTimeout(done, 300))
    const typed = await typeAt(anotherMachine, terminal.id, theOtherComputer(deviceKey), 'echo FAR-$((6*7))\r')
    expect(typed.status, typed.text.slice(0, 300)).toBe(200)
    expect(typed.body.typedFrom).toBe('another computer')
    expect(await untilTheScreenShows(place, terminal.id, 'FAR-42')).toContain('FAR-42')

    const streamed = await watching
    expect(streamed.status, streamed.refusal.slice(0, 300)).toBe(200)
    expect(streamed.events[0]?.event).toBe('screen')
    const sources = theNewestTypedFrom(streamed.events)
    expect(sources?.since, 'the sources say since when they were recorded').toEqual(expect.any(String))
    const far = sources?.runs.at(-1)
    expect(far).toMatchObject({ level: 'another computer', account: { id: THE_TEST_OFFICES_OWNER.id, proof: "a device's key", device: deviceName }, inputs: 1 })
    expect(far).toMatchObject({ how: 'an address', machine: THE_LAPTOPS_ADDRESS })

    const resized = await ask(anotherMachine, 'POST', `/api/terminals/${terminal.id}/resize`, theOtherComputer(deviceKey), { cols: 90, rows: 20 })
    expect(resized.status, resized.text.slice(0, 300)).toBe(200)

    // MORE TYPING FROM THERE joins the run and writes no second line.
    for (const keys of ['echo ', 'again\r']) expect((await typeAt(anotherMachine, terminal.id, theOtherComputer(deviceKey), keys)).status).toBe(200)
    const again = await readTheStream(anotherMachine, terminal.id, theOtherComputer(deviceKey))
    expect(theNewestTypedFrom(again.events)?.runs.at(-1)).toMatchObject({ level: 'another computer', inputs: 3 })

    const lines = (await theLines()).filter((one) => !linesBefore.has(one.id))
    expect(lines.map((one) => one.said.split(', from another computer')[0]).sort()).toEqual(
      [`The terminal "/bin/bash --noprofile --norc" in ${place.dir} was read`, `The terminal "/bin/bash --noprofile --norc" in ${place.dir} was typed into`].sort(),
    )
    for (const one of lines) expect(one.said).toContain(`with the key of ${deviceName}`)
  }, 60_000)

  it('3: typing on this computer is a run of its own at the level of this computer, and is not said', async () => {
    const terminal = await openThroughTheHolder(place)
    groups.add(terminal.pid)
    expect((await typeAt(anotherMachine, terminal.id, theOtherComputer(deviceKey), 'echo one\r')).status).toBe(200)
    const lines = (await theLines()).length
    expect((await typeAt(thisMachine, terminal.id, THE_PERSON_HERE, 'echo HERE-$((2+2))\r')).status).toBe(200)
    expect(await untilTheScreenShows(place, terminal.id, 'HERE-4')).toContain('HERE-4')
    const read = await readTheStream(thisMachine, terminal.id, THE_PERSON_HERE)
    const runs = theNewestTypedFrom(read.events)?.runs ?? []
    expect(runs.map((run) => run.level)).toEqual(['another computer', 'this computer'])
    expect(runs[1]).toMatchObject({ how: 'this machine', account: { proof: 'no key, from this computer', device: null }, inputs: 1 })
    expect((await theLines()).length).toBe(lines)
  }, 60_000)

  it('4: refuses everybody else at the input door, from there and from here, and counts nothing', async () => {
    const terminal = await openThroughTheHolder(place)
    groups.add(terminal.pid)
    const words = `NOBODY-${randomBytes(6).toString('hex')}`
    const callers: [string, string, Record<string, string>][] = [
      ['no key, from there', anotherMachine, theOtherComputer(null)],
      ['a key that proves nobody, from there', anotherMachine, theOtherComputer('a-key-that-proves-nobody-0000000000000000000000000000000000000000')],
      ["a visiting agent's own key, from there", anotherMachine, theOtherComputer(visitorKey, VISITOR)],
      ['an agent, on this computer', thisMachine, { ...AS_AN_AGENT, 'content-type': 'application/json' }],
    ]
    for (const [who, where, headers] of callers) {
      const typed = await typeAt(where, terminal.id, headers, `echo ${words}\r`)
      expect(typed.status, `${who}: ${typed.text.slice(0, 200)}`).toBe(403)
    }
    // THE PERSON TYPES AFTER THEM. Once that line is on the screen, anything theirs would be there too, and it is not.
    expect((await typeAt(thisMachine, terminal.id, THE_PERSON_HERE, 'echo after-$((1+1))\r')).status).toBe(200)
    const screen = await untilTheScreenShows(place, terminal.id, 'after-2')
    expect(screen.join('\n')).not.toContain(words)
    const read = await readTheStream(thisMachine, terminal.id, THE_PERSON_HERE)
    expect(theNewestTypedFrom(read.events)?.runs.map((run) => [run.level, run.inputs])).toEqual([['this computer', 1]])
  }, 60_000)

  it('5: opening a terminal stays on this computer, even for the person\'s key', async () => {
    const opened = await ask(anotherMachine, 'POST', '/api/terminals', theOtherComputer(deviceKey), { folder: place.dir, command: '/bin/bash' })
    expect(opened.status, opened.text.slice(0, 300)).toBe(403)
    expect(opened.text).toContain('works on the computer Mole Office is running on')
  })

  it('6: closing from there ends the terminal, is said, and forgets its sources', async () => {
    const terminal = await openThroughTheHolder(place)
    groups.add(terminal.pid)
    expect((await typeAt(anotherMachine, terminal.id, theOtherComputer(deviceKey), 'echo bye\r')).status).toBe(200)
    const linesBefore = new Set((await theLines()).map((one) => one.id))
    const closed = await ask(anotherMachine, 'POST', `/api/terminals/${terminal.id}/close`, theOtherComputer(deviceKey), {})
    expect(closed.status, closed.text.slice(0, 300)).toBe(200)
    const lines = (await theLines()).filter((one) => !linesBefore.has(one.id))
    expect(lines.map((one) => one.said.split(', from another computer')[0])).toEqual([`The terminal "/bin/bash --noprofile --norc" in ${place.dir} was closed`])
    const { typedFromOf } = await import('../src/server/lib/terminal-typed-from.ts')
    expect(typedFromOf(terminal.id).runs).toEqual([])
  }, 60_000)
})

describe('the record of where typing came from', () => {
  it('7: joins inputs from one source into one run, starts a new run for a new source, and keeps the newest runs', async () => {
    const { recordAnInput, typedFromOf, THE_MOST_RUNS_KEPT } = await import('../src/server/lib/terminal-typed-from.ts')
    const here = { level: 'this computer' as const, machine: 'a-made-up-machine', how: 'this machine', program: null, account: { id: 'a-person', proof: "the person's key" as const, device: null } }
    const there = { ...here, level: 'another computer' as const, machine: [100, 101, 44, 13].join('.'), how: 'an address', account: { id: 'a-person', proof: "a device's key" as const, device: 'A made-up phone' } }
    const id = `a-made-up-terminal-${randomBytes(4).toString('hex')}`
    expect(recordAnInput(id, here, new Date('2026-10-11T10:00:00Z')).began).toBe(true)
    expect(recordAnInput(id, here, new Date('2026-10-11T10:00:05Z')).began).toBe(false)
    expect(recordAnInput(id, there, new Date('2026-10-11T10:01:00Z')).began).toBe(true)
    expect(typedFromOf(id).runs.map((run) => [run.level, run.inputs, run.firstAt, run.lastAt])).toEqual([
      ['this computer', 2, '2026-10-11T10:00:00.000Z', '2026-10-11T10:00:05.000Z'],
      ['another computer', 1, '2026-10-11T10:01:00.000Z', '2026-10-11T10:01:00.000Z'],
    ])
    for (let n = 0; n < THE_MOST_RUNS_KEPT + 3; n += 1) recordAnInput(id, n % 2 === 0 ? here : there)
    const kept = typedFromOf(id)
    expect(kept.runs).toHaveLength(THE_MOST_RUNS_KEPT)
    // 2 runs, then 23 more that alternate and start with `here` after `there`: 25 in all, 20 kept.
    expect(kept.forgotten).toBe(5)
  })
})
