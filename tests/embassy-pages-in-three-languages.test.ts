// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'
import type { VisitorCredential, VisitorRequestRow } from '../src/shared/visitors.ts'
import type { WhatThePairingSays } from '../src/shared/pairing.ts'
import type { PageLanguage } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'
import { KEY_REVOCATION_UNDO_MS } from '../src/shared/danger-tiers.ts'

const secret = 'wire-only-'
const stamp = '2026-09-20 12:00:00'
const visitor: VisitorCredential = {
  id: `${secret}credential`, handle: `${secret}handle`, name: 'Test visitor · Rill', role: 'worker',
  world: `${secret}world`, machine: `${secret}host:48123`, machineHow: `${secret}connection`,
  facts: { conversationPath: `/${secret}transcript`, startDirectory: `/${secret}folder`, runtime: `${secret}runtime`, machine: `${secret}machine`, sessionRecord: `${secret}run` },
  standing: 'pending', confirmedBy: { kind: 'person', id: `${secret}person` }, confirmedAt: null,
  endsAt: '2026-10-20 12:00:00', endedAt: null, endedBecause: null, issuedAt: stamp,
  requests: 2, writes: 1, mismatches: 1, lastAskedAt: stamp, tokenRemoved: false,
}
const citizen: EmbassyRow = {
  standing: 'citizen', who: { kind: 'agent', id: `${secret}agent` }, name: 'Test agent · Brook', registered: true,
  avatarUrl: '', world: `${secret}world`, worldName: 'Test world · Orchard', fromWorld: `${secret}from`, fromWorldName: null,
  since: stamp, until: null, citizenSince: stamp, role: 'worker', choseRole: true, cardChosenBy: null,
  portrait: null, credential: visitor.id, device: false, heldKeys: [{ id: `${secret}key`, is: 'its-own', of: null, madeAt: stamp, lastUsedAt: null }], runtime: `${secret}runtime`, machine: visitor.machine,
  admittedBeforeP88: `${secret}registration`, cardCeilingRaised: `${secret}MOLE_SETTING`,
  pickUpCost: { lastTurnTokens: 1000, idleMinutes: 10, warning: `${secret}run-warning` },
  chosePortrait: false, contact: true, group: 'Test group', groupKey: 'test-group', groupMade: true, presence: { colour: 'green', word: 'Online', says: `${secret}presence` }, retired: null,
}
const populated: WhatTheEmbassySays = {
  rows: [citizen, { ...citizen, who: { kind: 'agent', id: `${secret}retired-agent` }, name: 'Test retired · Reed', heldKeys: [], presence: { colour: 'red', word: 'Gone', says: `${secret}retirement` },
    retired: { at: stamp, because: 'Test retirement reason', by: { kind: 'agent', id: `${secret}retirer` }, byHandle: 'Test starter' } },
    { ...citizen, who: { kind: 'person', id: `${secret}stranger` }, name: null, heldKeys: [], contact: false, credential: null, role: null, presence: null }],
  visitors: [visitor, { ...visitor, id: `${secret}device`, name: 'Test device · Slate', role: '' }],
  worlds: [{ world: { id: `${secret}world-row`, name: 'Test world · Orchard', kind: 'home', startedBy: { kind: 'agent', id: `${secret}starter` },
    checkout: `/${secret}checkout`, head: `${secret}branch`, databaseIdentity: `${secret}database`, address: 'http://wire-only-host:48123',
    addressForOtherMachines: null, standing: 'alive', parentWorld: null, bornAt: stamp, diedAt: null, diedBecause: null, installation: `${secret}installation` },
    owner: { kind: 'person', id: `${secret}owner` }, ownerIsAClaim: `${secret}owner-claim`, isThisWorld: true,
    citizens: 3, visitsFrom: 0, visitsTo: 1, credentials: 2, openCredentials: 2, requests: 2, writes: 1, mismatches: 1 }],
  // THE OFFICE'S OWN SENDER ROW, drawn apart from the rows: its id is wire-only like every other id.
  office: { who: { kind: 'agent', id: `${secret}office` }, name: 'Test office · Elm', avatarUrl: '' },
  says: `${secret}summary /api/office/embassy`, isTheOffice: true, workspaceId: `${secret}workspace`,
}
const request: VisitorRequestRow = {
  id: `${secret}request`, credential: visitor.id, at: stamp, method: 'POST', route: '/api/wire-only-door', operation: `${secret}operation`,
  wrote: true, refusedBecause: `${secret}refusal`, mismatch: [{ said: `${secret}rawField`, issued: `/${secret}issued`, sent: `/${secret}sent` }],
}
const pairing: WhatThePairingSays = { paired: false, offered: false, mayAsk: true, mayMove: false, waiting: null }
const pages = ['embassy', 'credential', 'pairing'] as const
let app: LiveApp
let page: Page
let embassy = structuredClone(populated)
let credential = structuredClone(visitor)
let requests = [request]
const writes: { path: string; body: unknown }[] = []
let failNext = false
const pageErrors: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'g4-page-words', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'g4-browser.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {setWordLanguage,wordCheck} from './src/shared/i18n.ts';
    import {setMode} from './src/web/lib/mode.ts'; import {theApiIsOnPort} from './src/web/lib/api-address.ts';
    import {EmbassyPage} from './src/web/pages/EmbassyPage.tsx'; import {CredentialPage} from './src/web/pages/CredentialPage.tsx';
    import {PairingPage} from './src/web/pages/PairingPage.tsx'; import {UI_CSS} from './src/web/components/ui.tsx';
    theApiIsOnPort(${app.apiPort}); let revision=0; const root=createRoot(document.getElementById('test'));
    window.g4={check:wordCheck,draw(name,language,credential,pairing,inspect){
      setWordLanguage(language);setMode(inspect?'inspect':'normal');
      flushSync(()=>root.render(<React.Fragment key={++revision}><style>{UI_CSS}</style>
        {name==='embassy'?<EmbassyPage/>:name==='credential'?<CredentialPage id={credential}/>:
        <PairingPage said={{status:'ready',value:pairing}} onPaired={()=>{}}/>}</React.Fragment>));
    }};
  ` }, loader: { '.css': 'empty' }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })
  page = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/g4-pages', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test" class="page"></main></body></html>' }))
  await page.route('**/api/office/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') {
      writes.push({ path, body: route.request().postDataJSON() })
      if (failNext) { failNext = false; await route.fulfill({ status: 403, json: { error: 'Test refusal remains visible.' } }); return }
    }
    if (path.endsWith('/end')) {
      const id = decodeURIComponent(path.split('/').at(-2)!)
      credential = { ...credential, standing: 'ended', endedAt: stamp }
      embassy = { ...embassy, visitors: embassy.visitors.filter(one => one.id !== id) }
      // THE ENDED CREDENTIAL ALONE, as the route now answers: the page takes its card out where it stands.
      await route.fulfill({ json: { credential } }); return
    }
    if (path.endsWith('/revoke/undo')) {
      embassy = { ...embassy, rows: embassy.rows.map(one => one.who.id === citizen.who.id ? { ...one, heldKeys: citizen.heldKeys } : one) }
      await route.fulfill({ json: { restored: true } }); return
    }
    if (path.endsWith('/revoke')) {
      embassy = { ...embassy, rows: embassy.rows.map(one => one.who.id === citizen.who.id ? { ...one, heldKeys: [] } : one) }
      await route.fulfill({ json: { revoked: true, key: citizen.heldKeys[0], revokedAt: stamp, undoRemainingMs: KEY_REVOCATION_UNDO_MS } }); return
    }
    if (path.endsWith('/embassy')) {
      // THE PAGE ASKS A PAGE, ONE ROW OR THE WHOLE, and the stand-in answers each shape the page asks
      // for, so the words are drawn from the reply the real route would send. The whole reading is
      // still here for a caller that asks for one.
      const url = new URL(route.request().url())
      const row = url.searchParams.get('row')
      if (row !== null) {
        const one = row.startsWith('credential:')
          ? embassy.rows.find(one => one.credential === row.slice('credential:'.length) && !one.registered)
          : embassy.rows.find(one => `${one.who.kind}:${one.who.id}` === row && one.retired === null)
        await route.fulfill({ json: { ...embassy, rows: one === undefined ? [] : [one], visitors: [], worlds: [], rowsTotal: one === undefined ? 0 : 1, hidden: 0, retiredCount: 0, otherWorlds: 0, next: null } }); return
      }
      if (url.searchParams.get('shape') === 'page') {
        await route.fulfill({ json: { ...embassy, rowsTotal: embassy.rows.length, hidden: 0, retiredCount: embassy.rows.filter(one => one.retired !== null).length, otherWorlds: 0, next: null } }); return
      }
      await route.fulfill({ json: embassy }); return
    }
    if (path.includes('/visitors/')) { await route.fulfill({ json: { credential, requests } }); return }
    await route.continue()
  })
  await page.goto(`${app.site}/g4-pages`)
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') + '\nbody { padding: var(--gut); }' })
  await page.addScriptTag({ type: 'module', content: bundled.outputFiles[0]!.text })
  await page.waitForFunction(() => Boolean((window as any).g4))
}, 180_000)

afterAll(async () => { await page?.close(); await app?.stop() }, 60_000)

async function draw(name: typeof pages[number], language: PageLanguage, state = pairing, inspect = false) {
  await page.evaluate(({ name, language, id, state, inspect }) => (window as any).g4.draw(name, language, id, state, inspect), { name, language, id: visitor.id, state, inspect })
  await page.locator(name === 'embassy' ? '.emb-list' : name === 'credential' ? '.cred-limits' : '.pair-title').first().waitFor()
}

// Shared Avatar wording is outside G4 under supervisor message h5j9JVrTYy4U.
async function wordsOnPage(ownWordsOnly = false) {
  return page.locator('#test').evaluate((root, ownWordsOnly) => {
    const result: string[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.parentElement?.closest('style,script') || (ownWordsOnly && node.parentElement?.closest('.avatar'))) continue
      if (node.textContent?.trim()) result.push(node.textContent.trim())
    }
    for (const node of root.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) {
      if (ownWordsOnly && node.closest('.avatar')) continue
      for (const key of ['title', 'aria-label', 'alt', 'placeholder']) if (node.getAttribute(key)?.trim()) result.push(node.getAttribute(key)!.trim())
    }
    return result
  }, ownWordsOnly)
}

it('keeps ids, paths, runs, ports, branches, raw fields and settings out of normal pages', async () => {
  for (const language of ['en'] as const) for (const name of pages) {
    await draw(name, language)
    expect((await wordsOnPage()).join('\n'), name).not.toContain(secret)
  }
  await draw('credential', 'en', pairing, true)
  expect((await wordsOnPage()).join('\n')).toContain(visitor.facts.startDirectory)
  expect((await wordsOnPage()).join('\n')).toContain(request.route)
})

it('asks before refusing a visitor or ending a credential, and Cancel and Escape keep access unchanged', async () => {
  for (const language of ['en'] as const) for (const name of ['embassy', 'credential'] as const) {
    embassy = structuredClone(populated); credential = structuredClone(visitor); writes.length = 0
    await draw(name, language)
    const label = name === 'embassy' ? 'g4.embassy.refuse' : 'g4.credential.end'
    const words = en
    const button = page.getByRole('button').filter({ hasText: words[label] }).first()
    await button.click()
    let dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 5000 })
    expect(await dialog.locator('blockquote').innerText()).toBe(visitor.name)
    expect(writes).toHaveLength(0)
    await dialog.getByRole('button').first().click()
    expect(writes).toHaveLength(0)
    expect(await button.evaluate(node => node === document.activeElement)).toBe(true)
    await button.click(); await page.keyboard.press('Escape')
    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(writes).toHaveLength(0)
    await button.click(); dialog = page.getByRole('dialog')
    failNext = true
    await dialog.getByRole('button').last().click()
    await dialog.getByText('Test refusal remains visible.').waitFor()
    expect(credential.standing).toBe('pending')
    await dialog.getByRole('button').last().click()
    await dialog.waitFor({ state: 'hidden' })
    expect(writes).toHaveLength(2)
    expect(writes.map(one => one.path)).toEqual([`/api/office/visitors/${visitor.id}/end`, `/api/office/visitors/${visitor.id}/end`])
    expect(credential.standing).toBe('ended')
  }
  credential = structuredClone(visitor)
  await draw('credential', 'en')
  failNext = true
  await page.getByRole('button', { name: en['g4.credential.confirm'], exact: true }).click()
  await page.locator('.cred').getByText('Test refusal remains visible.').waitFor()
  await page.getByRole('button', { name: en['g4.credential.end'], exact: true }).click()
  const ending = page.getByRole('dialog')
  await ending.getByRole('button').last().click()
  await ending.waitFor({ state: 'hidden' })
  expect(credential.standing).toBe('ended')
  expect(await page.locator('.cred').textContent()).not.toContain('Test refusal remains visible.')
}, 120_000)

it('revokes at once and undoes the same key with the same receipt in each language', async () => {
  for (const language of ['en'] as const) {
    // THE PRESS IS ON THE CITIZEN'S OWN PAGE, NOT ON THE EMBASSY ROW. It answers question 15 of
    // report n9Mjk3c_sJRu. Here the citizen is a visitor no registry holds, so
    // its own page is the credential page it came in on.
    embassy = { ...structuredClone(populated), rows: populated.rows.map((one, i) => i === 0 ? { ...one, registered: false } : one) }
    writes.length = 0
    await draw('credential', language)
    const row = page.locator('.cred-presses')
    const words = en
    await row.getByRole('button').filter({ hasText: words['embassyKeys.revokeOwn'] }).waitFor()
    await row.getByRole('button').filter({ hasText: words['embassyKeys.revokeOwn'] }).click()
    const bar = row.locator('.tiered-undo'); await bar.waitFor()
    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(embassy.rows[0]!.heldKeys).toEqual([])
    expect(await bar.textContent()).toContain(words['embassyKeys.itsOwn'])
    await bar.getByRole('button').click()
    await bar.waitFor({ state: 'hidden' })
    expect(embassy.rows[0]!.heldKeys).toEqual(citizen.heldKeys)
    expect(writes).toEqual([
      { path: `/api/office/held-keys/${citizen.heldKeys[0]!.id}/revoke`, body: null },
      { path: `/api/office/held-keys/${citizen.heldKeys[0]!.id}/revoke/undo`, body: { revokedAt: stamp } },
    ])
  }
}, 120_000)
