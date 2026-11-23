// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A BACKLOG OF DEAD LETTERS CLEARS OVER SEVERAL SWEEPS, A CAPPED NUMBER AT A TIME, AND ONE LINE IS WRITTEN WHEN IT IS
 * CLEARED.
 *
 * Wave 14c. The sweep runs on the server's own timer and holds the server while it runs. On a made-up office at the
 * live counts, the first sweep after a start archived 13,984 notices and routed 850 letters, and took 8.6 to 10.9
 * seconds. So one sweep now archives at most `AT_MOST_ARCHIVED_IN_ONE_SWEEP` notices and routes at most
 * `AT_MOST_ROUTED_IN_ONE_SWEEP` letters, oldest first, and leaves the rest queued for the next sweeps. The letters one
 * receiver is told about go in one sweep, whole, with its one summary. While a cap leaves a letter for later, the sweep
 * writes no line. The sweep that clears the backlog writes one line, with the totals of every sweep of it.
 *
 * THE NUMBERS COME FROM THE TWO NAMED CONSTANTS, so a measure that moves either moves this file with it.
 *
 * THE LETTERS ARE PUT IN AS ROWS, the shape the record door stores for a letter written while its addressee could still
 * be reached, as in tests/the-dead-letter-sweep-reads-each-thing-once-per-project.test.ts. Each letter has a moment of
 * its own, one second after the one before, so "oldest first" has one answer. An owner is reachable because one of its
 * runs waits for its next message, as in
 * tests/the-persons-dead-letter-goes-on-at-once-and-the-server-sweeps-by-itself.test.ts.
 *
 * MUTATIONS in src/server/lib/deadletters.ts, each of which must turn this file red:
 *   (a) a cap removed: the first sweep archives every notice, or routes every owner's letters;
 *   (b) the two caps swapped: the first sweep archives only as many notices as the route cap;
 *   (c) the newest taken first: the first sweep archives the newest notices, or routes the part whose oldest letter
 *       is newest;
 *   (d) a receiver's part split: a sweep routes some of one owner's letters and leaves the rest, or an owner is sent
 *       two summaries;
 *   (e) a line written while the backlog clears: the first or second sweep writes a sweep line;
 *   (f) the totals left out: the third sweep's line counts only what the third sweep did;
 *   (g) the totals kept after the line: the line for one new notice after the backlog counts the backlog again;
 *   (h) a part larger than the route cap refused for ever, split, or taken with another part: the second case;
 *   (i) the route cap skipping to a newer part that fits, past an older part that does not: the second case.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb | null = null

beforeEach(() => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  // NO THRESHOLD MOVES ANYTHING HERE: every letter is for a retired agent, which the rules handle.
  vi.stubEnv('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', '100000')
  vi.stubEnv('MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT', '100000')
})

afterEach(() => {
  t?.close()
  t = null
  vi.unstubAllEnvs()
})

const PROJECT = 'default'
const BY = { type: 'system' as const, id: 'mole-office' }
/** The retired agent every office notice is for. */
const THE_NOTICES_READER = 'made-up-old-reader'

/** The two caps, read from the sweep's module once the test database is made. */
interface TheCaps {
  archive: number
  route: number
}

/** One made-up office, its sweep module, and the letters in it, each list oldest first. */
interface AWorld {
  db: TestDb
  sweeps: typeof import('../src/server/lib/deadletters.ts')
  caps: TheCaps
  notices: string[]
  /** Every letter to route, oldest first. */
  letters: string[]
  /** Each owner's letters, oldest first, by the owner's handle. */
  partOf: Map<string, string[]>
  idOf: (handle: string) => string
}

/** An agent of the made-up office, by handle, and its registry id. */
function anAgent(db: TestDb, handle: string): string {
  db.api.createRecord({
    workspaceId: PROJECT,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: db.api.HUMAN,
  })
  return (db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/**
 * A MADE-UP OFFICE WITH `notices` OFFICE NOTICES TO ONE RETIRED AGENT, AND ONE LETTER FROM AN AGENT FOR EACH OWNER
 * HANDLE IN `letters`, in that order, oldest first. Each owner started one retired agent, and each letter is for the
 * retired agent its owner started. Every owner has a run waiting for its next message, so it can be reached.
 *
 * `plan` sizes the office from the two caps. They are read after the test database is made, because the sweep's module
 * opens the database the moment it is loaded.
 */
async function aWorld(plan: (caps: TheCaps) => { notices: number; letters: readonly string[] }): Promise<AWorld> {
  t?.close()
  t = await freshDb()
  const db = t
  const sweeps = await import('../src/server/lib/deadletters.ts')
  const caps = { archive: sweeps.AT_MOST_ARCHIVED_IN_ONE_SWEEP, route: sweeps.AT_MOST_ROUTED_IN_ONE_SWEEP }
  expect(caps.archive, 'the archive cap is a named number').toBeGreaterThan(0)
  expect(caps.route, 'the route cap is a named number').toBeGreaterThan(0)
  const { notices, letters } = plan(caps)
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: db.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const { moleOffice } = await import('../src/shared/participants.ts')
  const sqlite = db.client.sqlite
  const ids = new Map<string, string>()
  const idOf = (handle: string): string => {
    const id = ids.get(handle)
    expect(id, `no made-up agent bears the handle ${handle}`).toBeDefined()
    return id!
  }
  const retire = (id: string): void => {
    sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the made-up piece of work is done' WHERE id = ?").run(id)
  }
  ids.set('made-up-writer', anAgent(db, 'made-up-writer'))
  ids.set(THE_NOTICES_READER, anAgent(db, THE_NOTICES_READER))
  retire(idOf(THE_NOTICES_READER))
  const inHalfAnHour = localStamp(new Date(Date.now() + 30 * 60_000))
  for (const owner of new Set(letters)) {
    const ownerId = anAgent(db, owner)
    ids.set(owner, ownerId)
    db.api.createRecord({
      workspaceId: PROJECT,
      kind: 'session',
      title: 'A made-up owner waiting for its next message',
      data: {
        state: 'finished',
        runtime: 'claude-code',
        servingAgentId: ownerId,
        deliveringMessage: 'made-up-message',
        providerSession: `made-up-conversation-${owner}`,
        waitsUntil: inHalfAnHour,
      },
      actor: db.api.HUMAN,
    })
    const old = anAgent(db, `old-of-${owner}`)
    ids.set(`old-of-${owner}`, old)
    sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run('agent', ownerId, old)
    setFixtureOwner(sqlite, ownerId, old, 'id')
    retire(old)
  }

  // ONE SECOND APART, the oldest two hours ago, so every letter has a moment of its own.
  let second = 0
  const start = Date.now() - 2 * 60 * 60 * 1000
  const aRecord = sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
      "VALUES (?, 'message-centre', ?, ?, ?, 'message', 'A made-up letter', NULL, ?, NULL, 'authored')",
  )
  const aDelivery = sqlite.prepare(
    "INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)",
  )
  // A NOTICE IS A LETTER THE OFFICE SENT, which is what the sweep's first rule reads.
  const aLetter = (id: string, to: string, sentBy: { kind: string; id: string }): string => {
    const at = localStamp(new Date(start + 1000 * second++))
    const data = {
      body: 'A made-up letter to an agent that has since retired.',
      to: [{ kind: 'agent', id: to }],
      sentBy,
      writtenIn: { project: PROJECT },
    }
    aRecord.run(id, THE_PERSON, at, at, JSON.stringify(data))
    aDelivery.run(`madeUpDeliveryOf-${id}`, id, to, at)
    return id
  }
  const world: AWorld = {
    db,
    sweeps,
    caps,
    notices: [],
    letters: [],
    partOf: new Map(),
    idOf,
  }
  sqlite.transaction(() => {
    for (let n = 0; n < notices; n++) world.notices.push(aLetter(`madeUpNotice${n}`, idOf(THE_NOTICES_READER), moleOffice()))
    letters.forEach((owner, n) => {
      const id = aLetter(`madeUpLetter${n}`, idOf(`old-of-${owner}`), { kind: 'agent', id: idOf('made-up-writer') })
      world.letters.push(id)
      world.partOf.set(owner, [...(world.partOf.get(owner) ?? []), id])
    })
  })()
  return world
}

/** The messages whose delivery to their addressee is archived, oldest first. */
function theArchived(world: AWorld): string[] {
  const archived = new Set(
    (world.db.client.sqlite.prepare("SELECT message_id AS id FROM message_delivery WHERE mark = 'archived'").all() as { id: string }[]).map((row) => row.id),
  )
  return world.notices.filter((id) => archived.has(id))
}

interface AnEntry {
  for: { id: string }
  to: { kind: string; id: string } | null
  inSummary?: string
}

/** The routed entries a letter stores. */
function theRoutingOf(world: AWorld, id: string): AnEntry[] {
  const row = world.db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  const routed = (JSON.parse(row.data) as { routed?: AnEntry[] }).routed
  return routed ?? []
}

/** The letters that carry a routed entry, oldest first. */
function theRouted(world: AWorld): string[] {
  return world.letters.filter((id) => theRoutingOf(world, id).length > 0)
}

/** Every sweep line written, oldest first, with what it says. */
function theLines(world: AWorld): { id: string; said: { archived: { name: string; count: number }[]; summarised?: { name: string; count: number }[]; routed: unknown[] } }[] {
  return (
    world.db.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep.said') IS NOT NULL ORDER BY created_at, rowid")
      .all() as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, said: (JSON.parse(row.data) as { deadLetterSweep: { said: ReturnType<typeof theLines>[number]['said'] } }).deadLetterSweep.said }))
}

/** Every summary a receiver was sent, oldest first: to whom, and the letters it names by addressee. */
function theSummaries(world: AWorld): { id: string; to: string; letters: number; addressees: { id: string; count: number }[] }[] {
  return (
    world.db.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep.summary') IS NOT NULL ORDER BY created_at, rowid")
      .all() as { id: string; data: string }[]
  ).map((row) => {
    const data = JSON.parse(row.data) as { to: { id: string }[]; deadLetterSweep: { summary: { letters: number; addressees: { id: string; count: number }[] } } }
    return {
      id: row.id,
      to: data.to[0]!.id,
      letters: data.deadLetterSweep.summary.letters,
      addressees: data.deadLetterSweep.summary.addressees.map((one) => ({ id: one.id, count: one.count })),
    }
  })
}

/** What one sweep sent: to whom, and how many letters each summary lists. */
const sent = (result: { summaries: { to: { id: string }; letters: number }[] }): [string, number][] =>
  result.summaries.map((one) => [one.to.id, one.letters])

/** A list of names and counts, by name, so the order the line lists them in is not what is held. */
const byName = (list: readonly { name: string; count: number }[] | undefined): { name: string; count: number }[] =>
  [...(list ?? [])].map((one) => ({ name: one.name, count: one.count })).sort((a, b) => a.name.localeCompare(b.name))

it('archives and routes at most the caps in each sweep, oldest first, and writes one line with the totals when the backlog is cleared', async () => {
  // EACH OWNER'S PART IS A LITTLE MORE THAN HALF THE ROUTE CAP, so no two parts fit in one sweep, and the three are more
  // than the route cap in all. The letters go by turns, the oldest for the second owner, then the third, then the first,
  // so the parts go in the order of their oldest letters, not of their owners' names.
  const turns = ['made-up-owner-2', 'made-up-owner-3', 'made-up-owner-1']
  const partFor = (caps: TheCaps): number => Math.floor(caps.route / 2) + 1
  const world = await aWorld((caps) => ({
    notices: 2 * caps.archive + 1,
    letters: Array.from({ length: 3 * partFor(caps) }, (_, n) => turns[n % 3]!),
  }))
  const { sweeps, idOf } = world
  const { archive: archiveCap, route: routeCap } = world.caps
  const part = partFor(world.caps)
  expect(archiveCap, 'the two caps differ, so swapping them shows').not.toBe(routeCap)
  expect(world.letters.length, 'more letters to route than the route cap').toBeGreaterThan(routeCap)

  // ---- THE FIRST SWEEP: the oldest notices up to the archive cap, and the part whose oldest letter is oldest.
  const first = sweeps.sweepDeadLetters(BY)
  expect(first.archived, 'the first sweep archives the archive cap').toBe(archiveCap)
  expect(theArchived(world), 'the first sweep archives the oldest notices').toEqual(world.notices.slice(0, archiveCap))
  expect(first.routed, 'the first sweep routes one whole part').toBe(part)
  expect(theRouted(world), 'the first sweep routes the part whose oldest letter is oldest').toEqual(world.partOf.get('made-up-owner-2'))
  expect(sent(first), 'the first sweep sends one summary, to that part\'s owner').toEqual([[idOf('made-up-owner-2'), part]])
  expect(first.lineId, 'a sweep a cap left letters after writes no line').toBeNull()
  expect(theLines(world), 'no sweep line yet').toEqual([])

  // ---- THE SECOND SWEEP: the next notices up to the cap, and the next part.
  const second = sweeps.sweepDeadLetters(BY)
  expect(second.archived).toBe(archiveCap)
  expect(theArchived(world)).toEqual(world.notices.slice(0, 2 * archiveCap))
  expect(second.routed).toBe(part)
  const firstTwo = new Set([...world.partOf.get('made-up-owner-2')!, ...world.partOf.get('made-up-owner-3')!])
  expect(theRouted(world), 'the second sweep routes the next part, and the first stays routed').toEqual(world.letters.filter((id) => firstTwo.has(id)))
  expect(sent(second)).toEqual([[idOf('made-up-owner-3'), part]])
  expect(second.lineId, 'the backlog is not cleared yet, so no line').toBeNull()
  expect(theLines(world)).toEqual([])

  // ---- THE THIRD SWEEP leaves nothing for later, so it writes the one line, with the totals of all three.
  const third = sweeps.sweepDeadLetters(BY)
  expect(third.archived, 'what the third sweep itself archived').toBe(1)
  expect(theArchived(world), 'every notice is archived').toEqual(world.notices)
  expect(third.routed).toBe(part)
  expect(theRouted(world), 'every letter is routed').toEqual(world.letters)
  expect(sent(third)).toEqual([[idOf('made-up-owner-1'), part]])
  expect(third.lineId, 'the sweep that clears the backlog writes a line').not.toBeNull()
  const lines = theLines(world)
  expect(lines.map((one) => one.id)).toEqual([third.lineId])
  expect(byName(lines[0]!.said.archived), 'the line counts every notice the backlog archived').toEqual([{ name: THE_NOTICES_READER, count: 2 * archiveCap + 1 }])
  expect(byName(lines[0]!.said.summarised), 'the line counts every letter the backlog summarised, by receiver').toEqual(
    byName(turns.map((name) => ({ name, count: part }))),
  )
  expect(lines[0]!.said.routed).toEqual([])

  // ---- EVERY LETTER ROUTED EXACTLY ONCE, NAMED IN ITS OWNER'S ONE SUMMARY.
  const summaries = theSummaries(world)
  for (const owner of turns) {
    const its = summaries.filter((one) => one.to === idOf(owner))
    expect(its, `${owner} is sent one summary in all`).toHaveLength(1)
    expect(its[0]!.letters, `${owner}'s summary names every letter of its part`).toBe(part)
    expect(its[0]!.addressees).toEqual([{ id: idOf(`old-of-${owner}`), count: part }])
    for (const id of world.partOf.get(owner)!) {
      const entries = theRoutingOf(world, id)
      expect(entries, `letter ${id} is routed once`).toHaveLength(1)
      expect(entries[0]!.to).toEqual({ kind: 'agent', id: idOf(owner) })
      expect(entries[0]!.inSummary, `letter ${id} names its owner's one summary`).toBe(its[0]!.id)
    }
  }

  // ---- A FURTHER SWEEP HAS NOTHING TO DO AND WRITES NOTHING.
  const fourth = sweeps.sweepDeadLetters(BY)
  expect({ archived: fourth.archived, routed: fourth.routed, summaries: fourth.summaries, lineId: fourth.lineId }).toEqual({
    archived: 0,
    routed: 0,
    summaries: [],
    lineId: null,
  })
  expect(theLines(world)).toHaveLength(1)
  expect(theSummaries(world)).toHaveLength(3)

  // ---- ONE NEW NOTICE AFTER THE BACKLOG: a sweep no cap holds back writes its line at once, counting only its own.
  const { moleOffice } = await import('../src/shared/participants.ts')
  const at = localStamp(new Date())
  world.db.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
        "VALUES ('madeUpNoticeAfter', 'message-centre', ?, ?, ?, 'message', 'A made-up letter', NULL, ?, NULL, 'authored')",
    )
    .run(THE_PERSON, at, at, JSON.stringify({ body: 'A made-up notice.', to: [{ kind: 'agent', id: idOf(THE_NOTICES_READER) }], sentBy: moleOffice(), writtenIn: { project: PROJECT } }))
  world.db.client.sqlite
    .prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES ('madeUpDeliveryAfter', 'madeUpNoticeAfter', 'agent', ?, 'queued', ?)")
    .run(idOf(THE_NOTICES_READER), at)
  const fifth = sweeps.sweepDeadLetters(BY)
  expect(fifth.archived).toBe(1)
  expect(fifth.lineId, 'a sweep that is not part of a backlog writes its line as today').not.toBeNull()
  const after = theLines(world)
  expect(after).toHaveLength(2)
  expect(byName(after[1]!.said.archived), 'the line after the backlog counts only its own sweep').toEqual([{ name: THE_NOTICES_READER, count: 1 }])
  expect(after[1]!.said.summarised ?? []).toEqual([])
}, 120_000)

it("routes a receiver's part larger than the route cap whole, in a sweep of its own, and never skips an older part for a newer one", async () => {
  // ONE LETTER FOR A SMALL OWNER, THEN MORE THAN THE CAP FOR A BIG ONE, THEN ONE FOR ANOTHER SMALL OWNER.
  const world = await aWorld((caps) => ({
    notices: 0,
    letters: ['made-up-small-1', ...Array.from({ length: caps.route + 1 }, () => 'made-up-big'), 'made-up-small-2'],
  }))
  const { sweeps, idOf } = world
  const big = world.caps.route + 1

  // THE OLDEST PART FITS, AND THE BIG PART AFTER IT WOULD PASS THE CAP, so it waits; the newer small part waits behind it.
  const first = sweeps.sweepDeadLetters(BY)
  expect(sent(first), 'the first sweep routes only the oldest small part').toEqual([[idOf('made-up-small-1'), 1]])
  expect(first.routed).toBe(1)
  expect(first.lineId).toBeNull()

  // THE BIG PART GOES WHOLE AND ALONE, though it is more than the cap.
  const second = sweeps.sweepDeadLetters(BY)
  expect(sent(second), 'the second sweep routes the whole big part, and nothing else').toEqual([[idOf('made-up-big'), big]])
  expect(second.routed).toBe(big)
  expect(second.lineId).toBeNull()
  const bigSummary = theSummaries(world).filter((one) => one.to === idOf('made-up-big'))
  expect(bigSummary, 'one summary names every letter of the big part').toHaveLength(1)
  expect(bigSummary[0]!.letters).toBe(big)
  for (const id of world.partOf.get('made-up-big')!) {
    expect(theRoutingOf(world, id).map((one) => one.inSummary)).toEqual([bigSummary[0]!.id])
  }

  // THE LAST SMALL PART CLEARS THE BACKLOG, and the line counts all three.
  const third = sweeps.sweepDeadLetters(BY)
  expect(sent(third)).toEqual([[idOf('made-up-small-2'), 1]])
  expect(third.lineId).not.toBeNull()
  expect(theRouted(world)).toEqual(world.letters)
  const lines = theLines(world)
  expect(lines).toHaveLength(1)
  expect(byName(lines[0]!.said.summarised)).toEqual(
    byName([
      { name: 'made-up-small-1', count: 1 },
      { name: 'made-up-big', count: big },
      { name: 'made-up-small-2', count: 1 },
    ]),
  )

  const fourth = sweeps.sweepDeadLetters(BY)
  expect(fourth.lineId).toBeNull()
  expect(fourth.summaries).toEqual([])
  expect(theSummaries(world)).toHaveLength(3)
}, 120_000)
