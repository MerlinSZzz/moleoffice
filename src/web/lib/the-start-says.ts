// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SENTENCE OF THE START, DRAWN IN PLACE OF THE APP, INSIDE THE PAGE'S OWN MARGIN.
 *
 * Before the app is drawn, src/web/main.tsx draws what the start says in the element React would mount into: the
 * sentence while Windows is slow to say who sent the first reads, and why a start failed. It was the element's plain
 * text, so it sat in the top left corner and at a phone's width reached the window's right edge. It is now one
 * paragraph with the page's own class (`.page` in src/web/styles.css), so it has the page's width and padding at every
 * width. It imports nothing, because the start draws it before the language module is loaded too.
 */

/** Draw `text` in `root`, in place of whatever the root held. */
export function theStartSays(root: HTMLElement, text: string): void {
  const said = document.createElement('p')
  said.className = 'page'
  said.textContent = text
  root.replaceChildren(said)
}
