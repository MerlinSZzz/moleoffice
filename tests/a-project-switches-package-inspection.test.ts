// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { aJudgedPoint } from '../src/shared/the-verdict-door.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { packageInspectionOf } from '../src/shared/workspaces.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const FIRST = 'made-up-first-project'
const SECOND = 'made-up-second-project'
let db: TestDb
let app: FastifyInstance
const person = (project: string) => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': project })
const path = (project: string) => `/api/workspaces/${project}`
async function read(project: string) {
  const reply = await app.inject({ method: 'GET', url: '/api/workspaces', headers: person(project) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().workspaces.find((one: { id: string }) => one.id === project)
}
async function set(project: string, enabled: boolean) {
  const reply = await app.inject({ method: 'PATCH', url: path(project), headers: person(project), payload: { packageInspection: enabled } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json()
}
beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const id of [FIRST, SECOND]) {
    const reply = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title: 'A made-up project' } })
    expect(reply.statusCode, reply.body).toBe(201)
  }
}, 60_000)
afterAll(async () => { await app.close(); db.close() })

it('starts unset projects with package inspection off and stores the choice per project', async () => {
  expect((await read(FIRST)).packageInspection).toBe(false)
  expect((await read(SECOND)).packageInspection).toBe(false)
  expect((await set(FIRST, true)).packageInspection).toBe(true)
  expect((await read(FIRST)).packageInspection).toBe(true)
  expect((await read(SECOND)).packageInspection).toBe(false)
  expect((await set(FIRST, false)).packageInspection).toBe(false)
  expect((await read(FIRST)).packageInspection).toBe(false)
}, 60_000)

it('keeps inspection on for a project whose existing row has no choice', async () => {
  db.client.sqlite.prepare('UPDATE workspaces SET package_inspection = NULL WHERE id = ?').run(FIRST)
  expect(packageInspectionOf((await read(FIRST)).packageInspection)).toBe(true)
})

it('requires one of the five judgments and the rules answer in a new verdict', () => {
  const base = { pointId: 'made-up-point', holds: false, why: 'Made-up evidence.', rulesKept: true }
  for (const judged of ['done', 'off_target', 'narrower', 'more_than_asked', 'unfinished']) {
    expect(aJudgedPoint.safeParse({ ...base, judged }).success, judged).toBe(true)
  }
  const { rulesKept: _rulesKept, ...withoutRules } = base
  expect(aJudgedPoint.safeParse({ ...withoutRules, judged: 'done' }).success).toBe(false)
  expect(aJudgedPoint.safeParse({ ...base, judged: 'part' }).success).toBe(false)
})
