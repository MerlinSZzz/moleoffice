// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A FAILED CONTACT NAVIGATION WAS DOING, PUT ON THE ERROR IT ALREADY THREW (wave 13n round AS).
 *
 * The chat test opens a contact and waits for the notice that says whether the office could not tell
 * or cannot reach. When that navigation fails, a bare locator timeout says nothing about the requests
 * the page made, whether one was refused, whether the page threw, or what it had drawn. The two
 * historical failures in the chat test left no such evidence, so nobody could say what happened.
 *
 * `openTheContact` watches from before the chat page is opened until the notice is drawn. It records
 * only what is needed to tell what drew: the method and path of each `/api/` request, its response
 * status or failure, the page's own errors, and the page's state at the failure. It never records a
 * header, a key, a query value or a response body. Every address it keeps is reduced to its origin,
 * its path and its route: the search and any query written in the route are left out. It keeps every
 * request and page error it saw, because it has no measured reason to drop any.
 *
 * When the navigation fails, the original error object is kept and its own message and stack come
 * first. The evidence is appended to both, because the default reporter and the JSON report read
 * the stack while a person reads the message. On success it returns the evidence and says nothing.
 * Its listeners are taken off on both paths, and the control beside the criterion counts them.
 */
import type { Locator, Page, Request, Response } from 'playwright'

/** One scoped API request the page made while the contact navigation was being watched. */
export interface ContactNavigationRequest {
  method: string
  /** The path only. The query is left out so no setting value can be kept here. */
  path: string
  resourceType: string
  /** The path of the frame that produced the request, where the browser says which one it was. */
  from: string
  /** How long after the watch began the request was made. */
  atMs: number
  /** `HTTP <status>`, `failed: <reason>`, or `no response seen`. */
  outcome: string
  /** How long after the watch began its answer came, or null when none was seen. */
  answeredAtMs: number | null
}

/** One uncaught error the page threw while the contact navigation was being watched. */
export interface ContactNavigationPageError {
  name: string
  message: string
  /** The first stack line after the message, where the browser said it was thrown. */
  where: string | null
  atMs: number
}

/** What the page had drawn at the moment the navigation failed. */
export interface ContactNavigationPageState {
  url: string
  readyState: string
  /** The value of the page's readiness marker, or null when the page had not written one. */
  ready: string | null
  contacts: number
  /** How many contact rows matched the one the navigation was trying to open. */
  matchingContacts: number
  cannotReach: number
  notices: string[]
  empty: string[]
  contactNames: string[]
}

/** Everything the watch kept about one contact navigation. */
export interface ContactNavigationEvidence {
  capturedForMs: number
  requests: ContactNavigationRequest[]
  pageErrors: ContactNavigationPageError[]
  state: ContactNavigationPageState | null
  stateUnavailable: string | null
  listenersDetached: boolean
}

/** The original error, with the evidence from the failed navigation beside it. */
export type ContactNavigationFailure = Error & { contactNavigation: ContactNavigationEvidence }

const THE_MOST_WORDS = 400

function oneLine(text: string, limit: number = THE_MOST_WORDS): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, limit)
}

/** The path of an address, where the browser could read one. */
function pathOf(address: string): string | null {
  try {
    return new URL(address).pathname
  } catch {
    return null
  }
}

/** The address reduced to its origin, path and route, with every query value left out. */
function addressWithoutQuery(address: string): string {
  try {
    const parsed = new URL(address)
    return `${parsed.origin}${parsed.pathname}${parsed.hash.split('?')[0] ?? ''}`
  } catch {
    return address
  }
}

/** Remove the query values from any web address written inside a line of browser text. */
function withoutQueryValues(text: string): string {
  return text.replace(/\bhttps?:\/\/[^\s)]+/g, (address) => addressWithoutQuery(address))
}

/** The path of the frame that made a request, or a plain answer when the browser gives none. */
function framePathOf(request: Request): string {
  try {
    return pathOf(request.frame().url()) ?? 'no frame'
  } catch {
    return 'no frame'
  }
}

/** Start watching this page. `stop` takes the listeners off once and answers the same evidence again. */
function beginWatching(page: Page): { stop(contact: Locator): Promise<ContactNavigationEvidence> } {
  const startedAt = Date.now()
  const requests = new Map<Request, ContactNavigationRequest>()
  const pageErrors: ContactNavigationPageError[] = []
  const sinceStart = (): number => Date.now() - startedAt

  const onRequest = (request: Request): void => {
    const path = pathOf(request.url())
    if (path === null || !path.startsWith('/api/') || requests.has(request)) return
    requests.set(request, {
      method: request.method(),
      path,
      resourceType: request.resourceType(),
      from: framePathOf(request),
      atMs: sinceStart(),
      outcome: 'no response seen',
      answeredAtMs: null,
    })
  }

  const onResponse = (response: Response): void => {
    const one = requests.get(response.request())
    if (one === undefined || one.answeredAtMs !== null) return
    one.outcome = `HTTP ${String(response.status())}`
    one.answeredAtMs = sinceStart()
  }

  const onRequestFailed = (request: Request): void => {
    const one = requests.get(request)
    if (one === undefined) return
    one.outcome = `failed: ${oneLine(withoutQueryValues(request.failure()?.errorText ?? 'no reason given'), 120)}`
    one.answeredAtMs = sinceStart()
  }

  const onPageError = (error: Error): void => {
    pageErrors.push({
      name: error.name,
      message: oneLine(withoutQueryValues(error.message)),
      where: error.stack === undefined ? null : oneLine(withoutQueryValues(error.stack.split('\n')[1] ?? ''), 240),
      atMs: sinceStart(),
    })
  }

  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)
  page.on('pageerror', onPageError)

  let stopped: Promise<ContactNavigationEvidence> | null = null
  const stop = (contact: Locator): Promise<ContactNavigationEvidence> => {
    stopped ??= (async () => {
      page.off('request', onRequest)
      page.off('response', onResponse)
      page.off('requestfailed', onRequestFailed)
      page.off('pageerror', onPageError)
      let state: ContactNavigationPageState | null = null
      let stateUnavailable: string | null = null
      try {
        const drawn = await page.evaluate(() => {
          const words = (selector: string, limit: number): string[] =>
            [...document.querySelectorAll(selector)]
              .slice(0, limit)
              .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160))
          return {
            url: location.href,
            readyState: document.readyState,
            ready: document.documentElement.getAttribute('data-mole-office-ready'),
            contacts: document.querySelectorAll('.px-chat-contact').length,
            cannotReach: document.querySelectorAll('.px-chat-cannot-reach-words').length,
            notices: words('.px-chat-notice', 4),
            empty: words('.px-chat-empty', 4),
            contactNames: words('.px-chat-contact .px-chat-name', 8),
          }
        })
        let matchingContacts = -1
        try {
          matchingContacts = await contact.count()
        } catch {
          matchingContacts = -1
        }
        state = { ...drawn, url: addressWithoutQuery(drawn.url), matchingContacts }
      } catch (error) {
        stateUnavailable = oneLine(withoutQueryValues(error instanceof Error ? error.message : String(error)), 240)
      }
      return {
        capturedForMs: sinceStart(),
        requests: [...requests.values()],
        pageErrors,
        state,
        stateUnavailable,
        listenersDetached: true,
      }
    })()
    return stopped
  }
  return { stop }
}

/** The evidence in words, short enough to sit in an error and plain enough to read there. */
function theEvidenceInWords(evidence: ContactNavigationEvidence): string {
  const lines: string[] = [
    `contact navigation evidence, captured for ${String(evidence.capturedForMs)} ms, listeners detached ${evidence.listenersDetached ? 'yes' : 'no'}:`,
  ]
  if (evidence.state === null) {
    lines.push(`  page state: not read (${evidence.stateUnavailable ?? 'the page was gone'})`)
  } else {
    const state = evidence.state
    lines.push(
      `  page state: url=${state.url} readyState=${state.readyState} ready=${state.ready ?? 'none'} ` +
        `contacts=${String(state.contacts)} matching=${String(state.matchingContacts)} cannotReach=${String(state.cannotReach)}`,
    )
    if (state.contactNames.length > 0) lines.push(`  contact rows: ${state.contactNames.join(' | ')}`)
    if (state.notices.length > 0) lines.push(`  notices: ${state.notices.join(' | ')}`)
    if (state.empty.length > 0) lines.push(`  empty list words: ${state.empty.join(' | ')}`)
  }
  lines.push(`  watched requests: ${String(evidence.requests.length)}`)
  for (const one of evidence.requests) {
    const answered = one.answeredAtMs === null ? '' : `, answered after ${String(one.answeredAtMs)} ms`
    lines.push(
      `  ${one.method} ${one.path} -> ${one.outcome} ` +
        `(asked after ${String(one.atMs)} ms${answered}; ${one.resourceType} from ${one.from})`,
    )
  }
  lines.push(`  page errors: ${String(evidence.pageErrors.length)}`)
  for (const one of evidence.pageErrors) {
    const where = one.where === null ? '' : ` (${one.where})`
    lines.push(`  ${one.name}: ${one.message}${where} (after ${String(one.atMs)} ms)`)
  }
  return lines.join('\n')
}

/** Put the evidence on the original error, keeping its own message and stack first. */
function withEvidence(original: unknown, evidence: ContactNavigationEvidence): ContactNavigationFailure {
  const failure = (original instanceof Error ? original : new Error(String(original))) as ContactNavigationFailure
  if (failure.contactNavigation !== undefined) return failure
  const section = theEvidenceInWords(evidence)
  failure.message = `${failure.message}\n\n${section}`
  if (failure.stack !== undefined) failure.stack = `${failure.stack}\n\n${section}`
  Object.defineProperty(failure, 'contactNavigation', { value: evidence, enumerable: false, configurable: true })
  return failure
}

/**
 * Open the chat page, open one contact's conversation, and wait for the words the caller expects.
 *
 * The watch starts before `opening` so the reads that draw and keep the contact rows are included.
 * A failure at any step is thrown again as the same error, carrying the evidence. A success returns
 * the evidence and prints nothing.
 */
export async function openTheContact(
  page: Page,
  opening: () => Promise<void>,
  contact: Locator,
  ready: Locator,
): Promise<ContactNavigationEvidence> {
  const watching = beginWatching(page)
  try {
    await opening()
    await contact.click()
    await ready.waitFor({ timeout: 20_000 })
  } catch (original) {
    throw withEvidence(original, await watching.stop(contact))
  }
  return watching.stop(contact)
}
