// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * THE STRIP THAT SAYS THIS PAGE IS AWAY FROM HOME.
 *
 * Criterion C7 of design/messages/ACCEPTANCE.md section 8: *a strip at the top says "Visiting
 * <world> · Return home" the whole time; return is one press.* A person who
 * enters another world with a press can come back from it.
 *
 * IT DRAWS NOTHING WHEN THIS PAGE IS AT HOME, which is every ordinary moment. That is the same rule
 * the wrong-world banner follows and the same reason: a page that is where it belongs says nothing
 * about it.
 *
 * IT IS NOT A WARNING. Being in another world on purpose is a thing somebody did, so the strip is
 * drawn in the ordinary way rather than in a state colour. The red banner is for a world nobody
 * asked to be in, and the two must not look alike.
 */

import { useSyncExternalStore } from 'react'
import { api } from '../api.ts'
import { subscribeToTheVisit, theVisitThisPageHolds, type Visiting } from '../lib/visiting.ts'
import { theHomeWorld } from '../lib/world.ts'

export function VisitingStrip() {
  const trip = useSyncExternalStore(subscribeToTheVisit, theVisitThisPageHolds, theVisitThisPageHolds)
  if (trip === null) return null
  return (
    <>
      <style href="mole-office-visiting-strip" precedence="default">
        {VISITING_CSS}
      </style>
      <Strip trip={trip} />
    </>
  )
}

function Strip({ trip }: { trip: Visiting }) {
  // THE COMMIT THE WORLD THAT SERVED THIS PAGE WAS ON, which is home. The page's own code carries no
  // commit stamp — `ServedCode` records when a file was served, not which commit — so the honest
  // answer to "the page's commit" is the commit of the world it came from.
  const mine = theHomeWorld()?.head ?? null
  // A DIFFERENT COMMIT IS A FACT AND NOT A FAULT. Criterion C7 asks the strip to say so; it is drawn
  // as one more thing on the line rather than as an alarm, because a scratch world running older
  // code is the ordinary reason somebody is visiting one.
  const different = mine !== null && trip.head !== null && mine !== trip.head
  return (
    <div className="px-visiting" role="status">
      <span className="px-visiting-what">{t('pageWords.VisitingStrip.001')}</span>
      <span className="px-visiting-world">{trip.worldName}</span>
      {different ? (
        <span className="px-visiting-code">
          <span className="px-visiting-key">{t('pageWords.VisitingStrip.002')}</span>
          {trip.head}
          <span className="px-visiting-key">{t('frameFiles.wrongWorld.thisPage')}</span>
          {mine}
        </span>
      ) : null}
      <button
        type="button"
        className="px-visiting-back"
        onClick={() => {
          void api.returnHome().then(() => {
            // EVERYTHING ON SCREEN WAS READ FROM THE OTHER WORLD, so the page is read again from
            // home rather than left holding a mixture of two.
            window.location.reload()
          })
        }}
      >{t('pageWords.VisitingStrip.003')}</button>
    </div>
  )
}

const VISITING_CSS = `
.px-visiting {
  position: sticky;
  top: 0;
  z-index: var(--z-bar);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pad);
  padding: var(--pad) var(--pad-lg);
  background: var(--panel-2);
  border-bottom: var(--border-w) solid var(--border);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--text-2);
}
.px-visiting-what { color: var(--text-3); }
.px-visiting-world { font-weight: 600; color: var(--text); }
.px-visiting-code {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.px-visiting-key { color: var(--text-3); font-family: var(--font-ui); }
.px-visiting-back {
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
.px-visiting-back:hover { background: var(--hover); }
.px-visiting-back:active { background: var(--press); }
`
