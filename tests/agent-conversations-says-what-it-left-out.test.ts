// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AGENT CONVERSATIONS SAYS WHAT ITS WORK LIST LEFT OUT, AND NEVER THAT A PROJECT HOLDS NO RECORDS WHEN IT DOES.
 *
 * Problem iAoIUjk2YwBh, found by the check of wave 13k's round 15 (Yh04uU1djtGd): the redesigned page
 * leaves agent runs, tools and tool groups out of its list of work, and a project holding only those
 * was told "This project holds no records yet", which is false (USER.md invariant 5). The page now
 * says under the list what it left out and how many, in both languages and both modes, and an empty
 * list says the project holds no work yet, only those.
 *
 * The list the page draws is answered by this test: `workToTalkAbout` (src/shared/talksources.ts), the
 * function the server's door works it out with, over made-up records shaped like a real row of that
 * door, so each case holds exactly the kinds it names. MUTATION: take the left-out line out of TalkSources
 * and let the empty list fall back to g6a.agents.emptyWorkReason; every case goes red. MUTATION: take
 * flow_run back out of NON_WORK_RECORD_KINDS; the two flow-run cases go red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { workToTalkAbout } from '../src/shared/talksources.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
/** One row as the work door answers it, taken from a real reply so the made-up ones have its shape. */
let template: Record<string, unknown>
/** The records the work door works its answer out from in the case being drawn. */
let answering: Array<{ kind: string; title: string }> = []

beforeAll(async () => {
  app = await liveApp({ name: 'agents-left-out', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ kind: 'task', title: 'Made-up shape for the list', data: { state: 'todo' } }),
  })
  expect(filed.ok, await filed.clone().text()).toBe(true)
  const listed = (await (await fetch(`${app.api}/api/records/work-to-talk-about?q=Made-up%20shape`, { headers: OWNER })).json()) as { rows: Record<string, unknown>[] }
  template = listed.rows.find((one) => one['title'] === 'Made-up shape for the list')!
  expect(template, 'the work door answered no record to copy the shape of').toBeTruthy()
  await app.page.route('**/api/records/work-to-talk-about*', async (route) => {
    const response = await route.fetch()
    const records = answering.map((one, n) => ({
      ...template,
      id: `left-out-${one.kind}-${String(n)}`,
      kind: one.kind,
      title: one.title,
      updatedAt: `2026-09-29 0${String(n)}:00:00`,
    }))
    await route.fulfill({ response, json: workToTalkAbout(records, '') })
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const CASES = [
  {
    name: 'a project with only agent runs',
    records: [
      { kind: 'session', title: 'Made-up run one' },
      { kind: 'session', title: 'Made-up run two' },
    ],
    what: (t: ReturnType<typeof createI18n>['t']) => t('agentsPage.leftOut.runs', { n: 2 }),
  },
  {
    name: 'a project with only tools',
    records: [
      { kind: 'tool', title: 'Made-up tool' },
      { kind: 'tool_category', title: 'Made-up tool group' },
    ],
    what: (t: ReturnType<typeof createI18n>['t']) =>
      t('agentsPage.leftOut.two', { a: t('agentsPage.leftOut.tools', { n: 1 }), b: t('agentsPage.leftOut.toolGroups', { n: 1 }) }),
  },
  {
    // Since wave 13p round 25 the office files a flow run beside every run. It is the office's account
    // of the run's steps, not work, so it is left out and counted as the runs are.
    name: 'a project with agent runs and their flow runs',
    records: [
      { kind: 'session', title: 'Made-up run one' },
      { kind: 'session', title: 'Made-up run two' },
      { kind: 'flow_run', title: 'Flow run' },
      { kind: 'flow_run', title: 'Flow run' },
    ],
    what: (t: ReturnType<typeof createI18n>['t']) =>
      t('agentsPage.leftOut.two', { a: t('agentsPage.leftOut.runs', { n: 2 }), b: t('agentsPage.leftOut.flowRuns', { n: 2 }) }),
  },
  {
    name: 'a project with one of each kind left out',
    records: [
      { kind: 'session', title: 'Made-up run one' },
      { kind: 'flow_run', title: 'Flow run' },
      { kind: 'tool', title: 'Made-up tool' },
      { kind: 'tool_category', title: 'Made-up tool group' },
    ],
    what: (t: ReturnType<typeof createI18n>['t']) =>
      t('agentsPage.leftOut.four', {
        a: t('agentsPage.leftOut.runs', { n: 1 }),
        b: t('agentsPage.leftOut.flowRuns', { n: 1 }),
        c: t('agentsPage.leftOut.tools', { n: 1 }),
        d: t('agentsPage.leftOut.toolGroups', { n: 1 }),
      }),
  },
]

for (const one of CASES) {
  it(`${one.name}: never reads "holds no records yet", and says what was left out, in both languages and both modes`, async () => {
    answering = one.records
    // TWO VIEWS COVER BOTH LANGUAGES AND BOTH MODES: English in normal mode, Chinese in the other.
    for (const { language, mode } of [
      { language: 'en', mode: 'normal' },
      { language: 'zh', mode: 'inspect' },
    ] as const) {
      const { t } = createI18n(language)
      const noRecords = t('g6a.agents.emptyWorkReason')
      const what = one.what(t)
      await app.page.goto(`${app.site}/?lang=${language}&mode=${mode}#${pathFor('agents')}`, { waitUntil: 'domcontentloaded' })
      await app.page.reload()
      await waitForThePage(app.page)
      const line = app.page.locator('.px-ac-left-out')
      await line.waitFor({ state: 'visible', timeout: 30_000 })
      const at = `${one.name}, ${language}, ${mode}`
      expect((await line.innerText()).trim(), `${at}: the left-out line`).toBe(t('agentsPage.leftOut.line', { what }))
      // Nowhere on the page, in its words or in a reason on hover.
      const said = await app.page.evaluate(() => [
        document.body.innerText,
        ...[...document.querySelectorAll('[title]')].map((element) => element.getAttribute('title') ?? ''),
      ].join('\n'))
      expect(said, `${at}: said the project holds no records`).not.toContain(noRecords)
      // The empty list's reason says what the project does hold.
      const titles = await app.page.locator('#main [title]').evaluateAll((elements) => elements.map((element) => element.getAttribute('title') ?? ''))
      expect(titles, `${at}: the empty list's reason`).toContain(t('agentsPage.leftOut.onlyThese', { what }))
    }
  }, 180_000)
}
