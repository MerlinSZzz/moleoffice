// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { readFileSync } from 'node:fs'
import { drawInABrowser } from './what-the-browser-draws.ts'

/**
 * Mount the real component with invented HTTP replies; no provider or office is contacted. With holdTheStart, each
 * request to start an attempt waits at the route, before it is counted, until releaseTheStart(); startIsHeld resolves
 * once one waits there.
 */
export async function privateLoginBrowser(options: { origin?: string; owner?: string; realHttp?: boolean; holdTheStart?: boolean; respond?: (request: any) => Promise<{ status: number; body: string; headers?: Record<string,string> }> } = {}) {
  const result = await bundlePageCode({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {AddSandboxLogin} from './src/web/components/AddSandboxLogin.tsx'; import {theApiIsOnPort} from './src/web/lib/api-address.ts'; import {theOwnerIsKnown} from './src/shared/person.ts'; theApiIsOnPort(null); if(window.__inventedOwner)theOwnerIsKnown(window.__inventedOwner); createRoot(document.getElementById('root')).render(React.createElement(AddSandboxLogin));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"test"' } })
  const drawn = await drawInABrowser('<div id="root"></div>')
  const tokens = readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8')
  const origin = options.origin ?? 'http://office.invalid'
  await drawn.page.route(origin + '/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${tokens}</style></head><body><main style="padding:24px;max-width:760px;margin:auto"><div id="root"></div></main></body></html>` }))
  await drawn.page.goto(origin + '/')
  await drawn.page.evaluate(() => {
    const writes: string[] = []; (window as any).privateStorageWrites = writes
    Storage.prototype.setItem = function(key, value) { writes.push(key + ':' + value) }
    window.open = () => null
  })
  let state: any = { attempt: 'd'.repeat(32), generation: 'b'.repeat(32), state: 'waiting', deadline: Date.now() + 600000, canOpen: true, code: true }
  let starts = 0; let inputs = 0; let cancels = 0
  let held = () => {}, release = () => {}
  const startIsHeld = new Promise<void>(resolve => { held = () => resolve() })
  const visits: string[] = []
  await drawn.page.route('**/api/office/sandbox-logins/claude/**', async route => {
    const req = route.request();
    if (options.realHttp) { await route.continue(); return }
    if (options.respond) { const answer = await options.respond(req); await route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body }); return }
    const path = new URL(req.url()).pathname; visits.push(path)
    let body: unknown = state
    if (path.endsWith('/capability')) body = { version: 1, available: true, code: true, generation: 'b'.repeat(32) }
    else if (path.endsWith('/attempts')) { if (options.holdTheStart) { held(); await new Promise<void>(resolve => { release = () => resolve() }) } starts++; state={attempt:'d'.repeat(32),generation:'b'.repeat(32),state:'waiting',deadline:Date.now()+600000,canOpen:true,code:true}; body=state }
    else if (path.endsWith('/sign-in')) body = { url: 'https://signin.invalid/authorize?state=invented-private-state' }
    else if (path.endsWith('/code')) { inputs++; state = { ...state, code: false, state: 'waiting' }; body = state }
    else if (path.endsWith('/cancel')) { cancels++; state = { ...state, state: 'cancelled', reason: 'Cancelled', code: false, canOpen: false }; body = state }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(body) })
  })
  const errors: string[] = []; drawn.page.on('pageerror', error => { errors.push(error.message) })
  const ownerSetup = options.owner ? `window.__inventedOwner=${JSON.stringify(options.owner)};` : ''
  await drawn.page.addScriptTag({ content: ownerSetup + result.outputFiles[0]!.text })
  await drawn.page.waitForFunction(() => document.querySelector('button') !== null, undefined, { timeout: 8000 }).catch(async () => { await drawn.close(); throw new Error('Component did not mount: ' + errors.join('; ')) })
  /**
   * The number of starts once `press` has returned and the request it made to start an attempt has been answered. The
   * route counts a start when the request reaches it, which can be after the press has returned.
   */
  const startsAfter = async (press: () => Promise<unknown>) => {
    const answered = drawn.page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/attempts'))
    await press(); await answered; return starts
  }
  return { ...drawn, visits, counts: () => ({ starts, inputs, cancels }), startsAfter, startIsHeld, releaseTheStart: () => release(), setState: (next: any) => { state = {...state,...next} }, complete: () => { state = { ...state, state: 'added', letter: 'E', sha12: '123456abcdef', code: false, canOpen: false } } }
}
