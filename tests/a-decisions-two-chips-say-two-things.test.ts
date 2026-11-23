// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION'S OWN PAGE SAYS TWO THINGS WITH ITS TWO CHIPS, IN CHINESE TOO. Wave 13k round 35.
 *
 * The secretary's addition to round 34 (message od5YvAL0IBhM), from wave 13r's round 11b pictures: on a decision's
 * page in Chinese, the kind chip and the family chip at the top both read 决定, where English has "decision"
 * and "Decisions". The kind chip says what this record is; the family chip says which list it is read in,
 * and that list holds proposals as well as decisions (KIND_FAMILIES in src/shared/work.ts). So the family
 * is 提议与决定 in Chinese, in the form the other family words take (报告与笔记, 模块与流水线).
 *
 * MADE-UP RECORDS: one decision, filed as the test office's person.
 *
 * PICTURES: only when TEST_SHOTS names a folder, at 1440, 990, 660 and 390, light and dark, English and Chinese.
 *
 * MUTATION, proved on 4 October 2026 after a control run (2 passed): src/shared/words/zh.ts with the family
 * word 决定 again. Case 1 goes red, the two chips reading 决定 and 决定. Restored green (2 passed).
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, waitForThePage, governsTheWholeProject } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'

const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('decision-chips')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let decisionId = ''

async function open(lang: string, width: number, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#${recordPath(decisionId)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.rp-kindline .px-family').waitFor({ timeout: 30_000 })
}


beforeAll(async () => {
  app = await liveApp({ name: 'decision-chips', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE PAGE TAKES ITS LOOK FROM THE ADDRESS'S look, which the office itself does not read: it keeps the theme in
  // local storage. Without this every dark picture was the light one.
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'decision', title: 'Fire the second kiln on Saturdays', data: {
      ...governsTheWholeProject(), replaces: [] } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  decisionId = ((await filed.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe("a decision's own page", () => {

  it('2. photographs the page at four widths', async () => {
    if (!KEEP) return
    for (const lang of ['en', 'zh']) {
      for (const look of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          await open(lang, width, look)
          await app.page.screenshot({ path: join(SHOTS, `decision-${lang}-${width}-${look}.png`), fullPage: true })
        }
      }
    }
  }, 900_000)
})
