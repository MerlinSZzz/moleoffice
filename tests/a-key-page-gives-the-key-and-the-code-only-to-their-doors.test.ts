// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT TOOL'S KEY PAGE GIVES THE KEY, AND A SIGN-IN'S CODE, ONLY TO THEIR OWN DOORS, AND SAYS WHAT HAPPENED IN ONE LINE.
 * Wave 13u, round 242.
 *
 * The person asked that setting up a tool take only his ask, then typing and confirming. The key page,
 * #/set-up/<tool>/<way> (src/web/pages/SetUpAToolPage.tsx), holds one hidden input and Confirm for a key, or one Sign in
 * press for an account. The page is drawn in Chromium from a bundle, and every door it asks is answered by hand here.
 * No office runs, no agent tool runs, no sign-in starts and no tab opens: the page's window.open is a made-up one that
 * writes down what it was asked. The address and device code are the made-up ones of tests/made-up-agent-tools.ts, and
 * every key and name in this file is made up and says so.
 *
 *   1. THE ADDRESSES. Each of the five ways has its own address, and an address naming any other way is no page.
 *   2. THE KEY. After Confirm the page says it is checking and then the tool's answer. The input is empty at once, and
 *      the key is in exactly one request: the key door's body. It is in no address, no header, not on the page after the
 *      press, and in nothing the page wrote to its console. The line that the key goes to the tool's own login is on the
 *      page once.
 *   3. A REFUSAL. An OpenCode key names its provider, and a refused key is one failure line in the page's language,
 *      in English and in Chinese, made from the refusal's code and not from the server's English sentence.
 *   4. NOT INSTALLED. A tool that is not installed gets its line, and no input and no press.
 *   5. A SIGN-IN. Sign in opens the sign-in's address in a new tab given no way back to this page, shows the device
 *      code as text with Copy, and reads the signed-in door until the tool says it is signed in. Claude Code's sign-in
 *      takes the code its sign-in page shows, and that code is in exactly one request: the code door's body.
 *   6. WHAT TO DO NEXT. Four lines say that something failed, and each one's next sentence says what to do, in English
 *      and in Chinese, naming the press or the place by the words the page and the panel draw. Not installed: the Set
 *      up press in Settings' Coding tools. Not signed in: Confirm again under a key, and Sign in again after a sign-in,
 *      each with no word of the other's press. Not readable: ask the secretary in the chat. Another host: update the
 *      tool. This part reads the words only, with no browser.
 */
import { chromium, type Browser, type Page, type Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n, sayInEnglish } from '../src/shared/i18n.ts'
import type { WordKey, WordValues } from '../src/shared/i18n.ts'
import { parseRoute } from '../src/shared/addresses.ts'
import { SET_UP_WAYS, setUpPath } from '../src/shared/setting-up-a-tool.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { A_DEVICE_CODE, A_SIGN_IN_ADDRESS } from './made-up-agent-tools.ts'

const SITE = 'http://made-up-office.test'
const A_MADE_UP_KEY = 'MADE-UP-KEY-not-a-real-one-7d1c'
const A_MADE_UP_SIGN_IN_CODE = 'MADE-UP-SIGN-IN-CODE#made-up-state'
const A_MADE_UP_SIGN_IN = 'MadeUpSignIn0001'
const NAMES = { codex: 'Made-up Codex', opencode: 'Made-up OpenCode', 'claude-code': 'Made-up Claude Code' } as const
type ATool = keyof typeof NAMES

/** One request the page made, as the browser sent it. */
interface Asked { method: string; url: string; headers: Record<string, string>; body: string | null }

/** How the made-up office answers one page. */
interface TheOffice {
  /** Whether the tool is installed: the signed-in door answers not installed when it is not. */
  installed: boolean
  /** The key door's answer, or a refusal: status and body. */
  key?: { status: number; body: unknown }
  /** Whether the key door waits until the test lets it answer. */
  holdTheKey?: boolean
  /** The sign-in door's answer. */
  signIn?: Record<string, unknown>
}

interface AnOpenPage {
  page: Page
  asked: Asked[]
  console: string[]
  /** Let a held key door answer. */
  answerTheKey: () => void
  /** Make the signed-in door say the tool is signed in from now on. */
  signTheToolIn: () => void
}

let browser: Browser
let script = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `
        import './tests/a-page-of-a-test-office.ts';
        import { createElement as h } from 'react';
        import { createRoot } from 'react-dom/client';
        import { theApiIsOnPort } from './src/web/lib/api-address.ts';
        import { SetUpAToolPage } from './src/web/pages/SetUpAToolPage.tsx';
        theApiIsOnPort(null);
        const opened = [];
        window.open = (address, target) => {
          const tab = { opener: 'the key page' };
          opened.push({ address, target, tab });
          return tab;
        };
        window.keyPage = {
          open: (tool, way) => createRoot(document.getElementById('app')).render(h(SetUpAToolPage, { tool, way })),
          opened: () => opened.map((one) => ({ address: one.address, target: one.target, opener: one.tab.opener })),
        };`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The made-up key page did not build.')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => { await browser?.close() })

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** The key page for one way, in one language, with its doors answered by the made-up office. */
async function aKeyPage(tool: ATool, way: string, office: TheOffice, lang: 'en' | 'zh' = 'en'): Promise<AnOpenPage> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const asked: Asked[] = []
  const said: string[] = []
  page.on('console', (message) => said.push(message.text()))
  let letTheKeyAnswer: () => void = () => {}
  const theKeyMayAnswer = new Promise<void>((resolve) => { letTheKeyAnswer = resolve })
  let signingIn = false
  let signedIn = false
  await page.route(`${SITE}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' })
    asked.push({ method: request.method(), url: request.url(), headers: await request.allHeaders(), body: request.postData() })
    const path = url.pathname
    if (path === '/api/harnesses' && url.searchParams.get('part') === 'list') {
      return json(route, 200, { harnesses: (Object.keys(NAMES) as ATool[]).map((id) => ({ id, name: NAMES[id] })) })
    }
    if (path === `/api/harnesses/${tool}/signed-in`) {
      const reading = !office.installed
        ? { answer: 'notReadable', why: 'notInstalled', asked: null }
        : { answer: signedIn ? 'yes' : 'no', asked: 'made-up status command' }
      return json(route, 200, { harness: tool, signedIn: reading, signingIn: signingIn && !signedIn })
    }
    if (path === `/api/harnesses/${tool}/key` && request.method() === 'POST') {
      if (office.holdTheKey === true) await theKeyMayAnswer
      const answer = office.key ?? { status: 200, body: { harness: tool, provider: null, signedIn: { answer: 'yes', asked: 'made-up status command' } } }
      return json(route, answer.status, answer.body)
    }
    if (path === `/api/harnesses/${tool}/sign-in` && request.method() === 'POST') {
      signingIn = true
      return json(route, 201, office.signIn ?? {})
    }
    if (path === `/api/harnesses/${tool}/sign-in/code` && request.method() === 'POST') {
      return json(route, 200, { harness: tool, signIn: A_MADE_UP_SIGN_IN, codeGiven: true })
    }
    return json(route, 404, { error: 'The made-up office answers no such door.' })
  })
  await page.goto(`${SITE}/?lang=${lang}`)
  await page.addScriptTag({ content: script, type: 'module' })
  await page.waitForFunction(() => 'keyPage' in window, undefined, { timeout: 10_000 })
  await page.evaluate(([one, two]) => { (window as unknown as { keyPage: { open: (a: string, b: string) => void } }).keyPage.open(one!, two!) }, [tool, way])
  await page.getByRole('heading', { name: NAMES[tool], exact: true }).waitFor({ timeout: 10_000 })
  return { page, asked, console: said, answerTheKey: () => letTheKeyAnswer(), signTheToolIn: () => { signedIn = true } }
}

const say = (lang: 'en' | 'zh', key: WordKey, values?: WordValues) => (lang === 'en' ? sayInEnglish(key, values) : createI18n('zh').t(key, values))
const thePress = (page: Page, lang: 'en' | 'zh', key: WordKey) => page.getByRole('button', { name: say(lang, key), exact: true })
/** The one line under a press that says what happened. */
const theLine = (page: Page) => page.locator('.sut-said')
const theFailureLine = (page: Page) => page.locator('.sut-failed[role="alert"]')

/** Every request that carried this text anywhere: its address, a header, or its body. */
function whereItWent(asked: Asked[], text: string): { address: Asked[]; header: Asked[]; body: Asked[] } {
  return {
    address: asked.filter((one) => one.url.includes(text) || decodeURIComponent(one.url).includes(text)),
    header: asked.filter((one) => Object.values(one.headers).some((value) => value.includes(text))),
    body: asked.filter((one) => one.body?.includes(text) === true),
  }
}

describe('1. each way of setting up a tool has its own address', () => {
  it('reads the five addresses as the key page, each for its own tool and way, and no other', () => {
    for (const one of SET_UP_WAYS) {
      expect(parseRoute(`#${setUpPath(one)}`)).toEqual({ name: 'setUpATool', tool: one.tool, way: one.way })
    }
    for (const other of ['/set-up/codex/claude', '/set-up/codex', '/set-up/codex/api-key/more', '/set-up/made-up-tool/api-key']) {
      expect(parseRoute(`#${other}`).name, other).toBe('unknown')
    }
  })
})

describe('2. the key goes only in the key door\'s body', () => {
  it('says checking and then the answer, empties the input at once, and keeps the key nowhere else', async () => {
    const { page, asked, console: said, answerTheKey } = await aKeyPage('codex', 'api-key', { installed: true, holdTheKey: true })
    try {
      expect(await page.getByText(say('en', 'setUpATool.keyGoesToTheTool', { tool: NAMES.codex }), { exact: true }).count()).toBe(1)
      expect(await page.getByText(say('en', 'setUpATool.way.codexApiKey'), { exact: true }).count()).toBe(1)
      const field = page.locator('input')
      expect(await field.count(), 'the page has one input').toBe(1)
      expect(await field.getAttribute('type')).toBe('password')
      await field.fill(A_MADE_UP_KEY)
      await thePress(page, 'en', 'setUpATool.confirm').click()
      await expect.poll(() => theLine(page).textContent(), { timeout: 5_000 }).toBe(say('en', 'setUpATool.checking'))
      expect(await field.inputValue(), 'the input is empty while the key door is asked').toBe('')
      answerTheKey()
      await expect.poll(() => theLine(page).textContent(), { timeout: 5_000 }).toBe(say('en', 'setUpATool.signedIn', { tool: NAMES.codex }))

      const went = whereItWent(asked, A_MADE_UP_KEY)
      expect(went.address, 'the key was in an address').toEqual([])
      expect(went.header, 'the key was in a header').toEqual([])
      expect(went.body.map((one) => `${one.method} ${new URL(one.url).pathname}`)).toEqual(['POST /api/harnesses/codex/key'])
      expect(JSON.parse(went.body[0]?.body ?? '{}')).toEqual({ key: A_MADE_UP_KEY })
      expect(await page.content(), 'the key is still on the page').not.toContain(A_MADE_UP_KEY)
      expect(said.filter((line) => line.includes(A_MADE_UP_KEY)), 'the page wrote the key to its console').toEqual([])
    } finally {
      await page.close()
    }
  }, 30_000)
})

describe('3. an OpenCode key names its provider, and a refused key is one line in the page\'s language', () => {
  for (const lang of ['en', 'zh'] as const) {
    it(`${lang}: draws the refusal's own words for its code, not the server's sentence`, async () => {
      const refusal = { error: 'MADE-UP server sentence that is not the page language.', code: 'harnessKeyLoginFailed', values: {} }
      const { page, asked } = await aKeyPage('opencode', 'opencode-go', { installed: true, key: { status: 422, body: refusal } }, lang)
      try {
        await page.locator('input').fill(A_MADE_UP_KEY)
        await thePress(page, lang, 'setUpATool.confirm').click()
        await expect.poll(() => theFailureLine(page).textContent(), { timeout: 5_000 }).toBe(say(lang, 'server.harnessKeyLoginFailed'))
        expect(await theFailureLine(page).count(), 'one failure line').toBe(1)
        expect(await page.content()).not.toContain(refusal.error)
        const went = whereItWent(asked, A_MADE_UP_KEY)
        expect(went.body.map((one) => new URL(one.url).pathname)).toEqual(['/api/harnesses/opencode/key'])
        expect(JSON.parse(went.body[0]?.body ?? '{}')).toEqual({ provider: 'opencode-go', key: A_MADE_UP_KEY })
        expect([...went.address, ...went.header]).toEqual([])
      } finally {
        await page.close()
      }
    }, 30_000)
  }
})

describe('4. a tool that is not installed gets one line and no input', () => {
  for (const [tool, way] of [['codex', 'api-key'], ['claude-code', 'claude']] as const) {
    it(`${tool}/${way}: says it is not installed, with no input and no press`, async () => {
      const { page, asked } = await aKeyPage(tool, way, { installed: false })
      try {
        await page.getByText(say('en', 'setUpATool.notInstalled', { tool: NAMES[tool] }), { exact: true }).waitFor({ timeout: 5_000 })
        expect(await page.locator('input').count()).toBe(0)
        expect(await thePress(page, 'en', 'setUpATool.confirm').count()).toBe(0)
        expect(await thePress(page, 'en', 'setUpATool.signIn').count()).toBe(0)
        const changes = asked.filter((one) => one.method !== 'GET' && new URL(one.url).pathname.startsWith('/api/harnesses'))
        expect(changes, 'the page asked a tool door that changes something').toEqual([])
      } finally {
        await page.close()
      }
    }, 30_000)
  }
})

describe('5. a sign-in opens its address with no way back, and its code goes only to the code door', () => {
  const started = (tool: ATool, takesACode: boolean, code: string | null) => ({
    harness: tool, id: A_MADE_UP_SIGN_IN, address: A_SIGN_IN_ADDRESS, noAddress: null, code, takesACode,
    aSecondTabMayOpen: false, started: '2026-11-22 06:00:00', already: false,
  })

  it('codex/chatgpt: opens the address in a new tab, shows the device code with Copy, and reads until signed in', async () => {
    const { page, signTheToolIn } = await aKeyPage('codex', 'chatgpt', { installed: true, signIn: started('codex', false, A_DEVICE_CODE) })
    try {
      expect(await page.locator('input').count(), 'a sign-in that takes no code has no input').toBe(0)
      await thePress(page, 'en', 'setUpATool.signIn').click()
      await expect.poll(() => theLine(page).textContent(), { timeout: 5_000 }).toBe(say('en', 'setUpATool.waiting'))
      const opened = await page.evaluate(() => (window as unknown as { keyPage: { opened: () => unknown[] } }).keyPage.opened())
      expect(opened).toEqual([{ address: A_SIGN_IN_ADDRESS, target: '_blank', opener: null }])
      expect(await page.locator('code.sut-code').textContent()).toBe(A_DEVICE_CODE)
      expect(await thePress(page, 'en', 'setUpATool.copy').count()).toBe(1)
      signTheToolIn()
      await expect.poll(() => theLine(page).textContent(), { timeout: 10_000 }).toBe(say('en', 'setUpATool.signedIn', { tool: NAMES.codex }))
    } finally {
      await page.close()
    }
  }, 30_000)

  it('claude-code/claude: takes the sign-in page\'s code once, and sends it only in the code door\'s body', async () => {
    const { page, asked } = await aKeyPage('claude-code', 'claude', { installed: true, signIn: started('claude-code', true, null) })
    try {
      await thePress(page, 'en', 'setUpATool.signIn').click()
      const field = page.locator('input')
      await field.waitFor({ timeout: 5_000 })
      await field.fill(A_MADE_UP_SIGN_IN_CODE)
      await thePress(page, 'en', 'setUpATool.confirm').click()
      await expect.poll(() => page.locator('input').count(), { timeout: 5_000 }).toBe(0)
      expect(await theLine(page).textContent()).toBe(say('en', 'setUpATool.checking'))
      const went = whereItWent(asked, A_MADE_UP_SIGN_IN_CODE)
      expect(went.body.map((one) => `${one.method} ${new URL(one.url).pathname}`)).toEqual(['POST /api/harnesses/claude-code/sign-in/code'])
      expect(JSON.parse(went.body[0]?.body ?? '{}')).toEqual({ signIn: A_MADE_UP_SIGN_IN, code: A_MADE_UP_SIGN_IN_CODE })
      expect([...went.address, ...went.header]).toEqual([])
      expect(await page.content()).not.toContain(A_MADE_UP_SIGN_IN_CODE)
    } finally {
      await page.close()
    }
  }, 30_000)
})

describe('6. each failure line says what to do next, in the words of the press or place it names', () => {
  /** What a line says after its first sentence, which is the step it asks for. The tool's made-up name has no full stop. */
  const theNextStep = (line: string) => {
    const end = line.search(/[.。]/)
    return end < 0 ? '' : line.slice(end + 1)
  }
  const tool = NAMES.codex
  const THE_SECRETARY_AND_THE_CHAT = { en: ['secretary', 'chat'], zh: ['秘书', '聊天'] } as const
  const UPDATE = { en: 'update', zh: '更新' } as const

  for (const lang of ['en', 'zh'] as const) {
    it(`${lang}: not installed names Set up and Coding tools; not signed in names Confirm under a key and Sign in after a sign-in; not readable names the secretary and the chat; another host says to update`, () => {
      const notInstalled = theNextStep(say(lang, 'setUpATool.notInstalled', { tool }))
      expect(notInstalled).toContain(say(lang, 'settingsPanel.tools.setUp'))
      expect(notInstalled).toContain(say(lang, 'settingsPanel.title.codingtools'))

      const underAKey = theNextStep(say(lang, 'setUpATool.notSignedIn', { tool }))
      expect(underAKey).toContain(say(lang, 'setUpATool.confirm'))
      expect(underAKey).not.toContain(say(lang, 'setUpATool.signIn'))
      const afterASignIn = theNextStep(say(lang, 'setUpATool.notSignedInAfterSignIn', { tool }))
      expect(afterASignIn).toContain(say(lang, 'setUpATool.signIn'))
      expect(afterASignIn).not.toContain(say(lang, 'setUpATool.confirm'))

      const notReadable = theNextStep(say(lang, 'setUpATool.signedInUnread', { tool }))
      for (const words of THE_SECRETARY_AND_THE_CHAT[lang]) expect(notReadable).toContain(words)

      const anotherHost = theNextStep(say(lang, 'setUpATool.noAddress.anotherHost', { tool }))
      expect(anotherHost).toContain(UPDATE[lang])
    })
  }
})
