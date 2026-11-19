#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MUCH AN AGENT HAS TO READ BEFORE IT CAN WRITE ANYTHING USEFUL.
 *
 * This measures one number, twice: how many requests a fresh agent makes, and how many characters
 * it has to read, between arriving at a project it knows nothing about and making its first useful
 * write. Its first useful write is filing its own session record, because that is the first write
 * the skill asks every run to make and the first one another agent can read.
 *
 * ---------------------------------------------------------------------------------------
 * THREE ROUTES THROUGH THE SAME KIND OF ERRAND
 * ---------------------------------------------------------------------------------------
 *
 *   --route long    the cold start `.claude/skills/mole-office/SKILL.md` tells an agent to make today.
 *   --route brief   the same errand with `GET /api/brief` in place of the first four reads.
 *   --route entry   what a new agent reads NOW THAT F15's entry exists: the SessionStart hook's own
 *                   printed line, GET /api/onboarding, the self-registration door, and GET /api/restore.
 *                   Unlike the other two, it does not end with a session-record POST — the
 *                   registration door already files one — and it reports against their ceiling, from
 *                   src/shared/start-cost.ts and a decision.
 *                   The ceiling counts tokens, minutes, and requests as the stand-in for tool rounds,
 *                   one request being the least a model could spend on each thing it reads.
 *
 * `long` and `brief` both end with the same POST and both are run against the same server, so the
 * difference between those two numbers is the brief and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS A SCRIPT, NOT A MODEL. IT IS SAID IN THE OUTPUT AS WELL AS HERE.
 * ---------------------------------------------------------------------------------------
 *
 * No model call is made. The script walks the same requests a model would be told to walk, so it
 * measures the READING an agent is put to and never the thinking. A real Claude Code run reading
 * the same replies would read the same characters; it would also read its own rules file and its
 * own prompt, which this does not count and which are the same on every route. THE REAL NUMBER FOR
 * A REAL RUN IS THE RECEIPT ON THAT SESSION'S OWN RECORD (src/server/lib/start-cost.ts): this script
 * is the gate that catches a regression in what an agent is TOLD to read; the receipt is the truth
 * about what one particular start actually cost, model thinking included.
 *
 * TOKENS ARE ESTIMATED AND THE OUTPUT SAYS SO. No tokenizer is installed on this machine, so the
 * token figure here is characters divided by CHARS_PER_TOKEN and is labelled `estimated` wherever
 * it appears. Characters and bytes are counted exactly.
 *
 * ---------------------------------------------------------------------------------------
 * NEVER POINT IT AT THE OWNER'S SERVER, AND NEVER AT THEIR HOME
 * ---------------------------------------------------------------------------------------
 *
 * Every route writes something — `long` and `brief` a session record, `entry` a whole self-
 * registration. Run against an isolated stack — `node tools/isolated-mole-office.mjs start <name>`
 * prints the address — and pass that address with `--api`. It refuses the port the live API is
 * configured on unless `--i-know-this-is-the-live-server` is given, because a measurement that files
 * rows into the owner's corpus is not a measurement anybody wants twice. `--route entry` ALSO spawns
 * the real SessionStart hook, in a scratch directory with a scratch `HOME` this script creates and
 * deletes itself — never the operator's own home — so a hook that reads or writes under `~/.claude`
 * cannot touch anything of theirs.
 *
 * Usage:
 *   node tools/how-long-to-the-first-write.mjs --api http://127.0.0.1:PORT --route long
 *   node tools/how-long-to-the-first-write.mjs --api http://127.0.0.1:PORT --route brief --json
 *   node tools/how-long-to-the-first-write.mjs --api http://127.0.0.1:PORT --route entry
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { settings } from '../src/config/settings.mjs'
import { theHookWroteNothing } from '../src/config/the-hook-run-by-hand.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import {
  CHARS_PER_TOKEN,
  theTokenEstimateSentence,
  tokensEstimatedFor,
} from '../src/config/token-estimate.mjs'
import { START_COST_CEILING, startCostOverage } from '../src/shared/start-cost.ts'

/** The workspace the measurement runs in, unless `--workspace` says otherwise. */
const DEFAULT_WORKSPACE = 'panelx'

/**
 * THE COLD START AS THE SKILL DESCRIBES IT TODAY, in the skill's own order.
 *
 * `GET /api/project/bootstrap` first, then the endpoint list, then the kinds, then the projects —
 * those four are steps 1 to 4 of *How to start*. `GET /api/open-loops` is the fifth because an
 * agent that has read all four still cannot say what work its run belongs to, and step 6 of the
 * same section requires it to. `GET /api/kinds/session` is the sixth because the skill says to
 * read the one kind you are about to write.
 */
const LONG_ROUTE = [
  '/api/project/bootstrap',
  '/api',
  '/api/kinds',
  '/api/workspaces',
  '/api/open-loops',
  '/api/kinds/session',
]

/**
 * THE SAME ERRAND WITH THE BRIEF.
 *
 * `GET /api/kinds/session` stays. The brief carries the rules for writing, not the field list of
 * every kind, and an agent that guessed a field list out of prose would be inventing one. Leaving
 * it in is what makes the comparison fair.
 */
const BRIEF_ROUTE = ['/api/brief', '/api/kinds/session']

function usage(problem) {
  const lines = [
    problem,
    '',
    'node tools/how-long-to-the-first-write.mjs --api <url> --route long|brief|entry [--workspace <id>] [--json]',
    '',
    '  --api        the address of an ISOLATED stack. Start one with:',
    '                 node tools/isolated-mole-office.mjs start <name>',
    '  --route      long  = the cold start the skill describes today',
    '               brief = the same errand through GET /api/brief',
    '               entry = the hook line, GET /api/onboarding, self-registration and GET /api/restore,',
    '                       reported against the person\'s ceiling. Runs in a scratch directory and HOME this',
    '                       script makes and deletes itself.',
    '  --workspace  which project to arrive at. Default: ' + DEFAULT_WORKSPACE,
    '  --json       print the reading as JSON instead of sentences',
  ]
  process.stderr.write(lines.join('\n') + '\n')
  process.exit(2)
}

function readArguments(argv) {
  const args = { api: null, route: null, workspace: DEFAULT_WORKSPACE, json: false, allowLive: false }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--api') args.api = argv[(i += 1)]
    else if (word === '--route') args.route = argv[(i += 1)]
    else if (word === '--workspace') args.workspace = argv[(i += 1)]
    else if (word === '--json') args.json = true
    else if (word === '--i-know-this-is-the-live-server') args.allowLive = true
    else usage(`I do not know the option ${word}.`)
  }
  if (!args.api) usage('Say which server to measure, with --api.')
  if (args.route !== 'long' && args.route !== 'brief' && args.route !== 'entry') {
    usage('Say which route to walk, with --route long, --route brief or --route entry.')
  }
  return args
}

/** Refuse the address the live API is configured on, unless told in so many words. */
function refuseTheLiveServer(api, allowLive) {
  if (allowLive) return
  const live = settings().apiAddress
  if (api.replace(/\/$/, '') !== live.replace(/\/$/, '')) return
  process.stderr.write(
    [
      `${api} is the address this checkout is configured to serve the live Mole Office on.`,
      'This script files a session record, so pointing it there puts a measurement row in the',
      "owner's corpus. Start an isolated stack instead:",
      '',
      '    node tools/isolated-mole-office.mjs start a-measurement',
      '',
      'and pass the address it prints. Nothing was measured and nothing was written.',
    ].join('\n') + '\n',
  )
  process.exit(3)
}

const NOW = () => Number(process.hrtime.bigint() / 1000000n)

/**
 * Walk one route and stop at the first useful write.
 *
 * Every reply is counted whole, including the ones the agent would skim, because an agent cannot
 * skim what has already been put in its context.
 */
async function walk(args) {
  const headers = {
    'x-mole-office-workspace': args.workspace,
    // The caller's own key and name when it holds a key; this tool's name when it holds none.
    ...anAgentsToolHeaders({ withoutAKey: 'mole-office/how-long-to-the-first-write' }),
    'x-mole-office-session': `how-long-${String(Date.now())}`,
    'x-mole-office-purpose': 'cold-recovery',
  }
  const reads = []
  const startedAt = NOW()
  for (const path of args.route === 'long' ? LONG_ROUTE : BRIEF_ROUTE) {
    const before = NOW()
    const reply = await fetch(`${args.api}${path}`, { headers })
    const text = await reply.text()
    reads.push({
      request: `GET ${path}`,
      status: reply.status,
      characters: text.length,
      bytes: Buffer.byteLength(text, 'utf8'),
      ms: NOW() - before,
    })
    if (!reply.ok) {
      return { failedAt: path, status: reply.status, said: text.slice(0, 400), reads }
    }
  }
  const body = JSON.stringify({
    kind: 'session',
    title: 'A measurement of how long a fresh agent takes to its first useful write',
    data: {
      state: 'running',
      runtime: 'claude-code',
      doing:
        'Written by tools/how-long-to-the-first-write.mjs. This record is the write being measured, ' +
        'not a record of any work. Route walked: ' +
        args.route,
    },
  })
  const before = NOW()
  const wrote = await fetch(`${args.api}/api/records`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body,
  })
  const said = await wrote.text()
  const write = {
    request: 'POST /api/records',
    status: wrote.status,
    charactersSent: body.length,
    characters: said.length,
    bytes: Buffer.byteLength(said, 'utf8'),
    ms: NOW() - before,
  }
  if (!wrote.ok) return { failedAt: 'POST /api/records', status: wrote.status, said: said.slice(0, 400), reads, write }
  const charactersRead = reads.reduce((n, r) => n + r.characters, 0)
  return {
    route: args.route,
    workspace: args.workspace,
    api: args.api,
    requestsBeforeTheWrite: reads.length,
    requestsAltogether: reads.length + 1,
    charactersRead,
    bytesRead: reads.reduce((n, r) => n + r.bytes, 0),
    tokensEstimated: tokensEstimatedFor(charactersRead),
    charsPerTokenAssumed: CHARS_PER_TOKEN,
    tokensAreAnEstimate: theTokenEstimateSentence(),
    msToTheFirstWrite: NOW() - startedAt,
    reads,
    write,
  }
}

/**
 * `--route entry`: WHAT A NEW AGENT REALLY READS NOW THAT THE ENTRY EXISTS.
 *
 * Four steps, in the order a new agent meets them: the SessionStart hook fires on its own and
 * prints one line (`tools/session-hook.mjs start`, run for real, in a scratch HOME so nothing it
 * reads or writes touches the operator's own `~/.claude`); `GET /api/onboarding`, which the hook's
 * own line tells the agent to read next; `POST /api/agents/register-myself`, the self-registration
 * door; and `GET /api/restore`, as the agent this run just registered.
 *
 * WHY THE HOOK IS RUN FOR REAL, RATHER THAN GUESSED AT. The hook makes several requests of its own
 * to build the one line it prints, and none of those are what an agent reads — an agent's context
 * only ever holds the printed line. Reimplementing "what the hook fetches" here would be a second,
 * driftable copy of a file this repository already has; running it and counting what it printed is
 * the one true answer and costs nothing extra to get right.
 *
 * WHY THIS DOES NOT END WITH ITS OWN POST /api/records, unlike `long` and `brief`. The registration
 * door in step 3 already files the session record — "registering ... the session record" is
 * word-for-word in their ceiling — so a fourth write here would be counting that filing twice.
 */
async function walkEntry(args) {
  const headers = (extra) => ({
    'x-mole-office-workspace': args.workspace,
    // The caller's own key and name when it holds a key; this tool's name when it holds none.
    ...anAgentsToolHeaders({ withoutAKey: 'mole-office/how-long-to-the-first-write' }),
    'x-mole-office-session': `how-long-entry-${String(Date.now())}`,
    'x-mole-office-purpose': 'cold-recovery',
    ...extra,
  })

  const scratchHome = mkdtempSync(join(tmpdir(), 'mole-office-entry-home-'))
  const scratchDir = mkdtempSync(join(tmpdir(), 'mole-office-entry-cwd-'))
  try {
    const reads = []
    const startedAt = NOW()

    // STEP 1: the hook's own line, from the hook itself, never reimplemented here. IT IS HANDED A PAYLOAD THAT NAMES A
    // SESSION, as Claude Code hands one (problem VqRbgkaNGw6P). Since the hook writes nothing without one (problem
    // WnVjoGd1bXx8), a run with no payload would measure its one-line "wrote nothing" as the entry's first read, and report
    // a start cost far below the real one with nothing failing. The session is this measurement's own.
    const beforeHook = NOW()
    const hookPath = fileURLToPath(new URL('./session-hook.mjs', import.meta.url))
    const hookSession = `how-long-entry-${String(Date.now())}`
    const hook = spawnSync(process.execPath, [hookPath, 'start'], {
      cwd: scratchDir,
      env: { ...process.env, MOLE_OFFICE_API: args.api, HOME: scratchHome },
      input: JSON.stringify({ session_id: hookSession, hook_event_name: 'SessionStart', cwd: scratchDir }),
      encoding: 'utf8',
      timeout: 15_000,
    })
    // THE NOTE THE HOOK KEEPS BESIDE THE CHECKOUT FOR THAT SESSION is this measurement's own, and goes with it.
    rmSync(fileURLToPath(new URL(`../.logs/session-${hookSession}.json`, import.meta.url)), { force: true })
    const hookLine = hook.stdout ?? ''
    reads.push({
      request: 'the SessionStart hook (tools/session-hook.mjs start)',
      status: hook.status === 0 ? 200 : (hook.status ?? -1),
      characters: hookLine.length,
      bytes: Buffer.byteLength(hookLine, 'utf8'),
      ms: NOW() - beforeHook,
    })
    if (hook.status !== 0) {
      return { failedAt: 'the SessionStart hook', status: hook.status, said: (hook.stderr ?? hook.error?.message ?? '').slice(0, 400), reads }
    }
    // AND A HOOK THAT SAYS IT WROTE NOTHING WAS NOT RUN AS CLAUDE CODE RUNS IT: its line is not what a new agent reads, so
    // nothing is measured rather than a number that is too low (problem VqRbgkaNGw6P). The mark is the hook's own, read from
    // the one declaration both files use (src/config/the-hook-run-by-hand.mjs; problem RwLABKMM2OFw).
    if (theHookWroteNothing(hookLine)) {
      return {
        failedAt: 'the SessionStart hook',
        status: hook.status,
        said: 'The hook said it was handed no payload naming a session and wrote nothing, so its line is not what a new agent reads. Nothing was measured.',
        reads,
      }
    }

    // STEP 2: GET /api/onboarding, which the hook's own line just told this agent to read.
    const beforeOnboarding = NOW()
    const onboardingReply = await fetch(`${args.api}/api/onboarding?directory=${encodeURIComponent(scratchDir)}`, {
      headers: headers(),
    })
    const onboardingText = await onboardingReply.text()
    reads.push({
      request: 'GET /api/onboarding',
      status: onboardingReply.status,
      characters: onboardingText.length,
      bytes: Buffer.byteLength(onboardingText, 'utf8'),
      ms: NOW() - beforeOnboarding,
    })
    if (!onboardingReply.ok) {
      return { failedAt: 'GET /api/onboarding', status: onboardingReply.status, said: onboardingText.slice(0, 400), reads }
    }

    // STEP 3: the registration door. "Registering" in their ceiling is this one request.
    const handle = `entry-measurement-${String(Date.now())}`
    const registerBody = JSON.stringify({
      handle,
      name: 'An entry-route measurement, not a real agent',
      workingDirectory: scratchDir,
      runtime: 'claude-code',
      doing: 'Measuring tools/how-long-to-the-first-write.mjs --route entry. This is not real work.',
    })
    const beforeRegister = NOW()
    const registerReply = await fetch(`${args.api}/api/agents/register-myself`, {
      method: 'POST',
      headers: { ...headers(), 'content-type': 'application/json' },
      body: registerBody,
    })
    const registerText = await registerReply.text()
    reads.push({
      request: 'POST /api/agents/register-myself',
      status: registerReply.status,
      charactersSent: registerBody.length,
      characters: registerText.length,
      bytes: Buffer.byteLength(registerText, 'utf8'),
      ms: NOW() - beforeRegister,
    })
    if (!registerReply.ok) {
      return { failedAt: 'POST /api/agents/register-myself', status: registerReply.status, said: registerText.slice(0, 400), reads }
    }
    let registered
    try {
      registered = JSON.parse(registerText)
    } catch {
      return { failedAt: 'POST /api/agents/register-myself', status: registerReply.status, said: 'The reply was not JSON.', reads }
    }
    if (registered.waiting === true || !registered.headers) {
      return {
        failedAt: 'POST /api/agents/register-myself',
        status: registerReply.status,
        said:
          'The registration landed as a waiting row rather than completing at once (the one-version window ' +
          "was closed), so this measurement cannot go on to the restore read. That is a real outcome of the " +
          'door, not a fault of this script — it is reported rather than guessed past.',
        reads,
        incomplete: true,
      }
    }

    // STEP 4: GET /api/restore/<handle>, as the agent this run just registered. "Restoring the
    // project's knowledge" in their ceiling is this one request.
    //
    // BY HANDLE IN THE PATH, NOT BY THE KEY THIS RUN JUST MINTED. `aHeldKeyThisWorldTrusts` in
    // src/server/lib/keys.ts (criterion P84's last clause) trusts only the starter's key and the
    // secretary's key inside a copied test world, on purpose, so a key minted after the copy was
    // taken proves nothing there — exactly as an unknown key does. Sending it would make this
    // script fail on every isolated office for a reason that has nothing to do with F15, so this
    // asks the same read the handle-only door already serves, which needs no key at all.
    const beforeRestore = NOW()
    const restoreReply = await fetch(`${args.api}/api/restore/${encodeURIComponent(handle)}`, {
      headers: headers(),
    })
    const restoreText = await restoreReply.text()
    reads.push({
      request: 'GET /api/restore/:handle',
      status: restoreReply.status,
      characters: restoreText.length,
      bytes: Buffer.byteLength(restoreText, 'utf8'),
      ms: NOW() - beforeRestore,
    })
    if (!restoreReply.ok) {
      return { failedAt: 'GET /api/restore', status: restoreReply.status, said: restoreText.slice(0, 400), reads }
    }

    const charactersRead = reads.reduce((n, r) => n + r.characters, 0)
    const tokensEstimated = tokensEstimatedFor(charactersRead)
    const msTaken = NOW() - startedAt
    const minutesTaken = Math.max(0, Math.ceil(msTaken / 60_000))
    const requestsAltogether = reads.length
    const over = startCostOverage(tokensEstimated, minutesTaken, requestsAltogether, START_COST_CEILING)
    return {
      route: 'entry',
      workspace: args.workspace,
      api: args.api,
      requestsAltogether,
      charactersRead,
      bytesRead: reads.reduce((n, r) => n + r.bytes, 0),
      tokensEstimated,
      charsPerTokenAssumed: CHARS_PER_TOKEN,
      tokensAreAnEstimate: theTokenEstimateSentence(),
      msTaken,
      minutesTaken,
      ceiling: START_COST_CEILING,
      over,
      overCeiling: over.length > 0,
      whatThisCannotProve:
        'This walks the requests a model would be told to make; it does not think, so it measures the ' +
        "reading and never the model's own reasoning tokens. Requests stand in for tool rounds here — one " +
        'request is the least a model could spend reading each thing — which is not the same count as a ' +
        "real transcript would give. The real number for a real run is the receipt on that session's own " +
        'record (src/server/lib/start-cost.ts): this script is the gate that catches a regression, the ' +
        'receipt is the truth about a start.',
      reads,
    }
  } finally {
    rmSync(scratchHome, { recursive: true, force: true })
    rmSync(scratchDir, { recursive: true, force: true })
  }
}

const args = readArguments(process.argv.slice(2))
refuseTheLiveServer(args.api, args.allowLive)
const reading = args.route === 'entry' ? await walkEntry(args) : await walk(args)
if (args.json) {
  process.stdout.write(JSON.stringify(reading, null, 2) + '\n')
} else if (reading.failedAt) {
  const lines = [`The walk did not reach the end. ${reading.failedAt} answered ${String(reading.status)}: ${reading.said}`]
  if (Array.isArray(reading.reads) && reading.reads.length > 0) {
    lines.push('', 'What was read before that:')
    lines.push(...reading.reads.map((r) => `  ${r.request} — ${String(r.status)}, ${String(r.characters)} characters, ${String(r.ms)} ms`))
  }
  process.stdout.write(lines.join('\n') + '\n')
  process.exit(1)
} else if (reading.route === 'entry') {
  const say = (name, value, ceiling) => `  ${name}: ${String(value)}, against ${String(ceiling)}${value > ceiling ? ' — OVER' : ''}`
  const lines = [
    `Route: entry. Server: ${reading.api}. Project: ${reading.workspace}.`,
    `${String(reading.requestsAltogether)} requests altogether.`,
    `${String(reading.charactersRead)} characters read (${String(reading.tokensEstimated)} tokens, estimated at ${String(reading.charsPerTokenAssumed)} characters each).`,
    `${String(reading.msTaken)} ms, ${String(reading.minutesTaken)} whole minutes.`,
    '',
    'Against the person\'s ceiling (decision ' + reading.ceiling.decisionId + '):',
    say('tokens', reading.tokensEstimated, reading.ceiling.tokens),
    say('minutes', reading.minutesTaken, reading.ceiling.minutes),
    say('requests (standing in for tool rounds)', reading.requestsAltogether, reading.ceiling.toolRounds),
    reading.overCeiling ? `OVER THE CEILING on ${reading.over.join(' and ')}.` : 'Under the ceiling on all three.',
    '',
    ...reading.reads.map((r) => `  ${r.request} — ${String(r.status)}, ${String(r.characters)} characters, ${String(r.ms)} ms`),
    '',
    reading.tokensAreAnEstimate,
    '',
    reading.whatThisCannotProve,
  ]
  process.stdout.write(lines.join('\n') + '\n')
} else {
  const lines = [
    `Route: ${reading.route}. Server: ${reading.api}. Project: ${reading.workspace}.`,
    `${String(reading.requestsBeforeTheWrite)} requests before the first useful write, ${String(reading.requestsAltogether)} altogether.`,
    `${String(reading.charactersRead)} characters read (${String(reading.tokensEstimated)} tokens, estimated at ${String(reading.charsPerTokenAssumed)} characters each).`,
    `${String(reading.msToTheFirstWrite)} ms from the first request to the 201.`,
    '',
    ...reading.reads.map((r) => `  ${r.request} — ${String(r.status)}, ${String(r.characters)} characters, ${String(r.ms)} ms`),
    `  ${reading.write.request} — ${String(reading.write.status)}, ${String(reading.write.ms)} ms`,
    '',
    reading.tokensAreAnEstimate,
  ]
  process.stdout.write(lines.join('\n') + '\n')
}
