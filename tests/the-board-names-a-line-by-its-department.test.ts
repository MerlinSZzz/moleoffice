// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOARD NAMES A LINE BY ITS DEPARTMENT. Wave 13s round 281, step 1 of departments and posts: the board's view by
 * line shows each code through the department that code names, by the department's name and its level word. A code no
 * department holds is shown as before and marked as not filed as a department. Packages still store codes, and
 * `theLineOfAHandle` still reads a line from a handle.
 *
 * WHAT IS PROVED, in a test office with one made-up department and one made-up package:
 *   1. The board door gives the line of a code a department holds that department, by id, by both names and by its
 *      level. The line of a code no department holds says it is not held, and the line not recorded names none.
 *   2. The page titles the first line by the department's name in the reader's language and its level word, in
 *      English and in Chinese. The second keeps today's title and adds the mark that it is not filed as a department.
 *      The line not recorded keeps its title.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BoardLine, ProjectBoard } from '../src/shared/project-board.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const HELD = 'made-up-held-code'
const NOT_HELD = 'made-up-code-no-department-holds'
const NAME = { en: 'Made-up queue', zh: '虚构的排队' }

let t0: TestDb
let app: FastifyInstance
let department = ''
let board: ProjectBoard
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The line of the board that names this code, or the line not recorded for null. */
function theLine(line: string | null): BoardLine {
  const found = board.lines.find((one) => one.line === line)
  if (found === undefined) throw new Error(`The board has no line ${String(line)}.`)
  return found
}

beforeAll(async () => {
  t0 = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  const filed = await app.inject({
    method: 'POST',
    url: '/api/departments',
    headers: PERSON,
    payload: { codes: [HELD], nameEn: NAME.en, nameZh: NAME.zh, state: 'running' },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  department = String((filed.json() as { department: { id: string } }).department.id)
  t0.api.createRecord({
    kind: 'task',
    title: 'A made-up package for two codes',
    workspaceId: 'default',
    origin: 'fixture',
    actor: t0.api.HUMAN,
    data: {
      state: 'todo',
      package: {
        moduleIds: [],
        pointIds: [],
        lines: [HELD, NOT_HELD],
        bundleId: 'madeUpBundle',
        forTheOutside: 'Made-up: nothing leaves.',
        acceptance: 'Made-up: nothing is judged.',
        at: '2026-11-20 12:00:00',
        by: { actorType: 'human', actorId: t0.api.HUMAN.id },
      },
    },
  })
  // A MADE-UP RUN WHOSE HANDLE GIVES NO LINE, so the board has the line not recorded.
  const run = t0.api.createRecord({
    kind: 'session',
    title: 'A made-up run with no line',
    workspaceId: 'default',
    origin: 'fixture',
    actor: t0.api.HUMAN,
    data: { state: 'running', servingAgent: 'made-up-agent-of-no-line' },
  })
  t0.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES ('made-up-call', ?, 'GET', 200, 1, 'agent', 'made-up-agent-of-no-line', ?, 'default', 'none')",
    )
    .run(Date.now() - 60_000, run.id)
  const read = await app.inject({ method: 'GET', url: '/api/projects/default/board', headers: PERSON })
  expect(read.statusCode, read.body.slice(0, 400)).toBe(200)
  board = read.json() as ProjectBoard
}, 60_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t0?.close()
})

describe('the board names a line by its department', () => {
  it('1: the board door gives a held code its department, and says a code no department holds is not held', () => {
    expect(theLine(HELD).department).toEqual({ state: 'held', id: department, name: NAME, level: 'team', teams: null })
    expect(theLine(NOT_HELD).department).toEqual({ state: 'not-held' })
    expect(theLine(null).department).toBeNull()
    expect(theLine(HELD).next.map((one) => one.title)).toEqual(['A made-up package for two codes'])
  })

  it('2: the page titles a held line by the department’s name and level word, and marks a line no department holds', async () => {
    const { theTitleOfALine } = await import('../src/web/pages/ProjectBoardPage.tsx')
    const { theLevelWord } = await import('../src/shared/departments.ts')
    for (const language of ['en', 'zh'] as const) {
      setWordLanguage(language)
      const held = theTitleOfALine(theLine(HELD))
      expect(held, language).toContain(NAME[language])
      expect(held, language).toContain(t(theLevelWord('team')))
      expect(held, language).not.toContain(t('board.line.named', { line: HELD }))
      const notHeld = theTitleOfALine(theLine(NOT_HELD))
      expect(notHeld, language).toContain(t('board.line.named', { line: NOT_HELD }))
      expect(notHeld, language).toContain(t('board.line.notFiled'))
      expect(theTitleOfALine(theLine(null)), language).toBe(t('board.line.notRecorded'))
    }
    setWordLanguage('en')
  })
})
