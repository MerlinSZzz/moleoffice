// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAITING PAIRING REQUEST, AT THE TOP OF HOME.
 *
 * When a browser or a device of the person's asks to pair, it waits for their press. Home draws the ask above its
 * parts, after the pause notice's place: one asking card for each request, whole, as the person's own card draws it
 * (src/web/components/YourBrowsersAndMachines.tsx), with its name, its first called line, Confirm and Refuse. Needs you
 * draws no row for a request drawn here, and still counts it in its number.
 *
 * ONE READING OF THE CREDENTIALS, AND ONLY WHILE A DEVICE WAITS. The list of what waits on the person names a waiting
 * device by its credential's id and name, and the card needs the whole credential. So HomePage reads the credentials
 * once, through `usePairingRequests`, while that list holds a visiting device, and again when the ids of those rows
 * change. With none, nothing is read and nothing is drawn. While the reading is on its way, or after it failed, nothing
 * is drawn here and Needs you keeps those rows, so a request is never out of sight.
 *
 * THE SPLIT IS THE CARD'S OWN. `hisBrowsersIn` is the one place that says which credentials are the person's browsers
 * waiting for their press, so Home and their card cannot draw different requests.
 */

import { useMemo } from 'react'
import { t } from '@shared/i18n.ts'
import { noKeyWorksUnder, type VisitorCredential } from '@shared/visitors.ts'
import { hisBrowsersIn } from '@shared/worlds.ts'
import { api } from '../../api.ts'
import { useProjectAsync } from '../../lib/project-async.ts'
import type { WaitingReply } from '../../lib/waiting.ts'
import { AskingCard, EMBASSY_CSS } from '../../pages/EmbassyPage.tsx'
import { hisBrowserPath } from '../router.tsx'
import type { AsyncState } from '../ui.tsx'
import { YOUR_BROWSERS_WORDS } from '../YourBrowsersAndMachines.tsx'

/** The kind of a waiting row that is a browser or a device of the person's asking to pair (src/server/lib/waiting.ts). */
const A_DEVICE_ASKS = 'visiting device'

/** The pairing requests Home draws, read once for the part and for Needs you. */
export interface PairingRequests {
  /** The requests drawn as cards. Empty while none waits, while the reading is on its way and after it failed. */
  cards: readonly VisitorCredential[]
  /** The ids of the credentials drawn as cards: Needs you draws no row for these and still counts them. */
  drawn: ReadonlySet<string>
  /** Read the credentials again, after an answer. */
  again: () => void
}

/** Reads the credentials while the waiting list holds a visiting device, and again when those rows' ids change. */
export function usePairingRequests(waiting: AsyncState<WaitingReply>): PairingRequests {
  // THE IDS OF THE DEVICES WAITING, AS ONE KEY, so a re-read of the same list asks nothing again.
  const asking = waiting.status === 'ready'
    ? waiting.value.items.filter((item) => item.kind === A_DEVICE_ASKS).map((item) => item.id).sort().join('\n')
    : ''
  const [read, again] = useProjectAsync<VisitorCredential[] | null>(
    () => (asking === '' ? Promise.resolve(null) : api.visitors().then((said) => said.credentials)),
    [asking],
  )
  const cards = useMemo(() => {
    // A FAILED RE-READ KEEPS ITS LAST ANSWER, and that answer may be out of date, so it is drawn as a failure is.
    if (asking === '' || read.status !== 'ready' || read.value === null || read.reReadError !== undefined) return []
    return hisBrowsersIn(read.value).waiting
  }, [asking, read])
  const drawn = useMemo(() => new Set(cards.map((one) => one.id)), [cards])
  return { cards, drawn, again }
}

/** The part: a heading, one asking card for each waiting request, and where a confirmed browser's key is kept. */
export function HomePairingRequests({ requests, onWaitingChanged }: {
  requests: PairingRequests
  /** Read the list of what waits on the person again, after an answer. */
  onWaitingChanged: () => void
}) {
  const { cards, again } = requests
  if (cards.length === 0) return null
  const onAnswered = (): void => {
    again()
    onWaitingChanged()
  }
  return (
    <section className="hm-section hm-pairing" data-home-section="pairing">
      <style href="mole-office-embassy" precedence="default">{EMBASSY_CSS}</style>
      <h2 className="hm-section-title">{t('home.pairingRequests', { n: cards.length })}</h2>
      <ul className="emb-list">
        {cards.map((one) => (
          <AskingCard key={one.id} credential={one} onAnswered={onAnswered} onHisCard={{ opens: hisBrowserPath(one.id), picked: false }} />
        ))}
      </ul>
      {cards.some((one) => !noKeyWorksUnder(one)) ? <p className="hm-pairing-kept">{YOUR_BROWSERS_WORDS.keptHere}</p> : null}
    </section>
  )
}
