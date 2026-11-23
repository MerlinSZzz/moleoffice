// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST PRESS BESIDE EACH SANDBOX LOGIN: ONE REQUEST TO THE LOGIN'S PROVIDER, READ AS ONE OF FIVE OUTCOMES. The person
 * sets the sandboxes' logins on the Settings page (lib/sandbox-logins.ts), and until now nothing said whether a login
 * worked before a sandbox run failed with it. The door is POST /api/office/sandbox-logins/test in
 * api/sandbox-logins.ts, and it lets in only the person pressing it themselves. This module is what it does after that.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE: ONE REQUEST FOR EACH NAME THAT HAS A TEST
 * ---------------------------------------------------------------------------------------
 *
 * Each base address is the provider router's own (THE_ROUTED_PROVIDERS in src/config/provider-router.mjs), so an
 * address is written in one place. No request names its address, and nothing can hand this module another one.
 *
 *   DEEPSEEK_API_KEY    GET  /user/balance       Bearer. is_available false is a limit, and the balances are shown.
 *   OPENCODE_API_KEY    POST /chat/completions   Bearer. One user message and max_tokens 16: the request a watch on
 *                                                the host sends every 30 minutes and has seen answered every day.
 *                                                max_tokens 1 was never tried, so it is not used. The answer's words
 *                                                are not read.
 *   OPENROUTER_API_KEY  GET  /key                Bearer. limit_remaining at or below 0 is a limit.
 *   OPENAI_API_KEY      GET  /models             Bearer. A model list costs no tokens and says nothing about credit.
 *   CODEX_API_KEY       GET  /models             Bearer, at OpenAI's address.
 *   ANTHROPIC_API_KEY   GET  /models             x-api-key and anthropic-version. The base ends in /v1.
 *
 * NO TEST IS KNOWN for the other names the templates declare: CLAUDE_CODE_OAUTH_TOKEN has no documented free check,
 * OPENAI_IMAGE_API_KEY may fail a model list while it works for images, and the office declares no address for
 * MINIMAX_API_KEY, MINIMAX_GROUP_ID or ELEVENLABS_API_KEY. No probe is guessed for them, and nothing is sent.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE OUTCOMES, read from the status and a few fixed fields, never from the provider's words
 * ---------------------------------------------------------------------------------------
 *
 *   works            a 200. creditChecked is true only for DeepSeek's is_available true, OpenRouter's
 *                    limit_remaining above 0 and a Go request that was answered. A 200 without the field is works
 *                    with credit not checked.
 *   refused          a 401, and only a 401. None of these providers documents a 403 as a bad key.
 *   limit            a 429 on every probe, DeepSeek's 402 (insufficient balance), and the two field readings above.
 *                    resetsAt comes only from the retry-after of a 429 in whole seconds; anything else gives none.
 *   no-clear-answer  every other status, a redirect, which is not followed, and a send that failed or had no answer
 *                    in 20 s, which has no status.
 *   no-test-known    a declared, set name the table has no entry for.
 *
 * A REDIRECT IS NOT FOLLOWED because fetch drops Authorization on a redirect to another host and keeps x-api-key, so
 * following one could send a login to an address that is not its provider's.
 *
 * THE PROVIDER'S WORDS AND AN ERROR'S MESSAGE ARE NEVER PASSED ON. A provider may answer with the login in its words
 * ("Incorrect API key provided: …"), and a failed send's message can hold the address or a header. The answer is read
 * by its status, one header and a few fields, and a failure is said as no clear answer and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * 30 S, AND THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * A result is kept for 30 s per name, so a second press inside that answers the first result with its read time and
 * sends nothing: a press that called the provider each time could use up a limit by itself. Setting or clearing the
 * login drops its result (`forgetTheTestOf`), because a result is about the value that was sent. Two presses of one
 * name at the same moment both send, because a result is kept only after its answer; the screen disables the press
 * while it waits.
 *
 * Each press that sent the login writes one setting-change row on setting:sandbox-login-tests: who, which name, when,
 * the outcome, the status and resetsAt. Never the login and never a balance. A refused press, a press with no test and
 * a press answered from the last 30 s send nothing and write nothing.
 */
import { THE_ROUTED_PROVIDERS } from '../../config/provider-router.mjs'
import type { SandboxLoginBalance, SandboxLoginTested } from '@shared/sandbox-logins.ts'
import { localStamp } from '@shared/time.ts'
import { writeDownASettingChange, type Actor } from './records.ts'
import { aSandboxLoginThatIsSet, theSandboxLoginToTest } from './sandbox-logins.ts'

/** How long a provider is given to answer. */
const THE_LONGEST_WAIT_MS = 20_000

/** How long a result is answered again without sending anything. */
const A_RESULT_IS_KEPT_MS = 30_000

/** The ledger key every tested press writes its act on, after `setting:`. */
const THE_LEDGER_SETTING = 'sandbox-login-tests'

type Provider = keyof typeof THE_ROUTED_PROVIDERS

/** What a 200 said: works or a limit, whether credit was checked, and the balances it showed. */
type A200Said = Pick<SandboxLoginTested, 'creditChecked' | 'balances'> & { outcome: 'works' | 'limit' }

interface AProbe {
  provider: Provider
  method: 'GET' | 'POST'
  /** After the provider's base address. */
  path: string
  /** The headers the login goes in. It goes in exactly one. */
  headers: (login: string) => Record<string, string>
  /** The JSON body, or null for none. */
  body: string | null
  /** Whether a 402 is a limit. Only DeepSeek documents it as insufficient balance. */
  a402IsALimit: boolean
  /** What a 200 says. */
  readA200: (answer: Response) => Promise<A200Said>
}

const bearer = (login: string): Record<string, string> => ({ authorization: `Bearer ${login}` })

/** THE ONE CURRENCY FORM SHOWN: three capital letters. */
const A_CURRENCY = /^[A-Z]{3}$/
/** THE ONE TOTAL FORM SHOWN: a plain decimal number, such as 110.00. */
const A_PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/

/**
 * The answer's JSON, or undefined when its words are not JSON or could not be read. Undefined is then read as a field
 * that is not there, which says works with credit not checked: the status still said 200.
 */
async function theJsonOf(answer: Response): Promise<unknown> {
  try {
    return JSON.parse(await answer.text()) as unknown
  } catch {
    return undefined
  }
}

/** The words of an answer whose status says everything are let go unread, so the connection is not held for them. */
async function letGoOf(answer: Response): Promise<void> {
  try {
    await answer.body?.cancel()
  } catch {
    // NOTHING IS LOST: the outcome is read from the status, so words that will not let go change nothing said.
  }
}

/** DeepSeek's balances: each entry whose currency and total pass the two forms above. An entry that fails is left out. */
function theBalancesIn(said: unknown): SandboxLoginBalance[] {
  const infos = (said as { balance_infos?: unknown } | null | undefined)?.balance_infos
  if (!Array.isArray(infos)) return []
  return infos.flatMap((one: unknown) => {
    const { currency, total_balance: total } = (one ?? {}) as { currency?: unknown; total_balance?: unknown }
    return typeof currency === 'string' && A_CURRENCY.test(currency) && typeof total === 'string' && A_PLAIN_DECIMAL.test(total) ? [{ total, currency }] : []
  })
}

/** A model list: its 200 says the login was accepted, and nothing about credit. */
async function aModelListAnswered(answer: Response): Promise<A200Said> {
  await letGoOf(answer)
  return { outcome: 'works', creditChecked: false, balances: [] }
}

/** THE PROBES, one per name that has a test. */
const PROBES: Readonly<Record<string, AProbe>> = {
  DEEPSEEK_API_KEY: {
    provider: 'deepseek',
    method: 'GET',
    path: '/user/balance',
    headers: bearer,
    body: null,
    a402IsALimit: true,
    readA200: async (answer) => {
      const said = await theJsonOf(answer)
      const available = (said as { is_available?: unknown } | null | undefined)?.is_available
      const balances = theBalancesIn(said)
      if (available === true) return { outcome: 'works', creditChecked: true, balances }
      // UNPROVEN: nobody has seen DeepSeek answer false. It is read as the decided design reads it, with the balance beside it.
      if (available === false) return { outcome: 'limit', creditChecked: null, balances }
      return { outcome: 'works', creditChecked: false, balances }
    },
  },
  OPENCODE_API_KEY: {
    provider: 'opencode-go',
    method: 'POST',
    path: '/chat/completions',
    headers: bearer,
    body: JSON.stringify({ model: 'deepseek-v4.1-flash', messages: [{ role: 'user', content: 'Reply with the single word READY.' }], max_tokens: 16 }),
    a402IsALimit: false,
    // AN ANSWERED REQUEST SAYS THE CREDIT HELD FOR IT. Its words are not read: they can say a limit with no time it
    // resets, and the press does not guess one.
    readA200: async (answer) => {
      await letGoOf(answer)
      return { outcome: 'works', creditChecked: true, balances: [] }
    },
  },
  OPENROUTER_API_KEY: {
    provider: 'openrouter',
    method: 'GET',
    path: '/key',
    headers: bearer,
    body: null,
    a402IsALimit: false,
    readA200: async (answer) => {
      const said = await theJsonOf(answer)
      const remaining = (said as { data?: { limit_remaining?: unknown } | null } | null | undefined)?.data?.limit_remaining
      // A NUMBER ONLY: null is a key with no limit, and `null <= 0` is true in JavaScript.
      if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return { outcome: 'works', creditChecked: false, balances: [] }
      return remaining <= 0 ? { outcome: 'limit', creditChecked: null, balances: [] } : { outcome: 'works', creditChecked: true, balances: [] }
    },
  },
  OPENAI_API_KEY: { provider: 'openai', method: 'GET', path: '/models', headers: bearer, body: null, a402IsALimit: false, readA200: aModelListAnswered },
  CODEX_API_KEY: { provider: 'openai', method: 'GET', path: '/models', headers: bearer, body: null, a402IsALimit: false, readA200: aModelListAnswered },
  ANTHROPIC_API_KEY: {
    provider: 'anthropic',
    method: 'GET',
    path: '/models',
    headers: (login) => ({ 'x-api-key': login, 'anthropic-version': '2023-06-01' }),
    body: null,
    a402IsALimit: false,
    readA200: aModelListAnswered,
  },
}

/** When a limit resets: only a retry-after of whole seconds, counted from when the answer was read. */
function whenItResets(retryAfter: string | null, read: Date): string | null {
  if (retryAfter === null || !/^\d+$/.test(retryAfter)) return null
  const at = new Date(read.getTime() + Number(retryAfter) * 1000)
  // A NUMBER TOO LARGE FOR A DATE gives no reset time, as any other unreadable retry-after does.
  return Number.isNaN(at.getTime()) ? null : localStamp(at)
}

type Read = Omit<SandboxLoginTested, 'name' | 'fromAnEarlierPress'>

/** The one request, and what its answer says. */
async function sendTheProbe(probe: AProbe, login: string): Promise<Read> {
  let answer: Response
  try {
    answer = await fetch(`${THE_ROUTED_PROVIDERS[probe.provider].upstream}${probe.path}`, {
      method: probe.method,
      headers: { ...probe.headers(login), ...(probe.body === null ? {} : { 'content-type': 'application/json' }) },
      ...(probe.body === null ? {} : { body: probe.body }),
      redirect: 'manual',
      signal: AbortSignal.timeout(THE_LONGEST_WAIT_MS),
    })
  } catch {
    // NOTHING ANSWERED: the send failed, or 20 s passed. Its message is not kept, because it can hold the address or the login.
    return { outcome: 'no-clear-answer', status: null, resetsAt: null, balances: [], creditChecked: null, readAt: localStamp(new Date()) }
  }
  const read = new Date()
  const plain = { status: answer.status, resetsAt: null, balances: [], creditChecked: null, readAt: localStamp(read) }
  if (answer.status === 200) return { ...plain, ...(await probe.readA200(answer)) }
  await letGoOf(answer)
  if (answer.status === 401) return { ...plain, outcome: 'refused' }
  if (answer.status === 429) return { ...plain, outcome: 'limit', resetsAt: whenItResets(answer.headers.get('retry-after'), read) }
  if (answer.status === 402 && probe.a402IsALimit) return { ...plain, outcome: 'limit' }
  return { ...plain, outcome: 'no-clear-answer' }
}

/** The last result of each name, and when it was read by this process's clock. */
const kept = new Map<string, { tested: SandboxLoginTested; at: number }>()

/**
 * HOW MANY TIMES EACH NAME WAS SET OR CLEARED SINCE THIS PROCESS STARTED. A test still waiting for its answer when the
 * login is set or cleared was about the value it sent, so its result is answered once and not kept for the next press.
 */
const changes = new Map<string, number>()

/** DROP ONE NAME'S RESULT. The set and clear doors call it, because the next press is about another value. */
export function forgetTheTestOf(name: string): void {
  kept.delete(name)
  changes.set(name, (changes.get(name) ?? 0) + 1)
}

/**
 * TEST ONE SANDBOX LOGIN for `actor`, whom the door has already found to be the person pressing it themselves.
 * Refused, before anything is read or sent: a name the templates do not declare, and a declared name the file does not set.
 */
export async function testASandboxLogin(actor: Actor, name: string, workspaceId: string | null): Promise<SandboxLoginTested> {
  aSandboxLoginThatIsSet(name)
  const probe = Object.hasOwn(PROBES, name) ? PROBES[name] : undefined
  if (probe === undefined) {
    return { name, outcome: 'no-test-known', status: null, resetsAt: null, balances: [], creditChecked: null, readAt: null, fromAnEarlierPress: false }
  }
  const earlier = kept.get(name)
  if (earlier !== undefined && Date.now() - earlier.at < A_RESULT_IS_KEPT_MS) return { ...earlier.tested, fromAnEarlierPress: true }
  const changesBefore = changes.get(name) ?? 0
  const read = await sendTheProbe(probe, theSandboxLoginToTest(name))
  const tested: SandboxLoginTested = { name, ...read, fromAnEarlierPress: false }
  // THE OUTCOME AND NEVER THE LOGIN OR A BALANCE, on the one row this press earns. It is written before the result is
  // kept, so a press whose row failed is not answered again from the 30 s result as if it had been written down.
  writeDownASettingChange(actor, {
    setting: THE_LEDGER_SETTING,
    field: `the sandboxes' login ${name}`,
    before: null,
    after: { outcome: tested.outcome, status: tested.status, resetsAt: tested.resetsAt },
    workspaceId,
  })
  if ((changes.get(name) ?? 0) === changesBefore) kept.set(name, { tested, at: Date.now() })
  return tested
}
