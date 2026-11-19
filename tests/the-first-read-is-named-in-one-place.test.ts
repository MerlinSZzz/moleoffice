// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST READ AFTER A RESTART IS NAMED IN ONE PLACE, AND THE READ THE HOOK SENDS AN AGENT TO
 * POINTS AT IT. Problem `NSOa-cFZLg66`.
 *
 * Three hand-written places each said they were the first thing to read, and they disagreed about
 * which round the project was in, with nothing failing. `THE_FIRST_READ` in src/shared/onboarding.ts
 * now names `GET /api/project/bootstrap` once. This file fails when CLAUDE.md starts an agent
 * somewhere else, when the onboarding read stops pointing at it, or when the route it names is not
 * served.
 *
 * CLAUDE.md is read as an agent is given it: its user part, src/config/rules/USER.md, put in at the
 * reference line by `withTheUserPart`. The line that names the first read
 * lives in that part, and it must be there exactly once.
 *
 * WHAT IS REAL HERE. The server, its route table and the checkout's own CLAUDE.md and USER.md.
 * Nothing is a fixture except the empty database.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ONBOARDING_DOORS, THE_FIRST_READ } from '@shared/onboarding.ts'
import { withTheUserPart } from '../src/worker/rules.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let t: TestDb
let app: FastifyInstance
let routes: Set<string>

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = new Set(built.listApiRoutes().map((route) => `${route.method} ${route.path}`))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the first read after a restart', () => {
  it('is a route the server serves, and one of the onboarding doors', () => {
    expect(routes.has(THE_FIRST_READ.ask), `${THE_FIRST_READ.ask} is not in the route table`).toBe(true)
    expect(ONBOARDING_DOORS).toContain(THE_FIRST_READ.ask)
  })

  it('is where CLAUDE.md tells an agent to start', () => {
    const claude = withTheUserPart(readFileSync(fileURLToPath(new URL('../CLAUDE.md', import.meta.url)), 'utf8'), REPO)
    const line = '**Start with `' + THE_FIRST_READ.ask + '`.**'
    expect(claude.split(line).length - 1, `CLAUDE.md with its user part names the first read ${claude.split(line).length - 1} times`).toBe(1)
  })

  it('is named by the onboarding read, which is the read the session hook sends an agent to next', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    const body = res.json() as { whereTheProjectIsNow?: { ask?: string; says?: string } }
    expect(body.whereTheProjectIsNow).toEqual(THE_FIRST_READ)
  })

  it('answers when asked', async () => {
    const path = THE_FIRST_READ.ask.replace(/^GET /, '')
    const res = await app.inject({ method: 'GET', url: path, headers: { 'x-mole-office-workspace': 'default' } })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  })
})
