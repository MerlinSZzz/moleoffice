// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CODE IS BEHIND THE CHECKOUT: ONE QUIET LINE AT THE TOP, AND THE PAGE STAYS USABLE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION, AND WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A decision was taken on problem `mnCme7ZcHO3F`. This part
 * changes little for now. The warning stays and becomes one
 * line of title, and the page's presses are unlocked while it shows. A person may have typed
 * something and fear a reload would lose it, so the page should go on taking presses, but nothing
 * needs to be written specially for that case.
 *
 * The warning stays. It becomes one line of title, and the page's presses are unlocked while it
 * shows. There is deliberately no provision for a half-written draft: the page simply does not lock.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACES
 * ---------------------------------------------------------------------------------------
 *
 * Until this file, BOTH directions of the freshness reading were rows inside `WrongWorld.tsx`'s red
 * banner, and the sheet under that banner swallowed every press. The reading itself is unchanged:
 * `lib/world.ts` still works out direction 1 (this page's own code is older than the checkout) and
 * direction 2 (the server this page talks to is older than the checkout). What changed is only how
 * the two rows are drawn.
 *
 * The rows this file draws are `isAFreshnessRow` in `lib/world.ts`: exactly those two, and
 * nothing else. Every other row — another world answering, a scratch database on the canonical
 * address, a server that cannot restart — is still the blocking banner, because those are not a
 * page somebody can go on using.
 *
 * ---------------------------------------------------------------------------------------
 * ONE LINE, AND THE COLOUR CARRIES THE DIFFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * One short sentence, the same in both directions, and one press that reads the page again. It sits
 * in the ordinary flow at the top of the page, so it covers nothing: every press and every field
 * below it keeps working.
 *
 * RED IS DIRECTION 2, the server behind the checkout, which is the office's fault and is not cured
 * by a refresh on its own. Direction 1, this page's own old code, is quiet, because a refresh is
 * exactly what cures it. The two are the same title and only the colour differs.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A RELOAD AND NOT A DISMISSAL
 * ---------------------------------------------------------------------------------------
 *
 * The press reads the page again, which is the remedy the warning asks for. It is not a dismissal:
 * it hides nothing and records nothing. The line goes when the reading stops disagreeing, with no
 * press at all, through the same replace-each-check's-rows machinery `lib/world.ts` describes.
 */

import { useSyncExternalStore } from 'react'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import {
  THE_CODE_THE_SERVER_IS_RUNNING,
  isAFreshnessRow,
  subscribeToTheWorld,
  worldTrouble,
} from '../lib/world.ts'

export function BehindTheCheckout() {
  useLanguage()
  const all = useSyncExternalStore(subscribeToTheWorld, worldTrouble, worldTrouble)
  const behind = all.filter(isAFreshnessRow)
  if (behind.length === 0) return null
  // DIRECTION 2, AND ONLY DIRECTION 2, IS RED. The server being behind is the office's fault and a
  // refresh does not cure it on its own; this page's own old code is quiet, and a refresh cures it.
  const theServerIsBehind = behind.some((one) => one.what === THE_CODE_THE_SERVER_IS_RUNNING)
  // THE DETAIL, FOR A READER WHO ASKS FOR IT. The one line is the same in both directions; the row
  // this reading built still carries which half differs and both values, and it is offered on hover
  // rather than drawn as a second line.
  const detail = behind.map((one) => one.doThis).join(' ')
  return (
    <>
      <style href="mole-office-behind-the-checkout" precedence="default">
        {BEHIND_CSS}
      </style>
      <div
        className={theServerIsBehind ? 'px-btc px-btc-server' : 'px-btc'}
        role="status"
        data-name="the code is behind the checkout"
        title={detail}
      >
        <span className="px-btc-said">{t('frameFiles.behind.said')}</span>
        <button
          type="button"
          className="px-btc-do"
          onClick={() => {
            window.location.reload()
          }}
        >
          {t('frameFiles.behind.refresh')}
        </button>
      </div>
    </>
  )
}

/**
 * THE LINE, IN ORDINARY FLOW.
 *
 * IT IS NOT FIXED AND IT IS NOT STICKY, and that is the whole of "the page stays usable under it":
 * a fixed strip covers the first rows of the page and a sticky one follows the reader down, and
 * either could stand between a press and the thing being pressed. This one sits above the page and
 * pushes it down. The wrong-world banner's own `.px-ww` stays fixed because that page is not usable.
 *
 * THE QUIET FORM READS AS `VisitingStrip`, the other ordinary strip: the same panel colour and the
 * same one-pixel rule. The red form is the state colour the wrong-world banner already uses, and
 * neither introduces a colour of its own.
 */
const BEHIND_CSS = `
.px-btc {
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
.px-btc-said { font-weight: 600; color: var(--text); }
.px-btc-do {
  margin-left: auto;
  min-height: var(--row-h);
  padding: 0 var(--pad-lg);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.px-btc-do:hover { background: var(--hover); }
.px-btc-do:active { background: var(--press); }
.px-btc-server {
  background: var(--st-broken-bg);
  border-bottom: var(--rail) solid var(--st-broken);
}
.px-btc-server .px-btc-said { color: var(--st-broken); }
`
