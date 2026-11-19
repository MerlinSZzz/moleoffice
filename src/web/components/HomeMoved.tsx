// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PLAIN LINE: THE OFFICE HAS MOVED HOME, AND THIS PAGE FOLLOWS IT.
 *
 * OP3 of design/messages/ONE-PERSON-EVERY-MACHINE-ACCEPTANCE.md. A restore or a move gives the
 * office a new database identity while a browser keeps the world it first met. When the reply
 * recognises the remembered world as one of this installation's own dead homes, it says on a header
 * which world is home now, and `lib/world.ts` adopts it. This is the one line that says so.
 *
 * NOTHING TO PRESS AND NOTHING TO DISMISS. The page has already done the thing the line is about;
 * the next request carries the new home. The line goes when the page is loaded again, which is when
 * it stops being news.
 *
 * IT DRAWS NOTHING IN NORMAL USE, like the visiting strip and the wrong-world banner: a page that is
 * where it belongs says nothing about it.
 */

import { useSyncExternalStore } from 'react'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { subscribeToTheHomeMoved, theHomeMovedOnThisPage } from '../lib/world.ts'

export function HomeMoved() {
  useLanguage()
  const moved = useSyncExternalStore(subscribeToTheHomeMoved, theHomeMovedOnThisPage, theHomeMovedOnThisPage)
  if (!moved) return null
  return (
    <>
      <style href="mole-office-home-moved" precedence="default">
        {HOME_MOVED_CSS}
      </style>
      <div className="px-hm" role="status" aria-live="polite" data-name="the office has moved home">
        {t('frameFiles.homeMoved')}
      </div>
    </>
  )
}

/**
 * THE LINE, IN ORDINARY FLOW. It is not fixed and not sticky, so it pushes the page down rather than
 * covering it: there is no action to take, so nothing on the page may be hidden by it. The quiet
 * form matches the visiting strip and the quiet checkout line, and it introduces no colour of its
 * own. NO BACKTICK ANYWHERE IN THIS TEMPLATE LITERAL.
 */
const HOME_MOVED_CSS = `
.px-hm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pad);
  padding: var(--pad) var(--pad-lg);
  background: var(--panel-2);
  border-bottom: var(--border-w) solid var(--border);
  color: var(--text-2);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
}
`
