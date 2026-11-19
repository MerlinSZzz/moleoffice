// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NINE SLOWEST READS ANSWER WORD FOR WORD WHAT THEY ANSWERED BEFORE THEY WERE MADE FAST.
 *
 * Round 13 of wave 13y made faster the reads that took seconds in the office's
 * call log of 9 October 2026, and the brief allowed no change to an answer: the same fields, the same order, the same
 * words. Each request below is the one the page or the waiter makes, asked once, in this order, on the office of the
 * slowest reads (tests/the-office-of-the-slowest-reads.ts) with the clock pinned to the moment it is measured at.
 *
 * WHAT IS COMPARED is a SHA-256 of the answer's bytes, taken at the code before the change (tip 406f46724). The answers
 * run to 11 MB, too much to keep in the repository, and one changed byte changes the hash.
 *
 * TWO VALUES IN THE ANSWERS ARE MADE AT RANDOM by the migrations, not by the office: the id of the Secretariat group
 * and the id of this machine's world. Two builds differ in those and in nothing else, so each is replaced by a fixed
 * word before the hash is taken. Every other byte is compared.
 *
 * A THIRD IS MADE AT RANDOM since line 13s's round 257: the id of the office's own row, which a fresh office now draws
 * new each time. The code before the change gave that row its handle as its id, so the id is replaced by the handle,
 * and the avatar id made from it comes back with it. The six answers that name the office are first checked to name it
 * by the id its row holds (`NAME_THE_OFFICE`). The two between-agents answers also put the two sides of each pair in
 * the order of their keys, and the handle sorted after every agent the office writes to here, where a drawn id may sort
 * before them. So in those two the office's pairs are checked to be in the order of their keys, and are then put in the
 * order the handle gave them (`theOfficesPairsInTheHandlesOrder`), before the id is replaced.
 *
 * ONE SETTING IS PINNED, as the clock is. Every message in an answer says until when its writer may still change its
 * words (`wordsMayChangeUntil`), which is the time it was written plus MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS. A test
 * office reads that setting from the .env of its checkout, or of the main checkout when a worktree has none. So it is
 * set here to its built-in 120 seconds, and the hashes are a fact about the code and not about which .env was found.
 *
 * When an answer is changed on purpose, the hash here is changed with the reason in the commit's message, in a commit
 * of its own before the code that changes the answer.
 */
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MOLE_OFFICE_HANDLE, type ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_LIVE_OFFICE } from './the-chat-office-of-the-live-shape.ts'
import { buildTheOfficeOfTheSlowestReads, THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

interface Asked { name: string; method: 'GET' | 'POST'; url: string; as: 'person' | 'agent'; payload?: Record<string, unknown> }

/** The requests, in the order they are made. The release and the waiter's move are writes, so they come last. */
const ASKED: Asked[] = [
  { name: 'GET /api/messages/comments', method: 'GET', url: '/api/messages/comments', as: 'person' },
  { name: 'GET /api/messages/between-agents?shape=page', method: 'GET', url: '/api/messages/between-agents?shape=page', as: 'person' },
  { name: 'GET /api/messages/between-agents', method: 'GET', url: '/api/messages/between-agents', as: 'person' },
  { name: 'GET /api/messages/groups?undelivered=1', method: 'GET', url: '/api/messages/groups?undelivered=1', as: 'agent' },
  { name: 'GET /api/participants', method: 'GET', url: '/api/participants', as: 'person' },
  { name: 'GET /api/presence', method: 'GET', url: '/api/presence', as: 'person' },
  { name: 'GET /api/messages/contacts', method: 'GET', url: '/api/messages/contacts', as: 'person' },
  { name: 'GET /api/groups?shape=page', method: 'GET', url: '/api/groups?shape=page', as: 'person' },
  { name: 'GET /api/groups', method: 'GET', url: '/api/groups', as: 'person' },
  { name: 'GET /api/resources', method: 'GET', url: '/api/resources', as: 'agent' },
  { name: 'POST /api/resources/:id/release', method: 'POST', url: '/api/resources/resource-live-0000/release', as: 'agent', payload: { signalNothing: true } },
  { name: 'GET /api/messages/groups?move=1&undelivered=1', method: 'GET', url: '/api/messages/groups?move=1&undelivered=1', as: 'agent' },
]

/**
 * The hash of each answer at tip 406f46724, before the reads were changed.
 *
 * FOUR ANSWERS CARRY MESSAGES, AND EACH MESSAGE HAS TWO FIELDS MORE since wave 13u's round 14, by point 2 of a
 * decision: `edited` and `wordsMayChangeUntil`. Their four hashes are of the answer at tip
 * 406f46724 with those two fields added to each message and nothing else changed. Round 16i of wave 13u compared the
 * bytes: with the two fields taken out again, each of the four answers was main's answer at 63e7fa24f byte for byte,
 * and main's hash is the one this list held before.
 *
 * EIGHT ANSWERS NAME THE TEST OFFICE'S OWNER, who is the person here, and since line round 49 that owner is an invented
 * person, Jory (tests/a-page-of-a-test-office.ts, commit faf45f41c, answer 1mDqct4t2suB). Their eight hashes
 * are of the same answers with that owner. With the owner's id and name from before round 49 put back, all twelve
 * answers at tip 32718a4fb had the hashes this list held before, so no code changed them (the fix for merge entry
 * dSim1ZXJAv43). The four that do not change are the two between-agents reads and the two resource requests.
 *
 * EACH COMMENT IN THE COMMENTS ANSWER CARRIES `writtenOrder` since wave 13y round 29: its place in the order the
 * comments were written. The hash is of that answer. With the field taken out again, the answer hashes to
 * 936cbd9d76086ecc6215330eeb0e2196c9b80c2b4a5fa3f8b61221f4038c41e9, the hash this list held before.
 *
 * EACH MESSAGE CARRIES `notice` since wave 13j: the name of the line when Mole Office wrote it, and null when a person
 * or an agent did. It changes four answers here: the plain between-agents read, contacts and the two groups reads.
 * Their four hashes are of those answers with the field. With the field taken out of the code again, each of the four
 * answers hashed to the value this list held before.
 *
 * A ROW THAT STILL HOLDS A DRAWING THE PRODUCT GENERATED UNDER AN EARLIER ID IS OFFERED THE DEFAULT PICTURE since wave
 * 13k's round 57. After a re-mint a row's own drawing is still keyed by the id it had, so the
 * rule reads the drawing's provenance and not its key. The office of the slowest reads gives every made-up agent the
 * office's own drawing, which no door does, so GET /api/participants now draws 912 agents with their role's default
 * portrait. Its hash is of that answer. With the old comparison of keys put back in the code, the answer hashed to
 * 522881fc6b73acfbc7b95d69fb09995cffe64f3898fa929efb957d854f0be455, the hash this list held before.
 *
 * EACH CONTACT IN THE CONTACTS ANSWER CARRIES `online` since wave 13y round 91 (item 22): whether the contact's dot in
 * the page's project says it is online, which puts the contacts who are online first in their group. Nobody in this
 * office is online at the measured moment. So each of the 912 rows carries `"online":false`, and the order is the
 * order before. The hash is of that answer. With the field taken out of every row, the answer hashes to
 * d1c6b0ca1f0c18e6f46c4fe97087f08a60f0ba0c545f21702cecd3e80b592d44, the hash this list held before.
 *
 * A HAND-OVER MOVES THE READ POINT ONLY IN A GROUP THAT HAD SOMETHING NEW OR NO POINT, AND ANSWERS WITHOUT `groups`
 * unless it adds `&groups=1`, since wave 13y round 114 (item 47). The sentence that says where the messages are read
 * names those groups, in both forms. So the two groups reads change: the read without the move by its sentence, and the
 * hand-over by its sentence and by the missing `groups`. Their two hashes are of those answers. With the sentences from
 * before this round put back in the code and `&groups=1` added to the hand-over, both answers hashed to the values this
 * list held before: 9cbcd72871e1859c9b19394dc3e6105abdde46e447932ff3dd965dff11fabe5f and
 * f5891c9cc9a3c75afb808110a7e2642f1f6ad2040adfbfc2d60d562bac30844b.
 *
 * THREE SENTENCES OF THE PRESENCE ANSWER ARE SHORTER since wave 13y round 124 (item 61), and none is built on
 * "nobody": an agent that "cannot be reached", "No terminal has this agent open." and "Not chosen, so this is the
 * default:". So GET /api/presence changes. Its hash is of that answer. With the three sentences from before round 124
 * put back in the code, the answer hashed to f649663cdfd116025c8a40f20171aafe82791a4c5bbca49e3720ff6c82ecc880, the
 * hash this list held before (the fix for merge entry bZjDmuiiGd5p).
 *
 * MOLE OFFICE'S OWN ROW SAYS THAT IT HOLDS NO CARD since line 13s's merge entry VVC73vSyWMGm (main 910a89a4e). The
 * office's row has no card, and its `roleSays` now says so (`MOLE_OFFICES_OWN_ROW_SAYS_OF_ITS_CARD` in
 * src/shared/participants.ts) where it said `NO_ROLE_SET` before. Its `roleReadAs` is unchanged. So GET
 * /api/participants changes in that one field of that one row. Its hash is of that answer. With the office's row
 * answered `NO_ROLE_SET` again in the code (`whatAnAgentsAnswerSaysOfItsCard` in src/server/api/participants.ts), the
 * answer hashed to cffea5bb8d826e56f2ed328079fe604390cd3a531ca06d208761af5ea91b11c6, the hash this list held before
 * (the fix for merge entry VVC73vSyWMGm).
 *
 * THE PERSON'S PARTICIPANT ROW NOW CARRIES THREE CHAT CHOICES: `chatButtonStays`, `chatOpensAs` and `chatLabels`.
 * The settings cover when the chat button stays visible, how the chat opens, and personal message labels.
 * This hash includes the three nullable fields that keep those choices. The person's later
 * layout field is checked separately, then removed before the earlier bytes are compared.
 *
 * EACH MESSAGE CARRIES `quotePositions` since wave 13y round 168. It changes the between-agents, undelivered groups, and
 * contacts answers. With that field taken out of the code again, each answer hashed to the value this list held before.
 *
 * THE PARTICIPANT ANSWER IS ONE PAGE SINCE bef5e982c: people, then agents, in handle order, at most 512,000 bytes, and it
 * carries `total`, `next` and `says`. The hash is of every page's rows joined, and the `narrowedByPermission` the reply
 * carried after them before the answer was paged; with the three page fields left out, that is the whole old answer byte
 * for byte and still hashes to ed2aae7b. The made-up office has 913 agent rows, and the office's own row is not on the
 * first page, so the answer is checked to name the office by its id in the whole roster.
 *
 * THE PERSON'S OWN ROW CARRIES TWO MORE FIELDS since wave 14d's round 4. `shippedFlags` is the person's own settings for
 * the two shipped flags and 'No mark' (migration 0346). It is null when they changed none. `themes` is the person's look
 * and own themes (migration 0347). It is only on their own row as they read it. The hash is of that answer. With the two
 * fields taken out of the code again (the two `shippedFlags:` lines in src/server/api/participants.ts and the
 * `Object.assign(value, theLookForTheReader(...))` line), the answer hashed to ed2aae7b, the hash this list held before.
 * The supervisor of wave 13y's round 173 ran that control.
 */
const BEFORE: Record<string, string> = {
  'GET /api/messages/comments': 'dd57c28cfb49aab82ecf06dd9c0e73b7014053198d8b5c68deaaabe596830c54',
  'GET /api/messages/between-agents?shape=page': '8f11ecea6899b10c287a3787a8a804e8054f9b78d3ea348e94ecd7ec788e4abc',
  'GET /api/messages/between-agents': '6e0fb230e0e25e384f9bc48eac84cdb2dc79c30c4eaed175613adb17a41851ca',
  'GET /api/messages/groups?undelivered=1': 'a40b4e87456355f5519a791bb3cff24b289dc8de385be40d0975a6411be41d6f',
  'GET /api/participants': 'f3af3201ea45b550527b21cedeb749356e20642832668fe3ddc46b00e7a70cff',
  'GET /api/presence': '327377454abac324834163535c6304f93092b06c088d7121bb32d0d0fc252d06',
  'GET /api/messages/contacts': 'c845b6bb10fb67d80557a192eebc7b9fd63233a7699751763dcbd0910510200b',
  'GET /api/groups?shape=page': '09affeed040dc9d8908f043f43e7b56134e71f20990ffd9d98c8a6490becfc98',
  'GET /api/groups': '20fa15979817b53f093b368e9eaa14ff0d24598650befbcb21c25083c45e585a',
  'GET /api/resources': '84317703a8595d19794f04a7113c8599b749cb24efc2c1057a68a8886ed1a82a',
  'POST /api/resources/:id/release': 'fcd30d731fcb4dfa0c8d8d4aa0f2b93d1bfd776ec3a1ce4e7426cb4be3a60504',
  'GET /api/messages/groups?move=1&undelivered=1': 'ca3e49fc882ea8f687fc82a75098661aed918c30ec5ad1f954ce9e33f2a88667',
}

/** The answers that name the office. Each names it by the id its own row holds, before that id is replaced. */
const NAME_THE_OFFICE = new Set([
  'GET /api/messages/between-agents?shape=page',
  'GET /api/messages/between-agents',
  'GET /api/participants',
  'GET /api/presence',
  'GET /api/groups?shape=page',
  'GET /api/groups',
])

/** The answers that list the conversations between two agents, each pair with its two sides in the order of their keys. */
const PAIRS_IN_KEY_ORDER = new Set(['GET /api/messages/between-agents?shape=page', 'GET /api/messages/between-agents'])

/**
 * THE OFFICE'S PAIRS IN THE ORDER THE HANDLE GAVE THEM. A conversation between two agents puts the side with the smaller
 * key first. The product writes that rule inline where it makes a pair (`conversationsBetweenAgents` in
 * src/server/lib/messages.ts) and exports no function for it, so this test states it as what it expects of the answer.
 * Each pair that names the office is checked to be in the order of its keys with the id the office's row holds, and is
 * then put in the order of its keys with the handle in place of that id: the order the answer had before. The answer
 * is written back out only if JSON.stringify writes it as it came, so no other byte moves. It answers what is wrong, or
 * null and the answer.
 */
function theOfficesPairsInTheHandlesOrder(body: string, officeId: string): { wrong: string | null; body: string } {
  const answer = JSON.parse(body) as { conversations: { between: [ParticipantRef, ParticipantRef] }[] }
  if (JSON.stringify(answer) !== body) return { wrong: 'JSON.stringify does not write the answer as it came', body }
  const isTheOffice = (one: ParticipantRef) => one.kind === 'agent' && one.id === officeId
  const withTheHandle = (one: ParticipantRef): ParticipantRef => (isTheOffice(one) ? { ...one, id: MOLE_OFFICE_HANDLE } : one)
  let theOfficesPairs = 0
  for (const one of answer.conversations) {
    const [first, second] = one.between
    if (!isTheOffice(first) && !isTheOffice(second)) continue
    theOfficesPairs += 1
    if (!(participantKey(first) < participantKey(second))) return { wrong: `${participantKey(first)} comes before ${participantKey(second)}`, body }
    if (!(participantKey(withTheHandle(first)) < participantKey(withTheHandle(second)))) one.between = [second, first]
  }
  if (theOfficesPairs === 0) return { wrong: 'no conversation has the office on one side', body }
  return { wrong: null, body: JSON.stringify(answer) }
}

let t: TestDb
let app: FastifyInstance
const answers = new Map<string, { status: number; hash: string; namesTheOfficeByItsId: boolean; theOfficesPairs: string | null; chatLayouts: unknown[] | null }>()

/**
 * EVERY PAGE OF THE ROSTER, JOINED IN THE ORDER THE DOOR GIVES THEM.
 *
 * `GET /api/participants` answers one page since bef5e982c, so a caller that needs every row follows `next`. The joined
 * body has the two lists the whole answer had, and the `narrowedByPermission` the reply carried after them, but no page
 * field. A page that is not 200 is handed back as it came, so the case reports the status it got.
 */
async function everyParticipantRow(): Promise<{ statusCode: number; body: string }> {
  const people: unknown[] = []
  const agents: unknown[] = []
  const seen = new Set<string>()
  let narrowedByPermission: unknown = null
  let first = true
  let next: string | null = '/api/participants'
  let statusCode = 0
  while (next !== null) {
    if (seen.has(next)) throw new Error('The participant roster repeated a page, so the whole roster cannot be read.')
    seen.add(next)
    const page = await app.inject({ method: 'GET', url: next, headers: PERSON })
    statusCode = page.statusCode
    if (page.statusCode !== 200) return { statusCode, body: page.body }
    const part = page.json() as { people: unknown[]; agents: unknown[]; next: string | null; narrowedByPermission?: unknown }
    if (first) { narrowedByPermission = part.narrowedByPermission ?? null; first = false }
    people.push(...part.people)
    agents.push(...part.agents)
    next = part.next
  }
  return { statusCode, body: JSON.stringify({ people, agents, narrowedByPermission }) }
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  // THE EDIT WINDOW AT ITS BUILT-IN VALUE, whatever the checkout's .env says. The header says why.
  vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const office = buildTheOfficeOfTheSlowestReads(t.client.sqlite, THE_PERSON, THE_LIVE_OFFICE)
  const sqlite = t.client.sqlite
  const handle = (sqlite.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  const AGENT = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
  // THE RANDOM VALUES, each with the word it is replaced by.
  const random = new Map<string, string>()
  for (const one of sqlite.prepare(`select id from groups where opened_because <> 'made up for a measurement'`).all() as { id: string }[]) random.set(one.id, `group-made-by-a-migration-${String(random.size)}`)
  for (const one of sqlite.prepare(`select home_world as world from people union select home_world from agents`).all() as { world: string | null }[]) {
    if (one.world !== null) random.set(one.world, `world-made-by-a-migration-${String(random.size)}`)
  }
  random.set(theOfficesOwnId(t), MOLE_OFFICE_HANDLE)
  for (const one of ASKED) {
    const reply = one.name === 'GET /api/participants'
      ? await everyParticipantRow()
      : await app.inject({ method: one.method, url: one.url, headers: one.as === 'person' ? PERSON : AGENT, ...(one.payload === undefined ? {} : { payload: one.payload }) })
    const namesTheOfficeByItsId = reply.body.includes(JSON.stringify(theOfficesOwnId(t)))
    const inOrder = PAIRS_IN_KEY_ORDER.has(one.name) ? theOfficesPairsInTheHandlesOrder(reply.body, theOfficesOwnId(t)) : { wrong: null, body: reply.body }
    let body = inOrder.body
    let chatLayouts: unknown[] | null = null
    if (one.name === 'GET /api/participants') {
      const held = JSON.parse(body) as { people: Record<string, unknown>[] }
      if (JSON.stringify(held) !== body) throw new Error('The participants answer did not serialize as received')
      chatLayouts = held.people.map(person => person['chatLayout'])
      for (const person of held.people) delete person['chatLayout']
      body = JSON.stringify(held)
    }
    for (const [value, word] of random) body = body.split(value).join(word)
    answers.set(one.name, { status: reply.statusCode, hash: createHash('sha256').update(body).digest('hex'), namesTheOfficeByItsId, theOfficesPairs: inOrder.wrong, chatLayouts })
  }
}, 600_000)

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await app.close()
  t.close()
})

describe('the slowest reads, on an office of the live shape', () => {
  for (const one of ASKED) {
    it(`${one.name} answers what it answered before it was made fast`, () => {
      const answer = answers.get(one.name)
      expect(answer?.status).toBe(200)
      if (NAME_THE_OFFICE.has(one.name)) expect(answer?.namesTheOfficeByItsId, 'the answer does not name the office by its own id').toBe(true)
      if (PAIRS_IN_KEY_ORDER.has(one.name)) expect(answer?.theOfficesPairs, "the office's pairs are not in the order of their keys").toBeNull()
      if (one.name === 'GET /api/participants') {
        expect(answer?.chatLayouts?.length).toBeGreaterThan(0)
        expect(answer?.chatLayouts?.every(value => value === null)).toBe(true)
      }
      expect(answer?.hash).toBe(BEFORE[one.name])
    })
  }
})
