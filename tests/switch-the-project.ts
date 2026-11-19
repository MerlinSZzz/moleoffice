// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A BROWSER TEST CHOOSES THE PROJECT, now that the sidebar's project block has a Switch press and a
 * list that opens downward inside the block, where a select box stood before.
 *
 * One place, so the tests that change project all press what a person presses.
 */
import type { Page } from 'playwright'

/** Wait until the project block has the list of projects to offer. */
export async function waitForTheProjects(page: Page, timeout = 30_000): Promise<void> {
  await page.locator('.sbp-block[data-projects="ready"]').waitFor({ state: 'attached', timeout })
}

/** Open the Switch list and choose the project with this id. The list closes on the choice. */
export async function switchTheProject(page: Page, id: string): Promise<void> {
  await waitForTheProjects(page)
  if ((await page.locator('.sbp-switch').getAttribute('aria-expanded')) !== 'true') await page.locator('.sbp-switch').click()
  await page.locator(`.sbp-choice[data-project="${id}"]`).click()
}

/** The name the project block draws for the project being read. */
export async function theProjectOnScreen(page: Page): Promise<string | null> {
  return page.locator('.sbp-name').textContent()
}

/** The id of the project being read, as the project block carries it. */
export async function theProjectIdOnScreen(page: Page): Promise<string | null> {
  return page.locator('.sbp-block').getAttribute('data-project')
}
