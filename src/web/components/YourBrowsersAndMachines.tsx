// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S BROWSERS AND THE MACHINES THIS OFFICE TRUSTS, ON THEIR OWN CARD. Design C of early idea B9.
 *
 * Before this they were on three pages. The Embassy drew the person's browsers' asks and rows, each row opened a
 * credential page, and the Worlds page set the machines. Their card is now the one place for them, and
 * those pages lead here.
 *
 * NO CHECK IS COPIED. Each press calls the door it called before, and the door still decides. The asks
 * are drawn by the Embassy's own asking card, so a browser whose key was left out of a copy has no
 * Confirm, as there. The keys are drawn by RevokeTheirKey, with its Undo. The machines are drawn by
 * TrustedMachines with its presses, and its press to remove one asks why, as before.
 *
 * WHAT WAS NOT READ IS SAID. A refused read draws the refusal and the word for not read, and never the
 * word for an empty list, because nobody has looked is not the same answer as nothing is there.
 */

import { useEffect } from 'react'
import { t } from '@shared/i18n.ts'
import { drawnStamp } from '@shared/time.ts'
import { noKeyWorksUnder, type VisitorCredential } from '@shared/visitors.ts'
import { hisBrowsersIn } from '@shared/worlds.ts'
import type { WhatTheOfficeTrusts } from '@shared/trustedmachines.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useProjectAsync } from '../lib/project-async.ts'
import { AskingCard, EMBASSY_CSS } from '../pages/EmbassyPage.tsx'
import { theNameThisBrowserGaveItself } from '../pages/PairingPage.tsx'
import { RevokeTheirKey } from './RevokeTheirKey.tsx'
import { hisBrowserPath } from './router.tsx'
import { TieredPress } from './TieredPress.tsx'
import { TrustedMachines } from './TrustedMachines.tsx'
import { Absence, ErrorNote, Loading, Panel, type AsyncState } from './ui.tsx'

/** Every word this part draws that is not read off a reply. */
export const YOUR_BROWSERS_WORDS = {
  get title() { return t('w13s.card.browsers.title') },
  get waiting() { return t('w13s.card.browsers.waiting') },
  get paired() { return t('w13s.card.browsers.paired') },
  get ended() { return t('w13s.card.browsers.ended') },
  get machines() { return t('w13s.card.browsers.machines') },
  get thisBrowser() { return t('w13s.card.browsers.thisBrowser') },
  get from() { return t('w13s.card.browsers.from') },
  get joined() { return t('w13s.card.browsers.joined') },
  get lastUsed() { return t('w13s.card.browsers.lastUsed') },
  get endedAt() { return t('w13s.card.browsers.endedAt') },
  get end() { return t('w13s.card.browsers.end') },
  get ending() { return t('w13s.card.browsers.ending') },
  get endQuestion() { return t('w13s.card.browsers.endQuestion') },
  get endWarning() { return t('w13s.card.browsers.endWarning') },
  /** Said under a press whose door is kept on the office's own computer, before it is pressed. */
  get keptHere() { return t('w13s.card.browsers.keptHere') },
  get notRead() { return t('w13s.card.browsers.notRead') },
  get none() { return t('w13s.card.browsers.none') },
} as const

/**
 * WHICH LIVE BROWSER THIS ONE IS, or null. The office gives a browser no mark it could read back, so
 * this compares the name this browser gave itself when it was paired with the names of the live ones.
 * Two with that name cannot be told apart, so neither is marked.
 */
function theOneThisBrowserIs(paired: VisitorCredential[], name: string | null): string | null {
  if (name === null) return null
  const same = paired.filter((one) => one.name === name)
  return same.length === 1 ? (same[0]?.id ?? null) : null
}

/** The part, loaded: the person's browsers from GET /api/office/visitors and the machines this office trusts. */
export function YourBrowsersAndMachines({ browser }: { browser: string | null }) {
  useLanguage()
  // HIS BROWSERS, read again when what waits on the person changes, at most once in 5 seconds
  // (src/web/lib/record-changes.ts). A pairing request asked, confirmed or ended elsewhere is announced on that list,
  // so a new ask and an answered one are drawn here with no reload.
  const [visitors, readVisitorsAgain] = useProjectAsync(() => api.visitors().then((said) => said.credentials), [], { follows: { lists: ['needsYou'], atMostEveryMs: 5_000 } })
  const [trusted, readTrustedAgain] = useProjectAsync(() => api.trustedMachines(), [])
  // AN ADDRESS THAT NAMES ONE BROWSER brings its row into view once the list is drawn.
  const drawn = visitors.status === 'ready'
  useEffect(() => {
    if (!drawn || browser === null) return
    document.querySelector(`[data-browser="${CSS.escape(browser)}"]`)?.scrollIntoView({ block: 'center' })
  }, [drawn, browser])
  return (
    <Panel titleIs="label" declares={{ surface: 'profile.browsers' }} title={YOUR_BROWSERS_WORDS.title}>
      <TheBrowsersAndMachines
        visitors={visitors}
        trusted={trusted}
        thisBrowser={theNameThisBrowserGaveItself()}
        row={browser}
        onChanged={() => {
          readVisitorsAgain()
          readTrustedAgain()
        }}
      />
    </Panel>
  )
}

/** The part's body, drawn from the two readings it is given. */
export function TheBrowsersAndMachines({
  visitors,
  trusted,
  thisBrowser,
  row,
  onChanged,
}: {
  visitors: AsyncState<VisitorCredential[]>
  trusted: AsyncState<WhatTheOfficeTrusts>
  /** The name this browser gave itself when it was paired, or null where it gave none. */
  thisBrowser: string | null
  /** The browser an address names, whose row is marked. */
  row: string | null
  onChanged: () => void
}) {
  return (
    <div className="ybm">
      <style href="mole-office-embassy" precedence="default">
        {EMBASSY_CSS}
      </style>
      <style href="mole-office-your-browsers" precedence="default">
        {YOUR_BROWSERS_CSS}
      </style>
      {visitors.status === 'loading' ? <Loading what={YOUR_BROWSERS_WORDS.title} /> : null}
      {visitors.status === 'error' ? <NotRead message={visitors.message} fault={visitors.fault ?? null} /> : null}
      {visitors.status === 'ready' ? (
        <TheBrowsers credentials={visitors.value} thisBrowser={thisBrowser} row={row} onChanged={onChanged} />
      ) : null}
      <h3 className="ybm-head" data-title-is="its-label">{YOUR_BROWSERS_WORDS.machines}</h3>
      {trusted.status === 'loading' ? <Loading what={YOUR_BROWSERS_WORDS.machines} /> : null}
      {trusted.status === 'error' ? <NotRead message={trusted.message} fault={trusted.fault ?? null} /> : null}
      {trusted.status === 'ready' ? (
        <>
          <TrustedMachines said={trusted.value} presses onChanged={onChanged} />
          <p className="ybm-kept">{YOUR_BROWSERS_WORDS.keptHere}</p>
        </>
      ) : null}
    </div>
  )
}

/** A read that was refused or failed: what the office said, and the state word in place of a list. */
function NotRead({ message, fault }: { message: string; fault: Parameters<typeof ErrorNote>[0]['fault'] }) {
  return (
    <>
      <ErrorNote message={message} fault={fault} />
      <p className="ybm-none"><Absence word={YOUR_BROWSERS_WORDS.notRead} /></p>
    </>
  )
}

function TheBrowsers({
  credentials,
  thisBrowser,
  row,
  onChanged,
}: {
  credentials: VisitorCredential[]
  thisBrowser: string | null
  row: string | null
  onChanged: () => void
}) {
  const { waiting, paired, ended } = hisBrowsersIn(credentials)
  const here = theOneThisBrowserIs(paired, thisBrowser)
  const none = <p className="ybm-none"><Absence word={YOUR_BROWSERS_WORDS.none} /></p>
  return (
    <>
      <h3 className="ybm-head" data-title-is="its-label">{YOUR_BROWSERS_WORDS.waiting}</h3>
      {waiting.length === 0 ? none : (
        <ul className="emb-list">
          {waiting.map((one) => (
            <AskingCard
              key={one.id}
              credential={one}
              onAnswered={onChanged}
              onHisCard={{ opens: hisBrowserPath(one.id), picked: one.id === row }}
            />
          ))}
        </ul>
      )}
      {/* CONFIRM IS KEPT ON THE OFFICE'S OWN COMPUTER, so the card says so under it, where one is drawn. */}
      {waiting.some((one) => !noKeyWorksUnder(one)) ? <p className="ybm-kept">{YOUR_BROWSERS_WORDS.keptHere}</p> : null}
      <h3 className="ybm-head" data-title-is="its-label">{YOUR_BROWSERS_WORDS.paired}</h3>
      {paired.length === 0 ? none : (
        <ul className="ybm-list">
          {paired.map((one) => (
            <ABrowser key={one.id} credential={one} here={one.id === here} picked={one.id === row} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <h3 className="ybm-head" data-title-is="its-label">{YOUR_BROWSERS_WORDS.ended}</h3>
      {ended.length === 0 ? none : (
        <ul className="ybm-list">
          {ended.map((one) => (
            <ABrowser key={one.id} credential={one} here={false} picked={one.id === row} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </>
  )
}

/** One paired or ended browser: how it was paired, when it joined, its key, and End while it is live. */
function ABrowser({
  credential,
  here,
  picked,
  onChanged,
}: {
  credential: VisitorCredential
  here: boolean
  picked: boolean
  onChanged: () => void
}) {
  const live = credential.endedAt === null
  const when = (stamp: string | null) => (stamp === null ? <Absence /> : drawnStamp(stamp))
  return (
    <li className="ybm-row" data-browser={credential.id} data-picked={picked ? 'yes' : 'no'}>
      <span className="ybm-top">
        <span className="ybm-name">{credential.name}</span>
        {here ? <span className="ybm-here">{YOUR_BROWSERS_WORDS.thisBrowser}</span> : null}
      </span>
      <span className="ybm-facts">
        <span className="emb-key">{YOUR_BROWSERS_WORDS.from}</span>
        <span className="emb-value">{credential.machine ?? <Absence />}</span>
        <span className="emb-key">{YOUR_BROWSERS_WORDS.joined}</span>
        <span className="emb-value">{when(credential.confirmedAt)}</span>
        <span className="emb-key">{YOUR_BROWSERS_WORDS.lastUsed}</span>
        <span className="emb-value">{when(credential.lastAskedAt)}</span>
        {live ? null : (
          <>
            <span className="emb-key">{YOUR_BROWSERS_WORDS.endedAt}</span>
            <span className="emb-value">{when(credential.endedAt)}</span>
          </>
        )}
      </span>
      {live ? (
        <div className="ybm-acts">
          <TieredPress tier="confirm" size="sm"
            press={YOUR_BROWSERS_WORDS.end} pending={YOUR_BROWSERS_WORDS.ending}
            question={YOUR_BROWSERS_WORDS.endQuestion} quote={credential.name}
            warning={YOUR_BROWSERS_WORDS.endWarning} cancel={t('g4.cancel')}
            onPress={async () => {
              await api.endVisitor(credential.id)
              onChanged()
            }} />
        </div>
      ) : null}
      {/* ITS KEY, with Revoke key and Undo, as the credential page drew them for every standing. */}
      <RevokeTheirKey credential={credential.id} />
    </li>
  )
}

// The stylesheet's comments give their reasons in words. The rows take the Embassy's key and value
// type, so a fact reads the same on the card as it did there.
const YOUR_BROWSERS_CSS = `
.ybm { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ybm-head { margin: 8px 0 0; color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.ybm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ybm-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 0;
  border-top: var(--border-w) solid var(--border);
}
/* The row an address named is marked by a bar at its start, not by colour alone. */
.ybm-row[data-picked='yes'] { border-left: 3px solid var(--accent); padding-left: 8px; }
.ybm-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.ybm-name { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.ybm-here { font-size: var(--fs-1); color: var(--text-2); }
.ybm-facts { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.ybm-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.ybm-kept, .ybm-none { margin: 0; font-size: var(--fs-1); color: var(--text-3); }
`
