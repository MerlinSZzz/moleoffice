// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ASKS THE MAIL TOOL FOR THE PERSON, AND KEEPS NOTHING. The tool answers only on 127.0.0.1 of the computer
 * it runs on, so the person's Settings page opened on another device could not reach it and showed an error. The office on the
 * tool's computer now asks the tool's GET /state for the person and passes the answer on as it is.
 *
 * AND PASSES ON THE PERSON'S THREE PRESSES. Saving the list of addresses, picking the account and sending a test go to the
 * tool's own POST /addresses, /account and /test the same way, and the tool's answer comes back as it is.
 *
 * NOT A WAY TO ASK ANYTHING ELSE. The address is the one the office already gives the person's page on this computer
 * (`page` of `theMailToolAsItStands`), taken apart by the page's own reader, so only http://127.0.0.1:<port> is asked.
 * The paths are the four above and nothing else. Nothing of the request that came in is sent on as it came: no header
 * and no query. A press's body is built again here from the one field the tool takes.
 *
 * NOTHING IS KEPT. The answer is not written to a row or a file, and the doors' addresses are private in the request
 * log (src/config/private-sandbox-login.mjs), so the addresses in them pass through the office and stay nowhere.
 */
import type {
  TheMailToolsChangeThroughTheOffice,
  TheMailToolThroughTheOffice,
  TheToolGaveNoAnswer,
} from '@shared/the-mail-tool-through-the-office.ts'
import { THE_SECRET_HEADER, whereTheToolIs } from '@shared/the-mail-tool.ts'

/** How long the tool is given to answer, in milliseconds. It answers from its folder, so a few milliseconds is usual. */
const THE_TOOLS_TIME = 10_000

/** One of the three presses, with the one field the tool takes for it. */
export type AChangeToTheMailTool = { door: 'addresses'; addresses: string } | { door: 'account'; id: string } | { door: 'test' }

/** The tool's state, asked at `page`, the address the office gives the person's page on this computer, or null when it has none. */
export async function theMailToolsStateThroughTheOffice(page: string | null): Promise<TheMailToolThroughTheOffice> {
  const asked = await askTheTool(page, 'GET', '/state', undefined)
  if (!asked.answered) return asked
  if (!isAnObject(asked.json)) return notTheTool(asked.status)
  return { answered: true, state: asked.json }
}

/** One press passed on to the tool at `page`. The tool's answer to a press holds `done` and `state`; anything else is not the tool's. */
export async function theMailToolChangedThroughTheOffice(page: string | null, change: AChangeToTheMailTool): Promise<TheMailToolsChangeThroughTheOffice> {
  const body =
    change.door === 'addresses' ? { addresses: change.addresses } : change.door === 'account' ? { id: change.id } : {}
  const asked = await askTheTool(page, 'POST', `/${change.door}`, body)
  if (!asked.answered) return asked
  const answer = asked.json
  if (!isAnObject(answer) || !isAnObject(answer.done) || !isAnObject(answer.state)) return notTheTool(asked.status)
  return { answered: true, answer: { done: answer.done, state: answer.state } }
}

async function askTheTool(
  page: string | null,
  method: 'GET' | 'POST',
  path: string,
  body: object | undefined,
): Promise<{ answered: true; status: number; json: unknown } | TheToolGaveNoAnswer> {
  const where = whereTheToolIs(page)
  if (where === null) {
    return {
      answered: false,
      because: 'no address',
      status: null,
      says: 'The office knows no address for the mail tool on its computer: it is not installed, not running, or has not said where it answers. Nothing was asked.',
    }
  }
  let response: Response
  try {
    response = await fetch(`${where.origin}${path}`, {
      method,
      headers: body === undefined ? { [THE_SECRET_HEADER]: where.secret } : { [THE_SECRET_HEADER]: where.secret, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'manual',
      signal: AbortSignal.timeout(THE_TOOLS_TIME),
    })
  } catch (err) {
    const why = err instanceof Error && err.name === 'TimeoutError' ? `nothing answered within ${String(THE_TOOLS_TIME / 1000)} seconds` : 'nothing answered there'
    return { answered: false, because: 'no answer', status: null, says: `The office asked the mail tool on its computer, and ${why}.` }
  }
  const text = await response.text()
  if (!response.ok) {
    return {
      answered: false,
      because: 'refused',
      status: response.status,
      says: `The mail tool on the office's computer refused with status ${String(response.status)}.`,
    }
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { answered: true, status: response.status, json }
}

function isAnObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function notTheTool(status: number): TheToolGaveNoAnswer {
  return {
    answered: false,
    because: 'not the tool',
    status,
    says: "Something answered at the mail tool's address on the office's computer, but not with the tool's JSON.",
  }
}
