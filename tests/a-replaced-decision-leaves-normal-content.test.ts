// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
let PROJECT = 'default'
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

/** The office is made once for the file. Each case gets its own project, so its readings are its own. */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `replaced-case-${String(caseNumber)}`
  AS_THE_PERSON['x-mole-office-workspace'] = PROJECT
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: PROJECT, title: `Replaced decision case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: object): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await app.inject({ method: 'POST', url, headers: AS_THE_PERSON, payload })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as Record<string, any> }
}

async function get(url: string): Promise<Record<string, any>> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return JSON.parse(reply.body) as Record<string, any>
}

/** A module to decide things about. */
async function aSubject(title = 'Test: the sidebar'): Promise<string> {
  const made = await post('/api/records', { kind: 'module', title, data: { context: 'a made-up module' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body['record'].id as string
}

/** A decision the person writes about a subject, saying what it replaces. */
async function aDecision(title: string, subject: string, replaces: string[] = []): Promise<string> {
  const made = await post('/api/records', {
    kind: 'decision',
    title,
    data: { option_taken: `Test: ${title}`, because: 'A made-up reason.', replaces },
    links: [{ type: 'about', toId: subject }],
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body['record'].id as string
}

describe('a replaced decision leaves normal content by itself', () => {
  it('1: a decision that does not say what it replaces is refused, naming the field and the candidate', async () => {
    const subject = await aSubject()
    const earlier = await aDecision('Test: the foot holds only Settings', subject)
    const refused = await post('/api/records', {
      kind: 'decision',
      title: 'Test: the foot holds a light or dark switch',
      data: { option_taken: 'Test: a switch at the foot', because: 'A made-up reason.' },
      links: [{ type: 'about', toId: subject }],
    })
    expect(refused.status).toBe(400)
    expect(String(refused.body['error'])).toContain('data.replaces')
    expect(String(refused.body['error'])).toContain(earlier)
    expect(String(refused.body['error'])).toContain('Nothing was written.')
  })

  it('2: a named replacement is linked, and the old one leaves every normal reading but its own record', async () => {
    // THE FORK DESK AND THE NEEDS-YOU LIST ANSWER FOR THE WHOLE OFFICE, so each reading is taken at
    // the start of the case and what this case added is what moved.
    const forksBefore = await get('/api/forks')
    const decisionsBefore = new Set((forksBefore['decisions'] as { recordId: string }[]).map((one) => one.recordId))
    const replacedBefore = Number(forksBefore['decisionsReplaced'])
    const needsYouBefore = await get('/api/needs-you')
    const needsReplacedBefore = Number(needsYouBefore['decisionsReplaced'])

    const subject = await aSubject()
    const earlier = await aDecision('Test: the foot holds only Settings', subject)
    const later = await aDecision('Test: the foot holds a light or dark switch', subject, [earlier])

    const link = t.client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM links WHERE from_id = ? AND to_id = ? AND type = 'supersedes'")
      .get(later, earlier) as { n: number }
    expect(link.n).toBe(1)

    const forks = await get('/api/forks')
    const added = (forks['decisions'] as { recordId: string }[])
      .map((one) => one.recordId)
      .filter((id) => !decisionsBefore.has(id))
    expect(added).toEqual([later])
    expect(forks['decisionsReplaced']).toBe(replacedBefore + 1)
    const needsYou = await get('/api/needs-you')
    expect((needsYou['decisions'] as { recordId: string }[]).map((one) => one.recordId)).not.toContain(earlier)
    expect(needsYou['decisionsReplaced']).toBe(needsReplacedBefore + 1)

    const brief = await get('/api/brief')
    expect(JSON.stringify(brief['decisions'])).toContain(later)
    expect(JSON.stringify(brief['decisions'])).not.toContain(earlier)

    const list = await get('/api/records?kind=decision&shape=full')
    expect((list['records'] as { id: string }[]).map((one) => one.id)).toEqual([later])
    expect(list['replacedLeftOut']).toBe(1)
    const archive = await get('/api/records?kind=decision&replaced=include&shape=full')
    const kept = (archive['records'] as { id: string; replacedBy?: { id: string } | null }[]).find((one) => one.id === earlier)
    expect(kept?.replacedBy?.id).toBe(later)

    const about = await get(`/api/records/${subject}/context`)
    expect((about['decisionsAboutThis']['decisions'] as { id: string }[]).map((one) => one.id)).toEqual([later])
    expect(String(about['decisionsAboutThis']['note'])).toContain('replaced by a later decision')

    const search = await get(`/api/search?q=${encodeURIComponent('the foot holds')}`)
    const found = (search['results'] ?? search['records']) as { record?: { id: string }; id?: string }[]
    expect(found.map((one) => one.record?.id ?? one.id)).toEqual([later])
    expect(String(search['note'])).toContain('replaced')

    const own = await get(`/api/records/${earlier}`)
    expect(own['record']['id']).toBe(earlier)
    expect(own['replacedBy']).toEqual({ id: later, title: 'Test: the foot holds a light or dark switch' })
    expect((await get(`/api/records/${later}`))['replacedBy']).toBeNull()
  })

  it('3: naming a decision already replaced, or a record that is not a decision, is refused', async () => {
    const subject = await aSubject()
    const first = await aDecision('Test: first', subject)
    await aDecision('Test: second', subject, [first])
    const again = await post('/api/records', {
      kind: 'decision',
      title: 'Test: third',
      data: { option_taken: 'Test: third', because: 'A made-up reason.', replaces: [first] },
    })
    expect(again.status).toBe(409)
    expect(String(again.body['error'])).toContain('already replaced')
    const notADecision = await post('/api/records', {
      kind: 'decision',
      title: 'Test: fourth',
      data: { option_taken: 'Test: fourth', because: 'A made-up reason.', replaces: [subject] },
    })
    expect(notADecision.status).toBe(400)
    expect(String(notADecision.body['error'])).toContain('only a decision is replaced')
  })

  it('4: promoting asks too, and choosing again replaces the old decision by itself', async () => {
    const fork = await post('/api/records', {
      kind: 'proposal',
      title: 'Test: which colour at the foot',
      data: { question: 'Which?', options: ['Test: light', 'Test: dark'], recommendation: 'Test: light' },
    })
    expect(fork.status, JSON.stringify(fork.body)).toBe(201)
    const promoted = await post(`/api/records/${fork.body['record'].id}/promote`, { title: 'Test: light at the foot', data: { option_taken: 'Test: light', because: 'A made-up reason.' } })
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201)
    const decision = promoted.body['decision'] as { id: string; data: Record<string, unknown> }
    expect(decision.data['replaces']).toEqual([])
    expect(String(decision.data['why_it_replaces_none'])).toContain('no earlier decision')

    // A FORK ABOUT A SUBJECT AN EARLIER DECISION IS ABOUT: the press is refused, naming that decision.
    const subject = await aSubject('Test: the corner')
    const earlier = await aDecision('Test: the corner holds a name', subject)
    const second = await post('/api/records', {
      kind: 'proposal',
      title: 'Test: what else the corner holds',
      data: { question: 'What?', options: ['Test: a switch', 'Test: nothing'], recommendation: 'Test: a switch' },
      links: [{ type: 'about', toId: subject }],
    })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    const refused = await post(`/api/records/${second.body['record'].id}/promote`, { title: 'Test: a switch', data: { option_taken: 'Test: a switch', because: 'A made-up reason.' } })
    expect(refused.status).toBe(400)
    expect(String(refused.body['error'])).toContain(earlier)

    const chosen = await post(`/api/records/${decision.id}/choose-again`, { title: 'Test: dark at the foot', data: { option_taken: 'Test: dark', because: 'A made-up reason.' } })
    expect(chosen.status, JSON.stringify(chosen.body)).toBeLessThan(300)
    const newer = chosen.body['decision'] as { id: string; data: Record<string, unknown> }
    expect(newer.data['replaces']).toEqual([decision.id])
    const forks = await get('/api/forks')
    expect((forks['decisions'] as { recordId: string }[]).map((one) => one.recordId)).not.toContain(decision.id)
  })
})
