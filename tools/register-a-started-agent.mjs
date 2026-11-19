#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REGISTER THE AGENT YOU HAVE JUST STARTED. One command, one request, before it does anything.
 *
 * Criterion P1 of design/permissions/ACCEPTANCE.md, on the owner's rule of 6 September 2026:
 * Whoever starts an agent manages it and answers for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A COMMAND AND NOT A PARAGRAPH IN A DOCUMENT
 * ---------------------------------------------------------------------------------------
 *
 * Builders are started today with one tool call from a session that is about to do something else.
 * Measured on 6 September 2026: 199 agent names had written into this installation and not one of
 * them was in a registry, between them 10,076 writes. A registration that costs four requests and a
 * shape read off `GET /api/kinds` is a registration that gets skipped, and that is what happened.
 * This is one line.
 *
 * ---------------------------------------------------------------------------------------
 * WHO THE STARTER IS, AND WHY YOU CANNOT SAY
 * ---------------------------------------------------------------------------------------
 *
 * The starter is whoever runs this command, read from the actor headers. There is no flag for it. A
 * caller that could name somebody else as the starter would be naming somebody who has not agreed to
 * answer for the agent, and answering for it is the whole of what a starter is. So send your own
 * handle as `--as`, or set MOLE_OFFICE_AGENT in this checkout's `.env`.
 *
 * IT SAYS WHICH CASTING THE TOOLS TAKE FOR THE ROLE (选角表), under two
 * decisions. This tool takes no model and starts no program, so it records no
 * model and no effort. After the registration it asks GET /api/casting/for/<the card it was registered
 * with>?project=<workspace>, which answers the one casting of the role marked "The tools take this one" (the project's
 * own if the project has castings of the role, else the every-project one), and prints one line: that casting's id, its
 * program, model and effort, and the decision behind the model; or that the table marks no casting, or that the marked
 * casting names no model. That is what the starter gives the program and names to tools/register-a-run.mjs, which reads
 * the same casting when no --model is given.
 *
 * IT PRINTS WHAT THE SERVER SAID. There is no local copy of the roles, no retry under another name,
 * and no fallback that files the record a different way. A refusal is printed and the exit code is
 * non-zero.
 *
 * IT NEVER PRINTS THE STARTED AGENT'S KEY (problem PImMRnU2Ph1B). When the starter is an agent, everything
 * this tool prints is kept in that agent's log and conversation, which any process of the same user can
 * read. So the key goes only to the file named by `--key-file`, a new file of mode 0600, and the plain
 * lines and `--json` carry that file's path instead. `--key-file` is required and is checked before the
 * request: the office answers a key once, and a key answered with nowhere to put it would be lost.
 * tools/register-myself.mjs writes its own key the same way.
 *
 * Usage:
 *   node tools/register-a-started-agent.mjs --handle <handle> --name "<name>" --role <role>
 *       --key-file <path>
 *       [--area <path>]... [--runtime <runtime>] [--notes <dir>] [--language <en|zh>] [--as <your handle>]
 *       [--session <your session record id>] [--workspace <id>] [--api <url>] [--json]
 */
import { existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { settings, settingValue } from '../src/config/settings.mjs'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'
import { aSecretFromTheEnvironment, THE_AGENT_KEY } from '../for-agents/agent-key.mjs'
// THE HEADER A KEY TRAVELS ON. Declared once, beside the key it carries; a copy here could spell a
// header the server never reads and nothing would fail until a registration arrived unproved.
import { KEY_HEADER } from '../src/config/key-header.mjs'

/**
 * HOW LONG THIS WAITS BEFORE GIVING UP ON MOLE OFFICE. Criterion: a setting, not a second constant
 * here — chapter 9's one-configuration-source rule means this file may not invent its own number,
 * only read the one src/config/settings.mjs declares.
 *
 * IT WAS A FIXED 10 SECONDS. Supervisor SA filed the problem: an agent could not register at
 * exactly the moment the office was busy — several clusters running, several agents starting —
 * which is when registration matters most, because that is when the office is busiest. 60 seconds
 * is the new default; MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS in .env overrides it.
 */
// A timeout that could not be read stops this tool by the setting's name, before it waits at all.
const TIMEOUT_SECONDS = (() => {
  try { return Number(settingValue('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS')) } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)} Nothing was registered.\n`)
    process.exit(2)
  }
})()

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/register-a-started-agent.mjs --handle <handle> --name "<name>" --role <role> --key-file <path> \\',
      '    [--area <path>]... [--runtime <runtime>] [--notes <dir>] [--language <en|zh>] [--as <your handle>] \\',
      '    [--session <id>] [--workspace <id>] [--api <url>] [--json]',
      '',
      '  --handle     the short address the started agent writes under. Required.',
      '  --name       what a reader sees. Required, and it is a name rather than a description.',
      '  --key-file   the file the started agent\'s key is written to: a new file, readable only by you',
      '               (0600), in a folder that exists. The key is never printed. Required.',
      '               For example: --key-file "$TMPDIR/<handle>.key"',
      '  --role       which role card it holds. Leaving it out registers a WORKER: the row holds no',
      '               card, and every refusal reads such a row as the worker card. A word no card',
      '               holds is refused with the list. The agent asks you for a higher rung later.',
      '  --area       a folder or file this agent is there to change. Repeat it for each one.',
      '               Repository-relative: a path inside the repository, written from its root —',
      '               "src/web", not "/srv/project/src/web". Anything outside is refused.',
      '  --runtime    which runtime serves it. Left out means nobody said.',
      '  --notes      the absolute path of the folder this agent keeps its own notes in.',
      '  --language   the language the agent reads, en or zh. Its card\'s handbook is sent in it.',
      '               Left out, the handbook is sent in every language it is written in.',
      '  --as         your own handle, which is who the registration records as the starter.',
      '               Default: MOLE_OFFICE_AGENT in this checkout. There is no way to name anybody else.',
      '  --session    the record id of the run doing the registering, so the started agent knows',
      '               which run started it. Default: MOLE_OFFICE_SESSION.',
      '  --workspace  which project the agent record goes in. Default: the one this checkout is set to.',
      '  --api        which server to ask. Default: the one this checkout is set to.',
      '  --chapter    a chapter of the office regulations this agent must read, as a number or a name,',
      '               with a reading level after a colon where it is not digest. Repeat it for each.',
      '               Naming none is not an exemption: the role card names what it must read anyway,',
      '               and the reply says so.',
      '  --json       print the reply as it arrived, with the key and the office\'s sentence about',
      '               showing it (keySays) taken out, and the key file\'s path put in whatToGiveIt.keyFile.',
      '',
      'THE STARTER\'S OWN KEY, and the new agent\'s key. If you are yourself an agent holding a key, it',
      'is read from the file MOLE_AGENT_KEY_FILE names, or from MOLE_AGENT_KEY, and sent on this request;',
      'with none the request is an unproved claim the one-version window still covers. The reply answers',
      'the STARTED agent its own key exactly once. This tool writes it to the --key-file and never prints',
      'it. Give that agent the file\'s full path as MOLE_AGENT_KEY_FILE; it reads the key from the file',
      'into a request header. Never give it the key itself: not in its environment, not in .env, not on',
      'the command line.',
      '',
      `Waits ${String(TIMEOUT_SECONDS)} seconds for Mole Office to answer before giving up (the busier the`,
      'machine, the longer registration can take). Set MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS in .env to',
      'change it; unset means 60.',
      '',
      'AND WHAT NEXT: this registers the agent but files no run. A run whose record does not say which',
      'agent it serves, where it works and what it was cut from cannot be checked when it says it is',
      'finished — the office answers "No check was asked for". File the run so the check can be asked:',
      '    node tools/register-a-run.mjs --handle <this handle> --worktree <absolute directory>',
      '        --cut-from <branch> --runtime <runtime> [--model <provider/model>]',
      '        --as <your handle> --session <your session record id> --workspace <project>',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function readArguments(argv) {
  const chosen = {
    handle: null,
    name: null,
    role: null,
    area: [],
    chapter: [],
    runtime: null,
    notes: null,
    language: null,
    as: null,
    session: null,
    workspace: null,
    api: null,
    json: false,
    keyFile: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--json') chosen.json = true
    else if (word === '--help' || word === '-h') usage('')
    else if (word === '--handle') chosen.handle = argv[(i += 1)]
    else if (word === '--name') chosen.name = argv[(i += 1)]
    else if (word === '--role') chosen.role = argv[(i += 1)]
    else if (word === '--area') chosen.area.push(argv[(i += 1)])
    else if (word === '--chapter') chosen.chapter.push(argv[(i += 1)])
    else if (word === '--runtime') chosen.runtime = argv[(i += 1)]
    else if (word === '--notes') chosen.notes = argv[(i += 1)]
    else if (word === '--language') chosen.language = argv[(i += 1)]
    else if (word === '--as') chosen.as = argv[(i += 1)]
    else if (word === '--session') chosen.session = argv[(i += 1)]
    else if (word === '--workspace') chosen.workspace = argv[(i += 1)]
    else if (word === '--api') chosen.api = argv[(i += 1)]
    else if (word === '--key-file') chosen.keyFile = argv[(i += 1)]
    else usage(`I do not know the option ${word}.`)
  }
  return chosen
}

const chosen = readArguments(process.argv.slice(2))
if (chosen.handle === null || chosen.handle === undefined) usage('Say which handle the started agent writes under, with --handle.')
if (chosen.name === null || chosen.name === undefined) usage('Say what a reader should call it, with --name.')
// WHERE THE KEY GOES, CHECKED BEFORE THE REQUEST. The office answers a new agent's key once; a key answered
// with nowhere to put it would be lost, and a file overwritten could hold another agent's key.
if (chosen.keyFile === null || chosen.keyFile === undefined || chosen.keyFile === '') {
  usage('Say which new file the started agent\'s key is written to, with --key-file, for example --key-file "$TMPDIR/<handle>.key". The key is never printed. Nothing was registered.')
}
chosen.keyFile = resolve(chosen.keyFile)
if (existsSync(chosen.keyFile)) {
  usage(`${chosen.keyFile} already exists. The key is written only to a new file, so name another with --key-file. Nothing was registered.`)
}
if (!existsSync(dirname(chosen.keyFile)) || !statSync(dirname(chosen.keyFile)).isDirectory()) {
  usage(`The folder ${dirname(chosen.keyFile)} does not exist, so the key could not be written there. Nothing was registered.`)
}
// A FOLDER THAT EXISTS BUT CANNOT BE WRITTEN TO loses the key just as surely, so the key file itself is made once
// here, empty, and removed again. Keeping it until the reply would leave an empty key file behind every refusal,
// timeout or kill, and the next try would then be refused as "already exists". The write after the reply uses
// 'wx' again, so a file that appears in between is still refused, never overwritten.
try {
  writeFileSync(chosen.keyFile, '', { mode: 0o600, flag: 'wx' })
  unlinkSync(chosen.keyFile)
} catch (err) {
  usage(
    `The key file ${chosen.keyFile} could not be made (${err instanceof Error ? err.message : String(err)}), so the key ` +
      'could not be written there. Name a file in a folder you can write to. Nothing was registered.',
  )
}
// NO --role IS NOT A MISSING ARGUMENT. Criterion P65: an agent defaults to
// worker. The field is left out of the body, the row is written with no card, and the reply says what
// such a row reads as — so nothing here holds a second opinion about what the default is.

const config = settings()
// THE OFFICE THIS COMMAND MEANS, through the one reader, which asks whether this copy may take the environment's
// address (problem JQ3yaANBi1JC); --api always wins.
const api = whereIsTheApiForACommand(chosen.api)
const workspace = chosen.workspace ?? config.workspace
const as = chosen.as ?? process.env['MOLE_OFFICE_AGENT'] ?? null
const session = chosen.session ?? process.env['MOLE_OFFICE_SESSION'] ?? null
/**
 * THE STARTER'S OWN KEY, WHEN THE STARTER HAS ONE. Criterion P83, point 5.
 *
 * IT IS READ BY for-agents/agent-key.mjs, FROM THE FILE MOLE_AGENT_KEY_FILE NAMES OR FROM MOLE_AGENT_KEY, AND NEVER
 * FROM A FLAG. A key typed on a command line appears in the shell's history and in the process list
 * for anybody on this machine to read. MOLE_AGENT_KEY_FILE is the name this tool tells a starter to
 * give the agent it just registered, so a session that is itself an agent carries its own key the
 * same way and this tool sends it. A file that cannot be used, or a key in both variables, stops
 * the tool before the request, and nothing is registered.
 *
 * A STARTER WITH NO KEY STILL WORKS. The one-version window still covers a claim from this machine,
 * so a person or an older session with no key registers the agent and the reply says what to give
 * it; the tool simply sends no key header, which is the same request it made before this piece.
 */
let starterKey = null
try {
  starterKey = aSecretFromTheEnvironment(THE_AGENT_KEY, process.env, 'Nothing was registered.')
} catch (why) {
  process.stderr.write(`${why instanceof Error ? why.message : String(why)}\n`)
  process.exit(2)
}

if (as === null || as === '') {
  process.stderr.write(
    [
      'NOTHING SAYS WHICH AGENT IS DOING THE STARTING, so nothing was registered.',
      '',
      'The starter is whoever runs this command, and it is read from the actor id rather than from a flag,',
      'because a caller that could name somebody else would be naming somebody who has not agreed to answer',
      'for the agent. Answering for it is the whole of what a starter is.',
      '',
      'Either pass --as <your handle>, or write the line once in this checkout\'s .env:',
      '    MOLE_OFFICE_AGENT=<your handle>',
      '',
      'GET /api/participants lists every agent that is registered. Nothing was written.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

const body = {
  handle: chosen.handle,
  name: chosen.name,
  ...(chosen.role === null || chosen.role === undefined ? {} : { role: chosen.role }),
}
if (chosen.runtime !== null && chosen.runtime !== undefined) body.runtime = chosen.runtime
if (chosen.notes !== null && chosen.notes !== undefined) body.notes = chosen.notes
if (chosen.language !== null && chosen.language !== undefined) body.language = chosen.language
if (chosen.area.length > 0) body.workArea = chosen.area
if (chosen.chapter.length > 0) body.chapters = chosen.chapter

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': as,
  'x-mole-office-purpose': 'normal',
}
if (session !== null && session !== '') headers['x-mole-office-session'] = session
// THE STARTER'S OWN KEY, where the starter has one. This is what makes the registration a proof
// rather than a claim; with none, the request is what it always was and the window covers it.
if (starterKey !== null && starterKey !== '') headers[KEY_HEADER] = starterKey

let reply
try {
  reply = await fetch(`${api}/api/agents/started`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
  })
} catch (why) {
  // SAY WHAT IT WAS WAITING FOR, rather than only that it gave up. A plain network refusal (nothing
  // listening at that address) fails at once and did not wait out the clock; only a real timeout
  // did, and only that case should claim to have waited.
  const timedOut = why instanceof Error && why.name === 'TimeoutError'
  process.stderr.write(
    (timedOut
      ? `Waited ${String(TIMEOUT_SECONDS)} seconds for Mole Office at ${api} to answer, and it did not.`
      : `Mole Office at ${api} did not answer.`) +
      ` Nothing was registered: ${String(why)}\n` +
      `Set MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS in .env to wait longer than the default of 60 seconds.\n`,
  )
  process.exit(1)
}

const said = await reply.text()
/** The reply read as JSON, or null when it is not JSON. */
function readTheReply(text) {
  try {
    const read = JSON.parse(text)
    return read !== null && typeof read === 'object' ? read : null
  } catch {
    return null
  }
}
let answer = readTheReply(said)
// THE KEY GOES TO THE FILE AND OUT OF EVERYTHING PRINTED, on every path below, a refusal's included. It is
// taken out of the reply before a line is written. A reply that is not JSON is never printed, because
// nothing here can tell whether it holds a key.
const key = typeof answer?.whatToGiveIt?.key === 'string' && answer.whatToGiveIt.key !== '' ? answer.whatToGiveIt.key : null
if (answer?.whatToGiveIt !== undefined && answer.whatToGiveIt !== null) delete answer.whatToGiveIt.key
if (!reply.ok) {
  process.stderr.write(
    `Mole Office refused the registration (${String(reply.status)}), so nothing was written:\n` +
      (answer === null ? 'Its answer was not JSON, so it is not printed.' : JSON.stringify(answer)) +
      '\n',
  )
  process.exit(1)
}
if (answer === null) {
  process.stderr.write(
    `Mole Office answered ${String(reply.status)}, and its answer was not JSON, so it is not printed: it may hold the ` +
      `started agent's key. The registration may have been written. GET /api/participants/agent/${chosen.handle} says ` +
      'whether it was; if it was, the agent asks for its own key with node tools/register-myself.mjs --new-key.\n',
  )
  process.exit(1)
}
if (key !== null) {
  try {
    writeFileSync(chosen.keyFile, `${key}\n`, { mode: 0o600, flag: 'wx' })
  } catch (err) {
    process.stderr.write(
      `The agent ${chosen.handle} is registered, and the office answered its key, but the key could not be written to ` +
        `${chosen.keyFile}: ${err instanceof Error ? err.message : String(err)}. It is not printed, so it is lost; the ` +
        'agent asks for a new one with node tools/register-myself.mjs --new-key.\n',
    )
    process.exit(1)
  }
  answer.whatToGiveIt.keyFile = chosen.keyFile
  // NOT THE OFFICE'S keySays EITHER: it says the key is shown here, and this tool never shows it. The plain lines
  // below leave it out for the same reason. Where no key was answered, keySays says why, and it stays.
  delete answer.whatToGiveIt.keySays
}

if (chosen.json) {
  process.stdout.write(`${JSON.stringify(answer)}\n`)
  process.exit(0)
}

const area = answer.agent?.workArea ?? null

// WHAT THE CASTING TABLE CASTS THIS ROLE WITH, for the starter to use (see the header). The registration is already
// written, so a table that cannot be read is said in one line and changes nothing about it.
const castRole = answer.card?.readAs ?? chosen.role ?? null
let castLine
if (castRole === null) {
  castLine = 'The reply names no role card, so the Casting table was not asked which model to start it with.'
} else {
  try {
    const asked = await fetch(`${api}/api/casting/for/${encodeURIComponent(castRole)}?project=${encodeURIComponent(workspace)}`, {
      headers: { 'x-mole-office-workspace': workspace },
      signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
    })
    const cast = asked.ok ? await asked.json() : null
    if (cast === null) {
      castLine = `The Casting table could not be read (GET /api/casting/for/${castRole} answered ${String(asked.status)}), so it says nothing here about which model to start it with.`
    } else if (typeof cast.casting?.id !== 'number') {
      castLine = `The Casting table marks no casting for ${castRole} in ${workspace}. Name the model yourself when you start it and when you file its run.`
    } else if (typeof cast.model !== 'string' || cast.model === '') {
      castLine = `Casting ${String(cast.casting.id)}, the one the tools take for ${castRole} in ${workspace}, names no model. Name the model yourself when you start it and when you file its run.`
    } else {
      const decision = cast.cells?.model?.from?.decision?.id ?? null
      castLine =
        `The tools take casting ${String(cast.casting.id)} for ${castRole} in ${workspace}: the model ${cast.model}` +
        (cast.program === null ? ' and names no program' : ` on ${cast.program}`) +
        (cast.effort === null ? ' and names no effort' : `, effort ${cast.effort}`) +
        (decision === null ? '. It names no decision for the model.' : `, from decision ${decision}.`) +
        ' This tool records neither the model nor the effort; start the program with them and file its run.'
    }
  } catch (why) {
    castLine = `The Casting table could not be read (${String(why)}), so it says nothing here about which model to start it with.`
  }
}
process.stdout.write(
  [
    `Registered "${answer.agent?.name ?? chosen.name}" as ${chosen.handle}, a ${answer.card?.readAs ?? chosen.role}.`,
    `Started by ${answer.startedBy?.kind ?? '?'} ${answer.startedBy?.id ?? '?'}, which is who answers for it.`,
    area === null
      ? 'No work area was recorded. Whoever checks this agent will have to find its changes another way.'
      : area.length === 0
        ? 'Its work area is empty, which says there is none rather than that nobody recorded one.'
        : `Its work area is ${area.join(', ')}.`,
    '',
    answer.chapters?.says ?? `The chapters it must read: ${(answer.chapters?.mustRead ?? []).map((one) => `${one.chapter} at ${one.level}`).join(', ')}.`,
    '',
    castLine,
    '',
    'Give the started agent these things, and it can report:',
    `  its handle          ${answer.whatToGiveIt?.handle ?? chosen.handle}`,
    `  the run that started it  ${answer.whatToGiveIt?.startedByRun ?? '(nothing — ' + String(answer.whatToGiveIt?.startedByRunSays ?? '') + ')'}`,
    `  this API            ${answer.whatToGiveIt?.api ?? api}`,
    ...(key !== null
      ? [
          '',
          `AND ITS OWN KEY, which is written to ${chosen.keyFile} (readable only by you) and is not printed.`,
          "Give the started agent this file's full path as MOLE_AGENT_KEY_FILE. It reads the key from the file into a",
          'request header. Never give it the key itself: not in its environment, not in .env, not on its command line.',
          // NOT THE OFFICE'S keySays HERE: it begins "This is the only time this key is shown", and this tool never shows it.
        ]
      : [
          '',
          'NO KEY WAS ANSWERED for this agent. ' +
            String(answer.whatToGiveIt?.keySays ?? 'It already held one, so no second key was made.'),
        ]),
  ].join('\n') + '\n',
)
