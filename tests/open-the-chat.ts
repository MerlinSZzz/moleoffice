// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPEN THE CHAT FROM A TEST, WHATEVER THE CORNER RULE IS.
 *
 * Design D draws the corner circle only while the chat is shut and a message waits, at 1024 px and wider. Older tests
 * pressed the circle to open the chat with no message waiting, so they would wait for a control that is deliberately
 * not drawn. This helper is the one way a test opens the chat: if the chat is already drawn it does nothing; otherwise
 * it uses the way the page in front of it offers — the bar's chat shape on a phone, the sidebar's Chat row when that
 * row is the button design D draws, and the corner circle when it is there.
 *
 * IT TELLS THE OLD ROW FROM THE NEW ONE BY WHAT IT IS, not by a version number: before design D the sidebar's Chat row
 * was a link to the chat page, and design D makes it a button that opens the chat. A link is never pressed here, so a
 * browser still on the old drawing waits for its circle and opens the panel the way that page always did.
 *
 * It is a test helper and nothing in src/ reads it. The call it replaces was `if (no .px-chat) click('.px-chat-circle')`
 * or the same two lines with a wait before them; no expectation changes with it.
 */
import type { Page } from 'playwright'

/** Whether the chat is drawn, in the corner, the split or on its own page. */
async function theChatIsOpen(page: Page): Promise<boolean> {
  return (await page.locator('.px-chat').count()) > 0
}

/** Wait until the chat is on screen, and say nothing about how it got there. */
async function waitForTheChat(page: Page): Promise<void> {
  await page.locator('.px-chat').first().waitFor({ state: 'attached', timeout: 30_000 })
}

/**
 * Open the chat the way the page offers it, without choosing the frame.
 *
 * A waiting message is not made up for this: the helper does not write a message to make the circle appear, because a
 * test that opens the chat is not a test about what waits. It uses the way the person has without a message. It says
 * whether it pressed an opener, which is false when the chat was open or the browser remembered it open.
 */
async function openTheChatAsItOpens(page: Page): Promise<boolean> {
  if (await theChatIsOpen(page)) return false
  // THE SHELL IS DRAWN BEFORE THE CHAT IS. Without this a page that has not rendered yet has no sidebar row and no
  // circle, and the helper would wait for a circle that design D does not draw.
  await page.locator('.shell-side, .px-chat').first().waitFor({ state: 'attached', timeout: 30_000 })

  // THE BROWSER REMEMBERED IT OPEN, SO IT IS OPENING BY ITSELF. Pressing an opener here would shut it again: after a
  // reload the stored answer is read before the panel is drawn, and the circle a reload draws for a moment is the
  // press that would close it. Waiting for the panel is the whole of what this case needs.
  const remembered = await page.evaluate(() => {
    try {
      return localStorage.getItem('mole-office.chat.open')
    } catch {
      return null
    }
  })
  if (remembered === 'yes' || remembered === 'split') {
    await waitForTheChat(page)
    return false
  }

  // THE PHONE'S BAR SHAPE, below 1024 px. It is attached only where the bar is drawn.
  const phone = page.locator('.shell-chat-phone')
  if ((await phone.count()) > 0 && (await phone.isVisible())) {
    await phone.click()
    await waitForTheChat(page)
    return true
  }

  // THE SIDEBAR'S CHAT ROW, WHEN IT IS DESIGN D'S BUTTON. An anchor is the old chat-page link and is left alone.
  const sidebar = page.locator('.shell-chat')
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible()) && (await sidebar.evaluate((one) => one.tagName === 'BUTTON'))) {
    await sidebar.click()
    await waitForTheChat(page)
    return true
  }

  // THE CORNER CIRCLE, which the old page always drew and design D draws while a message waits. Waiting for it is also
  // how this helper waits for the app to have read who is here.
  const circle = page.locator('.px-chat-circle')
  if ((await circle.count()) === 0) await circle.waitFor({ state: 'attached', timeout: 30_000 })
  await circle.click()
  await waitForTheChat(page)
  return true
}

/**
 * OPEN THE CHAT BESIDE THE PAGE, the frame design D opened from shut. The chat now opens the way the person last had it,
 * and the corner window when nothing is kept, so a chat that opened from shut in its window is put beside the page by
 * the window's own press. A browser that remembers the chat open is left as it opens.
 */
export async function openTheChatBeside(page: Page): Promise<void> {
  if (!(await openTheChatAsItOpens(page))) return
  if ((await page.locator('.px-chat[data-where="corner"]').count()) === 0) return
  await page.locator('.px-chat[data-where="corner"] .px-chat-beside').click()
  await page.locator('.px-chat[data-where="split"]').waitFor({ state: 'attached', timeout: 20_000 })
}

/**
 * OPEN THE CHAT IN THE CORNER WINDOW, which is the frame every test written before design D means by "the chat".
 *
 * The chat opens the way the person last had it, which a case may have made the split. The older tests press the
 * window's grips, its full-screen press and its close, so this opens the chat the person's way and sends it to its own
 * window when the split was what opened. A browser that remembers the window open needs nothing.
 */
export async function openTheChat(page: Page): Promise<void> {
  await openTheChatAsItOpens(page)
  if ((await page.locator('.px-chat[data-where="split"]').count()) > 0) {
    const ownWindow = page.locator('.px-chat-seam-window')
    // BELOW 1024 PIXELS THE SPLIT HAS NO OWN-WINDOW SHAPE: design D covers the screen there and the seam carries only
    // the way back. The stored open state still means the corner window, so a reload is how that window is opened.
    if ((await ownWindow.count()) === 0) {
      await page.evaluate(() => {
        localStorage.setItem('mole-office.chat.open', 'yes')
      })
      await page.reload()
      await page.locator('.px-chat[data-where="corner"]').waitFor({ state: 'attached', timeout: 30_000 })
      return
    }
    await ownWindow.click()
    await page.locator('.px-chat[data-where="corner"]').waitFor({ state: 'attached', timeout: 20_000 })
  }
}

/** The same as openTheChat: the window is the frame the older tests mean. Kept as its own name for those tests. */
export async function openTheChatWindow(page: Page): Promise<void> {
  await openTheChat(page)
}
