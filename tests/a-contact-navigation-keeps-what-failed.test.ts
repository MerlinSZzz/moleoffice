// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FAILED CONTACT NAVIGATION KEEPS WHAT FAILED (wave 13n round AS).
 *
 * The chat test opens a contact and waits for the notice that says the office could not tell or
 * cannot reach. When that navigation fails, the old run left only a locator timeout: no request,
 * no response status, no page error and no page state, so nobody could say what the page was doing.
 * This file proves the helper the chat test now uses. The helper watches the scoped API requests and
 * the page's own errors from before the chat page is opened until the notice is drawn. When the
 * navigation fails, it puts the refusal, the injected page error and the page's own state into the
 * original error, and it takes its listeners off again.
 *
 * The first case refuses one real contact read, keeping the real reply's own headers, and makes the
 * page throw one error of this fixture's own. It sees the original error object, message and stack at
 * the wait itself, then asserts that the helper rethrows that same object with the message and stack
 * unchanged at the front, and that the refusal, the page error and the page state follow in the
 * appended evidence. The captured address must carry no query value: a made-up search value and a
 * made-up route value go into the page's address, and both must be absent from the kept page state
 * and from the appended evidence. The original error is left out of that check because the browser's
 * own words may repeat the address it was on. The listeners are inventoried on the page before and
 * after rather than copied from the helper, so a listener this test never heard of cannot escape.
 * The second case opens a contact with nothing refused: the helper returns without a fault, no page
 * error or failed request was seen, and no listener is left behind. The third case makes a bounded
 * fixture of 65 requests and 11 page errors, more than any fixed cap this helper once kept, and
 * asserts that every one is retained.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Locator, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheContact, type ContactNavigationFailure } from './a-contact-navigation-keeps-what-failed.ts'

let app: LiveApp
const contexts: BrowserContext[] = []
/** A made-up agent with one made-up message, so its contact row is drawn. */
const NAME = 'Test Osprey'
const HANDLE = 'contact-evidence-osprey'
/** What this fixture's refused contact read says, and the page error it injects. */
const REFUSAL = 'The fixture contact read is refused.'
const PAGE_ERROR = 'AS contact-navigation fixture page error'
/**
 * Made-up query values, one in the search and one in the router's hash. They are generated for this
 * run and never printed, so finding either in the evidence means the helper kept a query value.
 */
const SEARCH_SECRET = randomUUID()
const ROUTE_SECRET = randomUUID()
/** The fixture's bounded event list: more requests and page errors than the helper's old caps. */
const THE_REQUESTS_TO_MAKE = 65
const THE_PAGE_ERRORS_TO_THROW = 11

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function request(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  expect(response.status, `${path}: ${await response.clone().text()}`).toBe(theAnswerToAWriteInATestOffice(HEADERS, body))
  return response.json()
}

async function aWindow(): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  contexts.push(context)
  await context.grantPermissions(['local-network-access'], { origin: app.site })
  return context.newPage()
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto(`${app.site}/${address}`)
  await waitForThePage(page, 30_000)
}

/**
 * Every event this page holds a listener for, and how many. It is read from the page itself rather
 * than from a list this test keeps, so an event the helper adds later is counted too.
 */
function theListenerInventory(page: Page): Record<string, number> {
  const counting = page as unknown as {
    eventNames(): (string | symbol)[]
    listenerCount(event: string | symbol): number
  }
  const counts = counting.eventNames().map((event) => [String(event), counting.listenerCount(event)] as const)
  return Object.fromEntries(counts.sort(([left], [right]) => left.localeCompare(right)))
}

/** An address reduced to its origin, path and route, with every query value left out. */
function withoutQuery(address: string): string {
  const parsed = new URL(address)
  return `${parsed.origin}${parsed.pathname}${parsed.hash.split('?')[0] ?? ''}`
}

/** The original error as it was at the wait, before the helper put its evidence beside it. */
interface TheObservedOriginal {
  error: Error
  name: string
  message: string
  stack: string
}

/**
 * Watch the readiness wait and remember the error it really threw, before the helper catches it.
 * The wrapper also puts a made-up value in the router's query after the failure, which the helper
 * then captures as page state. It changes no route, because replacing the address this way fires no
 * hashchange. The original error is thrown back unchanged, so the helper still receives it.
 */
function observingTheWait(page: Page, ready: Locator): { ready: Locator; observed: () => TheObservedOriginal | null } {
  let seen: TheObservedOriginal | null = null
  const waiting = {
    async waitFor(options?: { timeout?: number }): Promise<void> {
      try {
        await ready.waitFor(options)
      } catch (error) {
        const original = error instanceof Error ? error : new Error(String(error))
        seen = { error: original, name: original.name, message: original.message, stack: original.stack ?? '' }
        try {
          await page.evaluate((value) => {
            window.history.replaceState(null, '', `#/chat?as-contact-route=${value}`)
          }, ROUTE_SECRET)
        } catch {
          // The page is gone; the search value still proves the captured address carries no query.
        }
        throw error
      }
    },
  }
  return { ready: waiting as unknown as Locator, observed: () => seen }
}

beforeAll(async () => {
  app = await liveApp({ name: 'contact-navigation-evidence', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await request('/api/records', { kind: 'agent', title: NAME, data: { handle: HANDLE, runtime: 'claude-code', state: 'active' } })
  await request('/api/records', {
    kind: 'message',
    title: 'A made-up question',
    data: { body: 'Can you read the lighthouse log for me?', to: [{ kind: 'agent', id: HANDLE }] },
  })
}, 240_000)

afterAll(async () => {
  for (const context of contexts) await context.close()
  await app?.stop()
}, 60_000)

describe('a failed contact navigation keeps what failed', () => {
  it('puts the refusal, the page error and the page state in the original error, and leaves no listener', async () => {
    const page = await aWindow()
    await page.route(
      (url) => url.pathname === '/api/messages/conversation',
      async (route) => {
        const real = await route.fetch()
        await route.fulfill({ response: real, status: 403, json: { error: `${REFUSAL} This longer diagnostic belongs in the details.`, reason: REFUSAL } })
        await page.evaluate((message) => {
          setTimeout(() => {
            throw new Error(message)
          }, 0)
        }, PAGE_ERROR)
      },
    )
    const before = theListenerInventory(page)
    const watched = observingTheWait(page, page.locator('.px-chat-cannot-reach-words'))
    const failed = await openTheContact(
      page,
      () => open(page, `?lang=en&as-contact-search=${SEARCH_SECRET}#/chat`),
      page.locator('.px-chat-contact', { hasText: NAME }).first(),
      watched.ready,
    ).then(
      () => null,
      (error: unknown) => error as ContactNavigationFailure,
    )

    expect(failed, 'the refused contact read left the navigation looking successful').not.toBeNull()
    const original = watched.observed()
    expect(original, 'the readiness wait did not throw, so there is no original error to compare').not.toBeNull()
    expect(failed, 'the helper replaced the original error').toBe(original!.error)
    expect(failed!.name, 'the original error name changed').toBe(original!.name)
    expect(failed!.message.startsWith(original!.message), 'the original message no longer leads').toBe(true)
    const stack = failed!.stack ?? ''
    expect(stack.startsWith(original!.stack), 'the original stack no longer leads').toBe(true)
    const appendedMessage = failed!.message.slice(original!.message.length)
    const appendedStack = stack.slice(original!.stack.length)
    expect(appendedMessage, 'the evidence is not in the message').toContain('contact navigation evidence')
    expect(appendedStack, 'the evidence is not in the stack, so the JSON report would lose it').toContain('contact navigation evidence')

    const evidence = failed!.contactNavigation
    expect(evidence, 'the original error carries no contact navigation evidence').toBeDefined()
    const refused = evidence.requests.filter((one) => one.path === '/api/messages/conversation')
    expect(refused.length, 'the real contact read was not watched').toBeGreaterThan(0)
    expect(refused.every((one) => one.method === 'GET')).toBe(true)
    expect(refused.some((one) => one.outcome === 'HTTP 403'), JSON.stringify(refused)).toBe(true)
    const pageError = evidence.pageErrors.find((one) => one.message.includes(PAGE_ERROR))
    expect(pageError, 'the page error the page threw was not kept').toBeDefined()
    expect(evidence.state, 'the page state was not captured').not.toBeNull()
    expect(evidence.state!.url, 'the captured URL is not the page route without its query values').toBe(withoutQuery(page.url()))
    expect(evidence.state!.readyState).toBe('complete')
    expect(evidence.state!.contacts, 'the contact rows the page drew were not counted').toBeGreaterThan(0)
    expect(evidence.state!.matchingContacts, `the row for ${NAME} was not found in the page state`).toBeGreaterThan(0)

    // THE GENERATED QUERY VALUES ARE KEPT OUT OF THE STATE AND OUT OF THE APPENDED EVIDENCE. The
    // untouched original error is not searched, because the browser's own words may quote the address.
    const kept = JSON.stringify(evidence)
    for (const secret of [SEARCH_SECRET, ROUTE_SECRET]) {
      expect(kept, 'a generated query value was kept in the diagnostics').not.toContain(secret)
      expect(appendedMessage, 'a generated query value was kept in the appended message').not.toContain(secret)
      expect(appendedStack, 'a generated query value was kept in the appended stack').not.toContain(secret)
    }

    for (const said of [
      'GET /api/messages/conversation',
      'HTTP 403',
      PAGE_ERROR,
      `url=${evidence.state!.url}`,
      `contacts=${String(evidence.state!.contacts)}`,
      `matching=${String(evidence.state!.matchingContacts)}`,
      `readyState=${evidence.state!.readyState}`,
    ]) {
      expect(appendedMessage, `${said} is missing from the appended evidence`).toContain(said)
    }
    expect(theListenerInventory(page), 'the helper left a listener on the page after a failure').toEqual(before)
  }, 120_000)

  it('returns quietly and leaves no listener when the contact opens', async () => {
    const page = await aWindow()
    const before = theListenerInventory(page)
    const evidence = await openTheContact(
      page,
      () => open(page, '#/chat'),
      page.locator('.px-chat-contact', { hasText: NAME }).first(),
      page.locator('.px-chat-cannot-reach-words'),
    )

    expect(evidence.pageErrors, 'a successful navigation kept a page error').toEqual([])
    expect(evidence.requests.filter((one) => one.outcome.startsWith('failed:')), 'a successful navigation kept a failed request').toEqual([])
    expect(
      evidence.requests.filter((one) => one.outcome.startsWith('HTTP ') && Number(one.outcome.slice('HTTP '.length)) >= 400),
      'a successful navigation kept a refused request',
    ).toEqual([])
    expect(evidence.requests.find((one) => one.path === '/api/messages/conversation')?.outcome, 'the real contact read was not watched').toBe('HTTP 200')
    expect(evidence.state?.contacts, 'the page drew no contact rows').toBeGreaterThan(0)
    expect(evidence.state?.matchingContacts, `the page did not draw the row for ${NAME}`).toBeGreaterThan(0)
    expect(theListenerInventory(page), 'the helper left a listener on the page after a success').toEqual(before)
  }, 120_000)

  it('keeps every request, later failure and page error in a bounded fixture', async () => {
    const page = await aWindow()
    const before = theListenerInventory(page)
    const afterHeadersReason = randomUUID()
    const evidence = await openTheContact(
      page,
      async () => {
        await open(page, '#/chat')
        const answered = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith('/api/as-contact-retention/'))
        await page.evaluate(
          async ({ requestCount, errorCount }) => {
            const paths: string[] = []
            for (let i = 0; i < requestCount; i += 1) paths.push(`/api/as-contact-retention/${String(i)}`)
            await Promise.all(paths.map((path) => fetch(path)))
            for (let i = 0; i < errorCount; i += 1) {
              setTimeout(() => {
                throw new Error(`AS contact-retention page error ${String(i)}`)
              }, 0)
            }
            await new Promise((done) => setTimeout(done, 50))
          },
          { requestCount: THE_REQUESTS_TO_MAKE, errorCount: THE_PAGE_ERRORS_TO_THROW },
        )
        // Replay a fixture failure after the real response headers, with a generated reason.
        const failed = (await answered).request()
        Object.defineProperty(failed, 'failure', { value: () => ({ errorText: afterHeadersReason }) })
        void (page as unknown as { emit(event: string, request: unknown): void }).emit('requestfailed', failed)
      },
      page.locator('.px-chat-contact', { hasText: NAME }).first(),
      page.locator('.px-chat-cannot-reach-words'),
    )

    const retained = evidence.requests.filter((one) => one.path.startsWith('/api/as-contact-retention/'))
    expect(retained.some((one) => one.outcome.includes(afterHeadersReason)), 'the failure after response headers was lost').toBe(true)
    expect(retained.length, `only ${String(retained.length)} of ${String(THE_REQUESTS_TO_MAKE)} requests were kept`).toBe(THE_REQUESTS_TO_MAKE)
    for (let i = 0; i < THE_REQUESTS_TO_MAKE; i += 1) {
      expect(retained.some((one) => one.path === `/api/as-contact-retention/${String(i)}`), `request ${String(i)} was dropped`).toBe(true)
    }
    const retainedErrors = evidence.pageErrors.filter((one) => one.message.startsWith('AS contact-retention page error '))
    expect(retainedErrors.length, `only ${String(retainedErrors.length)} of ${String(THE_PAGE_ERRORS_TO_THROW)} page errors were kept`).toBe(
      THE_PAGE_ERRORS_TO_THROW,
    )
    expect(theListenerInventory(page), 'the helper left a listener on the page after the bounded fixture').toEqual(before)
  }, 120_000)
})
