// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NUMBERED QUOTE LINE OF A SENT REVIEW NAMES WHAT IT QUOTES IN WORDS. Problem F6-GRSXrBMtJ.
 *
 * A sent review goes as one message per recipient, each comment numbered with a line saying what it
 * was left on. That line is stored in the words of the review's conversation,
 * which a person reads there. So it names the thing by its title, and never by its record id: a record
 * id is shown only in developer mode, and the stored words cannot tell the
 * modes apart.
 *
 * The ids are not lost. The preview carries them apart from the line, for the pane's developer mode;
 * the review's conversation names the comments each message carries; and the one message the agent is
 * given carries each comment's context in its quotes, in the order of the numbered words. Until round
 * 19 of wave 13u this last part read the request of a run the send wrote; the send writes no run now
 * (answer yMYX20nfBuep, problem eCrK1atZOrvA).
 *
 * These tests press the same doors the review pane presses, in a throwaway office. The note, the
 * runs and the comments are made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const TITLE = 'Coolant pump review notes'
const NOTE_TEXT = 'The pump curve and the valve drawing are listed here.'

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Every case files its own note, run and review, and no case counts what
 * the office holds, so a shared database cannot make one case read another's work.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A run Mole Office could really pick up again. */
async function aRun(title: string, externalId: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath,
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-09-20 09:00:00',
      },
    },
  })
}

async function aComment(body: string, context: Record<string, unknown>, runId: string): Promise<string> {
  const id = await file('annotation', body.slice(0, 40), { body, context })
  const chose = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: HUMAN,
    payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: runId } } },
  })
  expect(chose.statusCode, chose.body).toBe(200)
  // A SECOND APART, because a stamp is to the second and the order written is the order numbered.
  await new Promise((done) => setTimeout(done, 1050))
  return id
}

async function aReview(entry: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/reviews', headers: HUMAN, payload: entry })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { review: { id: string } }).review.id
}

async function finish(reviewId: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/reviews/${reviewId}/finish-collecting`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
}

interface Preview {
  messages: { to: string; comments: { id: string; number: number; quote: string; ids: string[]; words: string }[] }[]
}

async function preview(reviewId: string): Promise<Preview> {
  const res = await app.inject({ method: 'GET', url: `/api/reviews/${reviewId}/send`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Preview
}

/** What the agent is given: the one message from the person, as the message pool holds it. */
interface Given {
  body: string
  quotes: { target: { recordId?: string } }[]
}

/**
 * Send the review, and give back the words of the one message of its conversation that carries two or
 * more comments, the comments it carries, and the one message each recipient was given.
 */
async function sendAndReadTheMergedWords(reviewId: string): Promise<{ words: string; carries: string[]; given: Given[] }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/reviews/${reviewId}/send`,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: { to: [] },
  })
  expect(res.statusCode, res.body).toBe(200)
  const sent = res.json() as { threadId: string; messages: { id: string }[] }
  const thread = await app.inject({ method: 'GET', url: `/api/agent/threads/${sent.threadId}`, headers: HUMAN })
  expect(thread.statusCode, thread.body).toBe(200)
  const merged = (thread.json() as { messages: { body: string; carries: string[] }[] }).messages.find(
    (one) => one.carries.length >= 2,
  )
  expect(merged, thread.body).toBeDefined()
  const given: Given[] = []
  for (const one of sent.messages) {
    const read = await app.inject({ method: 'GET', url: `/api/messages/${one.id}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    given.push((read.json() as { message: Given }).message)
  }
  return { words: merged?.body ?? '', carries: merged?.carries ?? [], given }
}

describe('the numbered quote line of a sent review', () => {
  it('names the record by its title and carries no id, in the preview and in the message; the ids are kept apart', async () => {
    const note = await file('note', TITLE, { body: NOTE_TEXT })
    const pump = await aRun('Pump bench work', 'ext-words-pump')
    const onTheNote = { target: { kind: 'record', recordId: note, workspaceId: WORKSPACE } }
    const review = await aReview({ entry: onTheNote })
    const first = await aComment('The pump curve does not match the bench test.', {
      ...onTheNote,
      span: { quote: 'pump curve', from: NOTE_TEXT.indexOf('pump curve'), to: NOTE_TEXT.indexOf('pump curve') + 10, field: 'body' },
    }, pump)
    const second = await aComment('Say which bench rig this came from.', onTheNote, pump)
    await finish(review)

    // THE PREVIEW: the line is the words, and the ids are a list of their own.
    const before = await preview(review)
    const comments = before.messages[0]?.comments ?? []
    expect(comments.map((one) => one.id)).toEqual([first, second])
    expect(comments[0]?.quote).toBe(`On the note "${TITLE}": “pump curve”`)
    expect(comments[1]?.quote).toBe(`On the note "${TITLE}"`)
    for (const one of comments) {
      expect(one.quote, one.quote).not.toContain(note)
      // THE RECORD'S ID AND THE PROJECT'S, the two ids the stored target names.
      expect(one.ids).toEqual([note, WORKSPACE])
    }

    // THE CONVERSATION'S WORDS, which a person reads there: the same lines, and no id.
    const sent = await sendAndReadTheMergedWords(review)
    const body = sent.words
    expect(body, body).toContain(`1. On the note "${TITLE}": “pump curve”\nThe pump curve does not match the bench test.`)
    expect(body, body).toContain(`2. On the note "${TITLE}"\nSay which bench rig this came from.`)
    expect(body, body).not.toContain(note)

    // THE COMMENTS' IDS are in the review's conversation, in the order numbered.
    expect(sent.carries).toEqual([first, second])
    // THE AGENT'S COPY keeps what it needs to act: a context naming the note by id for each comment, at
    // the place of its number, and words with no id in them.
    expect(sent.given).toHaveLength(1)
    expect(sent.given[0]?.quotes.map((one) => one.target.recordId)).toEqual([note, note])
    expect(sent.given[0]?.body).not.toContain(note)
  }, 60_000)

  it('names a record page by its title, any other page as "a page", and keeps both addresses for developer mode', async () => {
    const note = await file('note', TITLE, { body: NOTE_TEXT })
    const pump = await aRun('Pump bench work', 'ext-words-pages')
    // A PROJECT-WIDE REVIEW is the one kind that collects a comment left on a whole page.
    const review = await aReview({ entry: { target: { kind: 'page', route: '/' } }, reach: 'global' })
    await aComment('This page loads slowly.', { target: { kind: 'page', route: `/r/${note}` } }, pump)
    await aComment('The decisions list needs a filter.', { target: { kind: 'page', route: '/decisions' } }, pump)
    await finish(review)

    const comments = (await preview(review)).messages[0]?.comments ?? []
    expect(comments.map((one) => one.quote)).toEqual([`On the page of the note "${TITLE}"`, 'On a page'])
    expect(comments.map((one) => one.ids)).toEqual([[`/r/${note}`], ['/decisions']])
  }, 60_000)
})

/**
 * A TITLE COMES THROUGH WHOLE, EVEN WHEN IT HOLDS THE PROJECT'S OWN ID. Check Sn7v_9uljg7T.
 *
 * A record target's ids include the project's workspace id, and that is an ordinary word. The line
 * used to be built by taking every id the target names out of a sentence, so in project robotics the
 * note "robotics bench plan" became the note " bench plan", and in project default "Change the
 * default port" became "Change the port" — stored in the words the agent and the owner read. The line
 * is now built from the kind and the whole title. The projects and notes are made up.
 *
 * MUTATION (after a green control, then restored): whatItWasLeftOn in src/server/lib/reviews.ts goes
 * back to the old removal, every id the target names taken out of the reading's sentence:
 * `idsOfTarget(target).reduce((said, id) => said.split(id).join(''), comment.reading.about)`.
 * Both projects go red.
 */
describe('a quoted title that holds the project id', () => {
  const as = (workspace: string): Record<string, string> => ({ ...HUMAN, 'x-mole-office-workspace': workspace })

  async function fileIn(workspace: string, kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/records', headers: as(workspace), payload: { kind, title, data } })
    expect(res.statusCode, res.body).toBe(201)
    return (res.json() as { record: { id: string } }).record.id
  }

  for (const [workspace, title] of [['robotics', 'robotics bench plan'], ['default', 'Change the default port']] as const) {
    it(`keeps "${title}" whole in project ${workspace}, in the preview and in the stored message`, async () => {
      if (workspace !== 'default') {
        const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'A made-up robot project' } })
        expect(made.statusCode, made.body).toBe(201)
      }
      const note = await fileIn(workspace, 'note', title, { body: 'Made-up notes for this test.' })
      const run = await fileIn(workspace, 'session', 'Made-up bench work', {
        state: 'idle',
        runtime: 'claude-code',
        extra: {
          discovered: {
            tool: 'claude-code', externalId: `ext-${workspace}-title`, logPath: fakeTranscript(`ext-${workspace}-title`),
            resumeCommand: `claude --resume ext-${workspace}-title`, observedState: 'idle',
            stateReason: 'its log last grew 40 minutes ago and a process still names it', filesTouched: [], filesComplete: true,
            at: '2026-09-20 09:00:00',
          },
        },
      })
      const onTheNote = { target: { kind: 'record', recordId: note, workspaceId: workspace } }
      const made = await app.inject({ method: 'POST', url: '/api/reviews', headers: as(workspace), payload: { entry: onTheNote } })
      expect(made.statusCode, made.body).toBe(201)
      const review = (made.json() as { review: { id: string } }).review.id
      for (const body of ['The first made-up point.', 'The second made-up point.']) {
        const id = await fileIn(workspace, 'annotation', body, { body, context: onTheNote })
        const chose = await app.inject({
          method: 'PATCH', url: `/api/records/${id}`, headers: as(workspace),
          payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: run } } },
        })
        expect(chose.statusCode, chose.body).toBe(200)
        await new Promise((done) => setTimeout(done, 1050))
      }
      const finished = await app.inject({ method: 'POST', url: `/api/reviews/${review}/finish-collecting`, headers: as(workspace) })
      expect(finished.statusCode, finished.body).toBe(200)

      const line = `On the note "${title}"`
      const seen = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: as(workspace) })
      expect(seen.statusCode, seen.body).toBe(200)
      const quotes = (seen.json() as Preview).messages.flatMap((one) => one.comments.map((c) => c.quote))
      expect(quotes).toEqual([line, line])

      const sent = await app.inject({
        method: 'POST', url: `/api/reviews/${review}/send`, headers: { ...as(workspace), ...thePersonsKeyHeader() }, payload: { to: [] },
      })
      expect(sent.statusCode, sent.body).toBe(200)
      const threadId = (sent.json() as { threadId: string }).threadId
      const thread = await app.inject({ method: 'GET', url: `/api/agent/threads/${threadId}`, headers: as(workspace) })
      const merged = (thread.json() as { messages: { body: string; carries: string[] }[] }).messages.find((one) => one.carries.length >= 2)
      expect(merged?.body, thread.body).toContain(`1. ${line}\nThe first made-up point.`)
      expect(merged?.body, thread.body).toContain(`2. ${line}\nThe second made-up point.`)
    }, 60_000)
  }
})

/**
 * THE BROWSER'S RULE FOR TAKING IDS OUT OF THE SERVER'S SENTENCES LEAVES QUOTED WORDS WHOLE. Check Sn7v_9uljg7T.
 *
 * `withoutIdsOf` (src/shared/targets.ts) is what `withoutIds` in the browser uses on the review pane's rows and
 * the agent conversation's lines. It takes the target's ids out of the text between quotes only.
 *
 * MUTATION (after a green control, then restored): in withoutIdsOf, the line that keeps a quoted part as it is
 * (`if (at % 2 === 1) return part`) is taken out. Both cases go red.
 */
describe('withoutIdsOf keeps a quoted title whole', () => {
  it('takes out the record id and leaves the project id inside the title', async () => {
    const { withoutIdsOf } = await import('../src/shared/targets.ts')
    const target = { kind: 'record' as const, recordId: 'MadeUpId0001', workspaceId: 'robotics' }
    expect(withoutIdsOf('the note "robotics bench plan", MadeUpId0001', target)).toBe('the note "robotics bench plan"')
  })

  it('leaves a curly-quoted title whole and still takes the block id out of the words around it', async () => {
    const { withoutIdsOf } = await import('../src/shared/targets.ts')
    const target = { kind: 'reportBlock' as const, recordId: 'MadeUpId0002', blockId: 'b-2' }
    expect(withoutIdsOf('the block b-2 of the report “Change b-2 first”, MadeUpId0002', target)).toBe(
      'the block of the report “Change b-2 first”',
    )
  })
})
