// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OLD WORK AREA KEEPS WORKING, AND ITS PAGE SAYS SO — THE RULING THAT NARROWS P92 AND P93.
 *
 * The secretary's ruling of 12 September 2026: the door refuses registrations and widenings made
 * after it, and the 57 areas already stored are left exactly as they are and never refused after
 * the fact. A widening of an old area re-validates the whole area, so an old area moves to the new
 * grain the next time somebody touches it. THIS IS THE TEST THE WHOLE PIECE TURNS ON: it is what
 * stops a rule from breaking the office it governs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · an agent whose area was stored before the rule — a file, which the new grain refuses — can
 *     still start work: the door does not re-judge a stored area;
 *   · its citizen's page says the area predates the rule, with the ruling's date;
 *   · an area the new door widened says who registered it and does NOT carry the predates sentence.
 *
 * The browser is here for the page's own half and for the handback pictures, at 1440 and 390 in both
 * themes (P92_RULE_SHOTS names the directory; nothing is photographed when it is unset).
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · judge a stored area by the new grain in the P93 gate in src/server/lib/claims.ts (call
 *     `validateWorkArea` on `row.workArea`) → the first case goes red, because the old file is
 *     refused after the fact.
 *   · drop the `.prof-work-area-before-rule` block from src/web/pages/ProfilePage.tsx → the second
 *     case goes red, because the page no longer says the area predates the rule.
 *
 * Both source files were restored byte-identical after each mutation (sha256 before and after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: LiveApp
let oldRun = ''
let dbCopy = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function ask(
  path: string,
  body: unknown,
  headers: Record<string, string> = AS_THE_PERSON,
  method = 'POST',
): Promise<{ status: number; said: Record<string, unknown> }> {
  const response = await fetch(app.api + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, said: (await response.json()) as Record<string, unknown> }
}

/** The page's own half, at the two widths the handback asked for, in both themes. */
async function photograph(name: string): Promise<void> {
  const dir = process.env['P92_RULE_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.screenshot({ path: `${dir}/work-area-${name}-${width}-${theme}.png`, fullPage: true })
    }
  }
}

beforeAll(async () => {
  t = await freshDb()
  // AN OLD AREA, written straight into the registry as the office stored the 57 areas it already
  // holds: a file, which the new grain refuses. Its `created_at` is moved back before the rule, the
  // way P88's own pre-rule row is.
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'An area from before the rule',
    data: {
      handle: 'p92-old-area',
      runtime: 'claude-code',
      state: 'active',
      workArea: ['src/old/thing.ts'],
      startedBy: { kind: 'person', id: THE_PERSON },
    },
    actor: { type: 'human', id: THE_PERSON },
  })
  t.client.sqlite
    .prepare('UPDATE agents SET created_at = ? WHERE handle = ?')
    .run('2026-09-11 10:00:00', 'p92-old-area')
  oldRun = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The old agent’s run',
    actor: { type: 'agent', id: 'p92-old-area' },
    data: { state: 'running', runtime: 'claude-code' },
  }).id

  // A COPY FOR THE BROWSER STACK TO SERVE, because `liveApp` runs the server in its own process and
  // cannot see this one's database handle. `VACUUM INTO` is used rather than a file copy, because the
  // committed rows may still be in the write-ahead log and a copy of the database file alone would
  // silently lose them. The copy is the caller's to remove.
  dbCopy = join(mkdtempSync(join(tmpdir(), 'mole-office-p92-rule-')), 'panelx.db')
  t.client.sqlite.exec(`VACUUM INTO '${dbCopy}'`)
  t.close()

  app = await liveApp({ name: 'p92-rule', viewport: { width: 1440, height: 900 }, database: dbCopy })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (dbCopy !== '') rmSync(dirname(dbCopy), { recursive: true, force: true })
})

describe('an area stored before the rule', () => {
  it('keeps working: the agent can start work and the door never re-judges the stored area', async () => {
    const task = await ask('/api/records', {
      kind: 'task',
      title: 'Work started on the old area',
      data: {},
    })
    expect(task.status, JSON.stringify(task.said)).toBe(201)
    const taskId = (task.said['record'] as { id: string }).id

    const filed = await ask('/api/claims', { run: oldRun, things: [{ what: 'record', id: taskId }] }, asAgent('p92-old-area'))
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
  })

  it('says on its citizen’s page that the area predates the rule, with the date', async () => {
    const profile = await ask('/api/participants/agent/p92-old-area/profile', undefined, AS_THE_PERSON, 'GET')
    expect(profile.status, JSON.stringify(profile.said)).toBe(200)
    const sentence = profile.said['workAreaBeforeTheRule']
    expect(sentence, 'the reply carries the predates sentence').not.toBeNull()
    expect(String(sentence)).toContain('before the rule')
    expect(String(sentence)).toContain('12 September 2026')
    expect(String(sentence)).toContain('2026-09-11')

    await app.page.goto(`${app.site}/?mode=inspect#/who/agent/p92-old-area`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const block = await app.page.$('.prof-work-area-before-rule')
    expect(block, 'the page draws the predates sentence').not.toBeNull()
    expect((await block!.textContent()) ?? '').toContain('12 September 2026')
    await photograph('before-the-rule')
  }, 120_000)
})

describe('an area the new door wrote', () => {
  it('records who registered it and does not carry the predates sentence', async () => {
    const made = await ask('/api/agents/started', {
      handle: 'p92-widened',
      name: 'An area the door widened',
      runtime: 'claude-code',
      workArea: ['src/web'],
    })
    expect(made.status, JSON.stringify(made.said)).toBe(201)
    const changed = await ask('/api/participants/agent/p92-widened/work-area', {
      workArea: ['src/web', 'tests'],
      because: 'The owner registered the new scope.',
    })
    expect(changed.status, JSON.stringify(changed.said)).toBe(200)

    await app.page.goto(`${app.site}/?mode=inspect#/who/agent/p92-widened`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const says = await app.page.$('.prof-work-area-says')
    expect(says, 'the page draws who registered the area').not.toBeNull()
    expect((await says!.textContent()) ?? '').toContain('registered by the owner')
    // AND NOT THE PREDATES SENTENCE: the new door judged this area, so the rule governs it.
    expect(await app.page.$('.prof-work-area-before-rule')).toBeNull()
    await photograph('widened-with-the-grant')
  }, 120_000)
})
