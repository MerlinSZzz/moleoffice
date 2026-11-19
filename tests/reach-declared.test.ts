// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old route inventory predates leases. Five new resource acts are now explicitly driven/classified as local; every existing remote refusal remains. */
/**
 * EVERY /api ROUTE HAS SAID WHETHER ANOTHER MACHINE MAY ASK FOR IT.
 *
 * Mole Office listens on loopback and has no login, so today every request already comes from this
 * machine. `design/round-ten/design/remote-access.md` is the plan for letting the owner's other
 * machine reach it over the owner's own private network, and the word each route declares here is what
 * decides, then, which acts do not go.
 *
 * WHY THE DECLARATIONS LAND BEFORE ANYTHING READS THEM. A route nobody has classified is a hole
 * nobody has looked at, and the day the second listener is switched on is the wrong day to find
 * out how many there are. So the registration guard is green first, over the whole surface, and
 * the enforcement follows.
 *
 * The guard refuses to register a route that has not said, which means the server does not start.
 * Degrading to "remote access is off" would hide a missing word until it mattered.
 */

import { PRIVATE_LOGIN_ROUTES } from '../src/shared/private-sandbox-login.ts'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { trackApiRoutes, type ApiRoute } from '../src/server/api/kinds.ts'
import { REACHES } from '../src/shared/reach.ts'
import { WHY_REFUSED } from '../src/shared/authority.ts'

/**
 * The acts that stay on this machine, and why each one does.
 *
 * This list and the routes are the same fact in two places on purpose: it is the lock, and a
 * disagreement between them fails this test rather than passing quietly. `remote-access.md`
 * section 6.7 is where the argument for each is written out.
 */
const LOCAL_ONLY: ReadonlyArray<readonly [string, string]> = [
  ...PRIVATE_LOGIN_ROUTES.map(({ method, path }) => [
    `${method} /api${path}`, 'it reaches the private login service in the holder on this machine',
  ] as const),

  ['GET /api/office/storage-destinations', 'it reads credential presence from this computer’s host secrets file'],
  ['POST /api/office/storage-destinations', 'it writes credentials in this computer’s host secrets file'],
  ['POST /api/resources/sweep', 'it checks processes on this machine before closing ended runs’ rows'],
  ['POST /api/resources/:id/release', 'it kills a process group on the machine Mole Office runs on'],
  // A SESSION SAYING WHICH CLAUDE PROCESS IT IS, on the record it holds a handle for. The office reads
  // that process itself before it writes anything, and it can only read the process table of the machine
  // it runs on; a number sent from another computer would name whatever is running here under it.
  [
    'POST /api/handles/:handle/process',
    'a process number means something only on its own machine, and the office reads the process itself ' +
      'before it writes it down',
  ],
  [
    'POST /api/office/trusted-machines',
    'deciding which machines this office trusts, from another machine, is the door widening the door it ' +
      'came through',
  ],
  [
    'POST /api/office/trusted-machines/:id/remove',
    'taking a machine off the trusted list is the same act read the other way, and is reserved to the owner ' +
      'for the same reason',
  ],
  // CONFIRMING AND ENDING A VISITING CREDENTIAL ARE THE PERSON'S PRESS, kept here since 13 September 2026
  // (problem MLcj9RHaDkLa). On P83 the owner decided that the first confirmation is made where the office
  // runs.
  ['POST /api/office/visitors/:id/confirm', 'the person’s press: confirming a visiting credential is made where the office runs'],
  ['POST /api/office/visitors/:id/end', 'the person’s press: ending a visiting credential is made where the office runs'],
  // REVOKING A KEY HELD BY ONE ROW, criterion D3, P83 point 4. It is the person's press, and a
  // caller from another machine revoking a key is the door being asked to take away the key that
  // would have proved who it is.
  [
    'POST /api/office/held-keys/:id/revoke',
    'revoking a key is the person’s press, and a caller from elsewhere revoking one is the door taking ' +
      'away the proof of who asked',
  ],
  [
    'POST /api/office/held-keys/:id/revoke/undo',
    'bringing back an Embassy key requires the same owner-only proof as revoking it',
  ],
  // CLOSING THE ONE-VERSION KEY WINDOW, criterion P83 point 6. It is the person's press, and a caller
  // from another machine closing the window is the door being asked to shut the door it came through.
  [
    'POST /api/office/key-window/close',
    'closing the window is the person’s press, and a caller from elsewhere closing it is the door being ' +
      'asked to shut the door it came through',
  ],
  // PAIRING THIS BROWSER, criterion P83 point 2. Pairing is offered on the machine Mole Office runs
  // on and nowhere else: the listener's stamp is the proof that the caller is at the office, and a
  // browser from another computer joins through the credential flow that already exists.
  [
    'POST /api/office/pairing',
    'pairing is offered at the computer Mole Office is running on, and a browser elsewhere joins through ' +
      'the Embassy instead',
  ],
  [
    'POST /api/preview-roots',
    'adding a folder on this computer to the ones a preview may read, asked from another machine, would be '
      + 'the door widening what this server reads off its own disk',
  ],
  [
    'POST /api/participants/agent/:id/new-key',
    'giving an agent a new key revokes and makes keys in this installation\'s own registry, and it is that ' +
      'agent\'s starter\'s, proved by its own key',
  ],
  [
    'POST /api/participants/agent/:id/retire',
    'closing an agent is an act about this installation\'s own registry, and it is the owner\'s or that ' +
      'agent\'s starter\'s',
  ],
  // A SESSION A PERSON STARTED REGISTERS ITSELF, F15 point 2. Kept on this machine because P88 judges a
  // self-registration by the listener it arrived on, and because the working directory and the process
  // behind the hook are facts of this machine rather than claims from another one.
  [
    'POST /api/agents/register-myself',
    'a self-registration is judged by the listener it arrived on, and it records facts of this machine',
  ],
  [
    'POST /api/resources/:id/withdraw',
    'it changes what the list of what is running on this machine says, and that list is what somebody ' +
      'tidying up acts on',
  ],
  ['POST /api/resources', "a ledger row's liveness is checked against this host's process table"],
  // THE MACHINE'S SHARED TEST SEATS, DECISIONS R7(2). The holder is a process group in this host's
  // process table and the seats are this host's, so neither door means anything asked from elsewhere.
  ['POST /api/slots/acquire', "the seat is this machine's and its holder is a process group in this host's process table"],
  ['POST /api/slots/:id/release', 'giving a seat back lets the next run on this machine start'],
  ['POST /api/runtime/register', "it writes down what is running on this machine, read from this host's own process table"],
  ['POST /api/runtime/stop', 'it signals a process group on the machine Mole Office runs on'],
  // A RUN THAT WILL NOT STOP, stopped by its starter, its supervisor or a secretary. It revokes the run's key and
  // signals the process group the ledger recorded for the run, on the machine Mole Office runs on.
  ['POST /api/runtime/runs/:id/stop', "it signals a run's recorded process group on the machine Mole Office runs on"],
  ['POST /api/office/worlds/:id/stop',
    'it signals the process groups of a world running on the machine Mole Office runs on, which the row beside it ' +
      'does for a run. Criterion C32: the press that stops a world the person was asked to look at.',
  ],
  ['POST /api/office/interrupted-runs/:session/resume',
    'the press leads to a run started on the machine Mole Office runs on. Criterion W7: one press resumes an ' +
      'interrupted run.',
  ],
  ['POST /api/office/shut-down',
    'it stops the runs at work on the machine Mole Office runs on by their process groups, and then the server ' +
      'itself. Criterion W6: the shutdown that pauses the runs first.',
  ],
  // THE OFFICE'S OWN TERMINALS, wave 13u. Each door reaches the terminal holder, a process on this machine, over a
  // socket only this machine has. Since wave 13u round 14, point (d) of a decision, the person's own key reaches the
  // doors one terminal's view asks from another computer over an encrypted door (thePersonMayFromAnotherComputer),
  // and each input records where it came from; for everybody else every door stays here.
  ['GET /api/terminals', "it asks the terminal holder, a process on this machine, over this machine's own socket"],
  ['POST /api/terminals', 'it starts a command in a terminal on the machine Mole Office runs on'],
  ['GET /api/terminals/:id/stream', "it reads a terminal's screen, which can hold a key, from the holder on this machine"],
  ['POST /api/terminals/:id/input', 'it types into a terminal on this machine; the person may type from another computer with their own key'],
  ['POST /api/terminals/:id/resize', 'it resizes a terminal on the machine Mole Office runs on'],
  ['POST /api/terminals/:id/close', "it signals a terminal's process group on the machine Mole Office runs on"],
  // THE PERSON'S TYPING AS THE PERSON'S OWN WORDS (wave 13u, round 3): the last line they typed, read from the holder on this machine.
  ['POST /api/terminals/holder/start', 'it starts the terminal holder, a process on the machine Mole Office runs on'],
  // RESTARTING THE TERMINAL HOLDER, wave 13u round 23.
  ['POST /api/terminals/holder/restart', "it signals the terminal holder's process group on the machine Mole Office runs on, and starts a new holder there"],
  ['GET /api/terminals/:id/last-line', 'it reads what the person last typed into a terminal on this machine, from the holder here'],
  ['POST /api/terminals/:id/keep-my-line', 'it keeps a line typed into a terminal on this machine as the person\'s own words'],
  // THE PERSON'S TYPING KEPT WITH NO PRESS, wave 13u round 4.
  ['GET /api/terminals/:id/keeping', 'it reads from the holder on this machine whether a terminal keeps what the person types'],
  ['PUT /api/terminals/:id/keeping', 'it tells the holder on this machine to keep, or stop keeping, what the person types into a terminal'],
  // THE INSTALL PRESS, wave 13u round 3. The list runs each agent tool's --version on this machine, and the press opens
  // a terminal here that installs programs into this machine's home.
  ['GET /api/harnesses', 'it runs each agent tool on the machine Mole Office runs on to read its version'],
  ['POST /api/harnesses/install', 'it opens a terminal on the machine Mole Office runs on that installs programs there'],
  // A READINESS CHECKLIST, wave 13u round 13. The last signature runs the gated operation, and both gated operations
  // act on this machine: the install opens a terminal here, and the stop signals processes here.
  ['POST /api/readiness', 'raising a checklist signs it, and the signature that completes it runs a gated operation on the machine Mole Office runs on'],
  ['POST /api/readiness/:id/sign', "an agent's signature that completes a checklist runs a gated operation on the machine Mole Office runs on"],
  ['POST /api/readiness/:id/sign-as-the-person', "the person's signature that completes a checklist runs a gated operation on the machine Mole Office runs on"],
  // START AT LOGIN, wave 13u piece H9. Both doors ask systemd on this computer, under this server's login, and the press
  // writes a unit into the owner's home directory here.
  ['GET /api/office/start-at-login', "it asks systemd and loginctl on this computer about the owner's login"],
  ['POST /api/office/start-at-login', "it writes a systemd user unit into the owner's home directory on this computer and enables it here"],
  // THE DATA FOLDER, criteria DF19 to DF21. The read answers from this computer's `.env`, database folder and move
  // mark; the move starts a process here that stops this office, copies the folder on this machine and switches this
  // computer's `.env` line; and the confirm removes the old folder's copied files here.
  ['GET /api/office/data-folder', "it reads this computer's .env line, database folder and move mark"],
  [
    'POST /api/office/data-folder/move',
    'it starts a process on this computer that stops the office, copies its data folder here and switches this computer\'s .env line',
  ],
  ['POST /api/office/data-folder/confirm', "it removes the old data folder's copied files on this computer"],
  // ONE MEMORY LIMIT FOR ALL SANDBOXES TOGETHER. The read asks this computer's systemd, and the
  // press runs pkexec here, whose password dialog appears on this computer's screen.
  ['GET /api/office/sandbox-memory-cap', "it asks this computer's systemd how much memory the sandboxes together may use"],
  ['POST /api/office/sandbox-memory-cap', "it runs pkexec on this computer, whose password dialog appears on this computer's screen, to set a limit on this computer's systemd"],
  ['POST /api/terminals/agents', 'it starts an agent program in a terminal on the machine Mole Office runs on, and hands it a key of that agent'],
  // THE WAY BACK, wave 13u round 10: the read looks at this machine's processes for one still running the run, and the
  // press starts the run's program again in a terminal here, with a key of that agent.
  ['GET /api/terminals/agents/:agent/way-back', "it reads this machine's processes to say whether an agent's run still runs here"],
  ['POST /api/terminals/agents/:agent/way-back', "it starts an agent's program again in a terminal on the machine Mole Office runs on, and hands it a key of that agent"],
  // AN AGENT'S TMUX PANE, wave 13u round 10: the read asks ps and tmux on this machine, and the press opens a terminal
  // here that attaches to the owner's tmux server and types into the agent's pane.
  ['GET /api/terminals/agents/:agent/pane', "it reads this machine's processes and its tmux server to find an agent's pane"],
  ['POST /api/terminals/agents/:agent/pane', "it opens a terminal on the machine Mole Office runs on that watches and types into an agent's tmux pane there"],
  ['GET /api/terminals/agents/:agent/steps', "it reads the conversation file a sandboxed run writes on the machine Mole Office runs on"],
  // A QUICK INPUT, wave 13u round 21: the holder on this machine types an input from the owner's list into the asking
  // agent's own terminal here.
  ['POST /api/terminals/quick-input', "it types an input from the owner's list into an agent's terminal on the machine Mole Office runs on"],
  // THE OFFICE'S OWN KEYS, criterion U2. Setting one writes a file beside the database on this
  // computer, and the read asks each agent tool on this computer about its own key. Neither act
  // means anything asked from another machine, so all three stay here.
  [
    'GET /api/office/keys',
    'it reads a file on this computer and runs each agent tool here to ask whether it has its own key',
  ],
  [
    'POST /api/office/keys/set',
    'it writes one of the office\'s own keys into the file beside the database on this computer',
  ],
  [
    'POST /api/office/keys/test',
    'it sends one of the office\'s own keys to its provider from the computer that holds the file',
  ],
  ['GET /api/settings/provider-keys', 'it describes a key setup kept on this computer'],
  ['POST /api/settings/provider-keys', 'it writes a private key on this computer'],
  ['POST /api/settings/provider-keys/trial', 'it reads and tests a private key from this computer'],
  // THE MAIL TOOL, as one of the owner's decisions sets it out. It runs under the owner's login
  // on this computer and its page listens on this computer only, so the read of where it is and the press
  // that installs it both stay here.
  [
    'GET /api/office/mail-tool',
    'it asks systemd on this computer whether the mail tool runs, and hands out its page, which listens only here',
  ],
  [
    'POST /api/office/mail-tool/install',
    'it writes the mail tool\'s service and key into the owner\'s home directory on this computer and starts it here',
  ],
  // AND THE PERSON'S PRESS THAT TURNS IT OFF: systemd on this computer stops the service.
  [
    'POST /api/office/mail-tool/disable',
    'it has systemd on this computer stop the mail tool and no longer start it at the owner\'s login, and writes its place',
  ],
  [
    'POST /api/office/mail-tool/take-back-key',
    'the person’s personal tool key is taken back on this computer beside its install and disable presses',
  ],
  // AND THE PERSON'S READ OF THE TOOL'S OWN SETTINGS THROUGH THE OFFICE: the tool answers only here,
  // so the office here asks it for the person; the person reaches it from a paired device over an encrypted
  // door.
  [
    'GET /api/office/mail-tool/state',
    'it asks the mail tool on this computer for its state, at the one address the office knows, and passes it on',
  ],
  // AND THE PERSON'S THREE PRESSES ON THE TOOL'S OWN SETTINGS, passed on to the tool here the same way.
  [
    'POST /api/office/mail-tool/addresses',
    'it passes the person\'s list of addresses on to the mail tool on this computer, at the one address the office knows',
  ],
  [
    'POST /api/office/mail-tool/account',
    'it passes the account the person picked on to the mail tool on this computer, at the one address the office knows',
  ],
  [
    'POST /api/office/mail-tool/test',
    'it asks the mail tool on this computer to send a test letter, at the one address the office knows',
  ],
  // PUSH. The office's signing key and the devices the person allowed are
  // kept in the same key file on this computer, and the test press posts from here, so all four stay here; the person
  // reaches them from a paired device over an encrypted door (thePersonMayFromAnotherComputer).
  [
    'GET /api/office/push',
    'it reads the devices that take notifications from the key file beside the database on this computer',
  ],
  [
    'POST /api/office/push/devices',
    'it writes a device that takes notifications into the key file beside the database on this computer',
  ],
  [
    'POST /api/office/push/devices/remove',
    'it takes a device out of the key file beside the database on this computer',
  ],
  [
    'POST /api/office/push/test',
    'it signs a notification with the office\'s key and posts it from the computer that holds the file',
  ],
  // NAMING THE OFFICE'S OWNER: only the person, in their own browser here.
  [
    'POST /api/office/owner',
    'only the person names themselves, in their own browser on the computer the office runs on',
  ],
  // THE ENTRY THAT FOLLOWS THE PERSON, F15 point 1. It writes into the owner's own home directory —
  // the one place on this machine that belongs to no project — so it is the person's press and nothing asked
  // from another computer means anything.
  [
    'POST /api/office/install-the-entry',
    'it writes the skill link and three hook lines into the owner\'s home directory on this computer',
  ],
  // THE SAME ENTRY, FOR CODEX AND OPENCODE. The piece that split the skill, F15 point 5. The plan is a read of
  // this computer's disk — Codex's and OpenCode's own home directories are only meaningful here —
  // and the write is the person's press for the same reason the entry above is.
  [
    'GET /api/office/install-the-entry/other-runtimes',
    "it reads Codex's and OpenCode's own directories on this computer, which mean nothing asked from elsewhere",
  ],
  [
    'POST /api/office/install-the-entry/other-runtimes',
    "it writes Codex's or OpenCode's global instructions file into the owner's home directory on this computer",
  ],
  // THE SANDBOXES' LOGINS. The file they are kept in is on this computer and the
  // sandboxes that read it run here, so reading which are set, setting one and clearing one all stay here.
  [
    'GET /api/office/sandbox-logins',
    "it reads which logins the sandboxes' secrets file on this computer holds",
  ],
  [
    'POST /api/office/sandbox-logins/set',
    "it writes one login into the sandboxes' secrets file on this computer",
  ],
  [
    'POST /api/office/sandbox-logins/clear',
    "it takes one login out of the sandboxes' secrets file on this computer",
  ],
  // THE PROVIDER ROUTER'S KEY SLOTS, item 12 of the key layer. The slots file is in the owner's home on this computer and
  // the router that reads it runs here, so reading the slots, adding one and removing one all stay here.
  [
    'GET /api/provider-router/key-slots',
    "it reads the OpenCode Go slots in the provider router's key slots file on this computer",
  ],
  [
    'POST /api/provider-router/pin',
    "it selects a Go key slot in the provider router's key slots file on this computer",
  ],
  [
    'POST /api/provider-router/key-slots/add',
    "it writes one OpenCode Go key into the provider router's key slots file on this computer",
  ],
  [
    'POST /api/provider-router/key-slots/remove',
    "it takes one OpenCode Go slot out of the provider router's key slots file on this computer",
  ],
  ['POST /api/export', "it writes files into a directory on this host's disk"],
  ['POST /api/export/workspace', "it writes files into a directory on this host's disk"],
  ['POST /api/import', 'it replaces every authored table from an archive on this host'],
  ['POST /api/sessions/discover', "it files what is on this machine's disk as records"],
  ['POST /api/agent/threads/:id/dispatch', 'it is the one route where a request can start a process here'],
  ['POST /api/planning/intents/:id/commit', 'committing an intent is reserved to the owner, and no guard reaches it'],
  [
    'POST /api/records/:id/revisions/:seq/revoke',
    'taking back an act made on the owner’s own words is the person’s, and it is pressed at the machine Mole Office runs on',
  ],
  ['POST /api/planning/proposals/:id/apply', "applying a proposal is reserved to the owner, and its check is not in any guard"],
  // THE IMPLEMENTATION MAP'S FOUR. Each one is about THIS MACHINE'S DISK or is the person's own
  // settling act, and neither reads sensibly from somewhere else.
  ['POST /api/implementation/repositories', 'it takes an absolute root on this host and checks it is a directory here'],
  [
    'PATCH /api/implementation/repositories/:id',
    'it re-points at a directory on this host, and deletes everything derived from the tree it is leaving',
  ],
  [
    'DELETE /api/implementation/repositories/:id',
    'it deletes an index and the findings built from a tree on this host',
  ],
  ['POST /api/implementation/rebuild', 'it walks a directory on the machine Mole Office runs on'],
  [
    'POST /api/implementation/:id/accept',
    'accepting a guess is what turns it into ownership, and assertMayAcceptAGuess reserves it to the person',
  ],
  // The three run routes below are NOT settled. `agent-coordination.md` section 10.3 declares them
  // local; `remote-access.md` section 6.8 argued them remote. Both quote the owner, so it is the owner's,
  // and it is proposal Mk1VfP8L31Uz. Until the owner answers, both threads hold them local -- the
  // direction both documents call the safe one -- and reversing it is one word per route.
  // THE THREE RUN ROUTES LEFT THIS LIST ON ANSWER 3, which settled proposal
  // Mk1VfP8L31Uz: a worker on another machine may read the queue, claim a run and return its result.
  // Criterion P21. Starting one stayed here — the dispatch below — which is criterion P22.
  // THE MESSAGE WORKER'S DOORS. Every one of them is about a run that is a process in THIS machine's
  // process table, so a caller elsewhere asking any of them would be talking about another machine's
  // processes. They carry `starts-work-on-this-machine` rather than `acts-on-this-machine`, because
  // that is the reason the rule itself names, and a reader should meet the rule's own words.
  ['POST /api/worker/gates/run-out', 'the office on this machine removes ended gate choices and records their fallback'],
  ['GET /api/worker/queue', 'the runs it is about are processes in this host\u2019s own process table'],
  ['GET /api/worker/runs', 'the runs it lists are processes in this host\u2019s own process table'],
  ['GET /api/worker/waits', 'the runs it lists are processes in this host\u2019s own process table'],
  // SANDBOX V1, PIECE P9: the merge tool runs it lists are processes in this host's own process table,
  // and the entries it names are what the worker here is about to start the merge tool for.
  ['GET /api/worker/merges', 'the merge tool runs it lists are processes in this host\u2019s own process table'],
  // THE END OF A RESOLVING ENTRY'S HOUR, XHY2fVFG3Qq8 answer 2: the entry the merge list here named is
  // re-read here and bounced here, as the worker on this machine asks.
  ['POST /api/worker/merges/hand-backs/:problem/a-person-must-look', 'it acts on the local office hand-back reading'],
  ['POST /api/worker/merges/hand-backs/:problem/take-back', 'it acts on the local office hand-back reading'],
  ['POST /api/worker/merges/hand-backs/:problem/fixed-on-main', 'it acts on the local office hand-back reading'],
  ['POST /api/worker/merges/:entry/hour-over', 'it bounces an entry whose hour the worker here read as over'],
  ['POST /api/worker/waits/:session/over', 'it says a run on this machine waited and none came'],
  ['POST /api/worker/runs/:session/cut-off', 'it ends a run on this machine that a restart here cut off'],
  // THE RESUMES THE PERSON ASKED FOR, criterion W7. The worker here reads them and starts each run here.
  ['GET /api/worker/resumes', 'the runs it lists are about to be started on this machine'],
  ['POST /api/worker/runs/:session/resumed', 'it says which run this machine started for a resume, or why none'],
  ['POST /api/worker/messages/:id/taken', 'it names a run started on the machine Mole Office runs on'],
  ['POST /api/worker/messages/:id/needs-no-run', 'it says a run was not started on this machine, and why'],
  ['POST /api/worker/messages/:id/held', 'it says why no run could be started on this machine'],
  ['POST /api/worker/messages/:id/answered', 'it files what a run on this machine said'],
  // THE NEXT ROUNDS, wave 13j round loop-2. The worker here reads them and starts the sandbox launcher here, and says
  // how that launcher, a process in this host's own process table, ended. Asking for a round is remote: it starts nothing.
  ['GET /api/worker/rounds', 'the rounds it lists are about to be started on this machine'],
  ['POST /api/worker/rounds/:run/held', 'it records why a round could not start on this machine'],
  ['POST /api/worker/rounds/:run/starting', 'it hands the launcher this machine starts what it needs to start a round'],
  ['POST /api/worker/rounds/:run/ended', 'it says how a launcher process on this machine ended'],
  // THE WORKER RUNS, wave 13j round loop-3. As with the next rounds, the worker here reads them, starts the
  // sandbox launcher here, and says how that launcher ended. Asking for a worker run is remote: it starts nothing.
  ['GET /api/worker/worker-runs', 'the worker runs it lists are about to be started on this machine'],
  ['POST /api/worker/worker-runs/:run/starting', 'it hands the launcher this machine starts what it needs to start a worker run'],
  ['POST /api/worker/worker-runs/:run/ended', 'it says how a launcher process on this machine ended'],
  // THE DEAD-LETTER SWEEP, criterion M111. The worker presses it on this machine once a pass, and it
  // broadcasts this installation's own queue to its own secretaries — an act about this machine's
  // own office, not one a caller elsewhere has anything to say about.
  ['POST /api/dead-letters/sweep', 'it broadcasts this installation’s own dead-letter backlog, and the worker presses it here'],
  // THE PERSON LETTING A SECRETARY ACT FOR THEM, AND ENDING IT. Criterion P59. They carry
  // `reserved-to-the-owner`, which is the reason: it is the person's press at their own keyboard, and nothing
  // in Mole Office authenticates anybody, so `human` on a request from another machine is a claim
  // and not a fact. Keeping the act here is the only half of that the product can enforce.
  ['POST /api/roles/elevation/:handle', 'it hands the person’s own acts to an agent, and it is the person’s press'],
  ['DELETE /api/roles/elevation/:handle', 'it takes them back, and only the person may'],
  ['POST /api/roles/card/:handle', 'it gives an agent a role card, which is the person’s press, and an agent’s only within its own rank'],
]

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the whole registered surface has declared', () => {
  it('gives every route one of the two words', () => {
    const wrong = routes.filter((r) => !(REACHES as readonly string[]).includes(r.reach))
    expect(wrong.map((r) => `${r.method} ${r.path} -> ${String(r.reach)}`)).toEqual([])
  })

  it('keeps exactly the acts above on this machine, and nothing else', () => {
    const declaredLocal = routes.filter((r) => r.reach === 'local').map((r) => `${r.method} ${r.path}`)
    expect(declaredLocal.sort()).toEqual(LOCAL_ONLY.map(([key]) => key).sort())
  })

})

describe('a route that has not declared its reach does not register', () => {
  const register = async (config: unknown): Promise<void> => {
    const bare = Fastify({ logger: false })
    trackApiRoutes(bare)
    bare.get('/api/a-route-under-test', { config } as never, async () => ({ ok: true }))
    await bare.ready()
    await bare.close()
  }

  it('refuses a route with no reach at all, and names the endpoint', async () => {
    await expect(register({ operation: 'record.read' })).rejects.toThrow(
      /GET \/api\/a-route-under-test declares no config\.reach/,
    )
  })

  it('refuses a word that is not one of the two, and names the endpoint and the word', async () => {
    await expect(register({ operation: 'record.read', reach: 'loopback' })).rejects.toThrow(
      /GET \/api\/a-route-under-test declares config\.reach as "loopback"/,
    )
  })

  it('accepts a route that declared all of it, so the refusals above are about the declaration', async () => {
    await expect(
      register({
        operation: 'record.read',
        reach: 'local',
        keptHere: { because: 'acts-on-this-machine', act: 'Doing the thing on this computer' },
      }),
    ).resolves.toBeUndefined()
    await expect(register({ operation: 'record.read', reach: 'remote' })).resolves.toBeUndefined()
  })
})

/**
 * AN ACT KEPT ON THIS MACHINE SAYS WHICH OF THE THREE REASONS IT IS.
 *
 * `GET /api/access` publishes the refusal so the browser can decline to draw a control rather than
 * drawing one and being refused, and a published refusal with no reason is one a person cannot
 * argue with. The word is the route author's, written on the day they choose `local`.
 *
 * THIS IS A CRITERION THIS WAVE MADE STRICTER, said plainly: before it, `reach: 'local'` on its own
 * registered. The test above changed with the rule, in the same commit as the rule, and the two
 * cases below are what the new rule buys.
 */
describe('a route kept on this machine says why', () => {
  const register = async (config: unknown): Promise<void> => {
    const bare = Fastify({ logger: false })
    trackApiRoutes(bare)
    bare.get('/api/a-route-under-test', { config } as never, async () => ({ ok: true }))
    await bare.ready()
    await bare.close()
  }

  it('refuses a local route that says nothing, and names the endpoint', async () => {
    await expect(register({ operation: 'record.read', reach: 'local' })).rejects.toThrow(
      /GET \/api\/a-route-under-test declares reach "local" and no config\.keptHere/,
    )
  })

  it('refuses a reason that is not one of the three', async () => {
    await expect(
      register({
        operation: 'record.read',
        reach: 'local',
        keptHere: { because: 'because-i-said-so', act: 'Doing the thing' },
      }),
    ).rejects.toThrow(/declares config\.keptHere\.because as "because-i-said-so"/)
  })

  it('refuses a reason with no act in words, because the refusal a person reads starts with it', async () => {
    await expect(
      register({ operation: 'record.read', reach: 'local', keptHere: { because: 'acts-on-this-machine' } }),
    ).rejects.toThrow(/declares config\.keptHere\.act as undefined/)
  })

  it('refuses a remote route that carries a reason, because it refuses nobody', async () => {
    await expect(
      register({
        operation: 'record.read',
        reach: 'remote',
        keptHere: { because: 'acts-on-this-machine', act: 'Doing the thing' },
      }),
    ).rejects.toThrow(/declares reach "remote" and also config\.keptHere/)
  })

  it('gives every live local route one of the three and an act in words, and no remote route either', () => {
    const wrong = routes.filter((r) =>
      r.reach === 'local'
        ? r.keptHere === undefined ||
          !(WHY_REFUSED as readonly string[]).includes(r.keptHere.because) ||
          r.keptHere.act.trim().length < 8
        : r.keptHere !== undefined,
    )
    expect(wrong.map((r) => `${r.method} ${r.path} -> ${JSON.stringify(r.keptHere)}`)).toEqual([])
  })
})
