// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
/**
 * THE REST OF THE OFFICE WAITS UNTIL ITS PERSON HAS NAMED THEMSELVES.
 *
 * A fresh office writes no owner's name, as point 1 of a decision says. It leads
 * its first person through a guide that asks for the name, and nothing else is drawn until that is done.
 *
 * The browser already knows the owner before this draws: src/web/main.tsx asks GET /api/office/owner
 * before the app loads, and src/web/owner.ts holds the answer. So:
 *   - while the office has no named owner, every address draws the guide (src/web/pages/WelcomePage.tsx)
 *     in place of the whole office: no sidebar, no page, no chat button;
 *   - once it has a named owner, this draws the office, and sends #/welcome to Home.
 *
 * WHILE THE GUIDE IS UP, IT ASKS THE DOOR AGAIN AT EACH NEW ADDRESS. A person who named themselves in
 * another tab gets the office at their next move here. It also means the page asks for something at
 * each address, which is what the page's finished mark waits for (src/web/lib/ready.ts). The guide
 * stays drawn while it asks. If that read fails, the failure is drawn with a way to try again, and
 * the office stays closed, because an office that cannot say who owns it cannot say who may act in it.
 *
 * It is mounted around the shell in App.tsx, in one line, because App.tsx is another wave's file.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import type { TheOfficeOwner } from '@shared/owner.ts'
import { api, faultOf, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { theOwner, theOwnerIs, theOwnerWasNamed } from '../owner.ts'
import { navigate, parseRoute, useRoute } from './router.tsx'
import { theShellDrewTheAddress } from '../lib/ready.ts'
import { ErrorNote, Loading } from './ui.tsx'
import { WelcomePage } from '../pages/WelcomePage.tsx'

type OwnerReading =
  | { status: 'loading' }
  | { status: 'error'; err: unknown }
  | { status: 'ready'; value: TheOfficeOwner }

export function OwnerGate({ children }: { children: ReactNode }) {
  // The guide and the lines below draw words, so they draw again when the page language changes.
  useLanguage()
  const route = useRoute()
  const [reading, setReading] = useState<OwnerReading>(() => ({ status: 'ready', value: theOwner() }))
  const [asked, setAsked] = useState(0)
  const named = reading.status === 'ready' && reading.value.named

  // `named` is folded into this key, so the effect below runs again when it changes as well.
  const address = named ? 'named' : JSON.stringify(route)
  useEffect(() => {
    if (address === 'named') return
    let live = true
    api.officeOwner().then(
      (value) => {
        if (!live) return
        theOwnerIs(value)
        setReading({ status: 'ready', value })
      },
      (err: unknown) => {
        if (live) setReading({ status: 'error', err })
      },
    )
    return () => {
      live = false
    }
  }, [asked, address])

  // THE GUIDE'S OWN ADDRESS, ONCE THE OFFICE HAS AN OWNER, IS HOME. The guide is never drawn again,
  // so an old link to it lands where the person would have gone after it.
  useEffect(() => {
    if (named && route.name === 'welcome' && parseRoute(window.location.hash).name === 'welcome') navigate('/')
  }, [named, route.name])

  // THE GUIDE STANDS IN FOR THE SHELL while the office has no named owner, so it says it has drawn, as
  // the shell does once it is up. The page's finished mark waits for one of the two
  // (src/web/lib/ready.ts); without this the guide would never be marked ready.
  useEffect(() => {
    if (!named) theShellDrewTheAddress()
  }, [named, address, reading.status])

  if (reading.status === 'loading') return <Loading label={t('welcomeGuide.reading')} rows={1} />
  if (reading.status === 'error') {
    return (
      <main className="page" id="main">
        <ErrorNote
          label={t('welcomeGuide.readFailed')}
          message={errorMessage(reading.err)}
          fault={faultOf(reading.err)}
          retry={() => {
            setReading({ status: 'loading' })
            setAsked((n) => n + 1)
          }}
        />
      </main>
    )
  }
  if (!reading.value.named) {
    const stillHere = stillOnThisPage()
    return (
      <WelcomePage
        onNamed={(value) => {
          theOwnerWasNamed(value)
          if (stillHere()) navigate('/')
          setReading({ status: 'ready', value })
        }}
      />
    )
  }
  // Nothing for the one moment between arriving at #/welcome and the move to Home above, so the
  // office never draws a page for an address it has no page at.
  if (route.name === 'welcome') return null
  return <>{children}</>
}
