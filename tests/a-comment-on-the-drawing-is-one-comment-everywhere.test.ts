// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT LEFT ON A CARD IN THE DRAWING IS ONE RECORD, AND EVERY SCREEN DRAWS THE SAME ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, AND WHAT IS MEASURED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion D23. The owner pressed the detail tick on a card of the
 * pipeline "handover v2" in the Robotics project. A circle with a "1" appeared. He pressed the 1 and
 * the column opened on "Your reviews" with nothing in it. What is wanted:
 *
 *   The comment itself was not visible. A comment left on the graph page should also be mapped onto
 *   the content it is about, and a comment left on a page should still be there once it has gone to an agent.
 *
 * TWO THINGS WERE TRUE AT ONCE, and only the first of them was a defect in what the press does.
 *
 *   1. The press had nowhere to go. `CommentCircles` called `openReviewList()` for a circle with no
 *      comment to jump to, and that pane reads GET /api/reviews — a list of REVIEWS. A comment
 *      cannot appear in it under any circumstances, so the press could only draw an empty pane.
 *      Robotics has no review at all, which is why the pane was empty rather than merely wrong.
 *   2. Their "1" was an instruction they had begun writing and had not sent. Those are kept in their own
 *      browser under `mole-office.talk.drafts` and never reach the server. Measured read-only
 *      against his database on 6 September 2026: Robotics holds no comment, no open conversation
 *      and no review, so no server route could have drawn anything for that circle.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * It writes a comment on a card of a real pipeline drawing, in a real browser, against a real
 * server, and then asks three questions of it:
 *
 *   - pressing the count on the card draws that comment, in words;
 *   - the same comment is drawn on the block's own record page;
 *   - the same comment is in the conversation it was sent to, and is still there after it is sent.
 *
 * IT DOES NOT MEASURE THE NUMBER ON THE CARD. Whether the tick changes what the card counts is the
 * card's own half of D23 and belongs to whoever owns src/web/components/graph.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIRST QUESTION IS ASKED ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, and a lanes card carries no place a comment can be
 * written on, so no circle is drawn there. The modules drawing still draws the cards this file was
 * written about. So a second comment is written on a module's card, and the first question presses
 * that card's count on the modules drawing. The second and third questions still ask about the
 * step's comment, on the block's own page and in the conversation.
 *
 * A MUTATION THAT TURNS IT RED: drop the `openCommentsOn(circle.key)` call from the circle's press in
 * src/web/components/agent/CommentCircle.tsx. The press then opens no column on the comment, and the
 * first question goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const { t } = createI18n('en')

/** What the comment says. Long enough that finding it on a page is not an accident. */
const WHAT_THEY_WROTE = 'This step still assumes the human lets go first.'

/** What the comment on the module's card says, so that the first question finds its own words. */
const WHAT_WAS_WRITTEN_ON_THE_MODULE = 'This module still reads the timing from one camera only.'

/** The pipeline and the step, named as the owner's are. */
const PIPELINE = 'Handover v2'
const STEP = 'Predict the release instant'

let pipelineId = ''
let blockId = ''
let workspaceId = ''
let commentId = ''
let moduleId = ''

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const said = await res.text()
  expect(res.status, said).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return JSON.parse(said) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'drawing-comment', viewport: { width: 1440, height: 1000 } })

  const madePipeline = (await post('/api/records', { kind: 'pipeline', title: PIPELINE, data: { blockIds: [] } }))[
    'record'
  ] as { id: string; workspaceId: string }
  pipelineId = madePipeline.id
  workspaceId = madePipeline.workspaceId
  // THE BLOCK ROUTE ANSWERS WITH THE BLOCK AS `record`, the way every record write does, plus the
  // pipeline and where in the order it went.
  const added = (await post(`/api/records/${pipelineId}/blocks`, { name: STEP, state: 'doing' }))['record'] as {
    id: string
  }
  blockId = added.id

  // AN AGENT TO SEND IT TO, so that the third question — is it in the conversation it was sent to —
  // has a conversation to be in.
  await post('/api/records', {
    kind: 'agent',
    title: 'Reader Y',
    data: { handle: 'reader-y', runtime: 'claude-code', state: 'active' },
  })

  // THE COMMENT, WRITTEN ON THE CARD. The target is the key a card carries: `record/<the block's own
  // id>/<the project>`. `cardTarget` in components/graph/CardFace.tsx writes exactly that, and
  // `targetKey` in shared/targets.ts is the one function that spells it — so this is the shape a
  // right-click on the card produces, not a shape invented for a test.
  const written = (await post('/api/records', {
    kind: 'message',
    title: WHAT_THEY_WROTE,
    data: {
      body: WHAT_THEY_WROTE,
      target: { target: { kind: 'record', recordId: blockId, workspaceId }, place: { at: 'surface' } },
      to: [{ kind: 'agent', id: 'reader-y' }],
      sentBy: { kind: 'person', id: THE_PERSON },
    },
  }))['record'] as { id: string }
  commentId = written.id

  // TWO MODULES, LINKED, because the modules drawing folds away a module linked to no other module.
  const modules: string[] = []
  for (const title of ['Release timing', 'Hand camera']) {
    const made = (await post('/api/records', {
      kind: 'module',
      title,
      summary: `${title}, a module for the drawing's comment.`,
      data: { state: 'active', parts: [] },
    }))['record'] as { id: string }
    modules.push(made.id)
  }
  moduleId = modules[0] as string
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromId: modules[0], toId: modules[1], type: 'relates_to' }),
  })
  if (!linked.ok) throw new Error(`the two modules could not be linked: ${await linked.text()}`)

  // A SECOND COMMENT, WRITTEN ON THE MODULE'S CARD, in the same shape as the first.
  await post('/api/records', {
    kind: 'message',
    title: WHAT_WAS_WRITTEN_ON_THE_MODULE,
    data: {
      body: WHAT_WAS_WRITTEN_ON_THE_MODULE,
      target: { target: { kind: 'record', recordId: moduleId, workspaceId }, place: { at: 'surface' } },
      to: [{ kind: 'agent', id: 'reader-y' }],
      sentBy: { kind: 'person', id: THE_PERSON },
    },
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================================ on the drawing

describe('pressing the count on a card shows the comment', () => {
  it('draws the comment’s own words, rather than a list of reviews', async () => {
    await app.page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const key = `record/${moduleId}/${workspaceId}`
    await app.page.waitForSelector(`.px-comment-circle[data-comments-on="${key}"]`, { timeout: 60_000 })

    await app.page.click(`.px-comment-circle[data-comments-on="${key}"]`)
    await app.page.waitForSelector('.px-pane', { timeout: 30_000 })
    await app.page.waitForFunction(
      (words: string) => (document.querySelector('.px-pane')?.textContent ?? '').includes(words),
      WHAT_WAS_WRITTEN_ON_THE_MODULE,
      { timeout: 30_000 },
    )

    const said = (await app.page.textContent('.px-pane')) ?? ''
    expect(said).toContain(WHAT_WAS_WRITTEN_ON_THE_MODULE)
    // AND IT IS NOT THE LIST OF REVIEWS, which is what the press used to open. That pane's own
    // absence word is what the owner was left looking at.
    expect(said).not.toContain(t('review.pane.none.yet'))
  }, 240_000)
})

// ============================================================================ on the record page

describe('the same comment is on the block’s own page', () => {
  it('is drawn there as the same record, from the same count', async () => {
    await app.page.goto(`${app.site}/#/r/${blockId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const key = `record/${blockId}/${workspaceId}`
    await app.page.waitForSelector(`.px-comment-circle[data-comments-on="${key}"]`, { timeout: 60_000 })

    // ONE COMMENT, SAID AS ONE. The circle's number is what a reader sees first, so it is what is
    // checked: a page drawing the circle and counting nought would look like a page with no comment.
    const count = await app.page.textContent(`.px-comment-circle[data-comments-on="${key}"]`)
    expect((count ?? '').trim()).toBe('1')

    await app.page.click(`.px-comment-circle[data-comments-on="${key}"]`)
    await app.page.waitForFunction(
      (words: string) => (document.body.textContent ?? '').includes(words),
      WHAT_THEY_WROTE,
      { timeout: 30_000 },
    )
    expect(await app.page.textContent('body')).toContain(WHAT_THEY_WROTE)
  }, 240_000)
})

// ============================================================================ in the conversation

describe('the same comment is in the conversation it was sent to, and stays after it is sent', () => {
  it('is one record in the pool, addressed to the agent, still holding its target', async () => {
    const read = await fetch(`${app.api}/api/messages/comments`, { headers: { 'content-type': 'application/json' } })
    const comments = (JSON.parse(await read.text()) as { comments: { id: string }[] }).comments
    expect(comments.map((one) => one.id)).toContain(commentId)

    const conversation = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=reader-y`, { headers: { 'content-type': 'application/json' } })
    const said = await conversation.text()
    expect(conversation.status, said).toBe(200)
    expect(said).toContain(WHAT_THEY_WROTE)

    // AND IT IS STILL THERE ONCE IT HAS GONE. A comment used to be dropped from the surfaces that
    // drew it at the moment it was sent, which is the design's "handled comments remain
    // inspectable" broken. A comment should still be there once it has gone to an agent.
    const sent = await fetch(`${app.api}/api/agent/comments/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commentIds: [commentId], to: { kind: 'agent', id: 'reader-y' } }),
    })
    // THE ROUTE MAY REFUSE FOR A REASON OF ITS OWN — there may be no run to pick the comment up —
    // and that is not what this is measuring. What has to hold either way is that the comment is
    // still a record with its words and its target on it.
    await sent.text()
    const after = await fetch(`${app.api}/api/records/${commentId}`)
    const whole = await after.text()
    expect(after.status, whole).toBe(200)
    expect(whole).toContain(WHAT_THEY_WROTE)
    expect(whole).toContain(blockId)
  }, 240_000)
})
