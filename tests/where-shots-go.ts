// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A TEST'S PICTURES GO: A FOLDER OF ITS OWN, OR THE FOLDER `TEST_SHOTS` NAMES.
 *
 * Problem 4G3nLvf60ydX. This file used to answer the handback folder under the home the run started
 * with, so four browser tests rewrote that shared folder on every run. The rule is that a test that
 * takes pictures writes them only into its own temporary folder, or into a folder an environment
 * variable names. So without `TEST_SHOTS` each call makes a fresh folder under `os.tmpdir()`, and
 * with it the pictures go into a folder under the one it names, for somebody who wants to keep them.
 *
 * ONE PLACE, ONE RULE. The four callers ask this function rather than each working a folder out;
 * four copies of one path is the drift USER.md invariant 9 is about.
 *
 * `TEST_SHOTS` CARRIES NO `MOLE_OFFICE_` PREFIX ON PURPOSE. Every name beginning with `MOLE_OFFICE_`
 * is a setting of the product, read only in `src/config/settings.mjs`; this one is read by tests only.
 *
 * THE FRESH FOLDER IS GONE AFTER THE FILE'S TESTS (check dwwpG2NYGqFR, precedent ToxCUBqVhdPI).
 * Each call made a folder at load and nothing deleted it, so every run left picture folders behind,
 * and a skipped file left one too. Now the path is answered unmade: every caller takes its pictures
 * with Playwright's `screenshot({ path })`, which makes the folder it writes into, so a file whose
 * tests are skipped makes none. The call registers the file's `afterAll`, which deletes the folder.
 * So `testShots()` is called at a test file's top level, where the four callers call it, and never
 * inside a test. A folder `TEST_SHOTS` names is made at once and kept, because keeping it is the
 * reason to name it.
 *
 * tests/no-test-writes-into-the-owners-home.test.ts holds all of this, and that no test file names
 * the handback folder.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'
import type { Page } from 'playwright'

/** The environment variable that names a folder to keep the pictures in. */
export const TEST_SHOTS = 'TEST_SHOTS'

/**
 * The folder for one test's pictures: under `TEST_SHOTS`, made and kept; otherwise a fresh path under
 * the temporary folder, not yet made, deleted after the calling file's tests.
 *
 * `name` is that test's own name for its pictures: `graph-nested`, `graph-box`, `ui-names` and
 * `chat-notice-banner`. It is the folder's last name under `TEST_SHOTS`, and the start of the fresh
 * folder's name under the temporary folder, so a person can tell which test made it.
 */
export function testShots(name: string): string {
  const named = process.env[TEST_SHOTS]
  if (named !== undefined && named !== '') {
    const dir = join(named, name)
    mkdirSync(dir, { recursive: true })
    return dir
  }
  const dir = join(tmpdir(), `${name}-${randomBytes(6).toString('hex')}`)
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

/**
 * PHOTOGRAPH ONE PART OF A PAGE WITH NOTHING DRAWN OVER IT. Round 31b of wave 13k.
 *
 * An element's own picture (`locator.screenshot`) scrolls the element into view, and on a narrow window the
 * page's top bar ("Menu / Home") stays where it is and is drawn over the element's top: round 31's pictures of
 * Home's agent column showed the bar over the column's heading and first group. So the page is put back at its
 * top and the picture is the whole page cut to the element's box, where the bar is above it and not on it.
 */
export async function photographWithNothingOver(page: Page, selector: string, path: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0))
  const box = await page.locator(selector).first().evaluate((element) => {
    const at = element.getBoundingClientRect()
    return { x: at.x + window.scrollX, y: at.y + window.scrollY, width: at.width, height: at.height }
  })
  await page.screenshot({ path, fullPage: true, clip: box })
}
