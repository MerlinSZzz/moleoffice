// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PICTURE TEST SWITCHES PROJECT AT EVERY WIDTH IT PHOTOGRAPHS.
 *
 * From the shell's width in src/web/lib/the-shell-width.ts up, the sidebar stands beside the page and
 * its Switch press is in sight. Below that width the sidebar is a drawer, and the menu press opens it.
 * A switch of project does not change the page, so the drawer stays open after the choice. So at a
 * narrow width this opens the drawer, chooses, and closes the drawer with Escape, as a person with a
 * keyboard does. The choice itself is tests/switch-the-project.ts's.
 */
import type { Page } from 'playwright'
import { switchTheProject } from './switch-the-project.ts'

/** Choose the project with this id at any width, and leave the page in sight. */
export async function switchTheProjectAtAnyWidth(page: Page, id: string): Promise<void> {
  const menu = page.locator('.shell-menu')
  const aDrawer = (await menu.count()) > 0 && (await menu.first().isVisible())
  if (aDrawer) {
    await menu.first().click()
    await page.locator('#shell-side[data-drawer="open"]').waitFor({ state: 'attached', timeout: 10_000 })
  }
  await switchTheProject(page, id)
  if (aDrawer) {
    await page.keyboard.press('Escape')
    await page.locator('#shell-side[data-drawer="closed"]').waitFor({ state: 'attached', timeout: 10_000 })
  }
}
