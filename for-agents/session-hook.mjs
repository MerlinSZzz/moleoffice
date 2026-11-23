// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILE THE SESSION RECORD, AND HAND THE AGENT THE STATE OF THE PROJECT.
 *
 * Run by Claude Code as a hook, not by a person:
 *
 *     node tools/session-hook.mjs start   # SessionStart
 *     node tools/session-hook.mjs stop    # Stop
 *     node tools/session-hook.mjs end     # SessionEnd
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * Mole Office is meant to hold enough state that any agent can pick up unfinished work without being
 * told anything and without reading an old conversation. On 13 August 2026 a fresh agent was given
 * only the API address and asked to try. It reconstructed the project correctly as of the previous
 * night, and then sent itself to the wrong work, because a full day of changes had not been filed.
 *
 * The reason was not a missing feature. Nobody had filed a session record that day. The rule to
 * file one is written in the skill, and the agent that helped write the skill did not follow it
 * through ten commits. That is what a rule depending on memory looks like at hour six.
 *
 * So this does the filing. The agent no longer has to remember, and a session that crashes in its
 * first minute is still on the record.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * **It never blocks a session.** If the server is down, the port has moved, or anything at all
 * throws, it prints one line and exits 0. A tracker that stops you working is worse than no
 * tracker.
 *
 * **It never guesses what the session is for.** The record it files says so: the title is the date
 * and "not yet described", and the brief tells the agent to replace it. An honest stub is what the
 * skill asks for; an invented summary of work that has not happened would be fabricated evidence.
 *
 * **It writes as an agent**, so nothing it does can be mistaken for a person's act. It cannot file
 * a decision or settle anything; the server refuses those to agents and this sends agent headers.
 *
 * ---------------------------------------------------------------------------------------------
 * THE WIRING IS NOT IN THIS REPOSITORY, SO IT IS WRITTEN DOWN HERE
 * ---------------------------------------------------------------------------------------------
 *
 * Claude Code reads project settings from the directory a session is STARTED in, which here was the
 * parent of this checkout. So the two lines that made this file run lived in
 * `../.claude/settings.json`, one directory above the repository, and git cannot carry them. A
 * clone gets the script and none of the wiring, and nothing about that looks wrong — sessions just
 * quietly stop being filed, which is the exact failure this was built to end.
 *
 * SINCE 14 SEPTEMBER 2026 THE WIRING IS INSTALLED FROM INSIDE THE PRODUCT. The person's press on
 * the Settings page, `POST /api/office/install-the-entry`, writes the skill link and the three hook lines
 * at USER level — `~/.claude/skills/mole-office` and `~/.claude/settings.json` — so every directory
 * a session starts in gets them; `tools/install-the-entry.mjs` does the same on a machine with no
 * browser. The block below is kept because it is what the lines look like, and because a manual
 * wiring is still the last resort on a machine where neither the press nor the tool can run.
 *
 * To wire it up by hand, put this in `<the directory you start Claude Code in>/.claude/settings.json`:
 *
 *     {
 *       "hooks": {
 *         "SessionStart": [{ "matcher": "", "hooks": [
 *           { "type": "command", "command": "node <path>/panelx/tools/session-hook.mjs start", "timeout": 10 }
 *         ]}],
 *         "SessionEnd": [{ "matcher": "", "hooks": [
 *           { "type": "command", "command": "node <path>/panelx/tools/session-hook.mjs end", "timeout": 10 }
 *         ]}],
 *         "Stop": [{ "matcher": "", "hooks": [
 *           { "type": "command", "command": "node <path>/panelx/tools/session-hook.mjs stop", "timeout": 10 }
 *         ]}]
 *       }
 *     }
 *
 * Project settings are ADDED to the ones in `~/.claude/settings.json` rather than replacing them,
 * so hooks somebody already has there keep running.
 *
 * WHERE IT IS WIRED ON THE OWNER'S MACHINE TODAY, as the secretary read it, read-only, on 28 September 2026 (for wave
 * 13n's round 19): at user level, in `~/.claude/settings.json`. SessionStart, Stop and SessionEnd each run
 * `node "<the live checkout>/tools/session-hook.mjs"` with `start`, `stop` and `end`, so every Claude Code session
 * on that machine runs this file from the live checkout. `Stop` matters because a fresh conversation has no
 * transcript file at SessionStart, so the discovery stamp cannot be written then; `Stop` fires at the end of the
 * first turn, which is the first moment it can. Without it the stamp lands only at SessionEnd, which a session that
 * crashes never reaches. This file does not change the wiring: it is outside the repository and the owner's.
 *
 * To check it is working: start a session and look for the line beginning "MOLE OFFICE —". If it is not
 * there, the wiring is gone.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SKILL NEEDS A DIFFERENT DIRECTORY FROM THIS HOOK, SO IT NEEDS A LINK
 * ---------------------------------------------------------------------------------------------
 *
 * Claude Code loads project skills from `<the directory the session started in>/.claude/skills`.
 * The Mole Office skill lives INSIDE this checkout, at `.claude/skills/mole-office`. UNTIL 14 SEPTEMBER 2026
 * this hook was wired up one directory ABOVE the checkout, because that is where sessions were normally
 * started. Today the hook is wired at user level, in `~/.claude/settings.json`: on the owner's machine
 * SessionStart, Stop and SessionEnd run it from the live checkout (read by the secretary on 28 September 2026), and
 * the press installs the skill at user level too (see above). What follows is kept for a machine wired by
 * hand in a project directory.
 *
 * Wired that way, the two want opposite directories. A session started where the hook works gets no skill, and
 * a session started where the skill works gets no hook. There is no directory that gives an agent
 * both, and the agent with no skill cannot tell that it is missing one — it just writes to Mole Office
 * without the rules for writing to Mole Office.
 *
 * Measured on 16 August 2026, in fresh sessions started in the parent directory: with the link
 * removed, "SKILL NOT AVAILABLE"; with the link in place, the skill loaded and answered from its
 * own text. That is the whole of the evidence.
 *
 * The fix is one link, made once, in the directory sessions are started in:
 *
 *     mkdir -p <the directory you start Claude Code in>/.claude/skills
 *     ln -s <path>/panelx/.claude/skills/mole-office <the directory you start Claude Code in>/.claude/skills/mole-office
 *
 * A LINK AND NOT A COPY. A copy is a second skill that drifts from this one, which is the defect
 * this repository keeps finding: the same thing written in two places, with nothing making them
 * agree. The link has one source of truth, and it is the file in this checkout.
 *
 * This hook CHECKS the link and says when it is missing. It does not make it. Creating it would
 * mean writing into the owner's own configuration directory on every session start, which nobody
 * asked for; and saying it out loud is enough, because the failure was never that the link was
 * hard to make. It was that nothing said it was gone.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isatty } from 'node:tty'
import {
  whereIsTheApi,
  theInstallsOwnOffice,
  theAgentAnEnvFileNames,
  theAgentTheEnvironmentNames,
  theEnvFileASessionReads,
  theProjectAnEnvFileNames,
  theProjectTheEnvironmentNames,
  thisDirectoryIsInThisCheckout,
  whichWorkspace,
} from './where-is-the-api.mjs'
// Which world answered, criterion G3. The format and the database identity are declared once each,
// in src/config, and read by this hook, by the server that writes the header and by the browser.
import {
  bootstrapEnvironment,
  readSetting,
  REPO_ROOT,
  settings,
  THE_AGENTS_TOOLS,
  THE_FOR_AGENTS_FOLDER,
  THE_INSTALL,
  THE_SESSION_HOOK,
  theInstallsNode,
  theInstallsNodeInALine,
  transientToolContext,
} from '../src/config/settings.mjs'
// Which world this hook lives in, on every request it makes. Criterion C4.
import { HOME_HEADER } from '../src/config/visit-headers.mjs'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { HOOK_CLOCK_HEADER } from '../src/config/hook-clock-header.mjs'
import { whatAnswersForThisOffice, theAnswerInWords, whatAWorldHeaderShows } from '../src/config/the-self-check.mjs'
import { THIS_SIDE_EN } from '../src/config/the-self-check-words.mjs'
import { WORLD_HEADER, worldInWords } from '../src/config/world-header.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
// THE OFFICE'S OWN KEY, FOR THE HOOK'S ONE LAST-RESORT PATH ALONE: a session that holds no key, names no agent, and runs
// on a computer with no entry key file (`theOfficeKeyHeader` below). Nothing else in this file reads it.
import { theOfficeKey } from '../src/config/office-key.mjs'
// THIS COMPUTER'S ENTRY AGENT AND ITS KEY, which the entry press writes beside the office's key file: where they are,
// how they are read, and the start lines about them, in one module the press and the doors import too.
import {
  aNamedAgentWithoutAKeyLine,
  aPrivateFileRead,
  theEntrysFilesRead,
  theEntrysKeyFileWasNotUsedLine,
  theOfficeRefusedTheEntrysKeyLine,
} from '../src/config/the-entrys-agent.mjs'
import { theLineOfTheHookRunByHand } from '../src/config/the-hook-run-by-hand.mjs'
import { A_COMPACTION_REPORTED_BY_CLAUDE_CODE } from '../src/config/a-reported-compaction.mjs'
// WHICH KEY A RUN'S TOOL SENDS: the agent's own key from the environment, or else the run's key from the office tool
// configuration the launcher names. One function holds that order for the hook and for the kit's tools, so the two
// cannot choose differently.
import { OFFICE_TOOL_CONFIGURATION, theKeyARunsToolSends } from '../src/config/run-permissions.mjs'
// THE NOTE OF WHICH RECORD THIS CONVERSATION IS FILED AS, and the states in which a run is over, declared once in
// src/config because tools/register-myself.mjs writes the note too (problem Tv32CoCfV-cP).
import { carriesTheTestMark } from '../src/config/the-test-mark.mjs'
import { THE_KEY_FILE_ENTRY_SAYS, THE_SESSION_NOTES_FOLDER, RUN_IS_OVER_STATES, theRecordTheNoteNames, theSessionNote, theWaitersKeyFileAndOffice, writeTheSessionNote } from '../src/config/the-session-note.mjs'
import { readAFullList } from './a-full-list-read.mjs'
import { A_KIT_TOOL_HOLDS_NO_KEY, THE_AGENT_KEY, anAgentsToolHeaders, theNoKeyLine } from './agent-key.mjs'
// THE STOP CAUSE, READ FROM THE TRANSCRIPT. Criterion M94 and the office's decision say a Claude Code session's end
// writes why it stopped onto its run record. The reading is shared with the office's own sweep
// — src/server/lib/reminders.ts — so the two cannot drift.
import { localStampOf, theMomentOfALocalStamp, theStopCauseInTheTranscript, thePatchThatClosesARun } from '../src/config/stopped-run-cause.mjs'
import { aReceiptReadLately, claudeTranscriptUsage, keepingTheOutsideSpend, whereItRan } from '../src/config/usage.mjs'
import { theLoginThatPaid } from '../src/config/claude-code-login.mjs'
// THE SESSION'S OWN PROCESS. Criterion M106, second half: a session waiting in its terminal writes
// nothing to its transcript, so the office must be able to read the process that is still there.
// The reading is shared with the office's own check, so the two cannot drift about what a record
// names. src/server/lib/answering.ts reads it back through `theRecordedProcess` in that module.
// Whether the process recorded on a run that names another conversation still runs is read by the same reader as the
// office's inspection, `whetherTheRecordedProcessRuns` (problem c3p75p8aALd2).
import { readEveryProcessFirst, theSessionProcessForTheWaiter, theProcessPatchFor, whetherTheRecordedProcessRuns } from '../src/config/session-process.mjs'
// THE COMMAND THAT RESUMES THIS CONVERSATION, on the stamp the profile's resume line reads: worked out by the way-back
// rule and screened by the office's secret-shape check, both plain JavaScript for Node 18 (item 38, wave 13u round 109).
import { theClaudeWayBack } from '../src/config/the-way-back.mjs'
import { withSecretsMarked } from '../src/config/secret-shapes.mjs'

// WHERE THE HOOK RUNS FROM CHOOSES WHAT ITS LINES NAME. From a checkout they name the checkout's tools/ and its
// CLAUDE.md. From an installed office they name the files the installation built into for-agents/, run with the
// install's own Node (theInstallsNodeInALine in src/config/settings.mjs), and the mole-office skill's SKILL.md. An
// installed office has no tools/ and no CLAUDE.md, and
// its person may have no Node of their own.
const INSTALLED = THE_INSTALL.from === 'bundle'

/**
 * A file an installed office builds into for-agents/, as this hook's lines name it: the file, and the command
 * that runs it.
 * @param {string} name a name in THE_AGENTS_TOOLS, or THE_SESSION_HOOK (src/config/settings.mjs)
 * @returns {{ file: string, command: string }}
 */
function theTool(name) {
  const built = [...THE_AGENTS_TOOLS, THE_SESSION_HOOK]
  if (!built.includes(name)) throw new Error(`${name} is not one of the files an installed office builds into ${THE_FOR_AGENTS_FOLDER}/: ${built.join(', ')}.`)
  if (!INSTALLED) return { file: `tools/${name}`, command: `node tools/${name}` }
  const file = join(REPO_ROOT, THE_FOR_AGENTS_FOLDER, name)
  return { file, command: `${theInstallsNodeInALine(theInstallsNode({ named: true }))} "${file}"` }
}

/** Where an agent this hook speaks to finds the rules. */
const THE_RULES = INSTALLED ? "the mole-office skill's SKILL.md" : 'CLAUDE.md'

/**
 * THE HOOK NEVER BLOCKS A SESSION, EVEN WHEN SOMETHING INSIDE IT THROWS.
 *
 * Every request this hook makes already answers null when it fails. What those do not cover is a
 * throw anywhere else: a setting the declaration refuses, a reply of a shape nobody expected, a bug.
 * Measured on 27 September 2026: with MOLE_OFFICE_AGENT set to an empty value, the declaration throws
 * and this hook exited 1 with a stack trace. So a throw anywhere after this point prints one line
 * saying what failed and exits 0. It cannot say how far the hook got, so it does not say.
 *
 * A throw while the imports above are loading happens before this line runs, and is not caught here.
 */
function theHookStopped(error) {
  const what = error instanceof Error ? error.message : String(error)
  console.log(
    [
      'MOLE OFFICE — the session hook stopped part way through, and this session goes on without it.',
      `What failed: ${what}`,
      `Whatever the hook had not done by then was not done. ${theTool(THE_SESSION_HOOK).file} is the hook.`,
    ].join('\n'),
  )
  process.exit(0)
}
process.on('uncaughtException', theHookStopped)
process.on('unhandledRejection', theHookStopped)

/**
 * WHERE THE API IS AND WHICH PROJECT THIS FILES INTO — read from the one declaration.
 *
 * NOTHING HANDS THIS PROCESS AN ENVIRONMENT. Claude Code spawns this hook from
 * the owner's user-level `~/.claude/settings.json` (read by the secretary on 28 September 2026), whose command sets none. So `MOLE_OFFICE_API` is empty here even when `.env`
 * says exactly where the API is, and this file used to carry its own `.env` parser and its own
 * built-in address to cope.
 *
 * THAT BUILT-IN WAS 8787 AND IT WAS SILENTLY WRONG THE MOMENT THE PORT MOVED. Found on 28 August
 * 2026 by the check run after the port changed from 8787: the hook would have gone on filing
 * sessions into whatever answered on 8787 — at that moment a scratch copy of the corpus holding 791
 * records instead of the owner's 721 — and once nothing answered there at all, every session would
 * have gone unfiled with no error. This project has already lost a whole day of work to a session
 * nobody filed.
 *
 * IT NOW READS `src/config/settings.mjs`, the one place any of this is declared, through
 * `tools/where-is-the-api.mjs`. That declaration is plain JavaScript rather than TypeScript for
 * this caller's sake: the `node` on the PATH Claude Code hands a hook is v18.19.1 on this machine,
 * measured on 3 September 2026, and it cannot read a `.ts` file at all.
 *
 * The real environment still wins, so `MOLE_OFFICE_API=... node tools/session-hook.mjs` still
 * works. A missing or unreadable `.env` is not an error: the declared default is the last resort,
 * as before.
 */
// Ten seconds is Claude Code's hook budget. Keep half a second for output and exit,
// even if an earlier read or filing used up the budget before the brief was asked.
// performance.now() counts from this process's start, so the budget includes loading the imports above.
const hookStartedAt = 0
const clockScale = Number(readSetting('MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE', process.env).value ?? 1)
const hookMs = (ms) => Math.round(ms * clockScale)
const HOOK_BUDGET_MS = hookMs(10_000)
const OUTPUT_MARGIN_MS = hookMs(500)
const AFTER_READS_MARGIN_MS = hookMs(3500)
// AN INSTALLED OFFICE'S HOOK ASKS ITS OWN OFFICE when nothing names one, and says nothing on stderr unless its lock
// cannot be read (round W22): theInstallsOwnOffice in where-is-the-api.mjs, which whereIsTheApi asks first as well. The
// hook keeps its answer, because the world it expects is that office's, and asks it once, so its line is said once.
// The self-check works that world out from the office's database and port; undefined leaves it the declaration's.
const THE_INSTALLS_OWN_OFFICE = theInstallsOwnOffice()
const API = THE_INSTALLS_OWN_OFFICE?.address ?? whereIsTheApi()
let WORKSPACE = whichWorkspace()

/**
 * WHICH DURABLE AGENT THIS SESSION ANSWERS AS, or null because nobody said.
 *
 * Criterion H1 of design/messages/ACCEPTANCE.md section 10. A terminal has no way of its own to
 * know which agent it is, so the checkout says once in `.env` as `MOLE_OFFICE_AGENT`, and this hook
 * and `tools/hold-the-handle.mjs` read the same line through the same declaration.
 *
 * IT IS THE SESSION'S AGENT, NOT THE SCRIPT'S CHECKOUT'S. One hook is wired for every Claude Code
 * session on this machine, so a session in another repository used to be told it answered as this
 * checkout's agent and was handed a panelx run's record (problem `JsxXlrodyydX`). The agent now
 * comes from the environment the session was started with, or from a `.env` found upward from the
 * session's own working directory; the checkout's own `.env` is read only when the session is
 * inside this checkout. Where none names an agent this is null, and the hook says so rather than
 * claiming a handle and naming a run that is not this session's.
 *
 * AND SINCE 24 SEPTEMBER 2026 THERE IS A REGISTERED START FOLDER, as part (c) of a decision
 * says. A durable agent may record the folder its sessions start in, and the office is asked
 * which agents registered the folder this session started in. A folder names an agent only when exactly one live agent
 * registered that exact folder and that agent is not already answering in another live session;
 * otherwise nobody is named and the hook says which of those it was. `theStartFolderAnswer` below is
 * the whole of that rule.
 *
 * AND SINCE 27 SEPTEMBER 2026, THE WAITER'S HOLD ON THIS SESSION'S OWN RECORD (problem ihekMM954ojG).
 * The whole order is written once, above `AGENT` below.
 *
 * WHEN IT IS SET, IT IS THE ACTOR ID THIS HOOK WRITES UNDER. A session that is a durable agent
 * should have its session record filed as that agent's, not under the hook's own name.
 */

/** The hook is handed JSON on stdin. Read it ONCE, here, because the identity below depends on it. */
const input = readHookInput()

// A RUN WITH NO HOOK PAYLOAD IS A RUN BY HAND, AND IT WRITES NOTHING (problem WnVjoGd1bXx8). Claude Code hands every hook a
// JSON payload that names its session. On 28 September 2026 an agent ran this by hand to see what it says, and it filed
// session lv8MZDIoDnTV in the live office; only a rule to remember stood against that, and the office should
// stop such things itself. So with no session named, nothing is filed, noted or asked, and the
// hook says what it is. Nothing above this line writes.
// THE LINE AND ITS MARK ARE DECLARED ONCE, in src/config/the-hook-run-by-hand.mjs, which the start-cost measure reads too
// (problem RwLABKMM2OFw).
if (typeof input.session_id !== 'string' || input.session_id.trim() === '') {
  console.log(theLineOfTheHookRunByHand())
  process.exit(0)
}
const startDirectory = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : null

/**
 * WHO THIS SESSION IS: WHICH AGENT IT ANSWERS AS, AND WHAT THIS HOOK WRITES UNDER. Problem
 * ihekMM954ojG.
 *
 * ---------------------------------------------------------------------------------------------
 * THE ORDER, THE SAME IN START, STOP AND END
 * ---------------------------------------------------------------------------------------------
 *
 *   1. The environment the session was started with. MOLE_OFFICE_AGENT names the agent, and
 *      MOLE_OFFICE_SESSION names its run (`theRecordThisStartIsFor` takes that run as this session's
 *      record). MOLE_AGENT_KEY, where set, goes on every request under the agent's name, so the office
 *      itself refuses the name when the key proves another agent (`theHookIdentity`).
 *   2. The waiter's hold on this session's own record: the run the environment names, the record this
 *      hook's note names, the one record this start took over, a record whose providerSession
 *      names this conversation, or one naming this session's checked running claude process. A handle held there is held
 *      by this session. `theHeldAgent` reads it, from the office.
 *   3. A `.env`: the nearest one above the start folder, or this checkout's own when the session is
 *      inside it. `theAgentAnEnvFileNames` in tools/where-is-the-api.mjs.
 *   4. A registered start folder, from the office. `theStartFolderAnswer`.
 *   5. Nobody. The hook then says it cannot tell, and names no agent and no handle.
 *
 * THE PROCESS TREE NAMES NOBODY. `processFacts` identifies this session's records before
 * the hold is read, and also writes the claude program's pid on its record. After a compaction the hook may find no claude program above it, and
 * that says nothing about who the session is.
 *
 * WHAT WAS MEASURED, 27 SEPTEMBER 2026. The problem record says the hook read who a session is from
 * the process tree. The code never did: the process walk only ever recorded a pid. The "wrong agent"
 * half was this checkout's `.env` read for a session outside it (problem JsxXlrodyydX, fixed on
 * 16 September). What a compaction still broke was that nothing read MOLE_OFFICE_SESSION or the hold
 * the waiter keeps on the session's record, so a session whose environment named no agent was told it
 * was no durable agent while its waiter held its handle. Sources 1 and 2 are that fix.
 *
 * THESE TWO ARE SET MORE THAN ONCE, WHICH IS WHY THEY ARE NOT `const`. Only the environment costs
 * nothing to read; the rest are read after the world check has answered. Nothing is written before
 * the last of them is read, in every mode, so one session is never filed under one name and patched
 * under another.
 */
let AGENT = theAgentTheEnvironmentNames()
/**
 * THE NAME THIS HOOK WRITES UNDER WHEN IT CANNOT TELL WHICH AGENT ITS SESSION IS. It is `THE_SESSION_HOOK_ID` in
 * src/shared/participants.ts, copied here because this file cannot import a .ts file. No agent can register it: a
 * handle has no slash.
 */
const THE_SESSION_HOOK_ID = 'mole-office/the-session-hook'
let ACTOR = AGENT ?? THE_SESSION_HOOK_ID
/** Whether the reason a named office tool configuration gave no key has been said, so it is said once. */
let theRunsKeyWasNotReadSaid = false
/** Whether this hook sent the office's key, its last resort, so its start lines say so (`theKeyLines`). */
let theLastResortWasTaken = false
/** Whether a request named this session's agent with no key of it, so its start lines say so once (`theKeyLines`). */
let theNamedAgentSentItsNameAlone = false
/** Whether the office answered 401 to a request that carried this computer's entry key. Every request after it carries no key. */
let theEntrysKeyWasRefused = false
/**
 * THIS COMPUTER'S ENTRY FILES, read once and only for a session that holds no key and names no agent
 * (`theEntrysFilesOnce`), or null because no request has asked yet.
 * @type {ReturnType<typeof theEntrysFilesRead> | null}
 */
let theEntrysFiles = null
/**
 * THE KEY IN THE FILE THIS SESSION'S NOTE NAMES, read once, or null because there is none to send, or undefined because
 * no request has asked yet (`theKeyTheNotedFileHolds`).
 * @type {string | null | undefined}
 */
let theNotedKeyFilesKey = undefined
/**
 * WHAT THE HOOK SAYS, ONCE, WHEN IT TOOK ITS LAST RESORT: one line among its start lines on stdout, at a start only.
 * Nothing goes on stderr for it, because Claude Code shows the hook's stderr to the person at every start, every turn's
 * end and every session's end, and the person's own session is one that holds neither key.
 *
 * THESE ARE NEW WORDS. KK-1's sentence for a tool that holds no key (`A_KIT_TOOL_HOLDS_NO_KEY` in
 * for-agents/agent-key.mjs) says that the tool sent nothing, and tells the person to run the tool in the run's own
 * terminal. Neither is true of a hook that Claude Code runs. No key and no key file's path is ever printed.
 */
const THE_HOOK_USED_THE_OFFICES_KEY =
  "This session holds no key of its own and names no agent, and this computer has no entry key file, so the hook sent its requests with the office's key, as its last resort. " +
  "To give the session a key of its own, start it with MOLE_AGENT_KEY_FILE set to the full path of the file holding the agent's key; register-myself.mjs --key-file writes one."

/** THE RUN THE ENVIRONMENT NAMES AS THIS SESSION'S, from MOLE_OFFICE_SESSION, or null because it is not set. */
const THE_RUN_THE_ENVIRONMENT_NAMES = (() => {
  const said = transientToolContext().session
  return typeof said === 'string' && said.trim() !== '' ? said.trim() : null
})()

const MODES = ['start', 'stop', 'end']
const mode = MODES.includes(process.argv[2]) ? process.argv[2] : 'start'

/**
 * The hook is handed JSON on stdin, and read defensively. A terminal is not read at all: it is a person running this by
 * hand, who would otherwise wait on it, and there is no payload in it (problem WnVjoGd1bXx8).
 *
 * WHETHER IT IS A TERMINAL IS ASKED OF fd 0, NEVER OF process.stdin (problem xeY4z0EQJA8l). Reading process.stdin makes
 * fd 0 non-blocking, and readFileSync(0) then throws EAGAIN while the pipe is still open, even after the payload has
 * arrived; the hook took that for no payload and wrote nothing. Left blocking, the read waits for the pipe to close.
 * Claude Code closes it once the payload is written, and every test that starts this hook closes it too.
 */
function readHookInput() {
  if (isatty(0)) return {}
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * THE DISCOVERY STAMP: WHICH CONVERSATION THIS RUN IS, AND WHERE ITS TRANSCRIPT IS.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT UNBLOCKS, AND THE MEASUREMENT THAT SAYS SO
 * ---------------------------------------------------------------------------------------------
 *
 * `stampOf` in src/server/lib/sessions.ts needs three keys — `tool`, `externalId` and `logPath` —
 * and returns null if ANY of them is missing. Measured on 27 August 2026: **0 of 103 session
 * records carry `data.extra.discovered`.** So `pickUpOf` answers `never-observed` for every one of
 * them, and every row in the recipient picker reads *Needs a new run*. The defect was never in the
 * picker. It was that nothing ever wrote the stamp onto the record it filed, and this is that.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE STAMP IS WRITTEN WHOLE OR NOT AT ALL
 * ---------------------------------------------------------------------------------------------
 *
 * `stampOf`'s own rule and it is right: a stamp missing any of the three cannot be matched to
 * anything, so it is treated as absent rather than half-used. Relaxing it would let `pickUpOf`
 * answer *yes* for a run whose transcript nobody has located, and a worker would then start a
 * fresh agent that has never heard of the work and report that as picking the work up.
 *
 * ---------------------------------------------------------------------------------------------
 * WHEN EACH OF THE THREE IS KNOWN — MEASURED, NOT ASSUMED
 * ---------------------------------------------------------------------------------------------
 *
 * `tool` and `externalId` are known at SessionStart: this file already writes `runtime:
 * 'claude-code'` and already holds `input.session_id`.
 *
 * `logPath` was the open question. The design said nobody had measured whether SessionStart's
 * payload carries the transcript path and that the measurement should be taken before this was
 * built. **It was taken, on 27 August 2026, against Claude Code 2.1.246 on this machine.** The
 * base hook-input builder returns `{session_id, transcript_path, cwd, ...}` and the SessionStart
 * payload spreads it: `{...Ws(session, cwd()), hook_event_name: "SessionStart", ...}`. So the
 * PATH ARRIVES AT SessionStart.
 *
 * **A path is not a transcript.** The same measurement shows the path is COMPUTED from the session
 * id, not checked, so at the start of a fresh conversation it usually names a file that does not
 * exist yet. So the stamp is written the first moment the file is OBSERVED TO EXIST, which this
 * asks the filesystem, and that is why there are three writers rather than one:
 *
 *   start   the ordinary case for a resumed or compacted session, whose transcript is already there
 *   stop    after a turn, which is the first moment a fresh conversation has a transcript at all
 *   end     the last chance, and the one that is wired today
 *
 * `stop` is not wired yet and this file does not wire it — the wiring lives outside the repository
 * and belongs to whoever owns that directory. The block to paste is in the header.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * **It stamps this run and nothing else.** There is no backfill and there never will be. The 95
 * old records the existing sweep cannot honestly match stay unstamped for ever, and the product
 * already says the true thing about them: *nobody recorded a transcript for this run, so there is
 * no conversation to pick up.* Inventing a stamp for a run nobody observed is fabricated evidence.
 */
function discoveryStamp() {
  const externalId = typeof input.session_id === 'string' && input.session_id !== '' ? input.session_id : null
  const logPath = typeof input.transcript_path === 'string' && input.transcript_path !== '' ? input.transcript_path : null
  if (externalId === null || logPath === null) return null
  // THE FILE, NOT THE PATH. A computed path that names nothing is not an observation, and a stamp
  // built from one would say a transcript is on this machine when it is not.
  if (!existsSync(logPath)) return null
  const resumeCommand = theResumeCommand(externalId)
  return { tool: 'claude-code', externalId, logPath, ...(resumeCommand === null ? {} : { resumeCommand }) }
}

/**
 * WHY THE COMMAND THAT RESUMES THIS CONVERSATION WAS LEFT OFF THE STAMP THIS RUN OF THE HOOK WROTE, or null when it was
 * not. `stampedLine` says it, so a command left out is a stated absence.
 */
let resumeCommandLeftOut = null

/** A setting whose name says its value is a secret, as the profile's origins line reads the office's own settings. */
const A_SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i

/**
 * THE COMMAND THAT RESUMES THIS CONVERSATION, for its stamp, or null with the reason kept (item 38, wave 13u round 109).
 *
 * The profile's resume line reads the command from the stamp (src/server/lib/session-origins.ts). Only the discovery
 * sweep wrote it there, and this hook, which writes nearly every stamp now, never did, so from late September no
 * long-running session's profile showed one.
 *
 * Only the folder and the conversation id go in, through the way-back rule, as the sweep's command had them; the start's
 * flags do not. A command holding a piece shaped like a key, or the value of a setting of this process whose name says
 * it is a secret, is left out, and the profile's line screens what it reads again. Working it out never fails a start:
 * a throw leaves the command out, with that as the reason.
 *
 * @param {string} externalId  the conversation id
 * @returns {string | null}
 */
function theResumeCommand(externalId) {
  try {
    const folder = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : null
    if (folder === null) {
      resumeCommandLeftOut = 'the hook was not told the folder this conversation runs in'
      return null
    }
    const command = theClaudeWayBack({ folder, sessionId: externalId })
    if (withSecretsMarked(command).marked.length > 0) {
      resumeCommandLeftOut = 'it holds a piece shaped like a key'
      return null
    }
    const secrets = Object.entries(process.env).filter(([name, value]) => A_SECRET_NAME.test(name) && typeof value === 'string' && value.length >= 8)
    if (secrets.some(([, value]) => command.includes(value))) {
      resumeCommandLeftOut = 'it holds the value of a setting whose name says it is a secret'
      return null
    }
    resumeCommandLeftOut = null
    return command
  } catch {
    resumeCommandLeftOut = 'working it out failed'
    return null
  }
}

/** Whether a stamp names this conversation and carries no command that resumes it. */
function theCommandIsMissing(stamp) {
  return stamp !== null && stamp.externalId === input.session_id && !(typeof stamp.resumeCommand === 'string' && stamp.resumeCommand !== '')
}

/**
 * The attachment facts this run knows about itself, for the keys the session kind declares.
 *
 * Each is left out when it is not known rather than filled with a plausible value. A run that is
 * not in a tmux pane says nothing about a terminal; it does not say it is in one called "unknown".
 * The terminal is RECORDED AND NEVER WRITTEN TO — it is where a person can go and watch.
 */
function attachmentFacts() {
  const out = {}
  if (typeof input.session_id === 'string' && input.session_id !== '') out.providerSession = input.session_id
  if (typeof input.cwd === 'string' && input.cwd !== '') out.workingDirectory = input.cwd
  const machine = process.env.HOSTNAME ?? hostname()
  if (typeof machine === 'string' && machine !== '') out.machine = machine
  const pane = process.env.TMUX_PANE
  if (typeof pane === 'string' && pane !== '') out.terminal = `tmux ${pane}`
  return out
}

/**
 * Put the stamp on a record, and the session's own process beside it, without disturbing `extra`.
 *
 * `extra` is a declared open bag and somebody else may have written into it, so the whole bag is
 * read back and merged rather than replaced. A patch that replaced it would delete whatever else
 * was in there, silently, which is the shape of defect this repository keeps finding.
 *
 * A record that already carries a conversation keeps it. The one thing a later run may still have
 * to add is the process behind the session — a resume has the same session id and a new process —
 * and even then a recorded pid is only replaced with the old one kept in `pidReplaced`.
 *
 * A start that took the environment's run over replaces the whole stamp: the ended conversation is no longer this
 * run's conversation. Without an observed transcript it leaves the stamp alone and says what still names the old one.
 *
 * It answers what it did, including when a takeover found no transcript, so the caller can say so rather than assume.
 * A caller that has just read the record hands it in as `alreadyRead`, and it is not asked for again.
 */
async function stampTheRecord(recordId, takenOver = false, alreadyRead = null) {
  resumeCommandLeftOut = null
  const record = alreadyRead ?? (await ask(`/api/records/${recordId}`))?.record ?? null
  if (record === null) return 'no-record'
  const extra = typeof record.data?.extra === 'object' && record.data.extra !== null ? record.data.extra : {}
  const existing = typeof extra.discovered === 'object' && extra.discovered !== null ? extra.discovered : null

  if (takenOver) {
    const stamp = discoveryStamp()
    if (stamp === null) return 'takeover-not-observed-yet'
    // THIS PROCESS GOES ON THE NEW STAMP THROUGH THE ONE WRITER OF A PROCESS, start flags included, because the way back
    // reads them (src/config/the-way-back.mjs). A reading that recorded no process leaves the stamp without one.
    const next = theProcessPatchFor(stamp, processFacts) ?? stamp
    const processPatch = theProcessPatchFor(existing, processFacts)
    if (processPatch !== null && processPatch.pid !== existing.pid) next.pidReplaced = processPatch.pidReplaced
    // A MERGE PATCH RETAINS OMITTED KEYS. Explicitly remove the old stamp's other fields, so they cannot keep naming
    // the ended conversation or its process, while every field beside the stamp in `extra` stays as it was.
    const removed = Object.fromEntries(Object.keys(existing ?? {}).map((key) => [key, null]))
    // NAME ONLY THE STAMP: resending a null from elsewhere in `extra` would delete that field under a merge patch.
    return await writeTheStamp(recordId, {}, { ...removed, ...next })
  }

  // NOTHING OBSERVED AND NOTHING RECORDED YET: the transcript is not on disk, so there is no whole
  // stamp to write. The process is not written alone either — `stampOf` treats a discovery stamp
  // missing any of its three naming keys as absent, and a half-stamp would say a conversation is on
  // this machine when nobody has seen one.
  if (existing === null) {
    const stamp = discoveryStamp()
    if (stamp === null) return 'not-observed-yet'
    return await writeTheStamp(recordId, extra, withProcessFacts(stamp))
  }

  // ALREADY STAMPED. The conversation is written down; the only thing left that can change is the
  // process behind the session, on a resume where the same session id has a new process. The rule
  // for what that writes — the four process fields, the old pid kept in `pidReplaced`, and nothing
  // at all when the reading has not changed — is `theProcessPatchFor`, which the office's own door
  // for a waiter's process shares with this hook.
  //
  // A STAMP OF THIS CONVERSATION WITH NO COMMAND THAT RESUMES IT GETS ONE (item 38, wave 13u round 109), merged into
  // the stamp so every other field stays as it was. A stamp that carries a command already keeps it.
  const next = theProcessPatchFor(existing, processFacts)
  const resumeCommand = theCommandIsMissing(existing) ? theResumeCommand(existing.externalId) : null
  if (next === null && resumeCommand === null) return 'already-stamped'
  return await writeTheStamp(recordId, extra, { ...(next ?? existing), ...(resumeCommand === null ? {} : { resumeCommand }) })
}

/** One patch writing a whole discovery stamp, merged into `extra` so nothing beside it is lost. */
async function writeTheStamp(recordId, extra, discovered) {
  const reply = await ask(`/api/records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ dataPatch: { extra: { ...extra, discovered } } }),
  })
  return reply?.record === undefined ? 'refused' : 'stamped'
}

/**
 * The discovery stamp with this hook's own process on it, or unchanged when there is no process.
 *
 * THE SESSION'S OWN PROCESS IS THE SIGN OF LIFE A WAITING SESSION STILL GIVES. A session idle in
 * its terminal writes nothing to its transcript, so a record with only a transcript on it reads
 * offline while the session can take a message now. The process this hook was started by is that
 * session, and it is written beside the conversation it names.
 */
function withProcessFacts(stamp) {
  if (stamp === null || !processFacts.recorded) return stamp
  return {
    ...stamp,
    pid: processFacts.pid,
    pidStartedAt: processFacts.pidStartedAt,
    pidCommand: processFacts.pidCommand,
  }
}

/**
 * THE START HOOK'S OWN RECORD OF THIS CONVERSATION, CLOSED ONCE A REGISTRATION HAS REPLACED IT. Problem Tv32CoCfV-cP.
 *
 * tools/register-myself.mjs points this conversation's note at the record the registration gave it, and names in the
 * note ("supersedes") the record the note named before when that was this hook's own: live, of this conversation, and
 * held by no agent. The tool cannot end that run, because an agent may not end a run it did not start or file (problem
 * FZQflYp1vHuY). This hook can when the key it sends lets it (`theHookIdentity` below): the office's key, its last
 * resort, does, and so does the key of the agent that filed the record. A session that names an agent and holds no key
 * of it sends the name alone, which may end no run, so the close is refused and the record stays open in the list,
 * where a person sees it. Otherwise the first `stop` or `end` after the registration closes it as
 * superseded by the record the note names, after asking again that it is still live, still names this conversation and
 * is still held by no agent.
 *
 * THE NAME LEAVES THE NOTE ONLY WHEN THE OFFICE HAS JUDGED THE RECORD (problem 2KmE6ffWFEEx, the check of this fix,
 * QAA498uFBmE9; narrowed by problem 72plHvwU1uAK, the check of that one, YQD44W8WvLOs). The re-check is judged by a 200
 * whose JSON holds the record, or by a 404, the record gone. The close is judged by a 2xx, the record closed, or by a
 * refusal of this close: 400, 403 or 409. Any other reply keeps the name, and the next turn asks again: no reply at all,
 * a restart, the three-second limit, a server error, and a reply that says nothing about the record, such as a key not
 * accepted (401), a timeout (408), too many requests (429) or a 200 that is not JSON. The name used to be written away
 * whatever the answer, so one turn during a restart left the record open for good. A record an answered refusal leaves
 * open stays in the list, where a person sees it.
 *
 * @param {string} id  the record the note names, just stamped
 */
async function closeTheRecordItSupersedes(id) {
  const note = theSessionNote(sessionId)
  if (note === null || note.id !== id || note.supersedes === null) return
  // ASKED FOR IN ITS OWN PROJECT (problem uEpCGFcsM4Z6): after a takeover across projects the record the note
  // supersedes is in another project than the one the note names, and the note says which. A 404 that names the project
  // the record is in is not the record gone: it is asked for there.
  let there = note.supersedesWorkspace === null ? {} : { headers: { 'x-mole-office-workspace': note.supersedesWorkspace } }
  let read = await ask(`/api/records/${note.supersedes}`, { withStatus: true, ...there })
  const elsewhere = read.status === 404 ? read.body?.elsewhere?.workspaceId : undefined
  if (typeof elsewhere === 'string' && elsewhere !== '') {
    there = { headers: { 'x-mole-office-workspace': elsewhere } }
    read = await ask(`/api/records/${note.supersedes}`, { withStatus: true, ...there })
  }
  const held = read.status === 200 ? read.body?.record : undefined
  const old = typeof held === 'object' && held !== null && !Array.isArray(held) ? held : null
  if (old === null && read.status !== 404) return
  const data = old?.data ?? {}
  const stillTheHooksOwn =
    old !== null &&
    old.deletedAt == null &&
    old.kind === 'session' &&
    !RUN_IS_OVER_STATES.includes(data.state) &&
    (data.providerSession === sessionId || data.extra?.discovered?.externalId === sessionId) &&
    !(Array.isArray(data.ranAs) && data.ranAs.length > 0)
  if (stillTheHooksOwn) {
    const detail =
      note.supersededBecause === 'held'
        ? `Superseded by ${id}: the session hook filed this record for conversation ${sessionId}, and this session's waiter ` +
          `holds its handle on record ${id}${note.workspace === null ? '' : ` in project ${note.workspace}`}, which the hook ` +
          'took over and its note names now.'
        : `Superseded by ${id}: the session hook filed this record for conversation ${sessionId} before the session had a ` +
          `name, and a registration gave the conversation record ${id}, which the hook's note names now ` +
          `(${theTool('register-myself.mjs').file}).`
    const closed = await ask(`/api/records/${note.supersedes}`, {
      method: 'PATCH',
      body: JSON.stringify({ dataPatch: { state: 'finished', detail } }),
      withStatus: true,
      ...there,
    })
    const done = closed.status !== null && closed.status >= 200 && closed.status < 300
    if (!done && ![400, 403, 409].includes(closed.status)) return
  }
  writeTheSessionNote(sessionId, id, note.at ?? `${stamp} ${clock}`, null, {
    workspace: note.workspace,
    childOf: note.childOf,
    ...theWaitersKeyFileAndOffice(note),
  })
}

/**
 * THE OFFICE'S OWN KEY ON THE ONE HEADER IT TRAVELS ON: THE HOOK'S ONE LAST-RESORT PATH. Criterion P83, point 5. Read per
 * request, and only for a session that holds no key and names no agent, on a computer where this computer's entry key
 * file does not exist (`theHookIdentity` below). Any other session never reads the office's key file.
 * @returns {Record<string, string>}
 */
function theOfficeKeyHeader() {
  const held = theOfficeKey()
  return held.key === null ? {} : { [KEY_HEADER]: held.key }
}

/**
 * THE KEY THIS SESSION HOLDS, or null because it holds none.
 *
 * `theKeyARunsToolSends` in src/config/run-permissions.mjs chooses it, the function the kit's tools ask, so the hook
 * and those tools cannot choose differently: the agent's own key from MOLE_AGENT_KEY_FILE or MOLE_AGENT_KEY, and
 * otherwise the run's key from the office tool configuration MOLE_OFFICE_TOOL_CONFIGURATION names, read only when that
 * configuration names this session's agent and run. A run launched in a sandbox carries no key in its own environment;
 * its launcher gives the key to the run's office tool, which is why the second exists. The reason never holds a key.
 *
 * The environment's key counts as held before the agent is known too. It is sent only under its agent's name
 * (`theHookIdentity`), but a session started with a key of its own never takes the last resort.
 *
 * A NAMED CONFIGURATION THAT GAVE NO KEY has its reason said once on stderr, as before, for a session whose agent is
 * known. The reason is KK-1's `theNoKeyLine` without its opening sentence, which is about a kit tool: so the
 * configuration's path is not printed, and the key never is.
 * @returns {string | null}
 */
function theKeyThisSessionHolds() {
  const held = theKeyARunsToolSends(
    process.env,
    { agent: AGENT ?? undefined, session: THE_RUN_THE_ENVIRONMENT_NAMES ?? undefined },
    { agent: 'MOLE_OFFICE_AGENT', session: 'MOLE_OFFICE_SESSION' },
  )
  if (held.key !== null) return held.key
  const named = process.env[OFFICE_TOOL_CONFIGURATION]
  if (AGENT !== null && typeof named === 'string' && named !== '' && !theRunsKeyWasNotReadSaid) {
    theRunsKeyWasNotReadSaid = true
    process.stderr.write(`session-hook: ${theNoKeyLine(held.why, process.env).replace(`${A_KIT_TOOL_HOLDS_NO_KEY} `, () => '')}\n`)
  }
  return null
}

/**
 * THE AGENT'S KEY FROM THE FILE THIS SESSION'S NOTE NAMES, or null. A session started by hand names its agent and holds
 * no key of it, and its waiter, given the key in a file, wrote that file's full path into the note
 * (src/config/the-session-note.mjs). Read once, and only at a compaction, a stop and an end, where a name alone may not
 * stamp, change or end the run. No other start reads it. A file that is not there, or that the reader refuses, gives
 * one line on stderr that names neither the path nor the key, and null, so the hook sends the name alone as before.
 * The reader's own sentences are not passed on, because they name the path. A file holding another agent's key is sent
 * as it is: the office refuses a key under a name that is not its holder's.
 *
 * ONLY TO THE OFFICE THE WAITER HELD. The waiter wrote the address it asked beside the path. The file is not read
 * unless that address is this hook's own `API`, compared as written: one office written two ways is not the same
 * office here, and a note that names a key file and no office does not say which office the key is for. Otherwise one
 * line on stderr that names no address, path or key, and null, so the hook sends the name alone as before.
 * @returns {string | null}
 */
function theKeyTheNotedFileHolds() {
  if (theNotedKeyFilesKey !== undefined) return theNotedKeyFilesKey
  theNotedKeyFilesKey = null
  const now = (mode === 'start' && input.source === 'compact') || mode === 'stop' || mode === 'end'
  if (!now || typeof input.session_id !== 'string') return null
  const note = theSessionNote(input.session_id)
  if (note === null || note.agentKeyFile === null) return null
  if (note.agentKeyOffice !== API) {
    process.stderr.write(`${THE_KEY_FILE_ENTRY_SAYS.anotherOffice}\n`)
    return null
  }
  const read = aPrivateFileRead(note.agentKeyFile, THE_AGENT_KEY)
  if (read.is === 'held') theNotedKeyFilesKey = read.value
  else process.stderr.write(`${read.is === 'absent' ? THE_KEY_FILE_ENTRY_SAYS.absent : THE_KEY_FILE_ENTRY_SAYS.refused}\n`)
  return theNotedKeyFilesKey
}

/** This computer's entry files, read the first time a request asks, and kept for the rest of this run. */
function theEntrysFilesOnce() {
  if (theEntrysFiles === null) theEntrysFiles = theEntrysFilesRead(bootstrapEnvironment())
  return theEntrysFiles
}

/**
 * WHO THIS HOOK ASKS AS, AND WHICH KEY IT SENDS. Read per request, because AGENT can be set late.
 *
 * 1. The key this session holds goes when it holds one (`theKeyThisSessionHolds`), under that agent's name, through
 *    anAgentsToolHeaders in for-agents/agent-key.mjs. A key held before the agent is known goes nowhere: those requests
 *    (the start-folder read) go under ACTOR with no key, because a key could only go under a name that may not be its
 *    holder's.
 * 2. A session that names an agent and holds no key of it sends, at a compaction, a stop and an end, the key in the
 *    file its note names, under that agent's name, when the note says its waiter held the office this hook asks
 *    (`theKeyTheNotedFileHolds`). Otherwise it sends the name alone, on every computer, and its start lines say once
 *    that the office refuses its writes while the key window is closed.
 * 3. A session that holds no key and names no agent sends this computer's entry key, under the entry agent's registry
 *    id, when the two entry files are sound. AGENT stays null: the session is the entry agent's by its key alone. After
 *    the office refused that key with 401, no key goes.
 * 4. THE LAST RESORT. Only when the entry key file does not exist at all, the office's own key goes under ACTOR, as the
 *    hook did before agents held keys, and its start lines say so. That is a computer wired before the entry press gave
 *    keys, or wired by the terminal tool alone. An entry key file that is there and fails a check never brings the
 *    office's key back.
 * @returns {Record<string, string>}
 */
function theHookIdentity() {
  const key = theKeyThisSessionHolds()
  if (key !== null) return anAgentsToolHeaders({ self: AGENT, withoutAKey: ACTOR, key: AGENT === null ? null : key })
  if (AGENT !== null) {
    const noted = theKeyTheNotedFileHolds()
    if (noted !== null) return anAgentsToolHeaders({ self: AGENT, withoutAKey: ACTOR, key: noted })
    theNamedAgentSentItsNameAlone = true
    return anAgentsToolHeaders({ self: AGENT, withoutAKey: ACTOR, key: null })
  }
  const asked = anAgentsToolHeaders({ self: null, withoutAKey: ACTOR, key: null })
  const entry = theEntrysFilesOnce()
  if (entry.is === 'held') return theEntrysKeyWasRefused ? asked : anAgentsToolHeaders({ self: entry.agent, withoutAKey: ACTOR, key: entry.key })
  if (entry.is === 'refused') return asked
  const office = theOfficeKeyHeader()
  if (KEY_HEADER in office) theLastResortWasTaken = true
  return { ...asked, ...office }
}

/**
 * THE START LINES ABOUT THE KEY THE HOOK SENT, or none. Only at a start: a stop or an end prints nothing for them. Each
 * output of a start that sent a request carries each line once. No line holds a key or what a key file holds.
 * @returns {string[]}
 */
function theKeyLines() {
  if (mode !== 'start') return []
  const lines = []
  if (theLastResortWasTaken) lines.push(THE_HOOK_USED_THE_OFFICES_KEY)
  if (theEntrysFiles?.is === 'refused') lines.push(theEntrysKeyFileWasNotUsedLine(theEntrysFiles.why))
  if (theEntrysKeyWasRefused && theEntrysFiles?.is === 'held') lines.push(theOfficeRefusedTheEntrysKeyLine(theEntrysFiles.keyFile))
  if (theNamedAgentSentItsNameAlone && AGENT !== null) lines.push(aNamedAgentWithoutAKeyLine(AGENT))
  return lines
}

/**
 * One request, with a short deadline. Anything at all going wrong answers null.
 *
 * `withStatus` answers `{ status, body }` instead, and `{ status, body: null, error }` when the
 * request failed or its body was not JSON, so a caller can tell an error reply and a failed read
 * from an answer. `status` is null when no reply arrived at all.
 */
async function ask(path, options = {}) {
  const { timeLimitMs = hookMs(3000), withoutWorkspace = false, withStatus = false, headers: extraHeaders, ...rest } = options
  let status = null
  try {
    const res = await askTheOfficeTransport(`${API}${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        // THE PROJECT HEADER IS LEFT OFF FOR ONE CALL. The onboarding read has to let the DIRECTORY
        // decide which project it is in, and a header read from this checkout's .env would overrule
        // the directory with the checkout's own project. Every other call keeps the header.
        ...(withoutWorkspace ? {} : { 'x-mole-office-workspace': WORKSPACE }),
        ...theHookIdentity(),
        // AND WHICH WORLD THIS HOOK LIVES IN. Criterion C4 of design/messages/ACCEPTANCE.md section
        // 8. The hook runs in a checkout and talks to the API that checkout declares, so its home is
        // whatever that API says it is — read below from the world header, which the hook already
        // reads to decide whether to file anything at all. Null until it has read one, and a request
        // with no home is a local, which is what this hook has always been.
        ...(HOME === null ? {} : { [HOME_HEADER]: HOME }),
        // AND THIS HOOK'S OWN CLOCK, only while a test scales it, so the test's stand-in can count when a read ended on
        // the clock the hook gives it up by (src/config/hook-clock-header.mjs). No office receives it.
        ...(clockScale === 1 ? {} : { [HOOK_CLOCK_HEADER]: String(Math.round(performance.now() - hookStartedAt)) }),
        ...(extraHeaders ?? {}),
      },
      signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(
        timeLimitMs, HOOK_BUDGET_MS - OUTPUT_MARGIN_MS - (performance.now() - hookStartedAt),
      )))),
    })
    // THE DEV SUPERVISOR'S STAND-IN IS NOT THE OFFICE ANSWERING (stand-in-header.mjs). Its 503 is read
    // as nothing answered, so this hook says the office is not answering rather than reading the
    // stand-in's sentence as a reply about a record.
    if (res.headers.get(STAND_IN_HEADER) !== null) {
      const said = /** @type {any} */ (await res.json().catch(() => null))
      const error = String(said?.error ?? 'the dev supervisor answered that no server is running')
      return withStatus ? { status: null, body: null, error } : null
    }
    status = res.status
    const body = await res.json()
    return withStatus ? { status, body } : body
  } catch (error) {
    failedRequests.set(endpointName(path), `${rest.method ?? 'GET'} ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return withStatus ? { status, body: null, error: error instanceof Error ? error.message : String(error) } : null
  }
}

// Endpoint failures stay visible. Their full explanations are kept beside this hook's session notes.
/** @type {Map<string, string>} */
const failureEndpoints = new Map()
/** @type {Map<string, string>} */
const failedRequests = new Map()
let requestsTried = 0
let repliesReceived = 0
/** Count an HTTP reply as an answer even when its body cannot be read.
 * @type {typeof fetch} */
async function askTheOfficeTransport(input, options) {
  requestsTried++
  const address = new URL(input instanceof Request ? input.url : String(input))
  const path = address.pathname + address.search
  const method = options?.method ?? (input instanceof Request ? input.method : 'GET')
  try {
    const reply = await fetch(input, options)
    repliesReceived++
    const keyless = theHeadersWithoutARefusedEntryKey(reply.status, options?.headers)
    if (keyless === null) return reply
    // THE ENTRY KEY REFUSED: the office never gave it, or not to this office. This request is asked once more with
    // no key, and so is every request after it, and the start lines name the file (`theKeyLines`).
    const again = await fetch(input, { ...options, headers: keyless })
    repliesReceived++
    return again
  } catch (error) {
    failedRequests.set(endpointName(path), `${method} ${path}: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}
/**
 * THE HEADERS TO ASK AGAIN WITH, AFTER THE OFFICE ANSWERED 401 TO THIS COMPUTER'S ENTRY KEY, or null because the reply
 * is to be kept: it was not a 401, or the request did not carry the entry key. The entry identity's headers are
 * replaced by this hook's identity without a key, which every later request carries too. The office's key never comes
 * back here.
 * @param {number} status
 * @param {HeadersInit | undefined} sent
 * @returns {Record<string, string> | null}
 */
function theHeadersWithoutARefusedEntryKey(status, sent) {
  if (status !== 401 || theEntrysFiles?.is !== 'held' || theEntrysKeyWasRefused) return null
  if (sent === undefined || sent instanceof Headers || Array.isArray(sent)) return null
  if (sent[KEY_HEADER] !== theEntrysFiles.key) return null
  theEntrysKeyWasRefused = true
  const entry = anAgentsToolHeaders({ self: theEntrysFiles.agent, withoutAKey: ACTOR, key: theEntrysFiles.key })
  const kept = Object.fromEntries(Object.entries(sent).filter(([name]) => !(name in entry)))
  return { ...kept, ...theHookIdentity() }
}
/** The identity of a read, without the directory or conversation its query searches for.
 * @param {string} path */
function endpointName(path) {
  if (path.startsWith('/api/onboarding?')) return '/api/onboarding'
  if (path.startsWith('/api/records?')) {
    const query = new URLSearchParams(path.slice(path.indexOf('?') + 1))
    if (query.get('kind') === 'session') return '/api/records?kind=session'
  }
  return path
}
/** @param {string} endpoint @param {string} explanation */
function failedEndpoint(endpoint, explanation) {
  failureEndpoints.set(explanation, endpointName(endpoint))
  return explanation
}
const namedHookDetailsFolder = process.env.MOLE_HOOK_DETAILS_FOLDER ? resolve(process.env.MOLE_HOOK_DETAILS_FOLDER) : null
/** Keep only the twenty newest regular files with the hook's timestamp-and-pid names.
 * @param {string} hookDetailsFolder */
function trimHookDetails(hookDetailsFolder) {
  const files = readdirSync(hookDetailsFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^session-start-\d{13}-[1-9]\d*\.txt$/.test(entry.name))
    .sort((a, b) => Number(b.name.split('-')[2]) - Number(a.name.split('-')[2]) || Number(b.name.split('-')[3].slice(0, -4)) - Number(a.name.split('-')[3].slice(0, -4)))
  for (const entry of files.slice(20)) unlinkSync(join(hookDetailsFolder, entry.name))
}
/** @param {string[]} lines */
function printHookOutput(lines) {
  const hookDetailsFolder = namedHookDetailsFolder ?? (carriesTheTestMark() ? null : THE_SESSION_NOTES_FOLDER)
  const hookDetailsPath = hookDetailsFolder === null ? null : join(hookDetailsFolder, `session-start-${Date.now()}-${process.pid}.txt`)
  const detailsNotice = hookDetailsPath === null
    ? 'Details were not kept because the test suite named no folder (MOLE_HOOK_DETAILS_FOLDER).'
    : `Details: ${hookDetailsPath}`
  const seen = new Set()
  let failed = false
  const output = lines.flatMap((line) => {
    const notices = []
    let remaining = line
    for (const [explanation, endpoint] of failureEndpoints) {
      if (!remaining.includes(explanation)) continue
      failed = true
      remaining = remaining.replace(explanation, '')
      if (seen.has(endpoint)) continue
      seen.add(endpoint)
      notices.push(`Mole Office could not read GET ${endpoint}. ${detailsNotice}`)
    }
    return notices.length === 0 && remaining === line ? [line] : [...(remaining.trim() === '' ? [] : [remaining.trimEnd()]), ...notices]
  })
  for (const endpoint of failedRequests.keys()) {
    failed = true
    if (!seen.has(endpoint)) {
      seen.add(endpoint)
      output.push(`Mole Office request failed: ${endpoint}. ${detailsNotice}`)
    }
  }
  if (failed && hookDetailsFolder !== null && hookDetailsPath !== null) {
    try {
      mkdirSync(hookDetailsFolder, { recursive: true })
      writeFileSync(hookDetailsPath, lines.join('\n') + '\n' + (failedRequests.size === 0 ? '' : '\nFailed requests:\n' + [...failedRequests.values()].join('\n') + '\n'), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    } catch (error) {
      // The full explanations remain visible when their file could not be written.
      console.log(`Mole Office could not write hook details to ${hookDetailsPath}: ${error instanceof Error ? error.message : String(error)}`)
      console.log(lines.join('\n'))
      return
    }
  }
  if (failed && hookDetailsFolder !== null) {
    try { trimHookDetails(hookDetailsFolder) } catch (error) {
      console.log(`Mole Office could not remove old hook details in ${hookDetailsFolder}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (requestsTried > 0 && repliesReceived === 0) {
    console.log([`Mole Office did not answer (${requestsTried} requests tried, none answered). ${detailsNotice}`, ...(skill === null ? [] : [skill])].join('\n'))
  } else console.log(output.join('\n'))
}

// ------------------------------------------------ which world is answering, before anything

/**
 * WHICH WORLD THIS HOOK CALLS HOME, and how it comes to know.
 *
 * The hook learns its home from the world the self-check reads on the health reply, rather than
 * working out the answering database's identity itself. Null until an answer names a world; a
 * request carrying no home is a local, which is what this hook has always been. Nothing is guessed.
 */
let HOME = null

/**
 * Ask the shared self-check before writing. A wrong or unknown world refuses filing. A known world
 * allows it, reporting the office's own health reasons when it is unwell. Nothing answering leaves
 * the existing path to say the server is not there.
 */
async function checkTheWorldBeforeWriting() {
  // THIS IS WHY IT MATTERS, MEASURED. On 28 August 2026 the owner moved the API to another port.
  // The hook went on resolving 8787, where a scratch copy of the corpus was answering with 791
  // records instead of their 721. It would have filed every session into the wrong database with
  // nothing on screen to say so. The hook reads the declaration for its address, and the self-check
  // establishes whether the office answering is the one that declaration names.
  const answering = await whatAnswersForThisOffice({
    address: API,
    declared: THE_INSTALLS_OWN_OFFICE ?? undefined,
    headers: { 'x-mole-office-workspace': WORKSPACE, ...theHookIdentity() },
    asks: 1,
    waitMs: hookMs(3000),
    fetchImpl: askTheOfficeTransport,
  })
  const world = whatTheWorldCheckSays(answering)
  const launched = world.fileAnything ? null : await theLaunchedRunThisSessionIsIn(answering)
  return launched === null ? world : { fileAnything: false, line: `MOLE OFFICE — ${theLaunchedRunInWords(launched)}` }
}

/**
 * A LAUNCHED RUN IS TOLD IN ONE QUIET LINE, and the warning is kept for every other session. A round launched in a
 * sandbox talks to the office that holds its run, which is another world's: the sandbox's checkout declares its own
 * database and port. The launcher names the run in MOLE_OFFICE_SESSION, and writes the run's `sandbox` field when it
 * files it, which the office lets nobody else write (`assertMayWriteASandbox` in src/server/lib/records.ts). So only
 * when the world is another's, the office answering is asked for that run. When it holds it as a run whose sandbox
 * folder holds this checkout, this answers the run and the folder, and otherwise null. Nothing is written either way.
 */
async function theLaunchedRunThisSessionIsIn(answering) {
  if (answering.answer !== 'wrong-world' || answering.world === null || THE_RUN_THE_ENVIRONMENT_NAMES === null) return null
  const read = await ask(`/api/records/${encodeURIComponent(THE_RUN_THE_ENVIRONMENT_NAMES)}`, { withStatus: true })
  const record = read.status === 200 ? read.body?.record : null
  const folder = record?.kind === 'session' ? record.data?.sandbox?.folder : undefined
  if (typeof folder !== 'string' || folder === '') return null
  const within = relative(folder, REPO_ROOT)
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return null
  return { id: String(record.id), folder }
}

/** What the one quiet line says of a launched run, at the start. */
function theLaunchedRunInWords(run) {
  return `The run this session's environment names, ${run.id}, is held by the office on ${API} as a run launched in the ` +
    `sandbox at ${run.folder}, which holds ${THIS_SIDE_EN}. That office is not the one ${THIS_SIDE_EN} declares, as in ` +
    'every launched round, so this hook wrote nothing.'
}

/**
 * WHAT THE WORLD LINE SAYS AFTER A COMPACTION, when the office answering holds this session's launched run: the hook
 * read and wrote there as that run's office, and this says so where the wrong-world line would go.
 */
function theLaunchedRunsOfficeLine(run) {
  return `The office on ${API} is not the one ${THIS_SIDE_EN} declares, as in every launched round; it holds this ` +
    `session's run ${run.id} as launched in the sandbox at ${run.folder}, which holds ${THIS_SIDE_EN}; so after this ` +
    "compaction the hook read and wrote there as this run's office."
}

/**
 * WHAT ONE ANSWER ABOUT THE WORLD MEANS FOR THIS HOOK: whether it may write, and the line it prints. Shared by the
 * health read above and by the read after a compaction, which reads the world off its own reply's header instead.
 */
function whatTheWorldCheckSays(answering) {
  if (answering.answer === 'not-answering') return { fileAnything: true, line: null }
  if (answering.world !== null) HOME = answering.world.database
  if (answering.answer === 'wrong-world') {
    if (answering.world === null) {
      return {
        fileAnything: false,
        line: [
          `THE MOLE OFFICE ANSWERING ON ${API} DID NOT SAY WHICH WORLD IT IS, so this session has NOT been filed.`,
          ...theAnswerInWords(answering).map((line) => `  ${line}`),
          `Something other than the Mole Office server ${INSTALLED ? 'this installation runs' : 'this checkout builds'} is answering on that address, or it is a`,
          'version of it from before the header existed. Find out what is on that port before writing anything to it:',
          '    ss -ltnp | grep ' + String(THE_INSTALLS_OWN_OFFICE?.apiPort ?? settings().apiPort),
          'Nothing was written. Anything you want kept has to be filed by hand, once you know what you are talking to.',
        ].join('\n'),
      }
    }
    return {
      fileAnything: false,
      line: [
        `THE MOLE OFFICE ANSWERING ON ${API} IS NOT THE ONE ${THIS_SIDE_EN.toUpperCase()} DECLARES, so this session has NOT been filed.`,
        ...theAnswerInWords(answering).map((line) => `  ${line}`),
        // NEVER ADVISE A STOP (19 October 2026; yGL4JyF0d867, from wave 13k): in a sandbox this branch is the
        // normal case, because the session talks to the live office while its checkout declares the sandbox's own world.
        "Filing into it would put this run in a database nobody is reading. What answers there is another world's office",
        "(the live one, when this session runs in a sandbox), and it is not this session's to stop. Point this session at the",
        'office its checkout declares, or start that office, then start a new session. Nothing was written.',
      ].join('\n'),
    }
  }
  if (answering.answer === 'cannot-tell') {
    return {
      fileAnything: false,
      line: [
        `WHETHER THE MOLE OFFICE ANSWERING ON ${API} IS THE ONE ${THIS_SIDE_EN.toUpperCase()} DECLARES CANNOT BE TOLD, so this session has NOT been filed.`,
        ...theAnswerInWords(answering).map((line) => `  ${line}`),
        `Look at ${THIS_SIDE_EN}'s database, checkout and port settings, and GET /api/runtime on the office answering for what it could not read.`,
        'Nothing was written. Anything you want kept has to be filed by hand, once you know what you are talking to.',
      ].join('\n'),
    }
  }
  return {
    fileAnything: true,
    line:
      `This session is filed in the world ${THIS_SIDE_EN} declares: ${worldInWords(answering.world)}. ` +
      'The database, the checkout and the port are what was checked. The commit is what the running code was ' +
      `loaded from, which GET /api/runtime/freshness compares with ${INSTALLED ? 'the build this installation was made from' : 'the checkout'}.` +
      (answering.answer === 'unhealthy' ? '\n' + theAnswerInWords(answering).map((line) => `  ${line}`).join('\n') : ''),
  }
}

const today = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
const clock = `${pad(today.getHours())}:${pad(today.getMinutes())}`

const sessionId = typeof input.session_id === 'string' ? input.session_id : 'unknown'

/**
 * THIS SESSION'S NOTE, WHEN IT SAYS THIS SESSION IS A CHILD OF THE RUN THE ENVIRONMENT NAMES, or null. Problem
 * c3p75p8aALd2. A session started by hand inside another inherits the outer one's MOLE_OFFICE_SESSION. Its first start
 * filed its own record with that run as the parent, and wrote "childOf" in its note (`theRunTheEnvironmentNames`
 * below). Every later start, stop and end of it then reads its own record through the note, and not the run the
 * environment names. Read here, before any request, because the path after a compaction runs before the rest of this file.
 */
const THE_CHILD_NOTE = (() => {
  if (THE_RUN_THE_ENVIRONMENT_NAMES === null) return null
  const note = theSessionNote(sessionId)
  return note?.childOf === THE_RUN_THE_ENVIRONMENT_NAMES ? note : null
})()

// Read exactly as the waiter does: the parent walk, then a checked CLAUDE_PID.
// A process identifies records only; a fresh or kept hold is still required to name an agent.
// Read here, before any request, because the path after a compaction stamps the record before the rest of this file runs.
// On Windows the walk is answered from one reading of every process, one script rather than one for each question.
const processFacts = await readEveryProcessFirst(() => theSessionProcessForTheWaiter(process.ppid))
// Whether this session can reach the Mole Office skill. Worked out before any request, for the same reason.
const skill = skillNote()

// AFTER A COMPACTION, THE ONE READ GOES FIRST, and this file's ordinary start does not run (wave 13k round 46).
if (mode === 'start' && input.source === 'compact') await afterACompaction()

/**
 * THE FIRST READ, AND NOTHING IS WRITTEN UNTIL IT HAS ANSWERED.
 *
 * It runs for every mode, not only `start`. `stop` and `end` write to a record too, and writing a
 * session's end into the wrong database is the same defect as filing its start there.
 */
const worldCheck = await checkTheWorldBeforeWriting()
if (!worldCheck.fileAnything) {
  console.log([worldCheck.line, ...theKeyLines()].join('\n'))
  process.exit(0)
}

/**
 * WHICH PROJECT THIS DIRECTORY IS IN, AND WHO IS REGISTERED AS STARTING IN IT. Criterion F15 point 1,
 * and part (c) of a decision.
 *
 * The hook resolves the API and the checkout it belongs to from an absolute path, so it runs from
 * anywhere. What it could not say was which project an ARBITRARY directory belongs to, because the
 * answer is in the records rather than in the checkout. `GET /api/onboarding?directory=` is wave 1's
 * read for exactly this: `resolveProject` in src/server/lib/onboarding.ts matches the directory
 * against every project's registered repository roots and work areas.
 *
 * THE PROJECT HEADER IS NOT SENT. This checkout's `.env` names the checkout's own project, and a
 * session started somewhere else must not be told it is in that one. Leaving the header off is what
 * lets the directory decide; when nothing matches, the read says so and the line below asks the
 * agent to name a project rather than assuming the default.
 *
 * IT IS MADE HERE, BEFORE ANYTHING IS FILED, AND IT WAS MADE AFTER FILING UNTIL 24 SEPTEMBER 2026. The
 * same reply now carries the durable agents registered as starting in this folder, and that answer has
 * to be in hand before the record is filed, because it can decide whose name the record is filed
 * under. It is still ONE request: the folder's agents ride along in the read the hook already made,
 * which is what keeps this inside the hook's ten-second timeout.
 */
const onboarding =
  startDirectory === null
    ? null
    : await ask(`/api/onboarding?directory=${encodeURIComponent(startDirectory)}`, { withoutWorkspace: true })

// THE OFFICE HAS NO OWNER YET, FIRST. Report R9v6yxHpalAN block r16-4 carries out point (b) of the owner's
// decision. Use the sentence in the read already made, so its words cannot drift from the
// office's and no second request spends the hook's ten-second start budget.
const ownerLines =
  onboarding?.error === undefined &&
  onboarding?.owner?.named === false &&
  typeof onboarding.owner.says === 'string' &&
  onboarding.owner.says.trim() !== ''
    ? [onboarding.owner.says]
    : []

/**
 * THE RECORD THIS SESSION ALREADY HAS, from the note this hook wrote for it earlier, or null.
 *
 * Read off disk and not from the office, because it is needed before anything is asked: a session that
 * has already been filed is holding its own handle through its own waiter, and the office would then
 * say this agent is "answering in a live session" — that session being this one. Without this the hook
 * would refuse to name a session its own name on every compaction and every resume.
 *
 * The note may have been written by tools/register-myself.mjs rather than by this hook: a registration points it at
 * the record it gave this conversation (problem Tv32CoCfV-cP). Both read and write it through
 * src/config/the-session-note.mjs.
 */
function theRecordThisSessionAlreadyHas() {
  return theRecordTheNoteNames(sessionId)
}

/**
 * WHO A REGISTERED START FOLDER NAMES FOR THIS SESSION, AND THE SENTENCE FOR IT. This is part (c) of a
 * decision.
 *
 * ---------------------------------------------------------------------------------------------
 * THE DANGER THIS IS BUILT AGAINST
 * ---------------------------------------------------------------------------------------------
 *
 * A folder is shared. On 24 September 2026 one test folder held ten session records of eight
 * conversations and only one of them was the secretary's. A start folder must never name a session that is not
 * the agent's, so this names an agent ONLY when both of these hold:
 *
 *   · exactly one live agent is registered as starting in that exact folder, and
 *   · that agent is not already answering in another live session.
 *
 * Anything else names nobody AND SAYS WHY, in one of three sentences: two agents share the folder, the
 * one agent is answering elsewhere, or the office did not answer. A session told nothing would look
 * exactly like a session in a folder nobody registered.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * It sends no folder of its own and normalises nothing: the office was handed the directory Claude
 * Code named and matched it on the exact folder. It holds no handle and writes nothing. Where the
 * environment or a `.env` already named an agent, this is never asked at all — the order is the
 * environment, then a `.env`, then a registered start folder, then nobody.
 *
 * @returns {{ names: string | null, read: boolean, line: string | null }}
 */
function theStartFolderAnswer() {
  const said = onboarding === null || typeof onboarding !== 'object' ? null : onboarding.startFolder
  const agents = said === null || said === undefined ? null : said.agents
  if (!Array.isArray(agents)) {
    return {
      names: null,
      read: false,
      line: failedEndpoint('/api/onboarding',
        `Mole Office did not answer which agent is registered as starting in "${String(startDirectory)}", so nothing ` +
        'names a durable agent for this session.'),
    }
  }
  const folder = typeof said.directory === 'string' && said.directory !== '' ? said.directory : String(startDirectory)
  // NOBODY IS REGISTERED HERE, WHICH IS THE ORDINARY CASE AND NEEDS NO SENTENCE. The line that already
  // says this session answers as nobody is the whole of the answer.
  if (agents.length === 0) return { names: null, read: true, line: null }
  const handles = agents.map((one) => String(one?.handle ?? '')).filter((one) => one !== '')
  if (handles.length > 1) {
    return {
      names: null,
      read: true,
      line:
        `Neither this session's environment nor a .env names an agent here, and ${String(handles.length)} live agents ` +
        `are registered as starting in "${folder}": ${handles.join(', ')}. The hook does not choose between them, so ` +
        'this session answers as nobody. Set MOLE_OFFICE_AGENT=<handle> in the environment this session starts with, ' +
        'or register another start folder for all but one of them.',
    }
  }
  const only = agents[0]
  const handle = handles[0]
  if (handle === undefined) return { names: null, read: true, line: null }
  const answeringIn = typeof only?.answeringIn === 'string' && only.answeringIn !== '' ? only.answeringIn : null
  // ANOTHER LIVE SESSION, AND NOT THIS ONE. A session already filed holds its own handle through its
  // own waiter, so the office names its record here; that is this session and it keeps its name. The
  // record this start takes over (`theRecordThisStartIsFor` below) is this session's too: a waiter
  // started on it before the note was written holds the handle there, and that is this session.
  if (answeringIn !== null && !thisSessionsOwnRecords().includes(answeringIn)) {
    return {
      names: null,
      read: true,
      line:
        `"${folder}" is the registered start folder of "${handle}", and "${handle}" is already answering in the ` +
        `session filed as record ${answeringIn}, so this session is not named "${handle}". Set ` +
        `MOLE_OFFICE_AGENT=${handle} in its environment if it should be.`,
    }
  }
  return {
    names: handle,
    read: true,
    line:
      `Neither this session's environment nor a .env names an agent here, so "${handle}" is named by its registered ` +
      `start folder, "${folder}".`,
  }
}

/**
 * THE LIVE SESSION RECORDS THAT ALREADY NAME THIS CONVERSATION.
 *
 * A conversation is named on a session record in two places: `data.providerSession`, which this hook,
 * `tools/register-myself.mjs --provider-session` and the waiter write, and
 * `data.extra.discovered.externalId`, the discovery stamp. A record naming this session's id in either
 * one names this conversation.
 *
 * "LIVE" MEANS NOT DELETED AND NOT OVER. The list door leaves deleted records out, and a record whose
 * state is one of RUN_IS_OVER_STATES is over. A record with no state, or with `running` or `idle`, is
 * live. So a record closed by its `end` is never taken over here; the note is what finds that one.
 *
 * ONE SEARCH OF EVERY PROJECT'S SESSION RECORDS FOR THE SESSION'S ID, WITH NO PAGES. No door looks a
 * record up by these two fields, so the office's search narrows the list to the records whose words
 * hold the id, and the hook checks the two fields itself. It used to read every session record: on
 * 24 September 2026 that was 3,346 records, about 6 MB, in about 110 ms, but on 3 October 2026 the
 * same read of the owner's office answered 28.9 MB in 6.1 seconds, past the 3-second limit of `ask`,
 * so a start could not look and filed a record of its own. The search answered the same question in
 * about 0.25 s with a few kilobytes. One read still has no gap between pages.
 *
 * THE SEARCH ASKS `shape=hook` (wave 14c, AT-6): the live record can be 535 KB and almost all of it is
 * `data.detail`, which this read never looks at. The shape keeps the row's id, kind, project, title and
 * deletion stamp and only the `data` fields checked below; an older office refuses the word with a 400,
 * and `readAFullList` asks it again whole.
 *
 * EVERY PROJECT, SINCE LINE ROUND 49 (problem vya7xFG93ern, part B). A record is moved to another project when its work
 * turns out to be there, and it still names its conversation. On 6 October 2026 the search read only the project the
 * hook asked in, found none of the two live records naming the conversation, and the start filed a third. A record
 * found in another project is taken over there: the start reads and writes it in its own project.
 *
 * @returns {{ read: true, records: Array<{ id: string, kind: string, workspaceId: string, title: string, deletedAt?: string | null, data: Record<string, unknown> }> } | { read: false }}
 */
async function theLiveRecordsThatNameThisConversation() {
  const conversation = typeof input.session_id === 'string' && input.session_id !== '' ? input.session_id : null
  // NO SESSION ID, SO NOTHING CAN NAME THIS CONVERSATION. That is an answer, not a failed read.
  if (conversation === null) return { read: true, records: [] }
  const reply = await readAFullList(
    (path) => ask(path, { withStatus: true }),
    `/api/records?kind=session&projects=all&q=${encodeURIComponent(conversation)}&shape=hook`,
  )
  const rows = reply !== null && reply.status === 200 && typeof reply.body === 'object' && reply.body !== null
    ? reply.body.records
    : undefined
  // NO LIST CAME BACK: nothing answered, or what answered held no `records` array. Either way nobody
  // looked, which is not the same as nothing being there.
  if (!Array.isArray(rows)) return { read: false }
  const records = rows.filter((one) => {
    if (one === null || typeof one !== 'object' || one.deletedAt != null) return false
    const data = typeof one.data === 'object' && one.data !== null ? one.data : {}
    if (typeof data.state === 'string' && RUN_IS_OVER_STATES.includes(data.state)) return false
    const discovered = typeof data.extra?.discovered === 'object' && data.extra.discovered !== null ? data.extra.discovered : {}
    return data.providerSession === conversation || discovered.externalId === conversation
  })
  return { read: true, records }
}

/**
 * WHICH RECORD THIS START IS FOR, WORKED OUT ONCE, BEFORE ANYTHING IS WRITTEN. `start` only.
 *
 * Four answers:
 *
 *   note      the note this hook wrote earlier names a record that is still there and not over. That
 *             record.
 *   adopted   no usable note, and exactly one live record names this conversation. That record: the
 *             hook writes the note to it and records this process on it, instead of filing a new one.
 *   several   no usable note, and more than one live record names this conversation. None: the hook
 *             files nothing, writes no note, and names them all.
 *   file      no usable note, and none names it, or the records could not be read. The hook files one
 *             as it always has. `unread` says the second, so the line can say another record may exist.
 *
 * When the environment names a run, `theRunTheEnvironmentNames` answers instead: `environment`, `environment-unusable`
 * or `child`. A child's later starts answer `note` while its own record is not over.
 *
 * "NO USABLE NOTE" IS A MISSING NOTE, A NOTE WHOSE RECORD IS GONE OR DELETED, OR A NOTE WHOSE RECORD IS
 * OVER. The first two used to lead to a new record being filed, and a new record beside one that already
 * names the conversation is what a decision ends. A note whose record is gone is not evidence
 * that no other record names the conversation: somebody may have filed one after deleting the old one.
 *
 * A RECORD THAT IS OVER IS NEVER REOPENED AND NEVER WRITTEN TO HERE. The owner's section 16
 * (design/ROUND-ELEVEN-OWNER-MESSAGE.md): "SessionStart/register must create a NEW attachment." and "Do
 * not pretend an old closed attachment remained alive." A resume or a compaction after `end` closed the
 * record runs `start` again with the same session id, so this start goes the same way as a start with
 * no note: the conversation is looked up, and the one live record naming it is taken over, or a new
 * record is filed. The closed record never counts in that lookup, because the lookup takes only live
 * records. It is carried as `earlier` so the line can say which record this conversation was on.
 *
 * ON EVERY START, NOT ONLY BEHIND THE CLAUDE PROGRAM. The claude program behind the hook
 * (`processFacts.recorded`) was the condition for REOPENING a record: rewriting an old record's state
 * needed evidence that the same conversation was running again. Filing a new record claims nothing
 * about the old one. It is what `start` does whenever it has no live record to work on, and SessionStart
 * firing is itself the sign that a session is starting.
 *
 * IT IS WORKED OUT BEFORE THE START-FOLDER ANSWER, because that answer asks whether an agent is
 * already answering in another session, and a waiter holding the handle on the record taken over here
 * is answering in this one.
 */
async function theRecordThisStartIsFor() {
  if (THE_RUN_THE_ENVIRONMENT_NAMES !== null) {
    // A CHILD OF THAT RUN STARTS AGAIN ON ITS OWN RECORD, which its note names, while that record is not over.
    if (THE_CHILD_NOTE === null) return await theRunTheEnvironmentNames(null)
    const own = await recordAlreadyFiled()
    if (own !== null && !RUN_IS_OVER_STATES.includes(own.data?.state)) {
      return { how: 'note', record: own, adopted: null, earlier: null }
    }
    return await theRunTheEnvironmentNames(own)
  }
  const byNote = await recordAlreadyFiled()
  const over = byNote !== null && RUN_IS_OVER_STATES.includes(byNote.data?.state)
  if (byNote !== null && !over) return { how: 'note', record: byNote, adopted: null, earlier: null }
  const earlier = over ? byNote : null
  const naming = await theLiveRecordsThatNameThisConversation()
  if (!naming.read) return { how: 'file', record: null, adopted: null, earlier, unread: true }
  if (naming.records.length === 1) {
    return { how: 'adopted', record: naming.records[0], adopted: naming.records[0], earlier }
  }
  if (naming.records.length > 1) return { how: 'several', record: null, adopted: null, earlier, several: naming.records }
  return { how: 'file', record: null, adopted: null, earlier, unread: false }
}

/**
 * THE RUN THE ENVIRONMENT NAMES, AS THIS START'S RECORD, or why it cannot be. Problem ihekMM954ojG.
 *
 * MOLE_OFFICE_SESSION is the environment saying which run this session is, so that run is this
 * session's record, and the hook neither files another beside it nor looks for one. It is used only
 * when it is a session record that is there and not over. Otherwise the hook says which of those it
 * was, files nothing and takes nothing over: a second record for a run that already has one is what
 * a decision ended, and taking over some other record would be a guess.
 *
 * NO NOTE IS WRITTEN FOR IT. The note is how `stop` and `end` find a record to stamp and to close, and
 * the run the environment names was started by whatever set the variable, which closes it too. The next
 * start of this session, after a compaction, finds it through the environment again.
 *
 * ---------------------------------------------------------------------------------------------
 * A RUN THAT IS ANOTHER CONVERSATION'S. Problem c3p75p8aALd2, design SJUJkry2nwH_.
 * ---------------------------------------------------------------------------------------------
 *
 * A session started by hand inside another session inherits the outer one's MOLE_OFFICE_SESSION. Until 13 October
 * 2026 this took that run as the inner session's own, so the inner session stamped its process on the outer
 * session's run, wrote its usage receipt over the outer one's and recorded its compactions there. So the run is asked
 * which conversation it is (`theConversationARunNames`):
 *
 *   · none yet: this is the run's first start, and this conversation is written on it (`aFirstConversation`);
 *   · this one: the run is this session's, as before;
 *   · another, whose process recorded on the run is this session's own, found by walking up from the hook: one
 *     process has left that conversation for this one, as /clear does, and this session takes the run over. A process
 *     named only by CLAUDE_PID does not count, because a session started inside another inherits the outer one's;
 *   · another, whose recorded process no longer runs: that conversation has ended, and this session takes the run
 *     over, as before;
 *   · another, whose recorded process still runs, or of which that cannot be told: this session is that run's child.
 *     It files its own record with the run as its parent, writes "childOf" in its note, and writes nothing on the run.
 *
 * THE SIGNAL IS THE PROCESS RECORDED ON THE RUN, read by `whetherTheRecordedProcessRuns`, which the office's inspection
 * reads too. A heartbeat is no signal: a session idle in its terminal writes nothing. A process registered on the run
 * is none either: a relaunch registers on the same run, and runs register their dev servers. The tree of processes is
 * none: a background or setsid session is moved under another parent. When it cannot be told, the start is a child,
 * because a child writes nothing on another conversation's run, and a takeover would.
 *
 * @param {object | null} earlier  the child's own record, over, when its note named one
 */
async function theRunTheEnvironmentNames(earlier) {
  const run = THE_RUN_THE_ENVIRONMENT_NAMES
  const read = await ask(`/api/records/${encodeURIComponent(run)}`, { withStatus: true })
  const record = read.status === 200 ? (read.body?.record ?? null) : null
  const why =
    read.status === null
      ? `Mole Office did not answer when asked for it (${String(read.error)})`
      : read.status === 404
        ? 'no record answers to that id'
        : record === null
          ? `Mole Office answered ${String(read.status)} when asked for it`
          : record.deletedAt != null
            ? 'that record is deleted'
            : record.kind !== 'session'
              ? `that record is a ${String(record.kind)}, not a session`
              : RUN_IS_OVER_STATES.includes(record.data?.state)
                ? `that run reads ${String(record.data.state)}`
                : null
  if (why !== null) return { how: 'environment-unusable', record: null, adopted: null, earlier, why }
  // A START WITH NO CONVERSATION ID cannot tell its conversation from the run's, and writes none, as before.
  if (sessionId === 'unknown') return { how: 'environment', record, adopted: null, earlier }
  const other = theConversationARunNames(record)
  if (other === null) return { how: 'environment', record, adopted: null, earlier, aFirstConversation: true }
  if (other === sessionId) return { how: 'environment', record, adopted: null, earlier }
  const discovered = record.data?.extra?.discovered ?? null
  const pid = typeof discovered?.pid === 'number' ? discovered.pid : null
  const pidStartedAt = typeof discovered?.pidStartedAt === 'string' ? discovered.pidStartedAt : null
  if (processFacts.recorded && processFacts.foundBy === 'the walk' && pid !== null &&
      processFacts.pid === pid && processFacts.pidStartedAt === pidStartedAt) {
    const says = `its recorded process ${String(pid)} is this session's own process, which has left that conversation for this one`
    return { how: 'environment', record, adopted: null, earlier, takenOver: { conversation: other, says } }
  }
  const reading = whetherTheRecordedProcessRuns(pid, pidStartedAt)
  if (reading.runs === 'no') {
    return { how: 'environment', record, adopted: null, earlier, takenOver: { conversation: other, says: reading.says } }
  }
  return { how: 'child', record: null, adopted: null, earlier, parent: record, parentConversation: other, reading }
}

/**
 * THE CONVERSATION A RUN NAMES: its `providerSession`, else the conversation its discovery stamp names, else null.
 * Problem c3p75p8aALd2. The start asks it to tell this session's run from another conversation's, and a stop or end
 * with no note asks it before it writes a usage receipt on the run the environment names. After a compaction, the
 * hook reads the same naming fields from the small reply before it stamps the run or records the compaction.
 */
function theConversationARunNames(record) {
  const data = record?.data ?? {}
  if (typeof data.providerSession === 'string' && data.providerSession !== '') return data.providerSession
  const stamped = data.extra?.discovered?.externalId
  return typeof stamped === 'string' && stamped !== '' ? stamped : null
}

/**
 * THE PROJECT OF THE RECORD THIS SESSION'S NOTE NAMES, worked out here once for start, stop and end (problem
 * uEpCGFcsM4Z6; the refusal of check tGSC1GMzXgPv). A start that took over a held record in another project wrote that
 * project into the note, so every later start, stop and end reads and writes the record there, and not in the folder's
 * project, where the office answers 404 and a stamp or a close would be lost. A note with no project names a record in
 * the folder's project, as every note did before. The run the environment names keeps the environment's project, and a
 * child of that run reads its own record in the project its note names (`THE_CHILD_NOTE`).
 */
const THE_NOTED_PROJECT =
  THE_RUN_THE_ENVIRONMENT_NAMES === null ? (theSessionNote(sessionId)?.workspace ?? null) : (THE_CHILD_NOTE?.workspace ?? null)
if (THE_NOTED_PROJECT !== null) WORKSPACE = THE_NOTED_PROJECT

let thisStart = mode === 'start' ? await theRecordThisStartIsFor() : null
let heldOwnRecords = []

/**
 * THE PROJECT OF THE RECORD THIS START IS ON, when the note's record or the record taken over is in another project than
 * the one the start asked in (problem vya7xFG93ern, part B). Every later read and write of this start is made there, and
 * the note carries it to stop, end and the next start. `askedIn` keeps the project asked in, for the lines that say so.
 */
const itsProject = thisStart?.record?.workspaceId
if ((thisStart?.how === 'note' || thisStart?.how === 'adopted') &&
    typeof itsProject === 'string' && itsProject !== '' && itsProject !== WORKSPACE) {
  thisStart = { ...thisStart, askedIn: WORKSPACE }
  WORKSPACE = itsProject
}

/**
 * THE RECORDS THAT ARE THIS SESSION'S, as far as this hook knows before it files anything: the run the
 * environment names, the record this hook's note names, in `start` the record this start is on,
 * and held records naming this provider session or its checked running claude process. The run the environment names
 * is not this session's when this session is that run's child: it is another conversation's (problem c3p75p8aALd2).
 */
function thisSessionsOwnRecords() {
  const aChild = THE_CHILD_NOTE !== null || thisStart?.how === 'child'
  const own = [aChild ? null : THE_RUN_THE_ENVIRONMENT_NAMES, theRecordThisSessionAlreadyHas(), thisStart?.record?.id ?? null, ...heldOwnRecords]
  return [...new Set(own.filter((one) => typeof one === 'string' && one !== ''))]
}

/**
 * THE SECOND SOURCE OF THIS SESSION'S NAME: THE HANDLE A WAITER HOLDS ON THIS SESSION'S OWN RECORD.
 * Problem ihekMM954ojG.
 *
 * A session that holds its handle keeps holding it through a compaction: the waiter goes on beating the
 * hold, and the hold names the session's record. So when the environment names nobody, a hold on this
 * session's record is the session saying who it is. A hold counts while the office reads it as `fresh`
 * or `kept`; one that is released, or lapsed, names nobody.
 *
 * Asked only when the environment named nobody. Four answers, each with its own sentence or none:
 * one handle held there names that agent; more than one names nobody, because the hook does not choose;
 * none names nobody and needs no sentence; a failed read names nobody and says nobody could look.
 *
 * @returns {Promise<{ names: string | null, read: boolean, records: string[], line: string | null, record?: object | null }>}
 */
/**
 * THE HOLDS ON THESE SESSION RECORDS, and no others.
 *
 * The hook used to read every hold and then keep the three it wanted. At the live size that was
 * about 840 KB a call and 57 calls an hour. It now names the records it is asking about and keeps
 * only the three fields it reads. An office of an older version refuses the words with a 400, and
 * the whole list is read once in their place, then filtered here, exactly as before.
 */
async function theHoldsOn(sessions, askWhenEmpty = false) {
  const ids = [...new Set(sessions.filter((id) => typeof id === 'string' && id !== ''))]
  if (ids.length === 0 && !askWhenEmpty) return []
  // A START WITH NO CANDIDATE still reads the handle door, as it always did, so an office that
  // cannot answer is named instead of silently looking like no waiter. The id is one no real
  // session can have, and the answer is empty; the door is asked, and nothing large comes back.
  const asked = ids.length === 0 ? ['mole-office-no-session'] : ids
  const narrow = `/api/handles?session=${encodeURIComponent(asked.join(','))}&state=fresh,kept&shape=hold`
  let reply = await ask(narrow, { withStatus: true })
  if (reply !== null && reply.status === 400) reply = await ask('/api/handles', { withStatus: true })
  if (reply === null || reply.status !== 200) return null
  const holds = reply.body?.holds
  if (!Array.isArray(holds)) return null
  return holds.filter((one) => one !== null && typeof one === 'object' &&
    (one.state === 'fresh' || one.state === 'kept') && typeof one.session === 'string')
}

async function theHeldAgent() {
  // THE SEARCH COMES FIRST, and the handles read names only what it found. Holds are
  // installation-wide, and a note may name a record in another project, so the held records are
  // found by two narrow searches across projects. Measured on the live office on 3 October 2026:
  // listing every session record answered 29.5 MB (6,907 rows), and one held record read by id up
  // to 12.8 MB, while each search answered in about 0.25 s with a few kilobytes. A search only
  // narrows; the checks after it decide.
  const known = thisSessionsOwnRecords()
  const searchFor = async (words) => {
    const answer = await readAFullList(
      (path) => ask(path, { withStatus: true }),
      `/api/records?kind=session&projects=all&q=${encodeURIComponent(words)}&shape=hook`,
    )
    return answer !== null && answer.status === 200 ? answer.body : null
  }
  const found = await Promise.all([
    // input.session_id is a non-empty string here: the hook stops at the top without one.
    searchFor(input.session_id),
    // The waiter writes extra.discovered.pid and pidStartedAt on the record it holds
    // (src/server/lib/held-process.ts). The search reads strings, not numbers, so it looks
    // for the start time; the pid and the start time are both checked below.
    processFacts.recorded && typeof processFacts.pidStartedAt === 'string' ? searchFor(processFacts.pidStartedAt) : null,
  ])
  const rows = found.flatMap((one) => (Array.isArray(one?.records) ? one.records : []))
  const possible = rows.filter((one) =>
    one !== null && typeof one === 'object' && one.kind === 'session' && one.deletedAt == null &&
    !RUN_IS_OVER_STATES.includes(one.data?.state),
  )
  const candidateIds = [...new Set([...known, ...possible.map((one) => one.id)])]
  const liveHolds = await theHoldsOn(candidateIds, true)
  if (liveHolds === null) {
    return {
      names: null,
      read: false,
      records: known,
      line: failedEndpoint('/api/handles', 'Mole Office did not answer which handles are held, so whether a waiter holds one for this session was not read.'),
    }
  }
  let records = known
  const candidates = [...new Map(possible.filter((one) => liveHolds.some((hold) => hold.session === one.id))
    .map((one) => [one.id, one])).values()]
  const namesThisConversation = (one) => one.data?.providerSession === input.session_id
  const namesThisProcess = (one) => processFacts.recorded &&
    one.data?.extra?.discovered?.pid === processFacts.pid &&
    one.data?.extra?.discovered?.pidStartedAt === processFacts.pidStartedAt
  const matches = candidates.filter((one) => namesThisConversation(one) || namesThisProcess(one))
  heldOwnRecords = matches.map((one) => one.id)
  records = thisSessionsOwnRecords()
  const held = liveHolds.filter(
    (one) => one !== null && typeof one === 'object' && (one.state === 'fresh' || one.state === 'kept') && records.includes(one.session),
  )
  const handles = [...new Set(held.map((one) => String(one.handle ?? '')).filter((one) => one !== ''))]
  if (handles.length === 1) {
    const on = held.find((one) => String(one.handle) === handles[0])
    return {
      names: handles[0],
      read: true,
      records,
      record: candidates.find((one) => one.id === on?.session) ?? (thisStart?.record?.id === on?.session ? thisStart.record : null),
      line: `The environment names no agent, so "${handles[0]}" is named by the handle its waiter holds on this session's record ${String(on?.session)}.` +
        (matches.some((one) => one.id === on?.session)
          ? (namesThisConversation(matches.find((one) => one.id === on?.session))
            ? ` That record names this conversation in data.providerSession (${sessionId}).`
            : ` That record names this session's running claude program (pid ${String(processFacts.pid)}, started ${String(processFacts.pidStartedAt)}).`)
          : ''),
    }
  }
  if (handles.length > 1) {
    return {
      names: null,
      read: true,
      records,
      line:
        `${String(handles.length)} handles are held on this session's records (${records.join(', ')}): ${handles.join(', ')}. ` +
        'The hook does not choose between them.',
    }
  }
  return { names: null, read: true, records, line: null }
}

const heldNote = AGENT === null ? await theHeldAgent() : null
if (heldNote !== null && heldNote.names !== null) {
  AGENT = heldNote.names
  ACTOR = heldNote.names
  if (mode === 'start' && heldNote.record !== null && heldNote.record !== undefined &&
      thisStart?.how !== 'environment' && thisStart?.how !== 'environment-unusable' && thisStart?.how !== 'child') {
    const heldRecord = heldNote.record
    if (thisStart?.record?.id !== heldRecord.id) {
      // THE RECORD THIS START WAS ON BEFORE, when it had one. When it names this conversation it is this session's own
      // record filed a second time, so the note names it as superseded and the first stop or end closes it
      // (`closeTheRecordItSupersedes`, which asks again first). A record that does not name this conversation is left.
      const before = thisStart?.record ?? null
      thisStart = {
        ...thisStart,
        how: 'held',
        record: heldRecord,
        replaced: before === null ? null : {
          id: before.id,
          workspace: typeof before.workspaceId === 'string' && before.workspaceId !== '' ? before.workspaceId : WORKSPACE,
          namesThisConversation:
            before.data?.providerSession === sessionId || before.data?.extra?.discovered?.externalId === sessionId,
        },
      }
    }
    // The hold's project governs every later read and write in this start, even when the folder or the old note
    // suggested another, and the note carries it to stop, end and the next start (`THE_NOTED_PROJECT`).
    if (typeof heldRecord.workspaceId === 'string' && heldRecord.workspaceId !== '') WORKSPACE = heldRecord.workspaceId
  }
}

/** THE THIRD SOURCE: A `.env`, read only when the environment and a hold named nobody. */
const namedByAnEnvFile = AGENT === null ? theAgentAnEnvFileNames(startDirectory ?? undefined) : null
if (namedByAnEnvFile !== null) {
  AGENT = namedByAnEnvFile
  ACTOR = namedByAnEnvFile
}

/**
 * THE FOURTH SOURCE OF THIS SESSION'S NAME, READ ONCE, FOR EVERY MODE.
 *
 * The same answer in start, stop and end: all three write to a record, and a session filed under one
 * name and patched under another would be two agents' work on one run. It is asked only when neither
 * the environment, nor a hold, nor a `.env` named an agent, and only when this session said which
 * directory it started in — a folder nobody named cannot be matched to one.
 */
const startFolderNote = AGENT === null && startDirectory !== null ? theStartFolderAnswer() : null
if (startFolderNote !== null && startFolderNote.names !== null) {
  AGENT = startFolderNote.names
  ACTOR = startFolderNote.names
}

/**
 * THE CONVERSATION'S USAGE SO FAR, WRITTEN AS ITS RUN'S RECEIPT AT A STOP AND AT THE END (milestone M8, report 4IoRUKizcZXb;
 * an ask for the secretaries). A secretary's session has no envelope at an end, so its receipt is the running
 * total of its own transcript, read by src/config/usage.mjs and written over the last one at each stop: a total,
 * never added onto what is stored. The transcript gives no cost, so the cost stays absent ("not reported"). Which
 * login paid and where it ran are written beside it, and outside spending already on the receipt is kept.
 *
 * AT A STOP, AT MOST ONCE IN TEN MINUTES; AT THE END, ALWAYS (a review, message DLqviJ8nr3yH). A stop fires after
 * every reply, and a long conversation's transcript takes seconds and a gigabyte to read. So the run is read first, and
 * a stop that finds a receipt read in the last ten minutes (aReceiptReadLately, src/config/usage.mjs) reads no
 * transcript and writes nothing. The receipt says when it was read, in `readAt`.
 *
 * IT NEVER STOPS THE SESSION. A receipt that cannot be read or written is said in one sentence on stderr.
 */
async function theUsageSoFarIsWritten(id, { fromItsFiling = false } = {}) {
  const logPath = typeof input.transcript_path === 'string' && input.transcript_path !== '' ? input.transcript_path : null
  if (logPath === null) return
  // THE STORED RECEIPT IS READ FIRST, so outside spending written on it is kept; with no read, nothing is written over it.
  const before = await ask(`/api/records/${id}`)
  if (before?.record === undefined || before?.record === null) {
    process.stderr.write(`session-hook: this session's usage receipt was not written, because run ${id} could not be read first.\n`)
    return
  }
  const stored = before.record.data?.usageReceipt
  const readAt = new Date()
  if (mode === 'stop' && aReceiptReadLately(stored, readAt.getTime())) return
  let text
  try {
    text = readFileSync(logPath, 'utf8')
  } catch (error) {
    process.stderr.write(`session-hook: this session's usage receipt was not written, because its transcript ${logPath} could not be read (${error instanceof Error ? error.message : String(error)}).\n`)
    return
  }
  // A RUN THE ENVIRONMENT NAMED counts only what its transcript says from its filing on, since the conversation may
  // have begun before it (as tools/usage-so-far.mjs counts). A filing time that is no stamp leaves no receipt written.
  const sinceMs = fromItsFiling ? theMomentOfALocalStamp(before.record.createdAt) : -Infinity
  if (sinceMs === null) {
    process.stderr.write(`session-hook: this session's usage receipt was not written, because run ${id}'s filing time is not a stamp.\n`)
    return
  }
  const usageReceipt = keepingTheOutsideSpend(stored, {
    ...claudeTranscriptUsage([text], sinceMs),
    paidBy: theLoginThatPaid(process.env),
    ranIn: whereItRan(process.env),
    readAt: localStampOf(readAt),
  })
  const wrote = await ask(`/api/records/${id}`, { method: 'PATCH', withStatus: true, body: JSON.stringify({ dataPatch: { usageReceipt } }) })
  if (wrote.status !== 200) {
    process.stderr.write(`session-hook: this session's usage receipt was not written on run ${id} (${wrote.status === null ? `no answer: ${String(wrote.error)}` : `answered ${String(wrote.status)}`}).\n`)
  }
}

/**
 * THE RECORD THE NOTE NAMES, FOLLOWED TO THE PROJECT IT WAS MOVED TO DURING THE SESSION (round 50, item 3). A stop and an
 * end ask in the note's project. Round 49 made the start follow a record moved since the note was written
 * (`recordAlreadyFiled`), but a record moved during the session was answered 404 at every stop and at the end, so its
 * stamp, its usage receipt and its close were lost until the next start. The 404 names the project the record is in, so
 * the stop or end reads and writes it there, and writes that project into the note for every later stop, end and start.
 * A null `supersedesWorkspace` meant the project asked in, so that is written down too, before the note's project changes.
 */
async function followTheNotedRecordIfItMoved(id) {
  const read = await ask(`/api/records/${id}`, { withStatus: true })
  const elsewhere = read.status === 404 ? read.body?.elsewhere?.workspaceId : undefined
  if (typeof elsewhere !== 'string' || elsewhere === '' || elsewhere === WORKSPACE) return
  const askedIn = WORKSPACE
  WORKSPACE = elsewhere
  const note = theSessionNote(sessionId)
  if (note === null || note.id !== id) return
  writeTheSessionNote(sessionId, id, note.at ?? `${stamp} ${clock}`, note.supersedes, {
    workspace: elsewhere,
    supersedesWorkspace: note.supersedesWorkspace ?? askedIn,
    supersededBecause: note.supersededBecause,
    childOf: note.childOf,
    ...theWaitersKeyFileAndOffice(note),
  })
}

if (mode === 'stop' || mode === 'end') {
  // THE LAST TWO CHANCES TO WRITE THE DISCOVERY STAMP. A fresh conversation has no transcript at
  // SessionStart, so the file the stamp names does not exist yet and the stamp is not written
  // then. `stop` fires when the agent finishes a turn, which is the first moment it does exist;
  // `end` fires when the session ends. Neither writes anything the other already wrote —
  // `stampTheRecord` reads the record first and leaves a stamped one alone.
  //
  // `end` also marks the record finished, so a run that ended cleanly does not sit in the list
  // looking alive. A session that crashes never reaches this, which is correct: it is not
  // finished, and the sweep that finds runs on disk will report it as it really is.
  //
  // THE RECORD IS THE ONE THE NOTE NAMES, read by the note's one reader (src/config/the-session-note.mjs). A
  // registration may have pointed the note at the record it gave this conversation since `start` wrote it
  // (tools/register-myself.mjs; problem Tv32CoCfV-cP), and that record is then the one stamped, and the start's
  // own record it replaced is closed (`closeTheRecordItSupersedes`).
  const id = theRecordTheNoteNames(sessionId)
  if (id === null) {
    // A RUN THE ENVIRONMENT NAMES, with no note (MOLE_OFFICE_SESSION), under a decision of wave 13s round 34: an office
    // terminal's agent, for one. Whatever set the variable closes it, so its usage receipt is
    // written here, and only while the run is not over, since a run's own seal carries its receipt and nothing is
    // written after it. NOR ON A RUN THAT NAMES ANOTHER CONVERSATION (problem c3p75p8aALd2): this session's receipt
    // would be written over that conversation's own.
    //
    // ITS STAMP TOO, ONCE, WHILE IT HAS NONE (wave 13u round 109). The office files the run before the program starts,
    // and a fresh conversation has no transcript at its start, so the start writes no stamp, and nothing else wrote one
    // until a compaction: the profile had no command to resume it. So the first stop or end that finds the run live,
    // naming this conversation and with no stamp, stamps it from the record it has just read. A stop fires after every
    // reply, so a run already stamped costs no call beyond the ones the receipt makes.
    if (THE_RUN_THE_ENVIRONMENT_NAMES !== null) {
      try {
        const read = await ask(`/api/records/${encodeURIComponent(THE_RUN_THE_ENVIRONMENT_NAMES)}`, { withStatus: true })
        const named = read.status === 200 ? read.body?.record ?? null : null
        const other = named === null ? null : theConversationARunNames(named)
        if (named === null) process.stderr.write(`session-hook: the usage receipt of run ${THE_RUN_THE_ENVIRONMENT_NAMES} was not written, because the office did not answer with its record (${read.status === null ? 'no reply' : `status ${String(read.status)}`}: ${String(read.error ?? read.body?.error ?? 'no record in the reply').slice(0, 300)}).\n`)
        else if (other !== null && other !== sessionId) {
          process.stderr.write(`session-hook: the usage receipt of run ${THE_RUN_THE_ENVIRONMENT_NAMES} was not written, because that run names another conversation (${other}), not this one (${sessionId}).\n`)
        } else if (named.kind === 'session' && !RUN_IS_OVER_STATES.includes(named.data?.state)) {
          const discovered = named.data?.extra?.discovered
          if (other === sessionId && (typeof discovered !== 'object' || discovered === null)) {
            const stampedNow = await stampTheRecord(THE_RUN_THE_ENVIRONMENT_NAMES, false, named)
            if (stampedNow === 'refused') process.stderr.write(`session-hook: run ${THE_RUN_THE_ENVIRONMENT_NAMES} was not stamped, because the office refused the write.\n`)
            else if (stampedNow === 'stamped' && resumeCommandLeftOut !== null) {
              process.stderr.write(`session-hook: run ${THE_RUN_THE_ENVIRONMENT_NAMES} was stamped without the command that resumes it, because ${resumeCommandLeftOut}.\n`)
            }
          }
          await theUsageSoFarIsWritten(THE_RUN_THE_ENVIRONMENT_NAMES, { fromItsFiling: true })
        }
      } catch (error) {
        process.stderr.write(`session-hook: the usage receipt of run ${THE_RUN_THE_ENVIRONMENT_NAMES} was not written, because its record could not be read (${error instanceof Error ? error.message : String(error)}).\n`)
      }
    }
    process.exit(0)
  }
  try {
    await followTheNotedRecordIfItMoved(id)
    await stampTheRecord(id)
    await closeTheRecordItSupersedes(id)
    await theUsageSoFarIsWritten(id)
    if (mode === 'end') {
      // WHAT THIS SESSION STOPPED FOR, WRITTEN ONTO ITS RUN RECORD. Criterion M94: a run that
      // stopped for a reason the person must act on — a session limit, a quota, a login gone —
      // must reach them, and the office has no way of its own to learn it, so the end of the
      // session writes it down here. The words come from the transcript's own last lines (never
      // from this file's guess) and Claude Code's SessionEnd `reason` is kept verbatim in
      // `detail`; the cause makes the state `crashed`, and a clean end makes it `finished`.
      //
      // AN ALREADY-RECORDED CAUSE IS NEVER OVERWRITTEN. The office's sweep can have read this
      // run's transcript and closed it as crashed before the session reaches here (a session
      // stopped by a limit can be resumed and end cleanly later). Writing over that cause would
      // lose the only record of why it stopped, so a record that already says why is left alone.
      const record = (await ask(`/api/records/${id}`))?.record ?? null
      const alreadySaysWhy =
        record !== null && typeof record.data?.closedBecause === 'string' && record.data.closedBecause !== ''
      if (!alreadySaysWhy) {
        const logPath =
          typeof input.transcript_path === 'string' && input.transcript_path !== '' ? input.transcript_path : null
        const cause = theStopCauseInTheTranscript(logPath)
        const patch = thePatchThatClosesARun(
          cause,
          new Date(),
          typeof input.reason === 'string' ? input.reason : null,
        )
        await ask(`/api/records/${id}`, { method: 'PATCH', body: JSON.stringify({ dataPatch: patch }) })
      }
    }
  } catch {
    // Nothing to report to anybody: nobody is reading this hook's output at either moment.
  }
  process.exit(0)
}

// ------------------------------------------------------------------ start: file it, then brief

const PLACEHOLDER = 'a session that has not said what it is for yet'

/**
 * The record this session already has, or null.
 *
 * A compaction and a resume both run SessionStart again, with the SAME session id. Without this
 * check the second run files a second record for one session, and leaves the first one saying
 * "running" for ever. That happened on the first real firing of this hook, on 13 August 2026: it
 * fired on a compaction, tried to file again, and was refused.
 *
 * A record somebody has deleted does not count. The session then files a fresh one.
 *
 * A RECORD MOVED TO ANOTHER PROJECT SINCE THE NOTE WAS WRITTEN IS FOLLOWED THERE (problem vya7xFG93ern, part B). The
 * office answers 404 and names the project the record is in, as `closeTheRecordItSupersedes` reads it. On 6 October 2026
 * the start took that 404 for "no record" and filed a new one beside the record it had.
 */
async function recordAlreadyFiled() {
  // THE ID COMES FROM THE ONE READER OF THE NOTE, `theRecordThisSessionAlreadyHas` above, so this
  // function and the start-folder answer cannot disagree about which record is this session's.
  const id = theRecordThisSessionAlreadyHas()
  if (id === null) return null
  let read = await ask(`/api/records/${id}`, { withStatus: true })
  const elsewhere = read.status === 404 ? read.body?.elsewhere?.workspaceId : undefined
  if (typeof elsewhere === 'string' && elsewhere !== '') {
    read = await ask(`/api/records/${id}`, { withStatus: true, headers: { 'x-mole-office-workspace': elsewhere } })
  }
  const record = read.status === 200 ? (read.body?.record ?? null) : null
  return record === null || record.deletedAt != null ? null : record
}

/**
 * File the record.
 *
 * THE TITLE CARRIES THE CLOCK TIME SO A PERSON CAN TELL ONE RUN FROM ANOTHER. A person runs several
 * sessions in a day and every one of them is filed with the same placeholder words, so a title fixed
 * to the date would put the same name on all of them and the session list would be unreadable.
 *
 * IT USED TO BE A REFUSAL RATHER THAN A READING PROBLEM, and that is worth saying because the retry
 * below was built for it. Titles were unique across a project until 17 August 2026, so the second
 * session of a day was refused outright — which is what the first real firing of this hook hit.
 * `drizzle/0030_titles_may_repeat` ended that: a repeated title is now stored and the reply says
 * what else is called the same thing.
 *
 * SO THE RETRY BELOW NO LONGER HAS THE FAILURE IT WAS WRITTEN FOR. It fires when a create comes back
 * without a record id, and a repeated title cannot produce that any more. It is kept because it also
 * covers any other refusal the create can meet, and because a hook that files nothing leaves an
 * agent with no record at all — but it is a last resort now, not the ordinary second path.
 */
const stampAtStart = withProcessFacts(discoveryStamp())

async function fileRecord() {
  const body = (title) =>
    JSON.stringify({
      kind: 'session',
      title,
      data: {
        state: 'running',
        runtime: 'claude-code',
        doing: 'Nobody has described this run yet. The agent should replace this title and this line as soon as it knows what it is doing.',
        workspace: WORKSPACE,
        // WHICH CONVERSATION THIS RUN IS, WHERE IT IS RUNNING, AND WHERE A PERSON COULD WATCH.
        // Each key is left out when this run does not know it — an absent key is an honest answer
        // and a made-up one is not.
        ...attachmentFacts(),
        // A CHILD OF THE RUN THE ENVIRONMENT NAMES says which run it is the child of (problem c3p75p8aALd2).
        ...(thisStart?.how === 'child' ? { parentAttachment: thisStart.parent.id } : {}),
        // Only when the transcript has been OBSERVED TO EXIST. On a fresh conversation it will not
        // have been, and the `stop` and `end` runs are what complete it. Nothing here backfills any
        // other record: this stamps the run that is happening now, and nothing else.
        ...(stampAtStart === null ? {} : { extra: { discovered: stampAtStart } }),
      },
    })
  const plain = `${stamp} ${clock} — ${PLACEHOLDER}`
  const first = await ask('/api/records', { method: 'POST', withStatus: true, body: body(plain) })
  if (first.body?.record?.id !== undefined || first.body === null) return first.body
  return await ask('/api/records', { method: 'POST', body: body(`${plain} (${sessionId.slice(0, 8)})`) })
}

/**
 * WHICH PROJECT A NEW RECORD IS FILED IN (problem vya7xFG93ern, part A; ruling T2Vy7Dt9_bil). The first of:
 *
 *   environment   the project the session's own environment names (MOLE_OFFICE_WORKSPACE);
 *   env-file      the project the `.env` the session reads names (`theEnvFileASessionReads`);
 *   folder        the project the office matched the start folder to (the onboarding read above);
 *   the-hooks-own the project the hook asks in when nothing names one. `whereItWasFiled` names it, for now, and says
 *                 how to move the record.
 *
 * It was always the hook's own project, which is the hook's environment and its own checkout's `.env`, so a session
 * started in another project's folder was filed outside it. A `.env` still comes before the folder: which of the two
 * should win is the owner's question, and it is left open. Asked only when this start files a record and its note names
 * no project. A note's project, a hold's and the project of a record taken over are where this conversation's record
 * already is.
 */
function theProjectANewRecordGoesIn() {
  const fromEnvironment = theProjectTheEnvironmentNames()
  if (fromEnvironment !== null) return { id: fromEnvironment, because: 'environment' }
  const envFile = theEnvFileASessionReads(startDirectory ?? undefined)
  const fromEnvFile = theProjectAnEnvFileNames(startDirectory ?? undefined)
  if (fromEnvFile !== null) return { id: fromEnvFile, because: 'env-file', envFile }
  const folder = onboarding?.error === undefined ? onboarding?.project : undefined
  if (folder?.kind === 'matched' && typeof folder.id === 'string' && folder.id !== '') return { id: folder.id, because: 'folder' }
  return { id: WORKSPACE, because: 'the-hooks-own' }
}
const filedIn = thisStart?.how === 'file' && THE_NOTED_PROJECT === null ? theProjectANewRecordGoesIn() : null
if (filedIn !== null) WORKSPACE = filedIn.id

// A CHILD IS FILED IN ITS PARENT'S PROJECT, because a run's children are looked for in its own project.
const itsParentsProject = thisStart?.how === 'child' ? thisStart.parent.workspaceId : undefined
if (typeof itsParentsProject === 'string' && itsParentsProject !== '') WORKSPACE = itsParentsProject

const existing = thisStart?.record ?? null
const filed = thisStart?.how === 'file' || thisStart?.how === 'child' ? await fileRecord() : null
const record = existing ?? filed?.record ?? null
const id = record?.id ?? null

// THIS CONVERSATION IS WRITTEN ON THE RUN THE ENVIRONMENT NAMES when the run named none yet, and when this start took it
// over from a conversation that has ended or that this session's own process has left (`theRunTheEnvironmentNames`).
// Written here, once AGENT is final, so the write goes under the name every other write of this start goes under.
const theConversationWritten =
  thisStart?.how === 'environment' && id !== null && (thisStart.aFirstConversation === true || thisStart.takenOver !== undefined)
    ? await ask(`/api/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        withStatus: true,
        body: JSON.stringify({ dataPatch: { providerSession: sessionId } }),
      })
    : null

// THE NOTE IS WRITTEN FOR A RECORD THIS START FILED AND FOR ONE IT TOOK OVER. Without it `end` finds no
// note and never closes the record, and the next `start` looks the conversation up again. It is not
// written for the run the environment names: see `theRunTheEnvironmentNames`.
if (id !== null && thisStart?.how !== 'note' && thisStart?.how !== 'environment') {
  // WITH THE PROJECT THE RECORD IS IN, so stop, end and the next start find it there (`THE_NOTED_PROJECT`), and, after a
  // takeover, the record it supersedes when that one names this conversation. A child's note names the run it is the
  // child of, so that every later start, stop and end reads the child's own record (`THE_CHILD_NOTE`).
  //
  // THE KEY FILE THE NOTE NAMES IS CARRIED, WITH THE OFFICE ITS WAITER HELD, whichever record the note names now: both
  // are the waiter's, given for this conversation, and not the record's.
  const superseded = thisStart?.how === 'held' && thisStart.replaced?.namesThisConversation === true ? thisStart.replaced : null
  writeTheSessionNote(sessionId, id, `${stamp} ${clock}`, superseded?.id ?? null, {
    workspace: WORKSPACE,
    supersedesWorkspace: superseded?.workspace ?? null,
    supersededBecause: superseded === null ? null : 'held',
    childOf: thisStart?.how === 'child' ? thisStart.parent.id : null,
    ...theWaitersKeyFileAndOffice(theSessionNote(sessionId)),
  })
}
// A NOTE WHOSE RECORD WAS FOUND IN ANOTHER PROJECT is written again with that project, and with the rest of what it said.
// A note that named no project for the record it supersedes named one in the project this start asked in.
if (id !== null && thisStart?.how === 'note' && thisStart.askedIn !== undefined) {
  const before = theSessionNote(sessionId)
  writeTheSessionNote(sessionId, id, before?.at ?? `${stamp} ${clock}`, before?.supersedes ?? null, {
    workspace: WORKSPACE,
    supersedesWorkspace: before?.supersedesWorkspace ?? thisStart.askedIn,
    supersededBecause: before?.supersededBecause ?? null,
    childOf: before?.childOf ?? null,
    ...theWaitersKeyFileAndOffice(before),
  })
}

// A COMPACTION AND A RESUME RUN SessionStart AGAIN ON A RECORD THAT IS ALREADY FILED AND OPEN, and by then
// the transcript certainly exists. So the already-filed path gets the stamp too. It is the same
// writer, it leaves a stamped record alone, and it is how the records filed before this existed
// get one — by being run again, which is an observation, and never by a backfill. A record taken
// over is stamped by this writer too, which is how this process is recorded on it. When the start took the environment's
// run over from another conversation, the writer replaces that conversation's whole stamp with this one's.
const stamped =
  id === null
    ? 'no-record'
    : existing !== null
      ? await stampTheRecord(id, thisStart?.takenOver !== undefined)
      : stampAtStart === null
        ? 'not-observed-yet'
        : 'stamped-at-create'

// What a cold agent needs before it does anything: what is being worked on, what only a person can
// settle, and what is still running on this machine.
//
// THE BRIEF, THE WAITING LIST AND THE OPEN LOOPS COME IN ONE READ, GET /api/where-you-stand (wave 13n's
// round 39). They were three reads, and each worked the open loops out for itself. At a load near 20 the
// three took 0.9 to 3.3 s each even alone, and they share the office's one thread, so behind one another
// the last of the seven reads arrived after 3.9 to 8.1 s, and a compaction at 07:16 on 5 October was told
// that none of them answered. The office keeps the last answer it gave this session, and when it is busy it
// answers with that at once and says how old it is (src/server/api/where-you-stand.ts).
// It is sent LAST, and only once the four small reads have answered or given up: when nothing is kept
// yet it is the slow one, so the four are answered before it holds the office's one thread, and the
// order is fixed by this code rather than by which request reaches the office first. The handles
// read waits for the running-session answer because it can only name the session ids that answer
// gave. Criterion I2: Claude Code's mechanism for
// getting the state of a project into a run is this hook, because it is the one tool here that reads
// its rules from a source file in the checkout rather than from a file written per run.
// One 3-second handleNote read remains below; allow 500 ms for printing and exit.
// The one read gets the elapsed budget when it is sent, bounded to 3–7 seconds. ask's overall deadline
// also bounds earlier slow filing, so even a read that never answers cannot overrun.
const runningSessions = ask('/api/sessions?only=running')
const [orphans, sessions, handles, resources] = await Promise.all([
  ask('/api/resources/orphans'),
  // ONLY THE RUNNING ROWS (wave 13n's round 35, BuHUg7uEz6WP): howManyRunsAreReallyAlive keeps only rows in state
  // "running", and ?only=running answers exactly those (isRunning in src/server/api/sessions.ts). The whole list, every run
  // the office has, was about 6,500 rows and 8.5 MB on a copy the size of the live office, and under load it arrived after
  // this read's 3 seconds.
  runningSessions,
  // WHAT STANDS BEHIND A RUN THAT SAYS IT IS RUNNING. A session record's state word is whatever
  // its agent last wrote, and an agent that died wrote nothing. These two are what Mole Office knows
  // about the machine: a registered process it has just looked for, and a handle a session is
  // still beating. See `howManyRunsAreReallyAlive` below. The handles read names only the running
  // record ids, so it is one small answer instead of every hold in the installation. It alone waits
  // for the sessions read; the other two start alongside it.
  runningSessions.then((reply) => theHoldsOn((reply?.sessions ?? [])
    .filter((row) => row?.state === 'running' && typeof row.recordId === 'string')
    .map((row) => row.recordId))),
  ask('/api/resources'),
])
const standing = await ask('/api/where-you-stand', { withStatus: true, timeLimitMs: Math.round(Math.max(hookMs(3000), Math.min(hookMs(7000),
  HOOK_BUDGET_MS - (performance.now() - hookStartedAt) - AFTER_READS_MARGIN_MS,
))) })

/**
 * THE THREE PARTS OF WHERE THIS SESSION STANDS, or why there are none.
 *
 * A READ THAT DID NOT HAPPEN IS NEVER AN EMPTY ANSWER (invariant 5). When the one read missed, each of
 * the three lines below says its part was not read, and names the door that answers that part alone;
 * `missed` is what the one read answered, and null when it arrived.
 */
const stood =
  standing.status === 200 && standing.body !== null && typeof standing.body === 'object' &&
  typeof standing.body.waiting === 'object' && standing.body.waiting !== null
    ? standing.body
    : null
const missed =
  stood !== null
    ? null
    : standing.status !== null && standing.status !== 200
      ? `${String(standing.status)}${typeof standing.body?.error === 'string' ? ` (${standing.body.error})` : ''}`
      : (standing.error ?? 'a reply that was not where this session stands')
const brief = stood !== null ? stood.brief : missed === null ? null : { error: `GET /api/where-you-stand, which carries it, answered ${missed}.` }
const open = stood?.openLoops ?? null

/**
 * HOW OLD WHAT FOLLOWS IS, when the office answered with what it kept. Nothing told to a session may be
 * older than it says: the sentence is the office's own, built where the answer was kept.
 */
function keptLines(stood) {
  const worked = stood?.workedOut
  if (worked?.kept !== true) return []
  return ['', typeof worked.says === 'string' ? worked.says : `This was worked out at ${String(worked.at)} and kept from then.`]
}

/**
 * Whether this session can reach the Mole Office skill, and what to say about it.
 *
 * Three answers, not two. The directory a session started in is read from the hook's own input;
 * when that is not there, nothing is claimed either way, because "the skill is missing" and
 * "nobody could check" send an agent to different places. See the header for why the link exists.
 *
 * This is worked out before the server is consulted, and it is said even when the server is down,
 * because whether the skill is linked has nothing to do with whether Mole Office is answering. An agent
 * that meets both faults at once is the one that most needs to be told about the second.
 */
// "NOT ANSWERING" ONLY WHEN NOTHING ANSWERED (a condition, message xc233fjcrLe2). The one read is the
// slowest, and under load it can miss while the four small reads are answered. Saying the office is down then
// would be false; the three lines below say which read missed instead.
const nothingAnswered = requestsTried > 0 && repliesReceived === 0
if (id === null && nothingAnswered && thisStart?.how !== 'several') {
  printHookOutput(
    [
      ...ownerLines,
      `Mole Office is not answering on ${API}, so this session is not on the record. Nothing else changes.`,
      ...(skill === null ? [] : ['', skill]),
      '',
      ...hereLines(),
    ],
  )
  process.exit(0)
}

/**
 * THE LINE ABOUT WHAT IS WAITING ON A PERSON, from GET /api/waiting's three counts, which
 * GET /api/where-you-stand carries.
 *
 * A READ THAT DID NOT HAPPEN IS NEVER A ZERO. A read that missed, or a reply without the three
 * counts, says it could not read, says what the read answered, and gives no count (invariant 5).
 */
function waitingLine(waiting, missed) {
  const counts = waiting?.counts
  const readable =
    typeof counts?.settle === 'number' &&
    typeof counts?.asked === 'number' &&
    typeof counts?.setAside === 'number'
  if (!readable) {
    return (
      failedEndpoint('/api/where-you-stand', 'Could not read what is waiting on a person: GET /api/where-you-stand, which carries it, answered ' +
      `${missed ?? 'without its three counts'}. GET /api/waiting answers it alone.`)
    )
  }
  if (counts.settle === 0 && counts.asked === 0 && counts.setAside === 0) {
    return 'Nothing is waiting on a person right now: GET /api/waiting lists nothing for a person to settle, nothing asked of a person and nothing set aside.'
  }
  return (
    `Waiting on a person (GET /api/waiting): ${counts.settle} to settle, ${counts.asked} asked of a person, ` +
    `${counts.setAside} set aside. These are the person's to answer; you may not settle them.`
  )
}
const unclaimed = orphans?.orphans?.length ?? orphans?.rows?.length ?? 0
/**
 * HOW MANY OTHER AGENT RUNS ARE REALLY ALIVE, AND HOW MANY ROWS ONLY SAY SO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * This line counted every session row whose stored state word was `running` and printed the number
 * as runs that are alive. A session record's state word is whatever its agent last wrote, and an
 * agent that crashed or was killed wrote nothing, so the word stays `running` for ever. On
 * 2 September 2026 the line said "7 other agent runs are alive" on a machine running one: six of
 * the seven were hand-filed records last active between 10 and 29 August, and the seventh was this
 * hook's own record, filed a few lines above and read back as somebody else. Problem `1Tn4k2vPx-Sm`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS ALIVE NOW
 * ---------------------------------------------------------------------------------------
 *
 * Something Mole Office can point at has to stand behind the row. There are two such things and both
 * are already served:
 *
 *   · a resource row naming that session, not released, whose process Mole Office has just looked for
 *     and found — `GET /api/resources`, `liveness.state`;
 *   · a handle hold naming that session that is still fresh — `GET /api/handles`, `state`, which is
 *     `fresh` only while the session keeps beating it.
 *
 * A row with neither is not called alive and is not called dead either. It is reported as what it
 * is: a row that says running with nothing behind it.
 *
 * A ROW MOLE OFFICE COULD NOT CHECK IS ITS OWN ANSWER. A resource row whose liveness reads `unknown`
 * means nobody could look, which is not the same as nothing being there, so it is counted apart and
 * said in its own sentence. Invariant 5 of USER.md.
 *
 * THIS RUN'S OWN RECORD IS NEVER COUNTED. The hook files it a few lines above and reads the session
 * list here, so without this it is one of the "other" runs.
 *
 * A READ THAT DID NOT ANSWER IS NOT AN EMPTY ONE. When GET /api/resources or GET /api/handles failed,
 * a row the other read shows nothing behind may have something the failed one would have shown, so it
 * is counted with the rows that could not be checked, and `unread` names the read that failed. It used
 * to be read as an empty list: at 00:54 on 11 October 2026 both reads ran out of time on the live office,
 * and the hook still said "44 rows say running with nothing behind them" (wave 13y round 22).
 */
function howManyRunsAreReallyAlive() {
  const rows = (sessions?.sessions ?? []).filter((s) => s.state === 'running' && s.recordId !== id)

  const behind = new Set()
  const onlyUnknown = new Set()
  for (const row of resources?.resources ?? []) {
    if (row?.releasedAt != null) continue
    const session = row?.sessionRecordId ?? null
    if (session === null) continue
    if (row?.liveness?.state === 'alive') behind.add(session)
    else if (row?.liveness?.state === 'unknown') onlyUnknown.add(session)
  }
  for (const hold of handles ?? []) {
    if (hold?.state === 'fresh' && typeof hold.session === 'string') behind.add(hold.session)
  }

  const alive = rows.filter((s) => behind.has(s.recordId))
  const rest = rows.filter((s) => !behind.has(s.recordId))
  const unread = [...(resources === null ? ['/api/resources'] : []), ...(handles === null ? ['/api/handles'] : [])]
  return {
    alive: alive.length,
    couldNotCheck: rest.filter((s) => unread.length > 0 || onlyUnknown.has(s.recordId)).length,
    nothingBehind: rest.filter((s) => unread.length === 0 && !onlyUnknown.has(s.recordId)).length,
    unread,
  }
}

/** Why each read that did not answer leaves the runs unchecked, said once per read. */
const RUNS_UNREAD = {
  '/api/resources': 'Mole Office did not answer which registered processes are still running, so no run was found dead or alive by one.',
  '/api/handles': 'Mole Office did not answer which handles are held, so no run was found dead or alive by a hold.',
}

/**
 * The runs line, or the honest absence of one.
 *
 * NOTHING IS COUNTED WHEN NOTHING ANSWERED. A failed read used to come out as "No other agent run
 * is alive", which is a made-up all-clear.
 */
function runLines() {
  if (sessions === null) return [failedEndpoint('/api/sessions?only=running', 'Mole Office did not answer about other runs, so nothing is known about them here.')]
  const counted = howManyRunsAreReallyAlive()
  const unchecked = counted.unread.length > 0 && counted.couldNotCheck > 0
  const said = [
    counted.alive === 0
      ? unchecked ? 'Whether another agent run is alive is not known.' : 'No other agent run is alive.'
      : `${unchecked ? 'At least ' : ''}${counted.alive} other agent run${counted.alive === 1 ? ' is' : 's are'} alive.`,
  ]
  if (unchecked) {
    said.push(
      `${counted.couldNotCheck} ${counted.alive === 0 ? '' : 'more '}row${counted.couldNotCheck === 1 ? ' says' : 's say'} running and could not be checked. ` +
        counted.unread.map((door) => failedEndpoint(door, RUNS_UNREAD[door])).join(' '),
    )
    return said
  }
  if (counted.nothingBehind > 0) {
    said.push(
      `${counted.nothingBehind} row${counted.nothingBehind === 1 ? '' : 's'} say${counted.nothingBehind === 1 ? 's' : ''} ` +
        'running with nothing behind them. GET /api/sessions.',
    )
  }
  if (counted.couldNotCheck > 0) {
    said.push(
      `${counted.couldNotCheck} more say${counted.couldNotCheck === 1 ? 's' : ''} running and Mole Office could not check ` +
        'what is behind them. GET /api/resources.',
    )
  }
  return said
}

// WHAT THIS SESSION IS, IN ONE LINE. Three different facts, and saying the wrong one is worse than
// saying nothing: an agent told it is filed when it is not will write as though its work is being
// kept. When filing fails, the server's own words are printed, because "could not file" sent the
// author hunting through curl for the reason — which was one sentence the server had already said.
/**
 * WHETHER THIS SESSION'S IDENTITY BELONGS TO THIS OFFICE AT ALL.
 *
 * Two things make it this office's: something named an agent for it — the environment it was
 * started with, or the `.env` of the project it is working in — or it is working inside this
 * checkout. A session outside every checkout with nobody named is not this checkout's, and the hook
 * may not hand it this checkout's agent or name it a run here. That is another project's failure of 15
 * September 2026 (problem `JsxXlrodyydX`). When the payload says no directory, nothing is claimed
 * either way and the old reading stands.
 */
const saysWhoItAnswersAs =
  AGENT !== null ||
  THE_RUN_THE_ENVIRONMENT_NAMES !== null ||
  startDirectory === null ||
  thisDirectoryIsInThisCheckout(startDirectory)
const stillUnnamed = record !== null && typeof record.title === 'string' && record.title.includes(PLACEHOLDER)
const itsName =
  id === null
    ? ''
    : stillUnnamed
      ? ` Nobody has said what it is for yet — change the title and the "doing" line with PATCH /api/records/${id}.`
      : ` It is called "${record.title}".`
const yours = [
  !saysWhoItAnswersAs
    ? 'The hook cannot tell who this session is: nothing names a durable agent for it, so no handle was claimed and no session record was named.'
    : thisStart?.how === 'several'
      ? 'This session is NOT on the record.'
      : thisStart?.how === 'environment-unusable'
        ? `This session is NOT on the record. Its environment names its run as ${String(THE_RUN_THE_ENVIRONMENT_NAMES)} ` +
          `(MOLE_OFFICE_SESSION), and ${String(thisStart.why)}, so the hook cannot tell which record is this ` +
          "session's: it filed none, took none over and wrote no note."
      : thisStart?.how === 'environment'
        ? `This session is filed as record ${id}, the run its environment names (MOLE_OFFICE_SESSION).${itsName}`
      : thisStart?.how === 'child' && id !== null
        ? `This session is filed as record ${id}, a new record of its own.${itsName}`
      : id === null
        ? `This session is NOT on the record. Mole Office refused it: ${filed?.error ?? 'no reason given'}. Say so if you write anything worth keeping.`
        : thisStart?.how === 'adopted'
          ? `This session is filed as record ${id}.${itsName}`
          : existing !== null
            ? `This session is already filed as record ${id}, from earlier in the same run.${itsName}`
            : `This session is filed as record ${id}. It has no real title yet. Change the title and the "doing" line as soon as you know what you are working on, with PATCH /api/records/${id}.`,
  ...conversationLines(),
  ...earlierRecordLines(),
].join(' ')

/**
 * WHAT THE LOOKUP OF THIS CONVERSATION FOUND, when it was made and found something to say.
 * Nothing when the note named this session's record, and nothing when the records were read and none named the
 * conversation: the hook filed one as it always has, and the line above says so.
 */
function conversationLines() {
  if (thisStart?.how === 'environment' && (thisStart.aFirstConversation === true || thisStart.takenOver !== undefined)) {
    const run = String(THE_RUN_THE_ENVIRONMENT_NAMES)
    const wrote = theConversationWritten?.status === 200
    const refused = wrote
      ? ''
      : ` Writing this conversation (${sessionId}) on run ${run} was refused: ` +
        `${theConversationWritten?.status == null ? `no answer: ${String(theConversationWritten?.error)}` : `answered ${String(theConversationWritten.status)}: ${String(theConversationWritten.body?.error ?? 'no reason given').slice(0, 300)}`}. ` +
        'A stop with no note writes no usage receipt on a run that names another conversation.'
    if (thisStart.aFirstConversation === true) {
      return [wrote ? `Run ${run} named no conversation yet, so this start wrote this one (${sessionId}) on it.` : `Run ${run} named no conversation yet.${refused}`]
    }
    return [
      `Run ${run} named another conversation (${thisStart.takenOver.conversation}), which is no longer running: ${thisStart.takenOver.says}.` +
        (wrote ? ` So this session took the run over and wrote this conversation (${sessionId}) on it.` : ` So this session took the run over.${refused}`),
    ]
  }
  if (thisStart?.how === 'child') {
    const run = String(THE_RUN_THE_ENVIRONMENT_NAMES)
    const aliveSays =
      thisStart.reading.runs === 'yes'
        ? `that conversation still runs: ${thisStart.reading.says}`
        : `whether that conversation still runs cannot be told: ${thisStart.reading.says}`
    return [
      `Run ${run}, which the environment names (MOLE_OFFICE_SESSION), is another conversation's (${thisStart.parentConversation}), ` +
        `and ${aliveSays}. So this session did not take that run over: ` +
        (id === null
          ? `it wrote nothing on run ${run}, and its own record was refused.`
          : `it filed its own record ${id}, with run ${run} as its parent, and wrote nothing on run ${run}.`),
    ]
  }
  if (thisStart?.how === 'note' && thisStart.askedIn !== undefined) {
    return [
      `Record ${id}, which this session's note names, is in the project "${WORKSPACE}" now and not in "${thisStart.askedIn}", ` +
        'so the hook read it there and wrote that project into the note.',
    ]
  }
  if (thisStart?.how === 'held') {
    const before = thisStart.replaced ?? null
    return [
      `No new record was filed: the waiter holds this session's handle on record ${id}, so the hook took it over and wrote its note for this session.` +
        (before === null
          ? ''
          : before.namesThisConversation
            ? ` The record the start was on before, ${before.id}, names this conversation too, so the first stop or end closes it as superseded by ${id}.`
            : ` The record the start was on before, ${before.id}, does not name this conversation, so it is left as it is.`),
    ]
  }
  if (thisStart?.how === 'adopted') {
    return [
      `No new record was filed: record ${id} was still open and already named this conversation (${sessionId}), ` +
        'so the hook took it over and wrote its note for this session.',
    ]
  }
  if (thisStart?.how === 'several') {
    const ids = thisStart.several.map((one) => String(one.id)).join(', ')
    return [
      `${String(thisStart.several.length)} open session records already name this conversation (${sessionId}): ${ids}. ` +
        'The hook does not choose between them, so it filed no record, took none over and wrote no note. ' +
        'Say which one is this session\'s before you write anything worth keeping.',
    ]
  }
  if (thisStart?.how === 'file' && thisStart.unread) {
    return [
      failedEndpoint('/api/records?kind=session', 'Mole Office did not answer which session records already name this conversation, so another record may ' +
        'already name it.'),
    ]
  }
  return []
}

/**
 * THE RECORD THIS SESSION'S NOTE NAMED, WHEN THAT RECORD IS OVER. Section 16: it
 * is never reopened, and this start is on another record, or on none. One sentence, with each path named
 * by its condition. Nothing when the note named no record that is over.
 */
function earlierRecordLines() {
  const earlier = thisStart?.earlier ?? null
  if (earlier === null) return []
  const data = typeof earlier.data === 'object' && earlier.data !== null ? earlier.data : {}
  const closed = typeof data.closedAt === 'string' && data.closedAt !== '' ? `, closed at ${data.closedAt}` : ''
  const then =
    thisStart.how === 'adopted'
      ? `This start took over record ${String(id)} instead.`
      : thisStart.how === 'environment'
        ? `This start is on run ${String(id)}, which its environment names, instead.`
      : thisStart.how === 'several' || thisStart.how === 'environment-unusable'
        ? 'This start is on no record.'
        : id === null
          ? 'Filing a new record for this start was refused.'
          : `This start filed the new record ${String(id)}.`
  return [
    `The record this session's note named, ${String(earlier.id)}, reads ${String(data.state)}${closed}. It stays ` +
      `closed and this start did not change it: a closed record is never reopened. ${then}`,
  ]
}

/**
 * WHAT IS STILL OPEN, IN AT MOST THREE LINES.
 *
 * The whole answer is 16 KB and this is a hook, so what goes on screen is the two numbers that
 * change what an agent does first — how much is open, and how much of it needs a person — plus the
 * one line that stops a module-shaped question being read as an empty project. The endpoint is
 * named so the agent can read the rest itself.
 *
 * A REPLY THAT DID NOT ARRIVE SAYS SO. An empty list and a server that answered nothing are not
 * the same fact, and an agent told "nothing is open" when nothing was asked would file work that
 * already exists.
 */
function openLoopLines(reply, missed) {
  if (reply === null || reply === undefined) {
    return [
      failedEndpoint('/api/where-you-stand', 'Mole Office did not answer what is still open, so this run knows nothing about it: GET /api/where-you-stand, ' +
        `which carries it, answered ${missed ?? 'without it'}. GET /api/open-loops answers it alone.`),
    ]
  }
  if (!Array.isArray(reply.loops)) return []
  const person = reply.whoseMove?.person ?? 0
  const unsaid = reply.whoseMove?.nobodyHasSaid ?? 0
  const cut = reply.counts?.leftOut ?? 0
  const lines = [
    reply.loops.length === 0
      ? 'Nothing in this project is open — no task, problem, idea, direction, obligation or unsettled fork. GET /api/open-loops.'
      : `${reply.loops.length} open loop${reply.loops.length === 1 ? '' : 's'} in this project: ${person} say a ` +
        `person has to move next, ${unsaid} say nobody has said whose move it is. GET /api/open-loops, or ` +
        'GET /api/records/<id>/context to stand somewhere.',
  ]
  if (cut > 0) {
    lines.push(
      `${cut} more were left out of that count and every one of them is named in the reply, with the reason.`,
    )
  }
  if (reply.attachment !== undefined && reply.attachment !== null) lines.push(reply.attachment.sentence)
  return lines
}

/**
 * THE OPENING OF THE BRIEF, AS THE SERVER WROTE IT.
 *
 * Criterion I2. The paragraphs are not built here: `GET /api/brief` carries its own opening in
 * `head`, because the same few paragraphs are also written into the rules file the other tools
 * read and printed by tools/brief.mjs, and built in each place they would drift.
 *
 * A reply nobody could read gets its own sentence, exactly as `openLoopLines` does. Printing
 * nothing would make a Mole Office that did not answer look like a project with nothing in it.
 */
function briefLines(reply) {
  if (reply !== null && reply !== undefined && typeof reply.head === 'string' && reply.head.trim() !== '') {
    return ['', ...reply.head.split('\n')]
  }
  // ONE SENTENCE FOR BOTH WAYS OF HAVING NOTHING, with what came back when something did. Nothing
  // came back and something came back that was not a brief are the same fact for a reader: this
  // run was told nothing about the project. What must never happen is an opening printed anyway.
  const said = reply === null || reply === undefined ? null : reply.error
  return [
    '',
    failedEndpoint('/api/where-you-stand', 'Mole Office did not answer the brief, so this run was told nothing about the project. GET /api/brief.' +
      (typeof said === 'string' && said.trim() !== '' ? ` It said: ${said}` : '')),
  ]
}

/**
 * What was done about this run's discovery stamp, in one sentence.
 *
 * Four answers and they are four different facts. Collapsing "the transcript is not there yet" into
 * "this is not recorded" would tell an agent to do something about a state that fixes itself at the
 * end of its first turn.
 * A takeover with no transcript is a fifth fact: the existing stamp still names the conversation that ended.
 */
function stampedLine(what) {
  const line = theStampedLineAlone(what)
  // A COMMAND LEFT OFF A STAMP THIS RUN OF THE HOOK WROTE OR READ, said with the reason, and the start goes on.
  if (resumeCommandLeftOut === null || !['stamped', 'stamped-at-create', 'already-stamped'].includes(what)) return line
  return `${line} The command that resumes this conversation was not written on its record, because ${resumeCommandLeftOut}.`
}

/** The line about the stamp, without the command. */
function theStampedLineAlone(what) {
  if (what === 'takeover-not-observed-yet') {
    return `The discovery stamp of run ${id} still names the conversation that ended (${thisStart.takenOver.conversation}), because this session's transcript was not found.`
  }
  if (what === 'stamped' || what === 'stamped-at-create') {
    return 'This run\'s conversation is written down on its record, so a later run can be pointed at it.'
  }
  if (what === 'already-stamped') return 'This run\'s conversation was already written down on its record.'
  if (what === 'not-observed-yet') {
    return 'This run\'s transcript does not exist on disk yet, so nothing was written down about which conversation this is. It is recorded when this session ends. Nothing was guessed at.'
  }
  if (what === 'refused') return 'The office did not take the write of this run\'s discovery stamp, or did not answer it, so the stamp on its record is as it was.'
  return 'Nothing was written down about which conversation this run is, because there is no record to write it on.'
}

/**
 * WHETHER THIS RUN'S OWN PROCESS IS ON ITS RECORD, and why not when it is not.
 *
 * A session waiting in its terminal writes nothing to its transcript, so a record that names only
 * a conversation reads offline while the session can take a message now. This line is the office
 * telling the agent that its record now names the process the office will read later. When the
 * hook's parent is not the claude program, nothing was written and this says so rather than leaving
 * the absence for a screen to show weeks from now.
 */
function processLine(stamped, id) {
  if (stamped === 'takeover-not-observed-yet') {
    return 'This run\'s own process was not written on its record, because this session\'s transcript was not found.'
  }
  // THE PROCESS IS WRITTEN ONLY WITH A WHOLE DISCOVERY STAMP, so when no stamp was written or already
  // there it is on no record, whatever the reading of the process said. Several records naming this
  // conversation leave this session with no record at all.
  if (processFacts.recorded && !['stamped', 'stamped-at-create', 'already-stamped'].includes(stamped)) {
    return id === null
      ? 'This run\'s own process is on no record, because this session has no record.'
      : 'This run\'s own process is NOT on its record: it is written only beside the conversation, and the conversation was not written down.'
  }
  if (processFacts.recorded) {
    return (
      `This run's own process is on its record: pid ${String(processFacts.pid)}, started ` +
      `${String(processFacts.pidStartedAt)}, ${String(processFacts.pidCommand)}`
    )
  }
  return `This run's own process is NOT on its record: ${String(processFacts.why)}`
}

/**
 * WHETHER THIS SESSION CAN ANSWER AS A DURABLE AGENT, AND HOW TO SAY SO. Criterion H1.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE HOOK OFFERS THIS RATHER THAN DOING IT
 * ---------------------------------------------------------------------------------------------
 *
 * Holding a handle changes where somebody's messages go. That is a decision about this session, and
 * the hook does not know whether this run is the one that should be answering as the agent — a
 * second terminal open on the same checkout is the ordinary case. So it prints the command and the
 * agent starts it, once, when it means to.
 *
 * THREE ANSWERS AND THEY ARE THREE DIFFERENT FACTS. Nothing said which agent: say nothing, which is
 * what every checkout that has not set the line gets. A name nobody registered: say so, because a
 * typo in `.env` would otherwise be silent for ever. A registered agent: print the command.
 */
async function handleNote(recordId) {
  if (AGENT === null || recordId === null) return null
  const seen = await ask(`/api/handles/${encodeURIComponent(AGENT)}`)
  return theHandleNote(seen, recordId)
}

/**
 * THE HANDLE NOTE FROM ONE READING: `{ error }`, or `{ answering, beatEvery, lapsesAfter }` as GET /api/handles/:handle
 * answers them, and as the read after a compaction carries them in its `hold` part. Null when there is nothing to say.
 */
function theHandleNote(seen, recordId) {
  if (AGENT === null || recordId === null || seen === null) return null
  if (seen.error !== undefined) {
    return [
      `THIS CHECKOUT SAYS ITS SESSIONS ANSWER AS "${AGENT}", AND NO AGENT IS REGISTERED UNDER THAT NAME.`,
      `Mole Office said: ${String(seen.error)}`,
      'Nothing was held. Fix MOLE_OFFICE_AGENT in .env, or register the agent, then start a new session.',
    ].join('\n')
  }
  const answering = seen.answering ?? null
  if (answering !== null && answering.how === 'a live session' && answering.session !== recordId) {
    return [
      `ANOTHER SESSION IS ALREADY ANSWERING AS "${AGENT}" — the one filed as record ${String(answering.session)}.`,
      'Messages to that agent go there, not here. Nothing was held and nothing was signalled.',
      'If that session has gone, its hold is released once it has been quiet long enough, and you can take over then.',
    ].join('\n')
  }
  /**
   * THIS SESSION STILL HOLDS THE HANDLE AND NOTHING IS BEATING IT: the waiter has stopped.
   *
   * Problem `Dm8eX0oNrVS5`. A waiter that died left the hold standing, so nothing else would answer
   * as this agent and this session was not listening either — messages went nowhere and no screen
   * said so. The hold's own silence is what tells the two apart: a waiter that is running has beaten
   * it within a beat, and anything much older than that means nobody is.
   *
   * TWO BEATS RATHER THAN ONE, because one beat is the gap between beats and a hook that ran inside
   * that gap would say the waiter had stopped when it had not.
   */
  const hold = answering === null ? null : answering.hold
  const beatEvery = typeof seen.beatEvery === 'number' ? seen.beatEvery : null
  if (hold !== null && beatEvery !== null && answering.session === recordId) {
    if (hold.quietFor > beatEvery * 2) {
      return [
        `THIS SESSION STILL HOLDS THE HANDLE "${AGENT}" AND NOTHING IS LISTENING FOR IT.`,
        `The hold has said nothing for ${String(hold.quietFor)} seconds and it is beaten every ${String(beatEvery)},`,
        'so the waiter that was holding it has stopped. Until you start it again, a message to this agent goes',
        'nowhere: Mole Office starts no run while the handle is held, and nothing here is reading. Start it again:',
        `    ${theTool('hold-the-handle.mjs').command} --agent ${AGENT} --session ${recordId}`,
        `It goes quiet on its own after ${String(seen.lapsesAfter ?? 'the lapse window')} seconds of silence, and a run answers from then on.`,
      ].join('\n')
    }
    return [
      `YOU ARE ANSWERING AS "${AGENT}" IN THIS SESSION and the waiter is running — it said so`,
      `${String(hold.quietFor)} seconds ago. A message to that agent comes here. There is nothing to start.`,
    ].join('\n')
  }
  return [
    `YOU CAN ANSWER AS THE AGENT "${AGENT}" IN THIS SESSION. Start the waiter once, in the background:`,
    `    ${theTool('hold-the-handle.mjs').command} --agent ${AGENT} --session ${recordId}`,
    'While it runs, a message to that agent comes to you and Mole Office starts no run beside you. It lets go when',
    'you stop it, and it prints the message it was waiting for when one arrives.',
  ].join('\n')
}

function skillNote() {
  const startDir = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : null
  if (startDir === null) {
    return (
      'Nothing said which directory this session started in, so whether you have the Mole Office skill was not checked. Look for a skill called mole-office; ' +
      (INSTALLED ? 'if it is not there, ask the person to press "Put the entry in place" on the Settings page.' : 'for-agents/session-hook.mjs says what to do if it is not there.')
    )
  }
  // existsSync follows the link, so this is true only when the skill is really readable from here.
  // TWO PLACES ARE CHECKED. The project-level link is what an older wiring made; the user-level one
  // is what the press writes, and it serves every directory a session starts in. A hook that only
  // looked in the start directory would tell every session outside this checkout that it had no
  // skill while Claude Code was reading one from the person's home.
  if (existsSync(join(startDir, '.claude', 'skills', 'mole-office', 'SKILL.md'))) return null
  if (existsSync(join(homedir(), '.claude', 'skills', 'mole-office', 'SKILL.md'))) return null
  return [
    'YOU DO NOT HAVE THE MOLE OFFICE SKILL, so you do not have the rules for writing to Mole Office —',
    'which project header to send, the three headers every write needs, and what to register',
    'before you start a server. The press "Put the entry in place" on the Settings page links it at user',
    ...(INSTALLED
      ? [
          // WHO MAY PRESS IT is `onlyThePersonMayInstallTheEntry` in src/server/api/entry.ts. The hook cannot read the
          // gate's position, so the words hold at either.
          'level, for every directory. The person can press it. While the office\'s gate on who changes the person\'s',
          'settings is at block, so can a secretary holding the person\'s grant, where the grant carries this press.',
          'While that gate is off, so can any agent with its own key. Otherwise, ask the person to press it.',
          'Do not copy the skill yourself: a copy is a second skill that drifts from the one this installation carries.',
        ]
      : [
          'level, for every directory; on a machine with no browser, run:',
          '    node tools/install-the-entry.mjs',
          'Link it, never copy it: a copy is a second skill that drifts from the one in the checkout.',
        ]),
  ].join('\n')
}

const handleLine = await handleNote(id)

/**
 * WHO THIS SESSION IS HERE, WHICH PROJECT THIS DIRECTORY IS IN, AND WHAT TO READ NEXT. Criterion
 * F15 point 1. Three lines and no more: an agent opened anywhere is told where it stands before it
 * does anything, and the whole start has a 15,000-token ceiling, so this is paid for every time.
 *
 * IT NEVER SAYS THE DIRECTORY IS IN THE DEFAULT PROJECT. When nothing matched the directory the line
 * asks the agent to name one, because falling back to the default is the exact defect this piece
 * exists to end: an agent registered in `default` with its work in another project is the 14
 * September 2026 failure. A record this start filed is in a project all the same, and
 * `whereItWasFiled` says which one, for now, and how to move it.
 */
function hereLines() {
  const who = AGENT === null ? theHookCannotTell() : `You are answering as the agent "${AGENT}" here.`
  // AND WHAT A HOLD OR A REGISTERED START FOLDER HAD TO DO WITH IT, when either had anything to do with it. This is
  // problem ihekMM954ojG and part (c) of a decision. One sentence each, after the line above:
  // which hold or folder named this agent, or why it named nobody. Null when it was not read, and when it was read and
  // found nobody — then the line above is already the whole answer.
  const fromItsHold = heldNote?.line ?? null
  const fromItsFolder = startFolderNote?.line ?? null
  let where
  if (heldNote?.record != null && heldNote.record.id === thisStart?.record?.id) {
    where = `This session is in the project "${WORKSPACE}", from the record its waiter holds.`
  } else if (thisStart?.how === 'note' && (THE_NOTED_PROJECT !== null || thisStart.askedIn !== undefined)) {
    where = `This session is in the project "${WORKSPACE}", where the record its note names is.`
  } else if (thisStart?.how === 'adopted' && thisStart.askedIn !== undefined) {
    where = `This session is in the project "${WORKSPACE}", where the record it took over is.`
  } else if (startDirectory === null) {
    where = 'Nothing said which directory this session started in, so which project it is in was not checked.'
  } else if (onboarding === null || onboarding.error !== undefined || onboarding.project === undefined) {
    where = failedEndpoint('/api/onboarding', `Mole Office did not answer which project "${startDirectory}" is in, so nothing is claimed about it.`)
  } else if (typeof onboarding.project.id === 'string' && onboarding.project.id !== '') {
    where = `This directory is in the project "${onboarding.project.id}".`
  } else {
    where =
      `Nothing matched the directory "${startDirectory}" to a project, so none is assumed. ` +
      'Name one with x-mole-office-workspace before you write anything.'
  }
  const next =
    startDirectory === null
      ? 'Read GET /api/onboarding next: it names the doors and the project in one small reply.'
      : `Read GET /api/onboarding?directory=${encodeURIComponent(startDirectory)} next: it names the doors and the project in one small reply.`
  return [who, fromItsHold, fromItsFolder, where, whereItWasFiled(), ...theKeyLines(), next].filter((one) => one !== null)
}

/**
 * WHERE A NEW RECORD WAS FILED, AND WHY, when the start folder matched a project and the record went in another one
 * (problem vya7xFG93ern, part A). That happens only when the session's environment or its `.env` named the other one.
 * The line above then names one project and the record is in another, so this line says which and why.
 *
 * AND WHEN THE START FOLDER MATCHED NO PROJECT, or the office did not say which (answer IoAiAKB7s690, 13 October
 * 2026). The line above then says none is assumed and asks the session to name one, but the record is in a project all
 * the same: the one the environment or a `.env` names, or the hook's own. Until then this answered null there, so a
 * record went in the hook's own project with no word, which is a silent default. So this line says where the record is
 * for now, why, and the door that moves it. It never says the folder is in that project: `hereLines` says why.
 *
 * NULL WHEN THE RECORD WENT WHERE THE FOLDER MATCHED, and when this start filed no record.
 */
function whereItWasFiled() {
  if (filedIn === null || filed?.record?.id === undefined) return null
  const folder = onboarding?.error === undefined ? onboarding?.project : undefined
  const matched = folder?.kind === 'matched' && typeof folder.id === 'string' && folder.id !== '' ? folder.id : null
  if (filedIn.id === matched) return null
  const because =
    filedIn.because === 'environment'
      ? 'the one its environment names (MOLE_OFFICE_WORKSPACE)'
      : filedIn.because === 'env-file'
        ? `the one ${String(filedIn.envFile)} names (MOLE_OFFICE_WORKSPACE)`
        : onboarding === null || onboarding.error !== undefined || onboarding.project === undefined
          ? 'because Mole Office did not answer which project the start folder is in, and that is the project this hook itself writes in'
          : 'because nothing named a project for it and that is the project this hook itself writes in'
  if (matched !== null) return `This session's record was filed in the project "${filedIn.id}", ${because}.`
  return (
    `This session's record was filed in the project "${filedIn.id}" for now, ${because}. ` +
    `To move it, send POST /api/records/${filed.record.id}/workspace {"to":"<project>"} with the header x-mole-office-workspace: ${filedIn.id}.`
  )
}

/**
 * THE SENTENCE FOR A SESSION NOTHING NAMES. Problem ihekMM954ojG: "cannot tell", and no agent claimed.
 *
 * It names only the sources that were read and found nobody. A source that could not be read has its
 * own sentence beside this one (the hold's or the start folder's), and a source that was not asked is
 * left out, so this never says "nothing names one" about a place nobody looked.
 */
function theHookCannotTell() {
  const found = ['the environment names none (MOLE_OFFICE_AGENT)']
  if (heldNote !== null && heldNote.read) {
    found.push(
      heldNote.records.length === 0
        ? 'this session had no record yet for a waiter to hold a handle on'
        : "no single handle is held on this session's record",
    )
  }
  if (namedByAnEnvFile === null) found.push('no .env names one')
  if (startFolderNote !== null && startFolderNote.read) found.push('no registered start folder names one')
  return `The hook cannot tell which durable agent this session is, so it names none and claims no handle: ${found.join('; ')}.`
}

// ------------------------------------------------------------------ after a compaction: the one read first

/**
 * AFTER A COMPACTION, WHO THIS SESSION IS, ITS RULES AND ITS HANDOVER COME BACK FIRST. Wave 13k round 46, the person's
 * decision and problem dkej5WjBNyWe.
 *
 * WHAT WENT WRONG. A compaction ran the ordinary start: a health read, the onboarding read, the run record, a stamp
 * read, five machine and project reads and a handle read, then GET /api/where-you-stand. Under a load near 12 the office
 * answered them one at a time, the ten seconds ran out, and the run got back neither its role card, nor the rules, nor
 * what is open.
 *
 * WHAT THIS DOES INSTEAD, IN THIS ORDER:
 *   1. GET /api/after-a-compaction, the first request this path makes. It answers the role, the chapters with their
 *      levels and rule names, the handover, the run with its stamp and its compactions, and the hold. The world is
 *      read off that reply's own x-mole-office-world header, so there is no health read. When the header does not name
 *      this checkout's world, the office answering is asked for the run this session's environment names. When it
 *      holds that run as launched in a sandbox that holds this checkout, this hook goes on as that run's office. Any
 *      other reply of another world prints the warning, and nothing in it is printed as this office's and nothing is
 *      written.
 *      When the reply names the agent only through the run's hold, or names none while a .env does, it is asked once
 *      more as that agent, so the handover is read by the agent itself.
 *   2. The stamp, only when the run is not stamped yet or its process changed: that write needs the record's whole
 *      `extra`, so the record is read then, and only then.
 *   3. One entry appended to the run's `compactions`, at the office's clock (`answeredAt` of the one read).
 *   4. GET /api/where-you-stand, with the time that is left. When it misses, the lines say so and name the doors.
 * Not sent: GET /api/resources/orphans, GET /api/sessions?only=running, GET /api/handles, GET /api/resources and
 * GET /api/onboarding. One line says so and names them.
 *
 * Role, rules and handover are printed first. The marker line "MOLE OFFICE —" is the first line and carries the role.
 * Every other source of a compaction (startup, resume, clear) runs the ordinary start, and records no compaction.
 */
async function afterACompaction() {
  // A CHILD OF THE RUN THE ENVIRONMENT NAMES asks about its own record, which its note names, and not about that run,
  // which is another conversation's (problem c3p75p8aALd2).
  const noted = THE_RUN_THE_ENVIRONMENT_NAMES === null ? theSessionNote(sessionId) : THE_CHILD_NOTE
  if (noted?.workspace !== null && noted?.workspace !== undefined) WORKSPACE = noted.workspace
  const runAsked = THE_CHILD_NOTE !== null ? THE_CHILD_NOTE.id : (THE_RUN_THE_ENVIRONMENT_NAMES ?? noted?.id ?? null)
  const path = `/api/after-a-compaction${runAsked === null ? '' : `?run=${encodeURIComponent(runAsked)}`}`

  /** One ask of the one read that keeps the reply's world header. */
  async function theOneRead() {
    try {
      const res = await askTheOfficeTransport(`${API}${path}`, {
        headers: {
          'x-mole-office-workspace': WORKSPACE,
          ...theHookIdentity(),
          ...(HOME === null ? {} : { [HOME_HEADER]: HOME }),
        },
        // THE ROLE, RULES AND HANDOVER COME FIRST, so this read may have the time the later reads do not need; the
        // after-reads margin is what is kept for those.
        signal: AbortSignal.timeout(Math.max(1, Math.floor(
          HOOK_BUDGET_MS - AFTER_READS_MARGIN_MS - (performance.now() - hookStartedAt),
        ))),
      })
      if (res.headers.get(STAND_IN_HEADER) !== null) return { status: null, body: null, world: null, error: 'the dev supervisor answered that no server is running' }
      const body = await res.json().catch(() => null)
      return { status: res.status, body, world: res.headers.get(WORLD_HEADER), error: null }
    } catch (error) {
      failedRequests.set('/api/after-a-compaction', `GET ${path}: ${error instanceof Error ? error.message : String(error)}`)
      return { status: null, body: null, world: null, error: error instanceof Error ? error.message : String(error) }
    }
  }

  let read = await theOneRead()
  if (read.status === null) {
    printHookOutput([
      `MOLE OFFICE — after a compaction. Mole Office did not answer GET /api/after-a-compaction on ${API} (${String(read.error)}), ` +
        'so this session was given back neither its role, nor its rules, nor its handover, and nothing was recorded. ' +
        `GET /api/after-a-compaction, GET /api/brief and${AGENT === null ? '' : ` GET /api/agents/${AGENT}/handover and`} ${THE_RULES} answer them.`,
      ...theKeyLines(),
      ...(skill === null ? [] : ['', skill]),
    ])
    process.exit(0)
  }

  // THE WORLD, FROM THIS REPLY'S OWN HEADER, judged in the self-check (src/config/the-self-check.mjs), as the health
  // read is. No health was asked, so a matching world is `same-world`, and the line below says only what was checked.
  const answering = whatAWorldHeaderShows(read.world, API, undefined, THE_INSTALLS_OWN_OFFICE ?? undefined)
  const world = whatTheWorldCheckSays(answering)
  // ONE DECISION, READ THREE TIMES BELOW: whether this is a launched run, whose office is the one that holds it.
  const launched = world.fileAnything ? null : await theLaunchedRunThisSessionIsIn(answering)
  if (!world.fileAnything && launched === null) {
    console.log([
      'MOLE OFFICE — after a compaction. The office that answered GET /api/after-a-compaction is not shown to be the one ' +
        `${THIS_SIDE_EN} declares, so nothing it said is printed here as this office's, and nothing was recorded.`,
      world.line,
      ...theKeyLines(),
    ].join('\n'))
    process.exit(0)
  }

  // ASKED ONCE MORE AS THE AGENT, when the first reply found it only through the run's hold, or found none while a .env
  // names one: the handover is read by the agent itself, its starter or the person, and naming a run proves none of them.
  const firstRole = read.status === 200 ? read.body?.role : null
  const envNames = AGENT === null && (firstRole?.handle ?? null) === null ? theAgentAnEnvFileNames(startDirectory ?? undefined) : null
  let namedBy = AGENT !== null ? 'the environment (MOLE_OFFICE_AGENT)' : null
  if (AGENT === null && firstRole?.how === 'the-runs-hold' && typeof firstRole.handle === 'string') {
    AGENT = firstRole.handle
    ACTOR = firstRole.handle
    namedBy = `the handle its waiter holds on run ${String(read.body?.run?.id)}`
  } else if (envNames !== null) {
    AGENT = envNames
    ACTOR = envNames
    namedBy = 'a .env'
  }
  if (namedBy !== null && namedBy !== 'the environment (MOLE_OFFICE_AGENT)') {
    const again = await theOneRead()
    if (again.status === 200 && again.world === read.world) read = again
  }

  const said = read.status === 200 && read.body !== null && typeof read.body === 'object' ? read.body : null
  const failedSaying = said !== null
    ? null
    : `GET /api/after-a-compaction answered ${String(read.status)}${typeof read.body?.error === 'string' ? ` (${read.body.error})` : ''}`

  // 1. ROLE, RULES AND HANDOVER, FIRST.
  const first = []
  if (said === null) {
    first.push(failedEndpoint('/api/after-a-compaction',
      `MOLE OFFICE — after a compaction. ${failedSaying}, so this session was given back neither its role, nor its rules, ` +
        'nor its handover. GET /api/after-a-compaction answers them. ' +
        (INSTALLED ? "The invariants are the skill's operating rules, in its SKILL.md." : 'The invariants are in CLAUDE.md or in a file it pulls in.')))
  } else {
    const role = said.role ?? {}
    first.push(`MOLE OFFICE — after a compaction. Your role: ${String(role.says ?? 'the reply said nothing about the role.')}`)
    if (typeof role.duties === 'string' && role.duties !== '') first.push(`Your card's duties, in one line: ${role.duties}`)
    const rules = said.rules ?? {}
    first.push(`Your rules: ${String(rules.says ?? 'the reply said nothing about the rules.')}`)
    for (const chapter of Array.isArray(rules.chapters) ? rules.chapters : []) {
      const names = Array.isArray(chapter.rules) ? chapter.rules.join('; ') : ''
      first.push(`  Chapter ${String(chapter.n)}, ${String(chapter.name)} (${String(chapter.level)}): ${String(chapter.title)}${names === '' ? '' : ` Rules: ${names}.`}`)
    }
    if (typeof rules.whereTheWholeIs === 'string') first.push(rules.whereTheWholeIs)
    const handover = said.handover ?? {}
    first.push(`Your handover: ${String(handover.says ?? 'the reply said nothing about the handover.')}`)
    const text = handover.current?.text
    if (typeof text === 'string' && text !== '') {
      first.push(...text.split('\n').map((line) => `  | ${line}`))
      first.push(`  (written ${String(handover.current.writtenAt)}${handover.current.sessionId === null ? '' : ` in run ${String(handover.current.sessionId)}`})`)
    }
  }

  // 2. THE RUN, ITS STAMP AND ITS COMPACTION.
  const run = said?.run ?? null
  const recordId = typeof run?.id === 'string' ? run.id : null
  const other = theConversationARunNames({ data: { providerSession: run?.providerSession, extra: { discovered: run?.discovered } } })
  const over = recordId !== null && typeof run.state === 'string' && RUN_IS_OVER_STATES.includes(run.state)
  const runLinesNow = []
  if (said === null) {
    runLinesNow.push('This run was not read, so nothing was stamped or recorded on it.')
  } else if (recordId === null) {
    runLinesNow.push(
      `${String(run?.says ?? 'The reply named no run.')} So nothing was stamped and no compaction was recorded. ` +
        `POST /api/records files a run, and ${theTool('register-myself.mjs').file} registers this session as one.`,
    )
  } else if (noted === null && other !== null && other !== sessionId) {
    // NO NOTE NAMING THIS SESSION'S OWN RECORD: an inherited run may be another conversation's. The small reply
    // already carries the naming fields, so this guard needs no further read and writes nothing on that run.
    runLinesNow.push(
      `This compaction was not recorded on run ${recordId}, because that run names another conversation (${other}) and ` +
        'this session has no note naming a record of its own. Nothing was written on that run.',
    )
  } else if (over) {
    runLinesNow.push(
      `This session's run ${recordId} reads ${String(run.state)}. A closed run is never reopened or written to, so nothing ` +
        'was stamped and no compaction was recorded on it. The next ordinary start files a new run.',
    )
  } else {
    runLinesNow.push(`This session is filed as record ${recordId}${typeof run.title === 'string' ? `, "${run.title}"` : ''}.` +
      (typeof run.doing === 'string' ? ` Doing: ${run.doing}` : ''))
    if (launched !== null) {
      // A LAUNCHED RUN IS NOT STAMPED AND ITS RECORD IS NOT READ FOR A STAMP: the process and the conversation this hook
      // can see are the sandbox's, while the office reads the processes outside it, so a stamp written here would name
      // a process the office cannot find.
      runLinesNow.push(
        `This run was launched in the sandbox at ${launched.folder}, and the process and the conversation this hook can ` +
          'see are inside that sandbox, while the office reads processes outside it, so it was not stamped and its record ' +
          'was not read for a stamp.',
      )
    } else {
      const existing = typeof run.discovered === 'object' && run.discovered !== null ? run.discovered : null
      const stampNeeded = !run.stamped || theProcessPatchFor(existing, processFacts) !== null || theCommandIsMissing(existing)
      const stampedNow = stampNeeded ? await stampTheRecord(recordId) : 'already-stamped'
      runLinesNow.push(stampedLine(stampedNow), processLine(stampedNow, recordId))
    }
    const compactions = Array.isArray(run.compactions) ? run.compactions : []
    const at = typeof said.answeredAt === 'string' ? said.answeredAt : null
    if (at === null) {
      runLinesNow.push('The one read gave no time of its own, so no compaction was recorded.')
    } else {
      const wrote = await ask(`/api/records/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        withStatus: true,
        body: JSON.stringify({ dataPatch: { compactions: [...compactions, { at, what: A_COMPACTION_REPORTED_BY_CLAUDE_CODE }] } }),
      })
      runLinesNow.push(
        wrote.status === 200
          ? `This compaction is recorded on run ${recordId}, at ${at} on the office's clock, as compaction ${String(compactions.length + 1)} of this run.`
          : `This compaction was NOT recorded on run ${recordId}: ${wrote.status === null ? `no answer (${String(wrote.error)})` : `Mole Office answered ${String(wrote.status)}${typeof wrote.body?.error === 'string' ? `: ${wrote.body.error}` : ''}`}.`,
      )
    }
  }

  // 3. WHERE THIS SESSION STANDS, WITH THE TIME THAT IS LEFT.
  const left = HOOK_BUDGET_MS - (performance.now() - hookStartedAt) - hookMs(1000)
  const standing = await ask('/api/where-you-stand', { withStatus: true, timeLimitMs: Math.max(1, Math.round(left)) })
  const stood =
    standing.status === 200 && standing.body !== null && typeof standing.body === 'object' &&
    typeof standing.body.waiting === 'object' && standing.body.waiting !== null
      ? standing.body
      : null
  const missed =
    stood !== null
      ? null
      : standing.status !== null && standing.status !== 200
        ? `${String(standing.status)}${typeof standing.body?.error === 'string' ? ` (${standing.body.error})` : ''}`
        : (standing.error ?? 'a reply that was not where this session stands')
  const brief = stood !== null ? stood.brief : { error: `GET /api/where-you-stand, which carries it, answered ${missed}.` }

  // A NAME NO AGENT IS REGISTERED UNDER is said as the handle door says it, from the role part's own sentence.
  const holdReading = said === null ? null : (said.role?.handle ?? null) === null ? { error: String(said.role?.says) } : (said.hold ?? null)
  const holdNote = recordId === null ? null : theHandleNote(holdReading, recordId)
  const who =
    AGENT === null
      ? 'The hook cannot tell which durable agent this session is, so it names none and claims no handle: neither the environment, nor a hold on its run, nor a .env names one.'
      : `You are answering as the agent "${AGENT}" here.${namedBy === null || namedBy === 'the environment (MOLE_OFFICE_AGENT)' ? '' : ` It is named by ${namedBy}.`}`
  const where =
    THE_RUN_THE_ENVIRONMENT_NAMES !== null && THE_CHILD_NOTE === null
      ? `This session is in the project "${WORKSPACE}", the one its environment names.`
      : noted?.workspace !== null && noted?.workspace !== undefined
        ? `This session is in the project "${WORKSPACE}", where the record its note names is.`
        : `This session asks in the project "${WORKSPACE}", the one its checkout or environment names.`

  printHookOutput([
    ...first,
    ...keptLines(stood),
    ...briefLines(brief),
    '',
    ...runLinesNow,
    '',
    who,
    where,
    ...theKeyLines(),
    '',
    waitingLine(stood?.waiting ?? null, missed),
    ...(launched === null
      ? (world.line === null ? [] : [world.line])
      : [theLaunchedRunsOfficeLine(launched)]),
    ...openLoopLines(stood?.openLoops ?? null, missed),
    'Not read after a compaction, to keep this inside ten seconds: the processes nobody claims (GET /api/resources/orphans), ' +
      'the other running sessions (GET /api/sessions?only=running), the handles (GET /api/handles), the resources ' +
      `(GET /api/resources) and the project of this directory (GET /api/onboarding${startDirectory === null ? '' : `?directory=${encodeURIComponent(startDirectory)}`}).`,
    ...(holdNote === null ? [] : ['', holdNote]),
    ...(skill === null ? [] : ['', skill]),
    '',
    "Write in plain words, and keep a person's own words when you cannot safely restate them.",
    'As you work: file what you find in Mole Office as it happens, not at the end. A finding that only exists in this conversation is lost when the conversation is.',
  ])
  process.exit(0)
}

const lines = [
  ...ownerLines,
  'MOLE OFFICE — the state of this project, read at the start of this session.',
  // THE BRIEF'S OPENING AFTER THE MARKER, AND IT OPENS WITH THIS AGENT'S NOTEBOOK. Criterion N4, their words of
  // 11 September 2026: the secretary should be able to restore its method and character even if the model changes. The notebook is the first
  // thing inside `head`, written by `theNotebookOpening` in src/shared/notebook.ts, so putting the
  // opening here puts the notebook before the rest of the project state this hook says.
  //
  // WHY NOT ABOVE THE LINE ABOVE. That line is the wiring check: chapter 9 rule 6 and USER.md both
  // say a session looks for a line beginning "MOLE OFFICE —" and reads its absence as the hook being
  // gone. It is one line and it is not content, so the notebook is the first project state a run READS while
  // the marker stays where every reader is told to look for it.
  //
  // IT WAS ELEVENTH UNTIL 11 SEPTEMBER 2026, after the waiting count, the orphan count, the other
  // runs, the transcript line, the world line and the open loops. Those are all still here and all
  // still said; what changed is that none of them now stands between a run and its own notebook.
  ...keptLines(stood),
  ...briefLines(brief),
  '',
  yours,
  '',
  ...hereLines(),
  '',
  waitingLine(stood?.waiting ?? null, missed),
  unclaimed === 0
    ? 'Nothing is running that nobody claims.'
    : `${unclaimed} process${unclaimed === 1 ? '' : 'es'} on this machine ${unclaimed === 1 ? 'belongs' : 'belong'} to no session. GET /api/resources/orphans.`,
  ...runLines(),
  // WHETHER THIS RUN'S CONVERSATION IS WRITTEN DOWN, said out loud rather than left to be assumed.
  // Without it, a run whose transcript nobody located looks exactly like one whose transcript was
  // recorded, and the difference is whether anybody can ever pick this work up again.
  stampedLine(stamped),
  // WHETHER THIS RUN'S OWN PROCESS IS ON ITS RECORD. The session behind a wait writes nothing to
  // its transcript, so this is the process the office reads later to answer whether it is still
  // there. Said out loud when the hook's parent is not the claude program, so an unrecorded process
  // is a stated absence and not a surprise.
  processLine(stamped, id),
  // WHICH WORLD THIS SESSION IS FILED IN, criterion G3 and act 2 of section 4. Only ever the
  // matching line: a session that reached here has already passed the check, and a mismatch stopped
  // this script before anything was written.
  ...(worldCheck.line === null ? [] : [worldCheck.line]),
  ...openLoopLines(open, missed),
  ...(handleLine === null ? [] : ['', handleLine]),
  ...(skill === null ? [] : ['', skill]),
  '',
  INSTALLED
    ? "Read GET /api/project/bootstrap first, then the mole-office skill's SKILL.md. The invariants are the skill's operating rules."
    : 'Read GET /api/project/bootstrap first, then CLAUDE.md. The invariants are in CLAUDE.md or in a file it pulls in.',
  // THE HANDOVER IS NOT IN ANY REPLY THIS START ALREADY READS, so it is named and not read (wave 13k round 46).
  ...(AGENT === null ? [] : [`Your handover, the newest one written for "${AGENT}" in this project: GET /api/agents/${AGENT}/handover.`]),
  // Keep both reminders at every start, as the secretary asked in message d1MayT25qNMU (problem NSOa-cFZLg66).
  "Write in plain words, and keep a person's own words when you cannot safely restate them.",
  'As you work: file what you find in Mole Office as it happens, not at the end. A finding that only exists in this conversation is lost when the conversation is.',
]

printHookOutput(lines)
