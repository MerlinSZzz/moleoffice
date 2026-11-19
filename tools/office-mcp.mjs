#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * office_request for Codex and Claude Code over stdio, one JSON-RPC message per line. No protocol dependencies.
 * IcgsA-OGvbzL: messages hX_qDiISkTCp, xu5mbrN9ucmN and t_YPyiwf07YJ.
 * RATbb8xNemOW: a Codex worker's commands get no MOLE_AGENT_KEY. Codex itself still holds the key,
 * and env_vars forwards it to this server (t_YPyiwf07YJ).
 * rgAmP45EklqO: Claude Code holds no worker key in its environment; its launcher's MCP configuration
 * file (mode 600, in a folder of its own, never in a log or a worktree) gives this server the key through
 * the server's env instead.
 * A run started with --starts-runs keeps the key in its commands.
 *
 * ON ANOTHER COMPUTER THE KEY MAY COME FROM A FILE: MOLE_AGENT_KEY_FILE names it. Under a decision, the owner's Mac
 * joins the office as an agent this way. The file is the one the secretary made with
 * register-a-started-agent.mjs --key-file and the owner carried to that computer by hand, so the key is in no
 * configuration and no shell. It is read once, before this server answers anything, and anything wrong with it stops
 * the server with a sentence and exit 1. Agreed with the agent that owns tools/, in its message aOvYSKXarQp2. Wave 13t,
 * round 21.
 *
 * SINCE THEN for-agents/agent-key.mjs reads the file, as it reads every agent's key. It is read again for each
 * request, so the key is never put into this server's environment.
 */
import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { askTheOffice, answerWithFields, prepareOfficeRequest, validateRequestFields, OFFICE_REQUEST, officeRequestDefinition, renderOfficeAnswer, withoutKeys } from './office-request.mjs'
import { workerCheckpoint } from './worker-delivery/checkpoint.mjs'
import { pictureJudgementTools, callPictureJudgement } from './picture-judgements/index.mjs'
import { aSecretFromTheEnvironment, THE_AGENT_KEY } from '../for-agents/agent-key.mjs'
import { howAFullPathIsWritten, isAnAbsolutePath, thePathsOf, theSameSpelling, THIS_PLATFORM } from '../src/config/the-paths-of-a-system.mjs'

// The parameters are handed on from the one shared definition, rather than written again here: each one's type and
// every other word it carries go into the schema as they came.
export const officeMcpTool = {
  name: OFFICE_REQUEST,
  description: officeRequestDefinition.description,
  inputSchema: {
    type: 'object',
    properties: Object.fromEntries(Object.entries(officeRequestDefinition.parameters).map(([name, parameter]) => {
      const { required: _required, ...rest } = /** @type {{required?: boolean, description: string}} */ (parameter)
      // The body is declared an object with any keys, in officeRequestDefinition (problem fO_gBrFz9Ax9): a body the
      // model sends as JSON text in quotes is refused by this tool rather than passed on.
      return [name, rest]
    })),
    required: Object.entries(officeRequestDefinition.parameters).filter(([, p]) => 'required' in p && p.required).map(([name]) => name),
    additionalProperties: false,
  },
}

/**
 * @param {any} message
 * @param {Parameters<typeof askTheOffice>[1]} [options]
 * @param {ReturnType<typeof workerCheckpoint>} [checkpoint]
 * @returns {Promise<object | null>}
 */
export async function answerOfficeMessage(message, options, checkpoint) {
  const id = message?.id ?? null
  /** @param {number} code @param {string} text */
  const error = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: withoutKeys(text) } })
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return error(-32600, 'Invalid JSON-RPC request.')
  }
  // Notifications never receive a JSON-RPC response.
  if (!Object.hasOwn(message, 'id')) return null
  let result
  switch (message.method) {
    case 'initialize':
      result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mole-office', version: '1.0.0' } }
      break
    case 'ping':
      result = {}
      break
    case 'tools/list':
      result = { tools: [officeMcpTool, ...pictureJudgementTools] }
      break
    case 'tools/call': {
      if (pictureJudgementTools.some(tool => tool.name === message.params?.name)) {
        result = await callPictureJudgement(message.params.name, message.params.arguments, options)
        break
      }
      if (message.params?.name !== OFFICE_REQUEST) return error(-32602, 'Unknown tool.')
      try {
        const supplied = message.params.arguments
        if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('office_request needs method, path and an optional JSON body.')
        const args = { ...supplied, fields: validateRequestFields(supplied.fields === undefined ? 'short' : supplied.fields, supplied.method) }
        const fromFile = theFileAskedFor(args)
        prepareOfficeRequest(args, options)
        if (fromFile === null) {
          if (checkpoint) await checkpoint.beforeCall(options)
          const answer = await askTheOffice(args, options)
          result = { content: renderOfficeAnswer(args, answer), isError: answer.projectionRefused === true }
        } else {
          const read = await aReportFileRead(fromFile, options)
          if (checkpoint) await checkpoint.beforeCall(options)
          // Integrity is judged from the full masked answer before any user-facing selection or cutoff.
          const answer = await askTheOffice({ ...args, fields: 'whole', body: { ...args.body, bytes: read.bytes.toString('base64') } }, { ...options, longestReply: Number.MAX_SAFE_INTEGER })
          result = theStoredFileJudged(args, answer, fromFile, read)
        }
      } catch (why) {
        result = { content: [{ type: 'text', text: withoutKeys(why instanceof Error ? why.message : String(why)) }], isError: true }
      }
      if (checkpoint && !result.isError) result = await checkpoint.append(result, options)
      break
    }
    default:
      return error(-32601, 'Unknown method.')
  }
  return { jsonrpc: '2.0', id, result }
}

// ---------------------------------------------------------------- a report file, read here from its path
//
// A REPORT FILE IS READ HERE FROM ITS PATH, SO ITS BYTES NEVER PASS THROUGH THE MODEL (19 October 2026;
// L2e8ymzb0nDF). In a sandbox only this server holds the run's key, and a run that typed a picture's base64 into
// office_request could not send it (13k's twelve report pictures were 2.2 M characters). So office_request to
// POST /api/report-files takes "bytes": {"fromFile": "<full path>"}: this server reads the file, sends its base64, and
// checks the size and short hash the office stored against the file it read. The bytes are never in an answer.

/** The one door whose body may name a file, and the field that names it. */
const THE_REPORT_FILES_DOOR = '/api/report-files'
const A_FILE_IS_NAMED_BY = 'fromFile'
/** src/server/lib/version.ts's HASH_CHARS: the short sha256 the office gives a stored file. */
const THE_SHORT_HASH_IS = 16
/**
 * FOLDERS AND FILES THAT HOLD CREDENTIALS, never read for a report. A hidden part alone is no reason (vmKz-CMmzsDs):
 * every sandbox's files sit under the host's ~/.cache/mole-office/sandboxes, and a sandbox sees that same path.
 */
const CREDENTIALS = new Set(['.claude', '.codex', '.config', '.ssh', '.gnupg', '.aws', '.docker', '.kube', '.git', '.netrc', '.npmrc', '.pypirc', '.git-credentials'])
/**
 * WHETHER ONE PART OF A PATH NAMES A CREDENTIALS FOLDER OR FILE. The names are compared by the layer's spelling rule,
 * so how one system compares a name is said in src/config/the-paths-of-a-system.mjs and nowhere else.
 * @param {string} part
 * @param {string} [platform]
 * @returns {boolean}
 */
const aCredentialsPart = (part, platform = THIS_PLATFORM) =>
  [...CREDENTIALS].some((name) => theSameSpelling(part, name, platform)) ||
  theSameSpelling(part, '.env', platform) ||
  theSameSpelling(part.slice(0, 5), '.env.', platform)
const NOTHING_SENT = 'Nothing was sent.'

/**
 * THE PATH A REQUEST ASKS THIS SERVER TO READ, or null when its body names no file. A body naming a file anywhere but
 * POST /api/report-files, or naming it with anything else beside, is refused here and never sent on.
 * @param {any} args
 * @returns {string | null}
 */
export function theFileAskedFor(args) {
  const bytes = args?.body?.bytes
  if (bytes === null || typeof bytes !== 'object' || !Object.hasOwn(bytes, A_FILE_IS_NAMED_BY)) return null
  let door = ''
  try { door = new URL(String(args.path ?? ''), 'http://the-office').pathname } catch { door = '' }
  if (String(args.method ?? '').toUpperCase() !== 'POST' || door !== THE_REPORT_FILES_DOOR) {
    throw new Error(`"bytes": {"${A_FILE_IS_NAMED_BY}": ...} is read only for POST ${THE_REPORT_FILES_DOOR}. ${NOTHING_SENT}`)
  }
  if (Array.isArray(bytes) || Object.keys(bytes).length !== 1 || typeof bytes[A_FILE_IS_NAMED_BY] !== 'string') {
    throw new Error(`"bytes" takes {"${A_FILE_IS_NAMED_BY}": "<the file's full path>"} and nothing else beside it. ${NOTHING_SENT}`)
  }
  return bytes[A_FILE_IS_NAMED_BY]
}

/**
 * THE PARTS A PATH IS MADE OF ON ONE SYSTEM: Windows ends a part at either separator, and Linux and the Mac end one
 * only at "/", so a "\" stays inside a name there.
 * @param {string} path
 * @param {string} [platform]
 * @returns {string[]}
 */
function thePartsOfAPath(path, platform = THIS_PLATFORM) {
  return platform === 'win32' ? path.split(/[\\/]/u) : path.split('/')
}

/**
 * WHETHER A PATH IS WRITTEN PLAINLY: no "." or ".." part, and no empty part where two separators meet. The first part
 * is the root, and one separator at the end is how a folder is written, so neither is refused.
 * @param {string} path
 * @param {string} [platform]
 * @returns {boolean}
 */
function aPathWrittenPlainly(path, platform = THIS_PLATFORM) {
  const rest = thePartsOfAPath(path, platform).slice(1)
  if (rest.length > 0 && rest[rest.length - 1] === '') rest.pop()
  return !rest.some((part) => part === '' || part === '.' || part === '..')
}

/**
 * THE SENTENCE REFUSING A PATH THAT IS NOT A FILE'S FULL PATH, written plainly: the example is the one that system
 * writes, and the platform is handed on as it came, so a caller that names none gets the layer's own default.
 * @param {string} path
 * @param {string} [platform]
 * @returns {string}
 */
export function theFullPathIsNotWritten(path, platform) {
  return `"${A_FILE_IS_NAMED_BY}" must be the file's full path, ${howAFullPathIsWritten('report.md', platform)}, with no . or .. part, and it is ${JSON.stringify(path)}. ${NOTHING_SENT}`
}

/**
 * THE SENTENCE REFUSING A PATH THAT GOES THROUGH A LINK, to the real path it leads to.
 * @param {string} path
 * @param {string} real
 * @returns {string}
 */
export function theLinkIsRefused(path, real) {
  return `The path ${path} goes through a link, to ${real}; name the file by its own path. ${NOTHING_SENT}`
}

/**
 * THE SENTENCE REFUSING A PATH WHOSE OPENED FILE IS A LINK NOW, OR IS ANOTHER FILE: the open could not refuse a link
 * itself, and the file at the path is not the one the descriptor holds.
 * @param {string} path
 * @returns {string}
 */
export function theOpenedFileIsNotThePath(path) {
  return `The path ${path} goes through a link, or is not the file that was opened; name the file by its own path. ${NOTHING_SENT}`
}

/**
 * WHETHER A PATH MAY BE READ AS A REPORT FILE, by the rules of one system: it must be a full path there and written
 * plainly. Null when it may, and the sentence when it may not.
 * @param {string} path
 * @param {string} [platform]
 * @returns {string | null}
 */
export function theReportFilePathRefused(path, platform) {
  if (!isAnAbsolutePath(path, platform) || !aPathWrittenPlainly(path, platform)) return theFullPathIsNotWritten(path, platform)
  return null
}

/**
 * WHETHER A REAL PATH IS THE PATH THAT WAS NAMED. Windows compares by spelling, because it writes a path with "\" and
 * ignores case; Linux and the Mac compare the two strings exactly.
 * @param {string} path
 * @param {string} real
 * @param {string} [platform]
 * @returns {string | null}
 */
export function theLinkRefused(path, real, platform = THIS_PLATFORM) {
  const same = platform === 'win32'
    ? theSameSpelling(real, thePathsOf('win32').normalize(path), platform)
    : real === path
  return same ? null : theLinkIsRefused(path, real)
}

/**
 * THE CREDENTIALS FOLDER OR FILE IN A PATH, under that system's rule, or undefined when it holds none. Every part is
 * judged by the layer's spelling rule, and a "\" is a separator only where the system says it is.
 * @param {string} path
 * @param {string} [platform]
 * @returns {string | undefined}
 */
export function theCredentialsPartIn(path, platform = THIS_PLATFORM) {
  return thePartsOfAPath(path, platform).find((part) => part !== '' && aCredentialsPart(part, platform))
}

/**
 * THE FLAGS A REPORT FILE IS OPENED WITH, and whether the open itself refuses a link. O_NONBLOCK keeps the open from
 * waiting on a named pipe on Linux and the Mac; a drive-letter path on Windows has no pipe, so it is not wanted there.
 * O_NOFOLLOW is not on Windows, so no undefined value is ever OR'd in, and the read compares the opened file with the
 * path itself. Windows also has no O_NONBLOCK.
 * @param {{ O_RDONLY?: number, O_NONBLOCK?: number, O_NOFOLLOW?: number }} theConstants
 * @param {string} [platform]
 * @returns {{ flags: number, refusesALink: boolean }}
 */
export function howAReportFileIsOpened(theConstants, platform = THIS_PLATFORM) {
  let flags = theConstants.O_RDONLY ?? 0
  let refusesALink = false
  if (platform !== 'win32') {
    if (typeof theConstants.O_NONBLOCK === 'number') flags |= theConstants.O_NONBLOCK
    if (typeof theConstants.O_NOFOLLOW === 'number') {
      flags |= theConstants.O_NOFOLLOW
      refusesALink = true
    }
  }
  return { flags, refusesALink }
}

/**
 * WHETHER THE OPENED FILE IS THE FILE AT THE PATH: a path that is a link now, or a different file, is not. dev and ino
 * are bigints, because a Windows file index can be larger than a double holds without losing a digit.
 * @param {string} path
 * @param {{ dev: bigint, ino: bigint }} opened
 * @param {{ dev: bigint, ino: bigint, isSymbolicLink: () => boolean } | null} atPath
 * @returns {string | null}
 */
export function theOpenedFileRefused(path, opened, atPath) {
  if (atPath !== null && !atPath.isSymbolicLink() && opened.dev === atPath.dev && opened.ino === atPath.ino) return null
  return theOpenedFileIsNotThePath(path)
}

/**
 * THE OPTIONS a report file's read is given. `platform` stands a system in for a test, as src/config/the-paths-of-a-
 * system.mjs does, and `theConstants` stands in node:fs's constants, so a system with no O_NOFOLLOW can be proved on
 * one that has it.
 * @typedef {Parameters<typeof askTheOffice>[1] & { platform?: string, theConstants?: { O_RDONLY?: number, O_NONBLOCK?: number, O_NOFOLLOW?: number } }} AReportFileReadOptions
 */

/**
 * THE FILE, READ FOR A REPORT: refused with a sentence before anything is sent when it is not a full path, goes
 * through a link, is a credentials folder or file, is the run's key file or sits in its folder, is not a regular file, is
 * empty, or is larger than the office stores (read from GET /api/report-files). Opened once and read from that same
 * descriptor. Where the open cannot refuse a link itself, the opened file is compared with the file at the path before
 * anything is read, because the path can be made a link between the two.
 * @param {string} path
 * @param {AReportFileReadOptions} [options]
 * @returns {Promise<{ bytes: Buffer, size: number, hash: string }>}
 */
export async function aReportFileRead(path, options) {
  const env = options?.env ?? process.env
  const platform = options?.platform
  const theConstants = options?.theConstants ?? constants
  const notFull = theReportFilePathRefused(path, platform)
  if (notFull !== null) throw new Error(notFull)
  let real = ''
  try { real = realpathSync(path) } catch (why) {
    throw new Error(`The file ${path} could not be found (${/** @type {NodeJS.ErrnoException} */ (why).code ?? 'no reason given'}). ${NOTHING_SENT}`)
  }
  const opening = howAReportFileIsOpened(theConstants, platform)
  const system = platform ?? THIS_PLATFORM
  // WHERE THE OPEN CANNOT REFUSE A LINK, THE COMPARISON AFTER IT IS THE GUARD. On Windows the comparison before the
  // open still runs, because the comparison after it sees only the last part of the path, so a link in a folder above
  // would be missed. A POSIX system whose constants have no O_NOFOLLOW is a stand-in, and takes the comparison after
  // the open.
  if (system === 'win32' || opening.refusesALink) {
    const throughALink = theLinkRefused(path, real, platform)
    if (throughALink !== null) throw new Error(throughALink)
  }
  const credentials = theCredentialsPartIn(path, platform)
  if (credentials !== undefined) throw new Error(`The file ${path} is in a credentials folder or is a credentials file (${credentials}), and is never sent as a report file. ${NOTHING_SENT}`)
  const keyFile = env['MOLE_AGENT_KEY_FILE']
  let theKey = null
  if (typeof keyFile === 'string' && keyFile !== '') {
    try { theKey = statSync(keyFile, { bigint: true }) } catch { theKey = null }
    if (dirname(path) === dirname(keyFile) || (theKey !== null && dirname(path) === dirname(realpathSync(keyFile)))) {
      throw new Error(`The file ${path} is the run's key file, or sits in its folder, and is never sent. ${NOTHING_SENT}`)
    }
  }
  let fd = null
  try {
    try { fd = openSync(path, opening.flags) } catch (why) {
      throw new Error(`The file ${path} could not be opened (${/** @type {NodeJS.ErrnoException} */ (why).code ?? 'no reason given'}). ${NOTHING_SENT}`)
    }
    const opened = fstatSync(fd, { bigint: true })
    if (!opening.refusesALink) {
      let atPath = null
      try { atPath = lstatSync(path, { bigint: true }) } catch { atPath = null }
      const refused = theOpenedFileRefused(path, opened, atPath)
      if (refused !== null) throw new Error(refused)
    }
    if (theKey !== null && opened.dev === theKey.dev && opened.ino === theKey.ino) throw new Error(`The file ${path} is the run's key file, and is never sent. ${NOTHING_SENT}`)
    if (!opened.isFile()) throw new Error(`The path ${path} is not a regular file. ${NOTHING_SENT}`)
    const size = Number(opened.size)
    if (size === 0) throw new Error(`The file ${path} is empty. ${NOTHING_SENT}`)
    const limit = await theLargestReportFile(options)
    if (size > limit) throw new Error(`The file ${path} is ${String(size)} bytes, and the office stores a report file of at most ${String(limit)} bytes. ${NOTHING_SENT}`)
    const bytes = Buffer.alloc(size)
    let got = 0
    while (got < size) {
      const one = readSync(fd, bytes, got, size - got, got)
      if (one === 0) break
      got += one
    }
    if (got !== size) throw new Error(`The file ${path} changed while it was read (${String(got)} of ${String(size)} bytes). ${NOTHING_SENT}`)
    return { bytes, size: got, hash: createHash('sha256').update(bytes).digest('hex').slice(0, THE_SHORT_HASH_IS) }
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * THE LARGEST REPORT FILE THE OFFICE STORES, read from its own door, so a file it would refuse is never sent. The door
 * answers {"reportFile": {"maxBytes": ..., "maxName": ...}} (src/server/api/reportfiles.ts); reading maxBytes at the top
 * found none, and every file was refused (the check's refusal lvw2tRFLMmB_).
 * @param {Parameters<typeof askTheOffice>[1]} [options]
 * @returns {Promise<number>}
 */
async function theLargestReportFile(options) {
  const answer = await askTheOffice({ method: 'GET', path: THE_REPORT_FILES_DOOR }, options)
  let limit = null
  try { limit = answer.status === 200 ? JSON.parse(answer.body)?.reportFile?.maxBytes : null } catch { limit = null }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    throw new Error(`The office's limit for a report file could not be read (GET ${THE_REPORT_FILES_DOOR} answered ${String(answer.status)}). ${NOTHING_SENT}`)
  }
  return limit
}

/**
 * THE OFFICE'S ANSWER, JUDGED AGAINST THE FILE READ: a stored file whose size or short hash is not the file's is an
 * error naming the path and both hashes. Only the office's reply is shown, never the bytes.
 * @param {any} args
 * @param {import('./office-request.mjs').AnAnswer} answer
 * @param {string} path
 * @param {{ size: number, hash: string }} read
 */
export function theStoredFileJudged(args, answer, path, read) {
  let stored = null
  try { stored = JSON.parse(answer.body)?.file ?? null } catch { stored = null }
  const matches = stored !== null && stored.size === read.size && stored.hash === read.hash
  const projected = answerWithFields(answer, args.fields === undefined ? 'short' : args.fields, args.method)
  const shown = renderOfficeAnswer(args, projected)
  if (answer.status !== 201) return { content: shown, isError: projected.projectionRefused === true }
  const said = shown[0]?.text ?? ''
  if (matches) {
    return { content: [{ type: 'text', text: `${said}\nThe stored file matches ${path} as read: ${String(read.size)} bytes, hash ${read.hash}.` }], isError: projected.projectionRefused === true }
  }
  return {
    content: [{
      type: 'text',
      text: `${said}\nTHE STORED FILE DOES NOT MATCH ${path} AS READ: the office answered size ${String(stored?.size)} and hash ` +
        `${String(stored?.hash)}, and the file read was ${String(read.size)} bytes with hash ${read.hash}. Do not put this stored file in a ` +
        'report. Ask again, and tell your supervisor if it does not match a second time.',
    }],
    isError: true,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // THE KEY FILE IS CHECKED BEFORE ANYTHING IS ANSWERED, so a file that cannot be used stops the start rather than the
  // first request. Each request reads it again through theAgentKey; the key is never put into this environment.
  try {
    aSecretFromTheEnvironment(THE_AGENT_KEY, process.env, 'This server did not start and nothing was sent.')
  } catch (why) {
    process.stderr.write(withoutKeys(why instanceof Error ? why.message : String(why)) + '\n')
    process.exit(1)
  }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const checkpoint = workerCheckpoint()
  // A failed output closes this receiver. Buffered later requests cannot acknowledge words nobody received.
  process.stdout.on('error', () => { process.exitCode = 1; lines.close(); process.stdin.destroy() })
  for await (const line of lines) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON.' } }) + '\n')
      continue
    }
    const answer = await answerOfficeMessage(message, undefined, checkpoint)
    if (answer !== null) {
      try {
        await new Promise((resolve, reject) => process.stdout.write(JSON.stringify(answer) + '\n', error => error ? reject(error) : resolve(undefined)))
      } catch { process.exitCode = 1; break }
      if ('result' in answer) checkpoint.presented(answer.result)
    }
  }
}
