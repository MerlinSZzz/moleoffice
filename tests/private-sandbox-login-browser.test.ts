// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { testShots } from './where-shots-go.ts'
import { privateLoginBrowser } from './private-sandbox-login-browser-stand.ts'
const pictures = process.env['PRIVATE_LOGIN_PICTURES'] ?? testShots('private-sandbox-login')
let drawn: Awaited<ReturnType<typeof privateLoginBrowser>>
beforeAll(async () => { drawn = await privateLoginBrowser() })
afterAll(async () => { await drawn?.close() })
it('starts one dedicated panel, clears protected input, handles popup failure and cancels', async () => {
  const page = drawn.page
  await page.getByRole('button', { name: 'Add Claude login', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  expect(drawn.counts().starts).toBe(1)
  expect(await page.getByLabel('Subscription token').count()).toBe(0)
  await page.getByRole('button', { name: 'Open sign-in page', exact: true }).click()
  await page.getByText('The sign-in page could not be opened. Allow a new window and press again.').waitFor()
  const code = page.getByLabel('Short sign-in code', { exact: true })
  expect(await code.getAttribute('type')).toBe('password')
  expect(await code.getAttribute('autocomplete')).toBe('off')
  await code.fill('invented-browser-private-code')
  await page.getByRole('button', { name: 'Submit code', exact: true }).click()
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('input')).some(e => e.value !== ''))
  expect(drawn.counts().inputs).toBe(1)
  expect(await page.evaluate(() => (window as any).privateStorageWrites)).toEqual([])
  expect(await page.locator('body').textContent()).not.toContain('invented-browser-private-code')
  expect(drawn.visits.some(url => url.includes('invented-'))).toBe(false)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByText('Sign-in was cancelled or declined.').waitFor()
  expect(drawn.counts().cancels).toBe(1)
})
it('photographs the pending state at the widest and narrowest widths and the added state at one width, in the light theme, without secret text', async () => {
  mkdirSync(pictures, { recursive: true })
  const page = drawn.page
  await page.reload(); await page.addScriptTag({ content: '' }).catch(() => {})
  // A fresh component creates a fresh view binding after the cancelled panel is dismissed.
  await drawn.close(); drawn = await privateLoginBrowser()
  await drawn.page.getByRole('button', { name: 'Add Claude login', exact: true }).click()
  await drawn.page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  for (const theme of ['light']) for (const width of [1440, 390]) {
    await drawn.page.setViewportSize({ width, height: 900 }); await drawn.palette(theme)
    await drawn.page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
    await drawn.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await drawn.page.screenshot({ path: join(pictures, `pending-${theme}-${width}.png`), animations: 'disabled' })
    expect(await drawn.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  drawn.complete(); await drawn.page.getByText('Added; current login unchanged.').waitFor()
  for (const theme of ['light']) for (const width of [1440]) {
    await drawn.page.setViewportSize({ width, height: 900 }); await drawn.palette(theme)
    await drawn.page.getByText('Added; current login unchanged.').waitFor()
    await drawn.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await drawn.page.screenshot({ path: join(pictures, `added-${theme}-${width}.png`), animations: 'disabled' })
    expect(await drawn.page.locator('body').textContent()).not.toMatch(/invented-private-state|invented-browser-private-code/)
  }
})
it('requires an explicit fresh binding after cancellation/completion and never retries unknown', async () => {
  await drawn.close(); drawn=await privateLoginBrowser()
  const page=drawn.page
  expect(await drawn.startsAfter(()=>page.getByRole('button',{name:'Add Claude login',exact:true}).dblclick())).toBe(1)
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByRole('button',{name:'Done',exact:true}).click()
  expect(await drawn.startsAfter(()=>page.getByRole('button',{name:'Add Claude login',exact:true}).click())).toBe(2)
  drawn.complete(); await page.getByText('Added; current login unchanged.').waitFor()
  await page.getByRole('button',{name:'Done',exact:true}).click()
  expect(await drawn.startsAfter(()=>page.getByRole('button',{name:'Add Claude login',exact:true}).click())).toBe(3)
  drawn.setState({state:'unknown',reason:'PoolUnknown',code:false,canOpen:false})
  await page.getByText('The login could not be confirmed. Its result must be checked before another sign-in.').waitFor()
  expect(await page.getByRole('button',{name:'Done',exact:true}).count()).toBe(0)
  expect(await page.getByRole('button',{name:'Add Claude login',exact:true}).isDisabled()).toBe(true)
  expect(drawn.counts().starts).toBe(3)
})
/**
 * A PRESS RETURNS BEFORE ITS REQUEST IS COUNTED. The route counts a start when the request reaches it, and a loaded
 * machine can reach it after click() has returned. Here the route holds the request until the press has returned, so a
 * count read as soon as the press returns reads 0.
 * Mutation: startsAfter reads the count once the press returns, without waiting for the answer → expected 0 to be 1.
 */
it('counts a start once its request has been answered, though the route answers after the press has returned', async () => {
  await drawn.close(); drawn=await privateLoginBrowser({holdTheStart:true})
  let returned=()=>{}; const pressReturned=new Promise<void>(resolve=>{returned=()=>resolve()})
  const counted=drawn.startsAfter(async()=>{await drawn.page.getByRole('button',{name:'Add Claude login',exact:true}).click();returned()})
  await Promise.all([drawn.startIsHeld,pressReturned])
  drawn.releaseTheStart()
  expect(await counted).toBe(1)
})
it('uses the actual browser client and guarded HTTP routes for same-origin GET without Origin', async () => {
  const {createServer}=await import('node:net')
  const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as import('node:net').AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()))
  const previousPort=process.env['MOLE_OFFICE_PORT'];process.env['MOLE_OFFICE_PORT']=String(port)
  const {freshDb,apiApp}=await import('./helpers.ts');const db=await freshDb();const built=await apiApp()
  const {THE_PERSON}=await import('../src/shared/person.ts')
  const {createPrivateLogin}=await import('../src/holder/private-sandbox-login.mjs')
  const {vi}=await import('vitest')
  const terminals=await import('../src/server/lib/terminals.ts')
  const native= {version:1,executable:'/invented/setup',args:['setup-token'],allowedSignInOrigins:['https://signin.invalid'],verified:{protocol:true,callback:true,code:false,storageIsolation:true,dumpPrevention:true,ownerWatch:true},createParser:()=>({feed:()=>[],clear:()=>{}}),start:vi.fn(async()=>({pgid:987654,identity:'invented-start',matchesIdentity:()=>true,signalGroup:()=>{},clear:()=>{},disposeScratch:()=>{},writeCode:()=>{}}))}
  const service=createPrivateLogin({adapter:native,pool:{available:()=>true,add:async()=>({letter:'E',sha12:'123456abcdef'})}})
  const spy=vi.spyOn(terminals,'askPrivateLoginHolder').mockImplementation(req=>service.handle(req))
  const received: {origin:unknown;site:unknown}[]=[]
  built.app.server.on('request',request=>{if(request.url?.startsWith('/api/office/sandbox-logins/claude/'))received.push({origin:request.headers.origin,site:request.headers['sec-fetch-site']})})
  await built.app.listen({port,host:'127.0.0.1'})
  const browser=await privateLoginBrowser({owner:THE_PERSON,origin:'http://127.0.0.1:'+port,realHttp:true})
  try {
    await browser.page.waitForFunction(()=>{const button=document.querySelector('button');return button && (!button.disabled || document.querySelector('[role=alert]'))})
    expect(await browser.page.getByRole('button',{name:'Add Claude login',exact:true}).isDisabled(), await browser.page.locator('body').textContent() ?? '').toBe(false)
    await browser.page.getByRole('button',{name:'Add Claude login',exact:true}).click()
    await browser.page.getByRole('heading',{name:'Sign in',exact:true}).waitFor()
    expect(received.some(r=>r.origin===undefined && r.site==='same-origin')).toBe(true)
    expect(native.start).toHaveBeenCalledTimes(1)
    await browser.page.getByRole('button',{name:'Cancel',exact:true}).click()
    await browser.page.getByText('Sign-in was cancelled or declined.').waitFor()
  } finally {await browser.close();service.close();spy.mockRestore();await built.app.close();db.close();if(previousPort===undefined)delete process.env['MOLE_OFFICE_PORT'];else process.env['MOLE_OFFICE_PORT']=previousPort}
})
it('refuses an expired protected request before contacting any endpoint', async () => {
  const {api:settingsDoors}=await import('../src/web/api.ts')
  const {vi}=await import('vitest');vi.useFakeTimers();vi.setSystemTime(1000)
  const fetch=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal('fetch',fetch)
  try {
    const state={attempt:'d'.repeat(32),generation:'b'.repeat(32),state:'waiting' as const,deadline:999,canOpen:true,code:true}
    const outcome=settingsDoors.privateLoginCode('a'.repeat(32),state,'invented-expired-code').then(()=>null,error=>error as {code:string})
    expect(fetch).not.toHaveBeenCalled()
    expect(await outcome).toMatchObject({code:'privateLoginExpired'})
  } finally {vi.useRealTimers();vi.unstubAllGlobals()}
})
it('aborts a stalled private fetch at the remaining deadline and clears its owned body', async () => {
  const transport=await import('../src/web/api.ts');const original=transport.request;const settingsDoors=transport.api
  const {vi}=await import('vitest');vi.useFakeTimers();vi.setSystemTime(1000)
  let sent:RequestInit|undefined;let owned:RequestInit|undefined
  const fetch=vi.fn((_url:unknown,init:RequestInit)=>{sent=init;return new Promise<Response>(()=>{})});vi.stubGlobal('fetch',fetch)
  const spy=vi.spyOn(transport,'request').mockImplementation(function<T>(path:string,init?:RequestInit,reads?:'json'|'text'|'bytes'):Promise<T>{owned=init;return original<T>(path,init,reads)})
  try {
    const state={attempt:'d'.repeat(32),generation:'b'.repeat(32),state:'waiting' as const,deadline:1100,canOpen:true,code:true}
    const outcome=settingsDoors.privateLoginCode('a'.repeat(32),state,'invented-stalled-code').then(()=>null,error=>error as {code:string})
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(owned?.body).toContain('invented-stalled-code')
    await vi.advanceTimersByTimeAsync(100)
    expect(sent?.signal?.aborted).toBe(true)
    expect(await outcome).toMatchObject({code:'privateLoginExpired'})
    expect(owned?.body).toBeUndefined()
  } finally {spy.mockRestore();vi.useRealTimers();vi.unstubAllGlobals()}
})
