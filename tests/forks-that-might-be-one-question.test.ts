// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READING THAT PROPOSES DUPLICATE FORKS AND WRITES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS IS BUILT AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief: *"Do not silently merge uncertain items."* And, in the same section, that
 * deduplication must not "depend only on a human noticing". Both at once means one thing: a reading
 * that suggests, with its reasons, and no write anywhere near it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED, AND THE FIRST ONE IS THE POINT OF THE FILE
 * ---------------------------------------------------------------------------------------
 *
 *   1. IT WRITES NOTHING. Every record, link and change row in the database is counted before and
 *      after, and the counts must be identical. Not "no duplicate link was written" — nothing at
 *      all, of any kind.
 *   2. It finds the three repository forks, which is the case it was built from.
 *   3. Every reason names what it saw, so a person can check it against the records.
 *   4. A group whose only evidence is words says so, because words are a resemblance and not a fact.
 *   5. It does not join two forks that merely mention the same module.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'

const AGENT = { type: 'agent' as const, id: 'claude-code' }
/** The owner. Needed because joining two of the owner's forks is the owner's act, not an agent's. */
const PERSON = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let app: FastifyInstance
let read: typeof import('../src/server/lib/duplicates.ts')

beforeEach(async () => {
  t = await freshDb()
  read = await import('../src/server/lib/duplicates.ts')
  const { forkRoutes } = await import('../src/server/api/forks.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(forkRoutes, { prefix: '/api' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

const fork = (title: string, question: string): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title,
    data: { question, options: ['a — one way', 'b — the other'] },
    actor: AGENT,
  }).id

const work = (title: string): string =>
  t.api.createRecord({ workspaceId: 'default', kind: 'problem', title, data: { state: 'open' }, actor: AGENT }).id

/** Every row in the three tables a write could touch. The whole database, counted. */
const rowCounts = (): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const table of ['records', 'links', 'changes', 'revisions']) {
    const row = t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
    out[table] = row.n
  }
  return out
}

/** The three forks that were actually in the owner's queue on 27 August 2026. */
const theRepositoryForks = (): string[] => [
  fork(
    'Which repository do the 152 module claims belong to',
    'Which repository do the 152 module claims belong to, when the only index is in another project?',
  ),
  fork(
    'Which repository do the 152 module claims belong to, when the only index is in another project',
    'Which repository do the 152 module claims belong to?',
  ),
  fork(
    'Which repository are the 152 module claims relative to',
    'Which repository are the 152 module claims relative to?',
  ),
]

describe('it writes nothing, which is the whole design', () => {
  it('leaves every table exactly as it found it', async () => {
    theRepositoryForks()
    const before = rowCounts()
    const answer = read.candidateDuplicates()
    expect(answer.groups.length, 'the reading found nothing, so this proves nothing').toBeGreaterThan(0)
    expect(rowCounts(), 'the reading wrote to the database').toEqual(before)
  })

  it('leaves every table alone over HTTP too', async () => {
    theRepositoryForks()
    const before = rowCounts()
    const reply = await app.inject({ method: 'GET', url: '/api/forks/possible-duplicates' })
    expect(reply.statusCode).toBe(200)
    expect(rowCounts()).toEqual(before)
  })

  it('says out loud that it wrote nothing, and says how a person records a grouping instead', () => {
    theRepositoryForks()
    const answer = read.candidateDuplicates()
    expect(answer.note).toContain('THIS READING WRITES NOTHING')
    expect(answer.howToJoinThem).toContain('"type":"duplicate_of"')
    // The direction is the part that is easy to get wrong, and getting it wrong takes the wrong
    // fork off the queue.
    expect(answer.howToJoinThem).toContain('the one that leaves the queue')
    expect(answer.howToJoinThem).toContain('supersedes')
    for (const group of answer.groups) expect(group.sentence).toContain('NOTHING HAS BEEN WRITTEN')
  })
})

describe('the case it was built from', () => {
  it('finds the three repository forks as one group', () => {
    const three = theRepositoryForks()
    const groups = read.candidateDuplicates().groups
    const found = groups.find((group) => group.forks.some((one) => one.recordId === three[0]))
    expect(found?.forks.map((one) => one.recordId).sort()).toEqual([...three].sort())
    expect(found?.onlyWords, 'nothing structural joins these three, so it must say so').toBe(true)
  })

  it('names the words that matched, rather than handing over a score', () => {
    theRepositoryForks()
    const group = read.candidateDuplicates().groups[0]
    const words = group?.signals.find((one) => one.evidence === 'the same words')
    expect(words?.because).toContain('repository')
    expect(words?.because).toContain('claims')
    expect(words?.because).toContain('resemblance and not a fact')
    // No score anywhere on the reading. If a number that is not a count of what was seen appears,
    // somebody has replaced the reasons with a weight.
    expect(JSON.stringify(group)).not.toContain('score')
    expect(JSON.stringify(group)).not.toContain('confidence')
  })
})

describe('the structural evidence, which is not about wording', () => {
  it('joins two forks that point at the same record, whatever they are called', () => {
    const module = work('The modules drawing')
    const one = fork('A question about drawing boundaries', 'Is a module card a boundary?')
    const two = fork('Something else entirely', 'Should the far view draw anything at all?')
    t.api.createLink({ fromId: one, toId: module, type: 'about', actor: AGENT })
    t.api.createLink({ fromId: two, toId: module, type: 'about', actor: AGENT })

    const group = read.candidateDuplicates().groups.find((g) => g.forks.length === 2)
    expect(group?.onlyWords, 'a structural reason was reported as a resemblance').toBe(false)
    const why = group?.signals.find((one2) => one2.evidence === 'the same records')
    expect(why?.because).toContain('The modules drawing')
    expect(why?.because).toContain(module)
  })

  it('the group with a structural reason comes before the one that is only words', () => {
    theRepositoryForks()
    const module = work('The modules drawing')
    const one = fork('A question about drawing boundaries', 'Is a module card a boundary?')
    const two = fork('Something else entirely', 'Should the far view draw anything at all?')
    t.api.createLink({ fromId: one, toId: module, type: 'about', actor: AGENT })
    t.api.createLink({ fromId: two, toId: module, type: 'about', actor: AGENT })
    expect(read.candidateDuplicates().groups[0]?.onlyWords).toBe(false)
  })
})

describe('the evidence the owner’s brief lists that is NOT here, and why that is not silence', () => {
  it('a stored supersedes or duplicate_of link already took one of the two off the queue', () => {
    // The owner's brief lists "explicit supersedes/duplicate links" as deduplication evidence. It is
    // answered one step earlier: `leftTheQueueBecause` in lib/forks.ts takes a superseded or
    // duplicate fork off the queue, and this reading compares only forks that are still being
    // asked. So the two are never both in front of it, and a signal for that case would be code
    // that can never run. This test is what makes that claim checkable — if the queue rule ever
    // changes, this fails here rather than leaving the reasoning in duplicates.ts quietly wrong.
    const canonical = fork('The one to answer', 'Which repository do the module claims belong to?')
    const repeat = fork('The repeat', 'Which repository are the module claims relative to?')
    // THE PERSON MAKES THIS LINK, and from 27 August 2026 it has to be. These two forks say nothing
    // about who settles them, which means they are the owner's, and joining one of the owner's forks to another is
    // the owner's act — `assertMayReplaceAFork` refuses it to an agent and `leftTheQueueBecause` does not
    // count an agent's. The claim this test pins is unchanged: a fork that has left the queue is
    // never in front of the duplicate reading.
    t.api.createLink({ fromId: repeat, toId: canonical, type: 'duplicate_of', actor: PERSON })

    const answer = read.candidateDuplicates()
    expect(answer.looked, 'both ends of a duplicate link were still in the open queue').toBe(1)
    expect(answer.groups, 'a fork that already left the queue was compared').toEqual([])
  })
})

describe('what it refuses to suggest', () => {
  it('does not join two long questions that happen to share a few words', () => {
    fork(
      'Should the wrist camera be recalibrated before the handover replay',
      'Should the wrist camera be recalibrated before the handover replay, given the mount was reprinted ' +
        'last week and nothing has measured the drift since?',
    )
    fork(
      'Should the gripper pads be re-textured before the next demo',
      'Should the gripper pads be re-textured before the next demo, given the handover replay showed slip ' +
        'on three of twenty trials and the camera says nothing about grip?',
    )
    const groups = read.candidateDuplicates().groups
    expect(groups, 'two different questions were suggested as one').toEqual([])
  })

  it('does not report a fork on its own', () => {
    fork('The only fork here', 'Which way?')
    expect(read.candidateDuplicates().groups).toEqual([])
    expect(read.candidateDuplicates().looked).toBe(1)
  })

  it('says how many forks it compared, so an empty answer is not read as none looked at', () => {
    theRepositoryForks()
    expect(read.candidateDuplicates().looked).toBe(3)
    expect(read.candidateDuplicates().note).toContain('3 open forks compared')
  })
})
