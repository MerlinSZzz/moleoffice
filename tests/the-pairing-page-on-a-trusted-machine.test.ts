// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAIRING PAGE ON A MACHINE THE OFFICE TRUSTS, PHOTOGRAPHED, AND THE CARD OF A DEVICE WAITING
 * FOR THE PERSON, which is on his own person card since design C of early idea B9.
 *
 * Criterion D2 and the amendment of 13 September 2026 at 18:50, and chapter 6's rule: every
 * screen is looked at at four widths and in both themes. `tools/review.mjs` cannot photograph
 * anything today (problem bfvKtNhVC4L5 — it cannot reach `#/incident`), so this uses what the
 * device-row picture already uses: a browser test that starts its stack through `liveApp`, drives
 * the real page in a real browser, and writes PNGs. The stack is the test's own — no server of the
 * worker's is started or left running.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A TRUSTED MACHINE EXISTS IN ONE PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * `liveApp` is told `addressForOtherMachines: 127.0.0.2`, so the server binds its second listener
 * there and Vite serves the app there too, exactly as a real machine reaches the office. The page is
 * opened on that address, so its own API base is that address (`src/web/lib/api-address.ts`), the
 * request arrives through the listener for other machines, and the environment wrote that address
 * onto the trusted list at start (P73). That is the whole of what makes `mayAsk` true, and it is the
 * real door rather than a faked read.
 *
 * BEFORE is the page with the ask press and the name it will use. AFTER is the same browser once the
 * credential asked for it has been confirmed on loopback: the page reloads, finds the cookie paired,
 * and draws the paired line.
 *
 * THE PICTURES ARE TAKEN ONLY WHEN `P83_PAIR_SHOTS` NAMES A DIRECTORY, the same shape the other
 * photographing tests use, so an ordinary run takes none.
 */

import { mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-device-that-is-not-the-person',
}

/** The four widths chapter 6 names, and the two themes. */
const WIDTHS = [1440, 1024, 768, 390] as const
const THEMES = ['light', 'dark'] as const

describe('the pairing page on a trusted machine, and the Embassy row of a device waiting', () => {
  it.skipIf(!process.env['P83_PAIR_SHOTS'])(
    'photographs before and after, and the waiting row, at 1440, 1024, 768 and 390 in both themes',
    async () => {
      const shots = process.env['P83_PAIR_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({
        name: 'p83-pair-photos',
        viewport: { width: 1440, height: 1000 },
        workspace: 'default',
        addressForOtherMachines: '127.0.0.2',
      })
      try {
        const atOtherMachines = (path: string): string => `http://127.0.0.2:${String(live.webPort)}${path}`

        // THE MACHINE THE OFFICE ACTUALLY SEES. A browser on this computer reaching the door for
        // other machines arrives with 127.0.0.1 as its peer address, and the environment put only
        // 127.0.0.2 there. Trusting it is the same press a person makes on the Worlds page.
        const trusted = await fetch(`${live.api}/api/office/trusted-machines`, {
          method: 'POST',
          headers: AS_THE_PERSON,
          body: JSON.stringify({ address: '127.0.0.1', note: 'the peer address the other-machines door sees' }),
        })
        expect([200, 201], await trusted.text()).toContain(trusted.status)

        // THE BROWSER ON THE OTHER MACHINE ASKS, AND IS CONFIRMED WHERE THE OFFICE RUNS. This
        // is the product's own second way in, not a seeded row.
        await live.page.goto(atOtherMachines('/#/pairing'), { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        const askPress = live.page.getByRole('button', { name: 'Ask to pair this browser' })
        await askPress.waitFor({ timeout: 30_000 })
        const name = (await live.page.locator('.pair-device').first().textContent())?.trim() ?? ''
        expect(name, 'the page drew no name for this browser').not.toBe('')
        const asked = await live.page.content()
        expect(asked, 'the ask press is drawn without the name it will use').toContain(name)

        // BEFORE: the press and the name it will use.
        for (const width of WIDTHS) {
          for (const theme of THEMES) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/p83-pairing-trusted-before-${String(width)}-${theme}.png`,
              fullPage: true,
            })
          }
        }

        // THE PRESS, the credential it asks for, and the loopback confirm.
        await live.page.setViewportSize({ width: 1440, height: 1000 })
        await askPress.click()
        await live.page.getByText('Waiting for you to confirm').waitFor({ timeout: 30_000 }).catch(() => {})

        const listed = (await (await fetch(`${live.api}/api/office/visitors`, { headers: AS_THE_PERSON })).json()) as {
          credentials: { id: string; handle: string; standing: string }[]
        }
        const waiting = listed.credentials.find((one) => one.handle === name && one.standing === 'pending')
        expect(waiting, `no pending credential was issued for "${name}"`).toBeDefined()
        const confirmed = await fetch(`${live.api}/api/office/visitors/${String(waiting?.id)}/confirm`, {
          method: 'POST',
          headers: AS_THE_PERSON,
          body: '{}',
        })
        expect(confirmed.status, await confirmed.text()).toBe(200)

        // AFTER: the same browser, now paired, read back from its cookie.
        await live.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.getByText('This browser is paired.').waitFor({ timeout: 30_000 })
        for (const width of WIDTHS) {
          for (const theme of THEMES) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/p83-pairing-trusted-after-${String(width)}-${theme}.png`,
              fullPage: true,
            })
          }
        }

        // THE CARD OF A DEVICE WAITING, ON HIS PERSON CARD. A second device asks through the credential
        // flow's own door and is left pending, which is the state the card is for.
        const device = await fetch(`${live.api}/api/office/visitors`, {
          method: 'POST',
          headers: AS_AN_AGENT,
          body: JSON.stringify({ device: 'Safari on iOS 9c3d' }),
        })
        const deviceText = await device.text()
        expect(device.status, deviceText).toBe(201)

        const { whoPath } = await import('../src/web/components/router.tsx')
        await live.page.goto(`${live.site}/#${whoPath('person', THE_PERSON)}`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.locator('[data-target$="profile.browsers"] .emb-asking-card')
          .getByText('Safari on iOS 9c3d').first().waitFor({ timeout: 30_000 })
        for (const width of WIDTHS) {
          for (const theme of THEMES) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/p83-card-waiting-device-${String(width)}-${theme}.png`,
              fullPage: true,
            })
          }
        }

        // THE SECOND LISTENER REALLY WAS THE ONE THAT WAS ASKED, so the pictures are of the amended
        // door and not of the loopback one. A loopback caller is written as `this machine` with the
        // office's own name; a caller through the other-machines address is written as an address.
        const after = (await (await fetch(`${live.api}/api/office/visitors`, { headers: AS_THE_PERSON })).json()) as {
          credentials: { handle: string; machine: string | null }[]
        }
        const trustedRow = after.credentials.find((one) => one.handle === name)
        expect(trustedRow?.machine, 'the ask did not arrive as an address').toMatch(/^127\./)
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})
