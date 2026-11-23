// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISITOR RESTORED FROM A BACKUP HOLDS NO TOKEN HASH, AND PAIRS AGAIN.
 *
 * By point (a) of a decision, a backup leaves out
 * `visitor_credentials.token_hash`, so a restore cannot bring back a visitor ended after the backup
 * was made, and a restored visitor pairs again. `emptyAndScrub` in
 * src/config/what-a-copy-must-not-carry.mjs writes REMOVED_MARK and the row's id where the hash was.
 *
 * This file makes a scratch office with one confirmed visitor and one waiting visitor, backs it up with
 * the real `npm run db:backup`, and restores the backup the way the backup's own words say: by copying
 * the file into place. Then it asks the restored office what a person and a visitor would meet:
 *
 *   1. the restored file holds both credentials, and neither token hash, as rows or as bytes;
 *   2. the pass every start runs binds no key from a credential with no token hash;
 *   3. the old token matches no credential, and each credential says it holds no token hash;
 *   4. the confirm press refuses both, and writes nothing;
 *   5. a credential asked for again in the restored office holds a token hash and can be confirmed;
 *   6. in a browser, the credential's page says no token works under it and draws no Confirm press,
 *      and the Embassy shows the waiting one, because the person can still refuse it (problem 4fDIo73TuEoK), with the
 *      state word the credential's page is titled by and no press to let it in. Before, the Embassy card drew the
 *      credential page's sentence; it draws the state word now, as decided.
 *
 * Case 6 photographs the page at 1440, 990, 660 and 390, light and dark, when RESTORED_VISITOR_SHOTS
 * names a folder.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In `giveAlreadyConfirmedCredentialsTheirKeysOnce` (src/server/lib/visitors.ts), take out the
 *      `aTokenHashWasRemoved` skip → the pass binds a key whose "hash" is the note: case 2 goes red.
 *   2. In `confirmACredential`, take out the `tokenRemoved` refusal → case 4 goes red.
 *   3. In CredentialPage.tsx, make `noTokenWorks` false whatever `tokenRemoved` says, so the title, the
 *      line under it and the Confirm press come from the standing alone → case 6 goes red.
 *   4. In src/shared/visitors.ts, make `noKeyWorksUnder` false always, so the Embassy card offers Let it in
 *      again → case 6 goes red.
 *
 * EVERY TOKEN HERE IS MADE BY THIS FILE, in a scratch office, and none is printed.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { CREDENTIAL_WORDS } from '../src/web/pages/CredentialPage.tsx'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'
import { freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts', 'backup.ts')

const FACTS = { conversationPath: null, startDirectory: null, runtime: null, sessionRecord: null }

let source: TestDb
let place: string
let backupRun: { status: number; stdout: string; stderr: string }
let restored: string
let confirmed: { id: string; token: string }
let waiting: { id: string; token: string }

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

beforeAll(async () => {
  source = await freshDb()
  const visitors = await import('../src/server/lib/visitors.ts')
  const one = visitors.issueACredential({
    handle: 'a-restored-visitor',
    name: 'A restored visitor',
    role: 'worker',
    world: null,
    machine: 'another-machine.example',
    machineHow: 'an address',
    facts: FACTS,
  })
  visitors.confirmACredential(one.credential.id, { kind: 'person', id: THE_PERSON })
  visitors.theKeyOneConfirmedCredentialBinds(one.credential, null)
  confirmed = { id: one.credential.id, token: one.token }
  const two = visitors.issueACredential({
    handle: 'a-restored-waiting-visitor',
    name: 'A restored waiting visitor',
    role: 'worker',
    world: null,
    machine: 'another-machine.example',
    machineHow: 'an address',
    facts: FACTS,
  })
  waiting = { id: two.credential.id, token: two.token }

  place = mkdtempSync(join(tmpdir(), 'restored-visitor-'))
  const backup = join(place, 'backup.db')
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: source.file }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) delete env[name]
  const run = spawnSync(process.execPath, [join(REPO, 'node_modules', '.bin', 'tsx'), BACKUP_SCRIPT, '--to', backup, '--database-only'], {
    cwd: REPO,
    encoding: 'utf8',
    env,
    timeout: 120_000,
  })
  backupRun = { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }

  // THE RESTORE, AS THE BACKUP'S OWN WORDS SAY IT: copy the file into place.
  mkdirSync(join(place, 'restored'))
  restored = join(place, 'restored', 'panelx.db')
  copyFileSync(backup, restored)

  // FROM HERE ON THIS PROCESS IS THE RESTORED OFFICE.
  source.client.sqlite.close()
  process.env.MOLE_OFFICE_DB = restored
  vi.resetModules()
}, 180_000)

afterAll(() => {
  source?.close()
  if (place !== undefined) rmSync(place, { recursive: true, force: true })
})

describe('the restored file', () => {
  it('holds both credentials and neither token hash, as rows or as bytes', async () => {
    expect(backupRun.status, backupRun.stderr).toBe(0)
    expect(backupRun.stdout).toContain('because a decision leaves them out of every backup')
    const { sqlite } = await import('../src/server/db/client.ts')
    const rows = sqlite.prepare('SELECT id, token_hash AS h FROM visitor_credentials ORDER BY id').all() as { id: string; h: string }[]
    expect(rows.map((r) => r.id).sort()).toEqual([confirmed.id, waiting.id].sort())
    for (const row of rows) expect(row.h).toBe(`${REMOVED_MARK}${row.id}`)
    const bytes = readFileSync(restored).toString('latin1')
    expect(bytes.includes(sha256(confirmed.token)), 'the confirmed visitor’s token hash came back').toBe(false)
    expect(bytes.includes(sha256(waiting.token)), 'the waiting visitor’s token hash came back').toBe(false)
  })
})

describe('the restored office', () => {
  it('binds no key at its start from a credential with no token hash', async () => {
    const visitors = await import('../src/server/lib/visitors.ts')
    const { sqlite } = await import('../src/server/db/client.ts')
    expect(visitors.giveAlreadyConfirmedCredentialsTheirKeysOnce()).toEqual([])
    expect((sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n).toBe(0)
  })

  it('matches the old token to no credential, and says each holds no token hash', async () => {
    const visitors = await import('../src/server/lib/visitors.ts')
    expect(visitors.credentialForToken(confirmed.token)).toBeNull()
    expect(visitors.credentialForToken(waiting.token)).toBeNull()
    expect(visitors.credentialById(confirmed.id)?.tokenRemoved).toBe(true)
    expect(visitors.credentialById(waiting.id)?.tokenRemoved).toBe(true)
  })

  it('refuses the confirm press on both, and writes nothing', async () => {
    const visitors = await import('../src/server/lib/visitors.ts')
    for (const id of [waiting.id, confirmed.id]) {
      let refused: unknown = null
      try {
        visitors.confirmACredential(id, { kind: 'person', id: THE_PERSON })
      } catch (err) {
        refused = err
      }
      expect(refused, `the confirm of ${id} was not refused`).not.toBeNull()
      expect((refused as { status?: number }).status).toBe(409)
      expect(String((refused as Error).message)).toContain('Ask the visitor for a new credential')
    }
    expect(visitors.credentialById(waiting.id)?.standing).toBe('pending')
    expect(visitors.credentialById(waiting.id)?.confirmedAt).toBeNull()
  })

  it('lets the visitor pair again: a new credential holds a token hash and can be confirmed', async () => {
    const visitors = await import('../src/server/lib/visitors.ts')
    const again = visitors.issueACredential({
      handle: 'a-restored-visitor',
      name: 'A restored visitor, asking again',
      role: 'worker',
      world: null,
      machine: 'another-machine.example',
      machineHow: 'an address',
      facts: FACTS,
    })
    expect(again.credential.tokenRemoved).toBe(false)
    expect(visitors.confirmACredential(again.credential.id, { kind: 'person', id: THE_PERSON }).standing).toBe('trusted')
    expect(visitors.credentialForToken(again.token)?.id).toBe(again.credential.id)
  })
})

describe('what a person sees, in a browser', () => {
  it('the page hides Confirm without a key, and the Embassy keeps a pending keyless visitor', async () => {
    // A SECOND RESTORE OF THE SAME BACKUP, served by a server of its own, which runs the start pass.
    const served = join(place, 'served')
    mkdirSync(served)
    copyFileSync(join(place, 'backup.db'), join(served, 'panelx.db'))
    const app = await liveApp({ name: 'restored-visitor', viewport: { width: 1440, height: 1000 }, database: join(served, 'panelx.db') })
    try {
      for (const id of [confirmed.id, waiting.id]) {
        await app.page.goto(`${app.site}/#/visitor/${id}`, { timeout: 60_000 })
        await waitForThePage(app.page, 60_000)
        await app.page.locator('.cred-meaning').waitFor()
        expect(await app.page.locator('.cred-meaning').innerText()).toBe(CREDENTIAL_WORDS.tokenRemoved)
        // Plan 7FEOshq3mBGG lets the look set a label title's case.
        const standing = await app.page.locator('.px-panel-title').first().textContent()
        expect(standing).toBe(CREDENTIAL_WORDS.tokenRemovedStanding)
        expect(standing, 'the page says the credential waits for a confirm the press would refuse').not.toBe(CREDENTIAL_WORDS.standing.pending)
        expect(await app.page.locator('.cred-confirm').count(), 'a Confirm press is drawn for a credential no token works under').toBe(0)
        expect(await app.page.locator('.cred-end').count()).toBe(1)
      }
      await app.page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      const asking = app.page.locator('.emb-asking-card')
      expect(await asking.count(), 'the pending visitor can still be refused').toBe(1)
      expect(await asking.first().innerText()).toContain('A restored waiting visitor')
      // THE CARD DRAWS THE STATE THE CREDENTIAL'S PAGE IS TITLED BY, and offers no press to let it in: the confirm is refused.
      expect(await asking.first().innerText()).toContain(CREDENTIAL_WORDS.tokenRemovedStanding)
      expect(await asking.first().getByRole('button', { name: EMBASSY_WORDS.confirm }).count(), 'a Let it in press the server refuses').toBe(0)

      const shots = process.env['RESTORED_VISITOR_SHOTS']
      if (shots !== undefined && shots !== '') {
        mkdirSync(shots, { recursive: true })
        for (const [id, name] of [[confirmed.id, 'confirmed'], [waiting.id, 'waiting']] as const) {
          await app.page.goto(`${app.site}/#/visitor/${id}`, { timeout: 60_000 })
          await waitForThePage(app.page, 60_000)
          await app.page.locator('.cred-meaning').waitFor()
          for (const width of [1440, 990, 660, 390]) {
            for (const theme of ['light', 'dark'] as const) {
              await app.page.setViewportSize({ width, height: 1000 })
              await app.page.emulateMedia({ colorScheme: theme })
              await app.page.screenshot({ path: `${shots}/restored-visitor-${name}-${String(width)}-${theme}.png`, fullPage: true })
            }
          }
        }
      }
    } finally {
      await app.stop()
    }
  }, 300_000)
})
