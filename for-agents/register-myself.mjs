#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REGISTER THIS SESSION. One command, one request, before it does anything. F15 point 2; problem
 * pHFu8nivPZ_O.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * On 14 September 2026 a new agent in another project's folder took about twenty tool calls and met two
 * refusals to register itself: `POST /api/agents/started` refused a caller nothing was registered
 * as, and `POST /api/roles/requests` refused because its starter was a person. The door at
 * `POST /api/agents/register-myself` is one request in their place, and this is the one line a
 * terminal runs to make it.
 *
 * IT PRINTS WHAT THE SERVER SAID, EXCEPT THE KEY. There is no local copy of the rules, no retry under
 * another name and no fallback. A refusal is printed and the exit code is non-zero. The key is
 * answered once, and this writes it to a new file only its owner can read (0600, created with 'wx' so
 * an existing file is never overwritten) and never prints it: a key printed goes into a terminal's
 * scrollback, a transcript and any log that caught the output. The file is `--key-file`, or
 * `mole-office-key` in the `--notes` folder. One of the two is required, and the file must not exist
 * yet, checked before the request so a key is never answered with nowhere to put it.
 *
 * A REGISTRATION THAT WAITS FOR THE PERSON'S PRESS is answered a one-time secret on its first ask
 * (finding 83). This writes it beside the key file exactly as it writes a new-key ask's secret
 * below, sends it back on the next run, and removes it once the key is written: after the press, only
 * the ask holding the secret is answered the key.
 *
 * `--new-key` IS AN EXISTING AGENT ASKING FOR A NEW KEY because it lost its own (problem
 * x8ktQfHS5yGr). The first ask waits for the person's press or its starter's grant, and is answered a
 * one-time secret once. This writes the secret beside the key file (`<key file>.ask-secret`, 0600,
 * 'wx') and never prints it. The ask after the grant sends the secret back, because only the asker
 * holding it collects the key; it is answered one new key, once, this writes it to the key file, and
 * then removes its own secret file.
 *
 * Usage:
 *   node for-agents/register-myself.mjs --handle <handle> --name "<name>" --dir <working directory> \
 *       (--key-file <path> | --notes <dir>) [--new-key] \
 *       [--runtime <runtime>] [--area <path>]... [--role <card>] [--doing "<one line>"] \
 *       [--start-folder <absolute path>] [--provider-session <id>] [--machine <name>] \
 *       [--workspace <id>] [--api <url>] [--json]
 *
 * ---------------------------------------------------------------------------------------
 * `--start-folder` IS ASKED FOR AND NEVER TAKEN FROM `--dir`
 * ---------------------------------------------------------------------------------------
 *
 * Part (c) of a decision, and the answer to open question 9 of the recognition measurement. A
 * start folder is what the session hook names a durable agent from when neither the session's environment nor a `.env`
 * does, so it must be the folder of an agent's own sessions and nothing else. `--dir` is the directory THIS
 * registration was run in, and the skill has every session a person starts register itself, and one folder can hold the
 * session records of several conversations. Recording `--dir` for every registration would have handed one agent's name
 * to other people's sessions, so the two flags are separate and this one is only sent when somebody asks for it.
 *
 * ---------------------------------------------------------------------------------------
 * `--provider-session` POINTS THE SESSION HOOK'S NOTE AT THE RECORD THIS REGISTRATION GAVE THE CONVERSATION
 * ---------------------------------------------------------------------------------------
 *
 * Problem Tv32CoCfV-cP (29 September 2026). One agent's start hook filed a record for his conversation, with
 * no agent on it, and wrote the session hook's note naming it (src/config/the-session-note.mjs). His
 * registration, admitted at the owner's press, filed a second record for the same conversation, and his
 * waiter held his handle on that one. The Stop hook stamps only the record the note names, so the second
 * record never carried the conversation: the office could not tie his process to it, answered "nobody" for
 * his handle, showed him to the owner as Cannot reach, and copied every message to him to the owner.
 *
 * So once this ask holds the agent's first key (a registration admitted now, or the first key collected
 * after the press), and `--provider-session` names the conversation, this finds the one live session record
 * that holds this agent and names that conversation, and points the note at it. The Stop hook then stamps
 * that record at the end of each turn, as it stamps one it filed itself.
 *
 * AND THE START HOOK'S OWN RECORD IS CLOSED BY THE HOOK, NOT HERE. When the record the note named before is a
 * live session record of this conversation that no agent holds (the start hook's own, filed before the
 * session had a name), the note says so ("supersedes"), and the session hook closes it as superseded at the
 * end of the next turn, so the conversation is not left with two live records. This
 * tool cannot: an agent may not end a run it did not start or file (problem FZQflYp1vHuY), and the hook is
 * one of the office's own processes.
 *
 * AND THE NOTE SAYS WHICH PROJECT EACH RECORD IS IN ("workspace", "supersedesWorkspace"; problem yIh8EGfyZXMH,
 * 3 October 2026): the project this agent was registered in, from which both records were read. Without it the hook
 * read the records under its folder's project, which is another project when the agent was registered elsewhere.
 *
 * WHAT IT NEVER DOES. It writes no note without `--provider-session`, and none when the environment names
 * this session's run (MOLE_OFFICE_SESSION), because the hook then takes that run as the session's record
 * and keeps no note. It never points the note away from a record another agent holds. It names no record of
 * another conversation, and none an agent holds, as superseded. And it never fails the registration: the
 * key is written first, and whatever this step could not do is printed.
 */
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { settingValue, transientToolContext } from '../src/config/settings.mjs'
import { howAFullPathIsWritten, isAnAbsolutePath } from '../src/config/the-paths-of-a-system.mjs'
import { readAFullList } from './a-full-list-read.mjs'
import { whereIsTheApiForACommand, whichWorkspace } from './where-is-the-api.mjs'
import {
  RUN_IS_OVER_STATES,
  aConversationANoteCanName,
  theRecordTheNoteNames,
  writeTheSessionNote,
} from '../src/config/the-session-note.mjs'

/** The header the key travels on, and the file name in a notes folder. */
const KEY_HEADER = 'x-mole-office-key'
const KEY_FILE_IN_NOTES = 'mole-office-key'

const TIMEOUT_SECONDS = Number(settingValue('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS'))

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node for-agents/register-myself.mjs --handle <handle> --name "<name>" --dir <working directory> \\',
      '    (--key-file <path> | --notes <dir>) [--new-key] \\',
      '    [--runtime <runtime>] [--area <path>]... [--role <card>] [--doing "<one line>"] \\',
      '    [--start-folder <absolute path>] [--provider-session <id>] [--machine <name>] \\',
      '    [--workspace <id>] [--api <url>] [--json]',
      '',
      '  --handle     the short address this session writes under. Required.',
      '  --name       what a reader sees. Required.',
      '  --dir        the absolute directory this session started in. Required: the door matches it',
      '               against the registered repositories and work areas to find the project.',
      '  --runtime    which runtime serves this session. A visitor is only an agent from another',
      '               machine; on this machine the runtime no longer decides anything.',
      '  --area       a repository-relative folder this session is there to change. Repeat it.',
      '  --role       the card this session asks for. It GRANTS nothing: a rung above worker waits',
      '               for the person to press. Leaving it out registers a worker.',
      '  --doing      one line about what this session is doing.',
      '  --notes      the absolute path of the folder this session keeps its own notes in. The key',
      '               is written to mole-office-key in it unless --key-file names another file.',
      '  --key-file   the file the key is written to: a new file, readable only by you (0600).',
      '               The key is never printed. One of --key-file and --notes is required.',
      '               A registration that waits for the person\u2019s press writes its one-time secret',
      '               beside the key file; run the same command again after the person\u2019s press.',
      '  --new-key    this agent is registered and lost its key: ask for a new one. The first ask',
      '               waits for the person\u2019s press or its starter\u2019s grant, and its one-time',
      '               secret is written beside the key file; run the same command again after it.',
      '  --start-folder  the absolute folder THIS AGENT\u2019S sessions start in, recorded so the session',
      '               hook can name this agent for a session started there when neither that',
      '               session\u2019s environment nor a .env names one. It is not --dir and is never taken',
      '               from it. The hook names this agent only while it is the only live agent',
      '               registered at that folder and it is not already answering in another live',
      '               session. Refused: a relative path, the root of the machine, and a home folder.',
      '  --provider-session  the Claude Code conversation this session is ($CLAUDE_CODE_SESSION_ID in its',
      '               shell): letters, digits, dots, underscores and dashes. Once the key is written, the',
      '               session hook’s note for that conversation is pointed at the record this',
      '               registration gave it, so the hook stamps that record at the end of each turn.',
      '  --workspace  name the project instead of letting the working directory find it.',
      '  --api        which server to ask. Default: the one this checkout is set to.',
      '  --json       print the reply as it arrived, unchanged.',
      '',
      'The reply carries the headers to send on every later request, and the key exactly once, which',
      'this writes to the key file and never prints.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function readArguments(argv) {
  const chosen = {
    handle: null,
    name: null,
    dir: null,
    runtime: null,
    area: [],
    role: null,
    doing: null,
    notes: null,
    startFolder: null,
    providerSession: null,
    machine: null,
    workspace: null,
    api: null,
    json: false,
    keyFile: null,
    newKey: false,
    secretFile: null,
    secret: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--json') chosen.json = true
    else if (word === '--help' || word === '-h') usage('')
    else if (word === '--handle') chosen.handle = argv[(i += 1)]
    else if (word === '--name') chosen.name = argv[(i += 1)]
    else if (word === '--dir') chosen.dir = argv[(i += 1)]
    else if (word === '--runtime') chosen.runtime = argv[(i += 1)]
    else if (word === '--area') chosen.area.push(argv[(i += 1)])
    else if (word === '--role') chosen.role = argv[(i += 1)]
    else if (word === '--doing') chosen.doing = argv[(i += 1)]
    else if (word === '--notes') chosen.notes = argv[(i += 1)]
    else if (word === '--start-folder') chosen.startFolder = argv[(i += 1)]
    else if (word === '--provider-session') chosen.providerSession = argv[(i += 1)]
    else if (word === '--machine') chosen.machine = argv[(i += 1)]
    else if (word === '--workspace') chosen.workspace = argv[(i += 1)]
    else if (word === '--api') chosen.api = argv[(i += 1)]
    else if (word === '--key-file') chosen.keyFile = argv[(i += 1)]
    else if (word === '--new-key') chosen.newKey = true
    else usage(`unknown argument "${String(word)}"`)
  }
  if (chosen.handle === null) usage('--handle is required')
  if (chosen.name === null) usage('--name is required')
  if (chosen.dir === null) usage('--dir is required')
  // AN ABSOLUTE FOLDER, CHECKED HERE SO THE MISTAKE IS NAMED BEFORE A REQUEST IS MADE. The office
  // checks it too, and its refusal is the one that decides; this is the same rule said early, by the same
  // reading of a full path on this system, because a relative folder is the mistake somebody makes by
  // typing the folder they are standing in.
  if (chosen.startFolder !== null && !isAnAbsolutePath(chosen.startFolder)) {
    usage(`--start-folder must be a full path, ${howAFullPathIsWritten('work')}, and "${chosen.startFolder}" is not one`)
  }
  // A CONVERSATION ID NAMES THE SESSION HOOK'S NOTE, which is a file, so it is checked before any request: an id
  // with a slash or `..` would name a file outside the notes folder (src/config/the-session-note.mjs).
  if (chosen.providerSession !== null && !aConversationANoteCanName(chosen.providerSession)) {
    usage(
      `--provider-session must be letters, digits, dots, underscores and dashes, as a Claude Code conversation's id is, ` +
        `and "${String(chosen.providerSession)}" is not`,
    )
  }
  // WHERE THE KEY GOES, CHECKED BEFORE ANY REQUEST. The office answers a key once; a key answered with
  // nowhere to put it would be lost, and a file overwritten could be another agent's key.
  const keyFile =
    chosen.keyFile !== null ? resolve(chosen.keyFile) : chosen.notes !== null ? join(chosen.notes, KEY_FILE_IN_NOTES) : null
  if (keyFile === null) {
    usage('--key-file or --notes is required: the key is written to a file and never printed')
  }
  if (existsSync(keyFile)) {
    usage(`${keyFile} already exists. The key is written only to a new file, so name another with --key-file`)
  }
  // A FILE THE CALLER NAMED goes in a folder that is already there. The notes folder may not be made
  // yet, and it is made when a key arrives.
  if (chosen.keyFile !== null && (!existsSync(dirname(keyFile)) || !statSync(dirname(keyFile)).isDirectory())) {
    usage(`the folder ${dirname(keyFile)} does not exist, so the key could not be written there`)
  }
  chosen.keyFile = keyFile
  // THE ONE-TIME SECRET OF A FIRST ASK lives beside the key file: a new-key ask's, and a waiting
  // registration's (finding 83). Present means this run is the one that collects: it is sent
  // back, never printed.
  chosen.secretFile = `${keyFile}.ask-secret`
  chosen.secret = existsSync(chosen.secretFile) ? readFileSync(chosen.secretFile, 'utf8').trim() : null
  return chosen
}

/**
 * ONE READ FROM THE OFFICE AS THIS AGENT, WITH ITS KEY, answered `{ status, body }`, or null when nothing answered in
 * time. The key is sent and never printed.
 *
 * @param {string} path
 * @param {{ key: string, workspace: string }} how
 * @returns {Promise<{ status: number, body: any } | null>}
 */
async function readAsThisAgent(path, how) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_SECONDS * 1000)
  try {
    const res = await fetch(`${api}${path}`, {
      headers: {
        'x-mole-office-workspace': how.workspace,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': chosen.handle,
        [KEY_HEADER]: how.key,
      },
      signal: controller.signal,
    })
    const text = await res.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    return { status: res.status, body: parsed }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * POINT THE SESSION HOOK'S NOTE FOR `conversation` AT THE RECORD THIS REGISTRATION GAVE IT, and name in it the record
 * the note named before when that was the start hook's own, for the hook to close. Problem Tv32CoCfV-cP; the header
 * says why, and what this never does.
 *
 * It answers what it did in sentences and never throws: the key is already written, and nothing here may fail the
 * registration.
 *
 * @param {string} conversation
 * @param {{ key: string, workspace: string, agentRecord: string | null }} as  this agent's key, just answered, the
 *   project it was registered in, and its own record there, which a session record's `ranAs` names
 * @returns {Promise<{ conversation: string, record: string | null, path: string | null, supersedes: string | null, says: string[] }>}
 */
async function pointTheSessionNote(conversation, as) {
  /** @type {{ conversation: string, record: string | null, path: string | null, supersedes: string | null, says: string[] }} */
  const out = { conversation, record: null, path: null, supersedes: null, says: [] }
  // THE RUN THE ENVIRONMENT NAMES IS THE SESSION'S RECORD, and the hook keeps no note for it (tools/session-hook.mjs,
  // `theRunTheEnvironmentNames`), so a note written here would have `stop` stamp another record than `start` took.
  const environment = transientToolContext().session
  if (typeof environment === 'string' && environment.trim() !== '') {
    out.says.push(
      `This session's environment names its run, ${environment.trim()} (MOLE_OFFICE_SESSION), which the session hook ` +
        'takes as its record and keeps no note for, so no note was written.',
    )
    return out
  }
  // THE ONE LIVE SESSION RECORD THAT HOLDS THIS AGENT AND NAMES THIS CONVERSATION, from one read of every session
  // record in the project, as the hook reads them (a conversation is named by `providerSession` or by the discovery
  // stamp's `externalId`). A registration admitted at the owner's press filed it then, and this ask's reply does
  // not name it.
  const listed = await readAFullList((path) => readAsThisAgent(path, as), '/api/records?kind=session&shape=full')
  const rows = listed !== null && listed.status === 200 && Array.isArray(listed.body?.records) ? listed.body.records : null
  if (rows === null) {
    out.says.push(
      `Mole Office did not answer the list of session records (${listed === null ? 'no answer' : String(listed.status)}), ` +
        `so the session hook's note for this conversation (${conversation}) is left as it is.`,
    )
    return out
  }
  const live = (one) => one?.deletedAt == null && !RUN_IS_OVER_STATES.includes(one?.data?.state)
  const namesIt = (one) =>
    one?.data?.providerSession === conversation || one?.data?.extra?.discovered?.externalId === conversation
  const agentsOn = (one) =>
    Array.isArray(one?.data?.ranAs) ? one.data.ranAs.map((ran) => ran?.agentId).filter((id) => typeof id === 'string') : []
  const mine = as.agentRecord === null ? [] : rows.filter((one) => live(one) && namesIt(one) && agentsOn(one).includes(as.agentRecord))
  if (mine.length !== 1) {
    out.says.push(
      mine.length === 0
        ? `No live session record of "${chosen.handle}" names this conversation (${conversation}), so the session ` +
            "hook's note is left as it is. A registration names its conversation when its first ask carries " +
            '--provider-session too.'
        : `${String(mine.length)} live session records of "${chosen.handle}" name this conversation (` +
            `${mine.map((one) => one.id).join(', ')}), so the session hook's note is left as it is.`,
    )
    return out
  }
  const record = String(mine[0].id)
  const before = theRecordTheNoteNames(conversation)
  if (before === record) {
    out.record = record
    out.says.push(`The session hook's note for this conversation (${conversation}) already names record ${record}.`)
    return out
  }
  const that = before === null ? null : (rows.find((one) => one?.id === before) ?? null)
  // A RECORD ANOTHER AGENT HOLDS KEEPS THE NOTE: the conversation was already registered as that agent.
  if (that !== null && live(that) && agentsOn(that).length > 0 && !agentsOn(that).includes(as.agentRecord)) {
    out.says.push(
      `The session hook's note for this conversation (${conversation}) names record ${String(before)}, which another ` +
        `agent holds, so it is left as it is and does not name "${chosen.handle}"'s record ${record}.`,
    )
    return out
  }
  // THE START HOOK'S OWN RECORD OF THIS CONVERSATION, live, is named in the note for the hook to close as superseded at
  // the end of the next turn. A record of another conversation, or one already over, is never named. No agent holds a
  // live record of this conversation that reaches this line: another agent's keeps the note (above), and this agent's
  // own is the record found.
  const supersedes = that !== null && live(that) && namesIt(that) ? String(before) : null
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  try {
    // THE PROJECT OF EACH RECORD THE NOTE NAMES (problem yIh8EGfyZXMH): both came from the one list read above, in the
    // project this agent was registered in, so the hook reads them there, whatever project its folder maps to.
    out.path = writeTheSessionNote(conversation, record, at, supersedes, {
      workspace: as.workspace,
      supersedesWorkspace: supersedes === null ? null : as.workspace,
    })
  } catch (err) {
    out.says.push(
      `The session hook's note for this conversation (${conversation}) could not be written: ` +
        `${err instanceof Error ? err.message : String(err)}.`,
    )
    return out
  }
  out.record = record
  out.says.push(
    `The session hook's note for this conversation (${conversation}) names record ${record} now, so the hook stamps ` +
      `it with the conversation at the end of each turn (${String(out.path)}).`,
  )
  if (supersedes !== null) {
    out.supersedes = supersedes
    out.says.push(
      `Record ${supersedes}, which the start hook filed for this conversation and no agent holds, is closed as ` +
        `superseded by ${record} by the session hook at the end of this session's next turn: an agent may not end a ` +
        'run it did not start or file.',
    )
  }
  return out
}

const chosen = readArguments(process.argv.slice(2))
// THE OFFICE THIS COMMAND MEANS, through the one reader, which asks whether this copy may take the environment's
// address: on 4 October 2026 an installed office's copy of this file, run by hand in a sandbox shell without --api,
// registered a made-up agent on the live office (problem JQ3yaANBi1JC). --api always wins.
const api = whereIsTheApiForACommand(chosen.api)
// THE PROJECT, BY THE READER THE ADDRESS CAME FROM, which merges this process's environment over the .env file as
// settings() does. settings() would work out an address as well, and in an installed office with nothing set it said
// on stderr that the address took a default this tool does not ask (round W22).
const workspace = whichWorkspace(chosen.workspace ?? undefined)

const body = {
  handle: chosen.handle,
  name: chosen.name,
  workingDirectory: chosen.dir,
  ...(chosen.runtime === null ? {} : { runtime: chosen.runtime }),
  ...(chosen.area.length === 0 ? {} : { workArea: chosen.area }),
  ...(chosen.role === null ? {} : { requestedRole: chosen.role }),
  ...(chosen.doing === null ? {} : { doing: chosen.doing }),
  ...(chosen.providerSession === null ? {} : { providerSession: chosen.providerSession }),
  ...(chosen.machine === null ? {} : { machine: chosen.machine }),
  ...(chosen.startFolder === null ? {} : { startFolder: chosen.startFolder }),
  ...(chosen.notes === null ? {} : { notes: chosen.notes }),

  ...(chosen.newKey ? { newKey: true } : {}),
  ...(chosen.secret === null || chosen.secret === '' ? {} : { askSecret: chosen.secret }),
}

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), TIMEOUT_SECONDS * 1000)
let res
try {
  res = await fetch(`${api}/api/agents/register-myself`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': workspace,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': chosen.handle,
      // NO RUN IS NAMED. This request carries no key, and a door to a key refuses a run name on a request with no key:
      // nothing yet proves the run is this caller's (problem TwH5ICyRxLVd, lib/the-run-a-key-holds.ts).
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
} catch (err) {
  clearTimeout(timer)
  process.stderr.write(`register-myself: could not reach Mole Office at ${api}: ${String(err)}\n`)
  process.exit(1)
}
clearTimeout(timer)

const text = await res.text()
let said = {}
try {
  said = JSON.parse(text)
} catch {
  said = {}
}

// THE KEY GOES TO THE FILE AND OUT OF EVERYTHING PRINTED. It is taken out of the reply before a line is
// written, so neither the plain lines nor --json can carry it.
const headers = { ...(said.headers ?? {}) }
const key = typeof headers[KEY_HEADER] === 'string' && headers[KEY_HEADER] !== '' ? headers[KEY_HEADER] : null
let keySaid = null
if (key !== null) {
  delete headers[KEY_HEADER]
  said.headers = headers
  try {
    mkdirSync(dirname(chosen.keyFile), { recursive: true, mode: 0o700 })
    writeFileSync(chosen.keyFile, `${key}\n`, { mode: 0o600, flag: 'wx' })
    keySaid = `the key is written to ${chosen.keyFile} (readable only by you) and is not printed`
  } catch (err) {
    process.stderr.write(
      `register-myself: the office answered a key and it could not be written to ${chosen.keyFile}: ` +
        `${err instanceof Error ? err.message : String(err)}. It is not printed, so it is lost; ask for a new key with --new-key.\n`,
    )
    process.exit(1)
  }
}

// THE ONE-TIME SECRET OF A FIRST ASK, a new-key ask's or a waiting registration's, goes to its own file
// and out of everything printed.
let secretSaid = null
if (typeof said.askSecret === 'string' && said.askSecret !== '') {
  const secret = said.askSecret
  delete said.askSecret
  try {
    // THE NOTES FOLDER MAY NOT BE MADE YET: it is made here, as it is made when a key arrives.
    mkdirSync(dirname(chosen.secretFile), { recursive: true, mode: 0o700 })
    writeFileSync(chosen.secretFile, `${secret}\n`, { mode: 0o600, flag: 'wx' })
    secretSaid = `the one-time secret of this ask is written to ${chosen.secretFile} (readable only by you); run this again after the grant`
  } catch (err) {
    process.stderr.write(
      `register-myself: the office answered this ask's one-time secret and it could not be written to ${chosen.secretFile}: ` +
        `${err instanceof Error ? err.message : String(err)}. It is not printed, so this ask cannot be collected.\n`,
    )
    process.exit(1)
  }
}
// AND ONCE THE KEY IS WRITTEN, THE SECRET THAT COLLECTED IT IS SPENT: this tool removes its own file.
if (key !== null && chosen.secret !== null && existsSync(chosen.secretFile)) unlinkSync(chosen.secretFile)

// THE SESSION HOOK'S NOTE, POINTED AT THE RECORD THIS REGISTRATION GAVE THE CONVERSATION, once this ask holds the
// agent's first key and --provider-session names the conversation (problem Tv32CoCfV-cP; the header says why). A
// new-key ask registers nothing, so it points nothing. The key is already in its file, so nothing this step meets
// fails the registration.
const sessionNote =
  key !== null && !chosen.newKey && chosen.providerSession !== null
    ? await pointTheSessionNote(chosen.providerSession, {
        key,
        workspace: typeof headers['x-mole-office-workspace'] === 'string' ? headers['x-mole-office-workspace'] : workspace,
        agentRecord: typeof said.record === 'string' ? said.record : null,
      })
    : null

if (chosen.json) {
  process.stdout.write(
    `${key === null && secretSaid === null ? text : JSON.stringify({ ...said, ...(key === null ? {} : { keyWrittenTo: chosen.keyFile }), ...(secretSaid === null ? {} : { askSecretWrittenTo: chosen.secretFile }), ...(sessionNote === null ? {} : { sessionNote }) })}\n`,
  )
} else {
  console.log(`register-myself: ${res.status} ${res.statusText}`)
  // A REFUSAL SAYS WHY IN `error`, and carries no `says`: without this line a refused registration printed its status
  // and nothing about the reason.
  if (typeof said.error === 'string' && said.error !== '') console.log(`  ${said.error}`)
  console.log(`  agent: ${said.agent?.handle ?? body.handle}`)
  if (typeof said.session === 'string') console.log(`  session: ${said.session}`)
  if (said.request !== undefined) console.log(`  the ask: ${said.request}`)
  console.log('  headers for every later request:')
  for (const [name, value] of Object.entries(headers)) console.log(`    ${name}: ${value}`)
  if (keySaid !== null) console.log(`  ${keySaid}`)
  if (secretSaid !== null) console.log(`  ${secretSaid}`)
  // WHAT WAS RECORDED ABOUT THE FOLDER THIS AGENT'S SESSIONS START IN, printed only when the server
  // said something about one. The words are the server's own: this tool keeps no copy of them.
  if (said.startFolderSays !== undefined && said.startFolderSays !== null) console.log(`  ${said.startFolderSays}`)
  if (said.says !== undefined) console.log(`  ${said.says}`)
  if (said.keySays !== undefined && said.keySays !== null) console.log(`  ${said.keySays}`)
  for (const line of sessionNote?.says ?? []) console.log(`  ${line}`)
}
if (res.status >= 400) process.exit(1)
