// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SETTING UP AN AGENT TOOL: WHETHER IT IS SIGNED IN, ITS FIRST INSTALL ON THE PERSON'S OWN MESSAGE, ITS KEY GIVEN TO ITS
 * OWN LOGIN, AND ITS ACCOUNT SIGN-IN. Wave 13u, round 242, the server side of the package that sets up a coding tool.
 *
 * The person asked that setting up a tool take only his ask, and then typing a key and confirming. The design for
 * setting up a coding tool says how, and this file is its server side. The pages, their words and the secretary's
 * manual come in a later round.
 *
 * WHAT IS READ, AND WHERE. Every reading and every command here finds the tool on the environment the office's
 * terminals get (`theEnvironmentATerminalGets`), and runs it with that environment and no other. That is where the
 * install terminal installs, and where the person signs in by hand. Its PATH is the server's own PATH, copied unchanged.
 * Nothing here changes what a terminal or a worker gets.
 *
 * THE KEY IS GIVEN ONLY ON STANDARD INPUT, once, to the tool's own login, and then dropped. It is never on a command
 * line, in an environment variable, in a file of the office, in a log line, in a change row or in a reply. What a tool
 * prints is never answered either: an answer says yes, no or why not, in the office's own words.
 *
 * THE SERVER OPENS NO BROWSER. An account sign-in is the tool's own. Codex's starts as `codex login --device-auth`, which
 * opens no browser: it prints its device page and a one-time code. The one address a page may open is worked out here,
 * in `theAddressThePageMayOpen`, from the tool's declaration in ./harnesses.ts: Codex's declared device page, or the
 * address Claude Code printed, only when it is https on Claude Code's declared host exactly, with no user part and no
 * port. The page opens it in a new tab, and the desktop app in the system's browser. The device code is answered as
 * text. Claude Code's `claude auth login` opens the system's browser itself, and has no option that stops it (its help
 * on Claude Code 2.1.281). So every sign-in starts with BROWSER set to a program that opens nothing, on Linux and the
 * Mac. Only Linux has been read to honour it (`A_BROWSER_THAT_OPENS_NOTHING` says where), so on the Mac and on Windows
 * the page says in one line that a second tab may open.
 *
 * THE CODE A SIGN-IN PAGE SHOWS goes to the sign-in that asked for it. Claude Code's sign-in page shows a login code
 * when it cannot hand the sign-in back, and the tool reads it at its "Paste code here if prompted" prompt
 * (https://code.claude.com/docs/en/authentication, read 2026-11-22). The person types it on the office's page, and
 * `giveTheCodeToTheSignIn` writes it once to the standard input of the sign-in that press started, found by the id the
 * start answered, and then closes that input. The code is never kept, logged or answered.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NoSignInAddressCode, SignedIn, SignInCodeGiven, SignInStarted } from '@shared/harnesses.ts'
import { now } from '@shared/now.ts'
import { THE_PERSON } from '@shared/person.ts'
import { parseLocalStamp } from '@shared/time.ts'
import { theWayToStart, whereIsThisTool } from '../../config/runtimes.mjs'
import { aCommandsProgram, theSandboxIn } from '../../config/run-permissions.mjs'
import { theEnvironmentACodexGets } from '../../config/the-environment-a-codex-gets.mjs'
import { db } from '../db/client.ts'
import { changes } from '../db/schema.ts'
import { aHarnessRefusal, type Harness } from './harnesses.ts'
import { logChange } from './log-change.ts'
import { PanelError } from './panel-error.ts'
import type { Actor } from './records.ts'
import { getRecord } from './records/reading.ts'
import { osProbe } from './resources.ts'
import { theEnvironmentATerminalGets } from './terminals.ts'
import { aCommentInAConversation, recordWritten, whyTheCitedPlaceMayNotBeCited } from './why-the-cited-place-may-not-be-cited.ts'
import { whatClaudeCodeSaysOfItsSignIn, whatCodexSaysOfItsSignIn, whatOpenCodeSaysOfItsSignIn } from './what-an-agent-tool-says-of-its-sign-in.ts'

// ------------------------------------------------------------------------------ running a tool's own command

/** What a tool's own command did: what it printed on both streams and its exit code, or why it did not run. */
type Ran = { ran: true; printed: string; code: number | null } | { ran: false; why: string }

/** How much of what a tool prints is read. A status or a login prints a few lines. */
const AT_MOST_PRINTED = 64 * 1024

/**
 * THE ENVIRONMENT ONE OF A TOOL'S OWN COMMANDS STARTS WITH: `env` whole, except that a Codex gets only the names its
 * list keeps (src/config/the-environment-a-codex-gets.mjs). `program` is the tool's program word.
 */
function theToolsEnvironment(program: string, env: Readonly<Record<string, string>>): Record<string, string> {
  return aCommandsProgram([program]).isCodex ? theEnvironmentACodexGets(env) : { ...env }
}

/**
 * RUN ONE OF A TOOL'S OWN COMMANDS, found at `where`, with `env` as its whole environment and no shell. `program` is the
 * tool's program word, which `theToolsEnvironment` reads. `input` is written to its standard input once and the input
 * is then closed. A command that has not finished after `ms` is killed and said to have not finished. It never throws.
 */
function runTheTool(program: string, where: string, args: readonly string[], env: Readonly<Record<string, string>>, input: string | null, ms: number): Promise<Ran> {
  return new Promise((done) => {
    let printed = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (ran: Ran): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(ran)
    }
    let child: ChildProcess
    try {
      // A .cmd on Windows starts through cmd.exe, or is refused in words (theWayToStart, src/config/runtimes.mjs).
      const way = theWayToStart(where, args)
      child = spawn(way.command, way.args, {
        shell: false,
        stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        env: theToolsEnvironment(program, env),
        windowsVerbatimArguments: way.windowsVerbatimArguments,
        windowsHide: true,
      })
    } catch (err) {
      finish({ ran: false, why: err instanceof Error ? err.message : String(err) })
      return
    }
    timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ ran: false, why: `it did not finish within ${String(ms / 1000)} seconds` })
    }, ms)
    const read = (chunk: string): void => {
      if (printed.length < AT_MOST_PRINTED) printed += chunk
    }
    child.stdout?.setEncoding('utf8').on('data', read)
    child.stderr?.setEncoding('utf8').on('data', read)
    child.once('error', (err) => finish({ ran: false, why: err.message }))
    child.once('close', (code) => finish({ ran: true, printed, code }))
    if (input !== null && child.stdin !== null) {
      // Handled: a tool that ends before it reads its input closes the pipe, and its exit code says what happened.
      child.stdin.on('error', () => undefined)
      child.stdin.end(input)
    }
  })
}

// ------------------------------------------------------------------------------ part 1: signed in, from the tool itself

/** How long a tool's own status command may take. */
const A_STATUS_MUST_ANSWER_WITHIN_MS = 10_000

/**
 * EACH TOOL'S OWN STATUS COMMAND, and the reader of what it prints (./what-an-agent-tool-says-of-its-sign-in.ts). Read
 * from each tool's own help on this machine on 22 November 2026: codex-cli 0.159.2, Claude Code 2.1.281, OpenCode
 * 1.18.31. Kimi and dsh have none here, so their sign-in is not readable.
 */
const THE_SIGN_IN_READINGS: Readonly<Record<string, { args: readonly string[]; reads: (printed: string) => 'yes' | 'no' | null }>> = {
  'claude-code': { args: ['auth', 'status', '--json'], reads: whatClaudeCodeSaysOfItsSignIn },
  codex: { args: ['login', 'status'], reads: whatCodexSaysOfItsSignIn },
  opencode: { args: ['auth', 'list'], reads: whatOpenCodeSaysOfItsSignIn },
}

/**
 * WHETHER ONE AGENT TOOL IS SIGNED IN, as its own status command says, on the environment the office's terminals get.
 * The words are read whatever the exit code, because Claude Code ends with 1 when it is not signed in.
 */
export async function theSignInOf(one: Harness, env: Readonly<Record<string, string>> = theEnvironmentATerminalGets()): Promise<SignedIn> {
  const reading = THE_SIGN_IN_READINGS[one.id]
  if (reading === undefined) return { answer: 'notReadable', why: 'noStatusCommand', asked: null }
  const asked = [one.program, ...reading.args].join(' ')
  const where = whereIsThisTool(one.program, env)
  if (where === null) return { answer: 'notReadable', why: 'notInstalled', asked }
  const ran = await runTheTool(one.program, where, reading.args, env, null, A_STATUS_MUST_ANSWER_WITHIN_MS)
  if (!ran.ran) return { answer: 'notReadable', why: 'didNotRun', asked }
  const said = reading.reads(ran.printed)
  return said === null ? { answer: 'notReadable', why: 'notUnderstood', asked } : { answer: said, asked }
}

// ------------------------------------------------------------------------------ part 2: the first install on his message

/** How long the person's message opens a first install. An older message needs the readiness signatures. */
export const A_MESSAGE_OPENS_A_FIRST_INSTALL_FOR_MS = 24 * 60 * 60 * 1000

/**
 * WHERE A FIRST INSTALL OPENED BY A MESSAGE IS WRITTEN DOWN: one change row per tool, on `harness:<tool id>`, whose new
 * value is the message's id. No record is that id, as no record is a setting's `setting:<name>`. The row is the only
 * store of which message opened which tool, and the check below reads it, so no second store can disagree with it.
 */
const A_FIRST_INSTALL_IS_WRITTEN_ON = 'harness:'
const A_FIRST_INSTALL_FIELD = 'firstInstallFromAMessage'

/** Whether a message opens the first install of every tool asked, or why it does not. */
export type WhatAMessageOpens = { opens: true } | { opens: false; because: string }

/** A message as the warrants read it: when it was written, who wrote it and how a key proved them, and its words. */
type AMessageRead = { at: string; writer: { type: string; id: string; provedBy: string | null } | null; words: string }

/** A message in a conversation, or a message filed as a record with its words in `data.body`. Null when neither is held. */
function theMessageRead(id: string): AMessageRead | null {
  const comment = aCommentInAConversation(id)
  if (comment !== null) return comment
  const written = recordWritten(id, 'message')
  if (written === null) return null
  const body = getRecord(id)?.data['body']
  return { at: written.at, writer: written.writer, words: typeof body === 'string' ? body : '' }
}

/**
 * WHY A MESSAGE IS NOT THE PERSON'S OWN, PROVED AS HIS, or null when it is. Written by a person, and proved by the
 * person's key; or written by a person with no key at all while a warrant could still cite it, as
 * `whyTheCitedPlaceMayNotBeCited` decides for a warrant. The office's key, an agent's key and his tool's key are not
 * the person's key. A message any agent wrote never counts, whatever it says the person wants.
 */
function whyItIsNotThePersonsOwn(id: string, writer: AMessageRead['writer']): string | null {
  if (writer === null) return `Mole Office holds no record of who wrote the message ${id}.`
  if (writer.type !== 'human' || writer.id !== THE_PERSON) return `The ${writer.type} "${writer.id}" wrote the message ${id}, not the person.`
  if (writer.provedBy === 'the-person-key') return null
  if (writer.provedBy !== null) return `The message ${id} was written under the person's name, and proved by ${writer.provedBy}, not by the person's own key.`
  const why = whyTheCitedPlaceMayNotBeCited(`message:${id}`)
  return why === null ? null : `The message ${id} is not proved as the person's: ${why}`
}

/**
 * DO THESE WORDS NAME THIS TOOL, by a name the declaration gives it (src/server/lib/harnesses.ts): its name, such as
 * "Claude Code" or "OpenCode", or its id, such as "claude-code". Never by a name the request gave. Case and width do not
 * matter, and the words of a name may be joined by spaces, hyphens, underscores or nothing. A name stands alone among
 * Latin letters and digits, so Chinese around it still names it ("帮我装一下Codex") and "codexes" does not. OpenCode
 * Go is OpenCode's provider, so "OpenCode Go" names OpenCode. The program's own name, such as "claude", is not a name
 * here, so a message that only says "Claude" names no tool and the install waits for the signatures.
 */
function theWordsName(words: string, one: Harness): boolean {
  const text = words.normalize('NFKC').toLowerCase()
  return [one.name, one.id].some((name) => {
    const parts = name.normalize('NFKC').toLowerCase().split(/[\s\-_]+/u).filter((part) => part !== '')
    const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(`(?<![a-z0-9])${escaped.join('[\\s\\-_]*')}(?![a-z0-9])`, 'u').test(text)
  })
}

/** Whether this message already opened a first install of this tool. */
function aFirstInstallWasOpenedBy(messageId: string, one: Harness): boolean {
  const row = db
    .select({ id: changes.id })
    .from(changes)
    .where(and(eq(changes.recordId, `${A_FIRST_INSTALL_IS_WRITTEN_ON}${one.id}`), eq(changes.field, A_FIRST_INSTALL_FIELD), eq(changes.newValue, messageId)))
    .get()
  return row !== undefined
}

/**
 * NOTHING IS INSTALLED INSIDE A SANDBOX, by any press: the person's, one under the grant, one a message opens and one
 * that waits for the signatures. The office knows it is in one when SANDBOX_DIR names its folder (`theSandboxIn`,
 * src/config/run-permissions.mjs). The install door asks this first, before the message is read and before the
 * readiness gate, so a press it refuses writes nothing.
 */
export function nothingIsInstalledInASandbox(): void {
  const sandbox = theSandboxIn(process.env)
  if (sandbox !== null) {
    throw aHarnessRefusal('harnessInASandbox', `This office runs inside a sandbox (${sandbox}), and nothing is installed inside a sandbox. Nothing was installed.`, 409)
  }
}

/**
 * DOES THE PERSON'S OWN MESSAGE OPEN THE FIRST INSTALL OF EVERY TOOL ASKED, with no readiness signatures. It does when
 * the person wrote it, proved as the person; it was written within 24 hours; its words name each tool; part 1 reads
 * each as not installed; and it has not opened a first install of that tool before. One that fails says why, and the
 * install waits for the signatures as before. Every tool asked must pass, or none opens this way.
 *
 * THE MESSAGE IS MARKED USED BEFORE ANYTHING OPENS, in the same turn of the server as the check, so two requests with
 * one message cannot both pass. An install whose terminal then fails to open has used the message all the same: the
 * person asks again in a new message, or the install waits for the signatures.
 *
 * Inside a sandbox the door has refused before this is asked (`nothingIsInstalledInASandbox`).
 */
export function theFirstInstallAMessageOpens(
  messageId: string,
  chosen: readonly Harness[],
  actor: Actor,
  workspaceId: string,
  env: Readonly<Record<string, string>> = theEnvironmentATerminalGets(),
): WhatAMessageOpens {
  const message = theMessageRead(messageId)
  if (message === null) return { opens: false, because: `Mole Office holds no message with the id ${messageId}.` }
  const notHis = whyItIsNotThePersonsOwn(messageId, message.writer)
  if (notHis !== null) return { opens: false, because: notHis }
  const written = parseLocalStamp(message.at)
  const asOf = parseLocalStamp(now())
  if (written === null || asOf === null) {
    // A BROKEN ASSUMPTION: every message's stamp and the office's clock are written readable.
    throw aHarnessRefusal(
      'harnessMessageTimeUnread',
      `The message ${messageId} says it was written at ${JSON.stringify(message.at)}, and the office's clock says ${JSON.stringify(now())}. One of them cannot be read, so the office cannot tell whether the message is recent. Nothing was installed.`,
      500,
    )
  }
  if (asOf - written > A_MESSAGE_OPENS_A_FIRST_INSTALL_FOR_MS) return { opens: false, because: `The message ${messageId} was written at ${message.at}, more than 24 hours ago.` }
  for (const one of chosen) {
    if (!theWordsName(message.words, one)) return { opens: false, because: `The message ${messageId} does not name ${one.name}.` }
    if (whereIsThisTool(one.program, env) !== null) return { opens: false, because: `${one.name} is installed already, so this would not be its first install.` }
    if (aFirstInstallWasOpenedBy(messageId, one)) return { opens: false, because: `The message ${messageId} has already opened a first install of ${one.name}.` }
  }
  for (const one of chosen) logChange(`${A_FIRST_INSTALL_IS_WRITTEN_ON}${one.id}`, 'update', actor, A_FIRST_INSTALL_FIELD, null, messageId, workspaceId)
  return { opens: true }
}

// ------------------------------------------------------------------------------ part 3: the key, to the tool's own login

/** How long a tool's own key login may take. */
const A_KEY_LOGIN_MUST_ANSWER_WITHIN_MS = 30_000

/**
 * EACH TOOL'S OWN KEY LOGIN, which reads the key on standard input.
 *
 * CODEX, `codex login --with-api-key`: its help on codex-cli 0.159.2 says "Read the API key from stdin". The key is
 * ended with a newline.
 *
 * OPENCODE, `opencode auth login -p <provider> -m "API key"`: OpenCode 1.18.31 takes the key on standard input ended
 * with a carriage return, and a newline does not submit it. That is not a documented way, so it is used only on the
 * version it was checked on, and any other version gets the plain answer that its own login in a terminal is the way.
 * Its providers here are OpenCode Zen, whose id is `opencode`, and OpenCode Go, whose id is `opencode-go`. Both ids
 * were read from the installed OpenCode 1.18.31 with no key on 22 November 2026: `opencode models opencode-go` lists
 * its models, and a provider it does not have says "Provider not found".
 *
 * CLAUDE CODE HAS NO KEY LOGIN. Claude Code 2.1.281 signs in with an account (`claude auth login`), so its key door
 * answers that.
 */
const THE_KEY_LOGINS: Readonly<Record<string, { providers: readonly string[] | null; checkedOn: string | null; args: (provider: string | null) => string[]; ends: string }>> = {
  codex: { providers: null, checkedOn: null, args: () => ['login', '--with-api-key'], ends: '\n' },
  opencode: { providers: ['opencode', 'opencode-go'], checkedOn: '1.18.31', args: (provider) => ['auth', 'login', '-p', provider ?? '', '-m', 'API key'], ends: '\r' },
}

/** What the key door answers when the key was given: which tool, which provider, and the tool's own status after it. */
export type TheKeyGiven = { harness: string; provider: string | null; signedIn: SignedIn }

/**
 * GIVE THE KEY TO THE TOOL'S OWN LOGIN, on standard input, once. Then ask the tool's own status and answer what it says.
 * A tool with no key login, a provider it does not take, a tool not installed, an OpenCode at another version, and a
 * login that fails are each refused in plain words, and nothing is tried another way.
 */
export async function giveTheKeyToTheToolsOwnLogin(one: Harness, provider: string | null, key: string): Promise<TheKeyGiven> {
  if (one.id === 'claude-code') {
    throw aHarnessRefusal('harnessSignsInWithAnAccount', 'Claude Code signs in with a Claude account, not a key. Start its sign-in instead. No key was sent.', 409)
  }
  const login = THE_KEY_LOGINS[one.id]
  if (login === undefined) throw aHarnessRefusal('harnessNoKeyLogin', `${one.name} takes no key through the office. No key was sent.`)
  if (login.providers === null ? provider !== null : provider === null || !login.providers.includes(provider)) {
    throw aHarnessRefusal(
      'harnessKeyProvider',
      login.providers === null
        ? `${one.name} takes no provider with its key. No key was sent.`
        : `${one.name}'s key needs one of its providers here: ${login.providers.join(', ')}. No key was sent.`,
    )
  }
  const env = theEnvironmentATerminalGets()
  const where = whereIsThisTool(one.program, env)
  if (where === null) throw aHarnessRefusal('harnessNotInstalled', `${one.name} is not installed on the PATH the office's terminals get. No key was sent.`, 409)
  if (login.checkedOn !== null) {
    const read = await osProbe().theVersionOfAProgram?.(one.program, env)
    const found = read?.versionWasRead === true ? /(\d+\.\d+\.\d+)/.exec(read.version)?.[1] ?? null : null
    if (found !== login.checkedOn) {
      throw new PanelError(
        `${one.name} here is ${found === null ? 'a version that could not be read' : `version ${found}`}, and its key login was checked only on ${login.checkedOn}. No key was sent. Sign in with ${one.name}'s own login in a terminal: ${one.program} auth login.`,
        409,
        undefined,
        undefined,
        undefined,
        { code: 'harnessKeyLoginNotThisVersion', values: { found: found ?? 'unknown', checked: login.checkedOn } },
      )
    }
  }
  const ran = await runTheTool(one.program, where, login.args(provider), env, `${key}${login.ends}`, A_KEY_LOGIN_MUST_ANSWER_WITHIN_MS)
  if (!ran.ran || ran.code !== 0) {
    // WHAT THE TOOL PRINTED IS NOT ANSWERED, because a login may print back what it was given.
    throw aHarnessRefusal(
      'harnessKeyLoginFailed',
      `${one.name}'s own key login did not work, and it was not tried another way. Sign in with ${one.name}'s own login in a terminal.`,
      502,
    )
  }
  return { harness: one.id, provider, signedIn: await theSignInOf(one, env) }
}

// ------------------------------------------------------------------------------ part 4: an account sign-in, the tool's own

/**
 * EACH TOOL'S OWN ACCOUNT SIGN-IN. Codex signs in with ChatGPT by `codex login --device-auth`, which prints its device
 * page and a one-time code and opens no browser; its help on codex-cli 0.159.2 lists the option. Claude Code signs in
 * with a Claude account by `claude auth login --claudeai` (its help on Claude Code 2.1.281), which opens the system's
 * browser itself, and reads the login code its sign-in page may show.
 */
const THE_ACCOUNT_SIGN_INS: Readonly<Record<string, { args: readonly string[]; takesACode: boolean; opensItsOwnBrowser: boolean }>> = {
  codex: { args: ['login', '--device-auth'], takesACode: false, opensItsOwnBrowser: false },
  'claude-code': { args: ['auth', 'login', '--claudeai'], takesACode: true, opensItsOwnBrowser: true },
}

/**
 * THE PROGRAM A SIGN-IN IS GIVEN AS ITS BROWSER, which opens nothing: `true`, which Linux and the Mac have on their PATH.
 * It is set there. On Windows a sign-in is started with its environment unchanged.
 *
 * WHERE IT IS KNOWN TO BE READ. Linux was read in the installed Claude Code 2.1.323, whose Linux opener runs BROWSER
 * with the address and treats BROWSER="true" as no browser. The Mac was not read, so a second tab may open there until a
 * check on a Mac shows it does not.
 */
const A_BROWSER_THAT_OPENS_NOTHING = 'true'
const BROWSER_IS_SET = process.platform !== 'win32'

/** How long the start waits for the tool to print its address, and how long after the address for a device code. */
const A_SIGN_IN_SAYS_ITS_ADDRESS_WITHIN_MS = 5_000
const A_DEVICE_CODE_FOLLOWS_WITHIN_MS = 500

/** How long a sign-in the person has not finished is kept running before it is stopped. */
const A_SIGN_IN_IS_KEPT_MS = 10 * 60 * 1000

/** An address and a device code in what a sign-in printed. A code is four or more capitals or digits, a hyphen, four or more. */
const AN_ADDRESS = /https?:\/\/[^\s"'<>\x1b]+/
const A_DEVICE_CODE = /\b([A-Z0-9]{4,}-[A-Z0-9]{4,})\b/

/**
 * The sign-ins running now, one per tool at most. `until` is when it is stopped, and `codeGiven` whether the code door
 * has written to it, which it does once.
 */
const signingIn = new Map<string, { child: ChildProcess; answer: Omit<SignInStarted, 'already'>; until: number; codeGiven: boolean }>()

/** The ids of the sign-ins started here that have ended, each as `<tool> <id>`, so the code door can say so. */
const signInsEnded = new Set<string>()

/** What a page may open for a sign-in: one address, or none and why. */
type ThePageMayOpen = Pick<SignInStarted, 'address' | 'noAddress'>

/**
 * THE ONE ADDRESS A PAGE MAY OPEN FOR A TOOL'S SIGN-IN, worked out here and nowhere else. For a declared device page it
 * is that page, whatever the tool printed. For a declared host it is the address the tool printed, read as a URL, only
 * when its scheme is https, it has no user part and no port, and its host is the declared host exactly; so
 * `https://<host>@elsewhere` is refused. An address that fails is never answered, and the sentence does not quote it.
 */
export function theAddressThePageMayOpen(one: Harness, printed: string | null): ThePageMayOpen {
  const declared = one.signIn
  if (declared === null) throw new Error(`${one.name} declares no account sign-in in src/server/lib/harnesses.ts, and the address its sign-in may open was asked for.`)
  if ('devicePage' in declared) return { address: declared.devicePage, noAddress: null }
  const none = (code: NoSignInAddressCode, why: string): ThePageMayOpen => ({ address: null, noAddress: { code, says: `${why} So nothing is opened.` } })
  if (printed === null) return none('printedNone', `${one.name} printed no address to sign in at.`)
  let url: URL
  try {
    url = new URL(printed)
  } catch {
    // Handled: what cannot be read as a URL is not an address to open, and the answer says so.
    return none('notAnAddress', `What ${one.name} printed to sign in at cannot be read as an address.`)
  }
  if (url.protocol !== 'https:') return none('notHttps', `The address ${one.name} printed to sign in at is not https.`)
  if (url.username !== '' || url.password !== '') return none('hasAUser', `The address ${one.name} printed to sign in at has a user part before its host.`)
  if (url.port !== '') return none('hasAPort', `The address ${one.name} printed to sign in at names a port.`)
  if (url.hostname !== declared.host) return none('anotherHost', `The address ${one.name} printed to sign in at is not on ${declared.host}, where ${one.name} signs in.`)
  return { address: url.href, noAddress: null }
}

/** The address and device code in what a tool printed so far, colour codes taken out. */
function theAddressAndCode(printed: string): { address: string | null; code: string | null } {
  // eslint-disable-next-line no-control-regex
  const plain = printed.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  const address = AN_ADDRESS.exec(plain)?.[0] ?? null
  const code = A_DEVICE_CODE.exec(plain.replace(new RegExp(AN_ADDRESS.source, 'g'), ' '))?.[1] ?? null
  return { address, code }
}

/**
 * START THE TOOL'S OWN ACCOUNT SIGN-IN, and answer the address a page may open (`theAddressThePageMayOpen`) and the
 * device code it prints, with the id of this sign-in. The tool keeps running until the person finishes in the browser, it
 * ends, or ten minutes pass. A second start while one runs answers the first. No account and no key is written to it;
 * only the code door writes to it, once (`giveTheCodeToTheSignIn`).
 */
export async function startTheToolsOwnSignIn(one: Harness): Promise<SignInStarted> {
  const signIn = THE_ACCOUNT_SIGN_INS[one.id]
  if (signIn === undefined || one.signIn === null) throw aHarnessRefusal('harnessNoSignIn', `${one.name} has no account sign-in the office can start. Nothing was started.`)
  const { args } = signIn
  const running = signingIn.get(one.id)
  if (running !== undefined) return { ...running.answer, already: true }
  const env = theEnvironmentATerminalGets()
  const where = whereIsThisTool(one.program, env)
  if (where === null) throw aHarnessRefusal('harnessNotInstalled', `${one.name} is not installed on the PATH the office's terminals get. Nothing was started.`, 409)
  const failed = (): PanelError =>
    aHarnessRefusal('harnessSignInFailed', `${one.name}'s own sign-in did not start. Start it yourself in a terminal: ${[one.program, ...args].join(' ')}.`, 502)
  let child: ChildProcess
  try {
    const way = theWayToStart(where, args)
    child = spawn(way.command, way.args, {
      shell: false,
      // ITS INPUT STAYS OPEN: a sign-in that reads its input waits, and does not end. Only the code door writes to it.
      stdio: ['pipe', 'pipe', 'pipe'],
      env: theToolsEnvironment(one.program, BROWSER_IS_SET ? { ...env, BROWSER: A_BROWSER_THAT_OPENS_NOTHING } : env),
      windowsVerbatimArguments: way.windowsVerbatimArguments,
      windowsHide: true,
    })
  } catch {
    // Handled: a word theWayToStart refuses is a sign-in that did not start, and the answer says so.
    throw failed()
  }
  const started = now()
  let printed = ''
  const said = await new Promise<{ address: string | null; code: string | null; ended: boolean }>((done) => {
    let settled = false
    let codeTimer: NodeJS.Timeout | undefined
    const finish = (ended: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(codeTimer)
      done({ ...theAddressAndCode(printed), ended })
    }
    const timer = setTimeout(() => finish(false), A_SIGN_IN_SAYS_ITS_ADDRESS_WITHIN_MS)
    const read = (chunk: string): void => {
      if (printed.length < AT_MOST_PRINTED) printed += chunk
      const found = theAddressAndCode(printed)
      if (found.address !== null && found.code !== null) finish(false)
      else if (found.address !== null && codeTimer === undefined) codeTimer = setTimeout(() => finish(false), A_DEVICE_CODE_FOLLOWS_WITHIN_MS)
    }
    child.stdout?.setEncoding('utf8').on('data', read)
    child.stderr?.setEncoding('utf8').on('data', read)
    child.once('error', () => finish(true))
    child.once('close', () => finish(true))
  })
  if (said.ended && said.address === null) throw failed()
  const id = randomBytes(12).toString('base64url')
  const answer = {
    harness: one.id,
    id,
    ...theAddressThePageMayOpen(one, said.address),
    code: said.code,
    takesACode: signIn.takesACode,
    aSecondTabMayOpen: signIn.opensItsOwnBrowser && process.platform !== 'linux',
    started,
  }
  // A TOOL THAT ENDED JUST AFTER THE WAIT is not kept as running: its close has gone, and would never take it out again.
  if (!said.ended && child.exitCode === null && child.signalCode === null) {
    signingIn.set(one.id, { child, answer, until: Date.now() + A_SIGN_IN_IS_KEPT_MS, codeGiven: false })
    const stop = setTimeout(() => child.kill('SIGTERM'), A_SIGN_IN_IS_KEPT_MS)
    stop.unref()
    child.once('close', () => {
      clearTimeout(stop)
      signInsEnded.add(`${one.id} ${id}`)
      if (signingIn.get(one.id)?.child === child) signingIn.delete(one.id)
    })
  } else {
    signInsEnded.add(`${one.id} ${id}`)
  }
  return { ...answer, already: false }
}

/**
 * GIVE THE CODE THE SIGN-IN PAGE SHOWED TO THE SIGN-IN THAT PRESS STARTED, found by the id its start answered. The code
 * and a newline are written once to the sign-in's standard input, as typing it and Enter would, and the input is then
 * closed. A sign-in that takes no code, an id that names no sign-in started here for this tool, a sign-in that ended or
 * ran past its time, and a second code are each refused, and nothing is written. The code is never kept, logged or
 * answered, and no refusal holds it.
 */
export async function giveTheCodeToTheSignIn(one: Harness, id: string, code: string): Promise<SignInCodeGiven> {
  const ended = (): PanelError =>
    aHarnessRefusal('harnessSignInEnded', `That sign-in of ${one.name}'s has ended or ran past its ten minutes. Nothing was sent to it. Press Sign in again.`, 409)
  const running = signingIn.get(one.id)
  if (running === undefined || running.answer.id !== id) {
    if (signInsEnded.has(`${one.id} ${id}`)) throw ended()
    throw aHarnessRefusal('harnessNoSuchSignIn', `No sign-in the office started for ${one.name} has that id. Nothing was sent to it.`, 404)
  }
  if (!running.answer.takesACode) throw aHarnessRefusal('harnessSignInTakesNoCode', `${one.name}'s sign-in takes no code from the office. Nothing was sent to it.`, 409)
  if (running.codeGiven) throw aHarnessRefusal('harnessSignInCodeGiven', `That sign-in of ${one.name}'s has had its code already, and takes one. Nothing more was sent to it.`, 409)
  const { child } = running
  const stdin = child.stdin
  if (Date.now() >= running.until || child.exitCode !== null || child.signalCode !== null || stdin === null || !stdin.writable) throw ended()
  running.codeGiven = true
  const written = await new Promise<boolean>((done) => {
    // Handled: an input that broke means the sign-in ended, and the answer says so.
    stdin.once('error', () => done(false))
    stdin.write(`${code}\n`, (error) => done(error === null || error === undefined))
    stdin.end()
  })
  if (!written) throw ended()
  return { harness: one.id, signIn: id, codeGiven: true }
}

/** Whether a tool's own sign-in started here is still running. */
export function aSignInIsRunning(one: Harness): boolean {
  return signingIn.has(one.id)
}

/** Stop every sign-in started here. For a test. */
export function stopTheSignIns(): void {
  for (const { child } of signingIn.values()) child.kill('SIGKILL')
  signingIn.clear()
}
