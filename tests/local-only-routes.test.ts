// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old route inventory predates leases. Five new resource acts are now explicitly driven/classified as local; every existing remote refusal remains. */
/**
 * AN ACT KEPT ON THIS MACHINE IS NOT REACHABLE THROUGH THE LISTENER FOR OTHER MACHINES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING CLAIMED, AND AGAINST WHICH LISTENER
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/remote-access.md` §6.5 puts one request hook in front of every `/api`
 * route: a request that arrived through the listener for other machines, at a route declared
 * `reach: 'local'`, is refused 403 before any handler runs. §6.7 says which acts and why — six
 * because they act on the machine Mole Office runs on, and two the product reserves to the owner that no
 * guard reaches, both measured rather than assumed.
 *
 * These cases drive **the product's own second listener** — `listenForOtherMachines` out of
 * `src/server/index.ts`, the function `start()` calls — rather than a copy of it written here. A
 * test that built its own door would be proving that its own door works.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY LOCAL ROUTE HAS A DRIVE, AND WHY THAT LIST IS NOT THE ROUTE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * `DRIVES` below is a concrete request per `local` route. It is deliberately a second list, and the
 * first case binds it to the route table so neither can move without the other: a route that
 * becomes `local` with no drive fails, and a drive naming a route that does not exist fails.
 *
 * That is what makes the plan's mutation land where it says. **MUTATION:** change one route's
 * `reach` to `'remote'` — `POST /api/export` was used — and the second case goes red **naming that
 * route**, because its drive is still here and stops being refused. A test written over the route
 * table alone would follow the mutation and stay green.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING DESTRUCTIVE IS DRIVEN THROUGH THE LOCAL DOOR
 * ---------------------------------------------------------------------------------------
 *
 * The hook refuses at `onRequest`, before the body is parsed and before any handler runs, so
 * driving `POST /api/import` through the door for other machines does nothing at all. Driving it
 * through the door for THIS machine would replace every authored table. So the both-directions case
 * uses two safe routes and says so, and the wide sweep is only ever asked of the refusing door.
 */

import { isPrivateLoginRequest } from '../src/config/private-sandbox-login.mjs'
import { PRIVATE_LOGIN_ROUTES } from '../src/shared/private-sandbox-login.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { installTheEntry, theOwnersHome } from '../src/config/install-the-entry.mjs'
import type { ApiRoute } from '../src/server/api/kinds.ts'

/** One real request, and the route it is a request for. */
interface Drive {
  /** The route as the table writes it, `METHOD /api/path` with `:id` left in. */
  route: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** The same path with a concrete value in place of every parameter. */
  url: string
}

/**
 * One drive per `local` route. The ids are deliberately names of nothing: the refusal happens
 * before the handler, so nothing here has to exist.
 */
const DRIVES: readonly Drive[] = [
  // Private sign-in reaches the holder on this machine; every declared door still needs a refusing drive.
  ...PRIVATE_LOGIN_ROUTES.map(({ method, path }) => ({
    route: `${method} /api${path}`, method, url: `/api${path.replace(':attempt', 'a'.repeat(32))}`,
  })),

  // THE THREE RUN ROUTES ARE NOT HERE ANY MORE, and their absence is a decision rather than an
  // omission. They were held `local` while agent-coordination.md and remote-access.md disagreed and
  // each claimed the rule. A worker on another machine may read the
  // queue, claim a run and return its result, which is criterion P21. Starting one did not move —
  // the dispatch below is still here — and that is criterion P22.
  {
    route: 'POST /api/agent/threads/:id/dispatch',
    method: 'POST',
    url: '/api/agent/threads/no-such-thread/dispatch',
  },
  // A SESSION A PERSON STARTED REGISTERS ITSELF, F15 point 2. Kept on this machine because P88 judges
  // a self-registration by the listener it arrived on, and because the working directory and the
  // process are facts of this machine rather than claims from another one.
  { route: 'POST /api/agents/register-myself', method: 'POST', url: '/api/agents/register-myself' },
  { route: 'POST /api/export', method: 'POST', url: '/api/export' },
  // A SESSION RECORDING WHICH CLAUDE PROCESS IT IS, on the record it holds a handle for. Kept on this
  // machine because a process number names a process in ONE process table: sent from another computer it
  // would name whatever happens to be running here under that number. The office reads the process itself
  // before it writes anything, and it can only read this machine's.
  {
    route: 'POST /api/handles/:handle/process',
    method: 'POST',
    url: '/api/handles/nobody-is-registered-as-this/process',
  },
  // CONFIRMING AND ENDING A VISITING CREDENTIAL ARE THE PERSON'S PRESS, and kept on this machine since 13
  // September 2026 (problem MLcj9RHaDkLa): a `human` header from another machine is a claim the
  // office cannot check until P83's key exists, so a visitor could confirm itself. The choice on
  // P83 makes the first confirmation happen where the office runs.
  { route: 'POST /api/office/visitors/:id/confirm', method: 'POST', url: '/api/office/visitors/no-such-credential/confirm' },
  { route: 'POST /api/office/visitors/:id/end', method: 'POST', url: '/api/office/visitors/no-such-credential/end' },
  // REVOKING A KEY FROM THE EMBASSY, criterion D3, P83 point 4. It is the person's press, and a
  // caller from elsewhere revoking a key is the door being asked to take away the proof of who it is.
  {
    route: 'POST /api/office/held-keys/:id/revoke',
    method: 'POST',
    url: '/api/office/held-keys/no-such-key/revoke',
  },
  {
    route: 'POST /api/office/held-keys/:id/revoke/undo',
    method: 'POST',
    url: '/api/office/held-keys/no-such-key/revoke/undo',
  },
  // CLOSING THE ONE-VERSION KEY WINDOW, criterion P83 point 6. It is the person's press, and a caller
  // from another machine closing the window is the door being asked to shut the door it came through.
  { route: 'POST /api/office/key-window/close', method: 'POST', url: '/api/office/key-window/close' },
  // PAIRING THIS BROWSER, criterion P83 point 2. Pairing is offered on the machine Mole Office runs
  // on and nowhere else, so a caller from another computer is refused before any handler runs and no
  // cookie is set. Another machine joins through the credential flow that already exists.
  { route: 'POST /api/office/pairing', method: 'POST', url: '/api/office/pairing' },
  // ADDING A FOLDER TO THE DIRECTORIES A PREVIEW MAY READ, criterion U4. Kept on this machine for
  // the same reason the trusted-machines door is: asked from another computer it would be the door
  // widening what this server reads off its own disk.
  { route: 'POST /api/preview-roots', method: 'POST', url: '/api/preview-roots' },
  // LETTING A SECRETARY ACT FOR THE PERSON, AND ENDING IT. Criterion P59. Kept on this machine
  // because it is the person's press at their own keyboard, and Mole Office authenticates nobody: `human` on a
  // request from another machine is a claim and not a fact, so the act stays where the person is.
  {
    route: 'POST /api/roles/elevation/:handle',
    method: 'POST',
    url: '/api/roles/elevation/nobody-is-registered-as-this',
  },
  {
    route: 'DELETE /api/roles/elevation/:handle',
    method: 'DELETE',
    url: '/api/roles/elevation/nobody-is-registered-as-this',
  },
  // GIVING AN AGENT A ROLE CARD. Criterion P64, kept here for the same reason as the two above: it
  // is the person's press, and a request from another machine saying it is the person is a claim and not a fact.
  {
    route: 'POST /api/roles/card/:handle',
    method: 'POST',
    url: '/api/roles/card/nobody-is-registered-as-this',
  },
  { route: 'POST /api/export/workspace', method: 'POST', url: '/api/export/workspace' },
  { route: 'POST /api/implementation/:id/accept', method: 'POST', url: '/api/implementation/no-such-row/accept' },
  { route: 'POST /api/implementation/rebuild', method: 'POST', url: '/api/implementation/rebuild' },
  { route: 'POST /api/implementation/repositories', method: 'POST', url: '/api/implementation/repositories' },
  {
    route: 'DELETE /api/implementation/repositories/:id',
    method: 'DELETE',
    url: '/api/implementation/repositories/no-such-repo',
  },
  {
    route: 'PATCH /api/implementation/repositories/:id',
    method: 'PATCH',
    url: '/api/implementation/repositories/no-such-repo',
  },
  { route: 'POST /api/import', method: 'POST', url: '/api/import' },
  {
    route: 'POST /api/planning/intents/:id/commit',
    method: 'POST',
    url: '/api/planning/intents/no-such-intent/commit',
  },
  {
    route: 'POST /api/planning/proposals/:id/apply',
    method: 'POST',
    url: '/api/planning/proposals/no-such-proposal/apply',
  },
  {
    route: 'POST /api/records/:id/revisions/:seq/revoke',
    method: 'POST',
    url: '/api/records/no-such-record/revisions/1/revoke',
  },
  // THE DEAD-LETTER SWEEP, criterion M111. The worker presses it on this machine once a pass, and
  // the broadcast it makes is this installation's own act about its own queue, so a caller from
  // another machine is refused before any handler runs.
  { route: 'POST /api/dead-letters/sweep', method: 'POST', url: '/api/dead-letters/sweep' },
  { route: 'POST /api/resources', method: 'POST', url: '/api/resources' },
  // THE MACHINES THIS OFFICE TRUSTS, criterion P73. Both presses are refused from another computer
  // before any handler runs: a caller deciding from elsewhere which machines are trusted is the door
  // widening the door it came through.
  { route: 'POST /api/office/trusted-machines', method: 'POST', url: '/api/office/trusted-machines' },
  {
    route: 'POST /api/office/trusted-machines/:id/remove',
    method: 'POST',
    url: '/api/office/trusted-machines/no-such-machine/remove',
  },
  // AND A STARTER GIVING AN AGENT IT STARTED A NEW KEY, problem x8ktQfHS5yGr. It revokes and makes keys
  // in this installation's own registry.
  {
    route: 'POST /api/participants/agent/:id/new-key',
    method: 'POST',
    url: '/api/participants/agent/no-such-agent/new-key',
  },
  // AND CLOSING AN AGENT, problem zyCcJYCLsAe7. It is an act about this installation's own registry.
  {
    route: 'POST /api/participants/agent/:id/retire',
    method: 'POST',
    url: '/api/participants/agent/no-such-agent/retire',
  },
  // The first two runtime doors. Registering writes a ledger row about THIS machine, and stopping signals
  // a process on it, so both are refused from another computer before any handler runs.
  { route: 'POST /api/runtime/register', method: 'POST', url: '/api/runtime/register' },
  { route: 'POST /api/runtime/stop', method: 'POST', url: '/api/runtime/stop' },
  // AND STOPPING A RUN THAT WILL NOT STOP. It signals the run's recorded process group on this machine.
  { route: 'POST /api/runtime/runs/:id/stop', method: 'POST', url: '/api/runtime/runs/no-such-run/stop' },
  // STOPPING A WORLD KEPT UP FOR THE PERSON, criterion C32. It signals the world's recorded processes, and
  // this machine is where they run, so a caller from another computer is refused before any handler.
  { route: 'POST /api/office/worlds/:id/stop', method: 'POST', url: '/api/office/worlds/no-such-world/stop' },
  // SHUTTING MOLE OFFICE DOWN, criterion W6. It stops the runs at work on this machine by their process
  // groups and then this server, so a caller from another computer is refused before any handler runs,
  // which is also what keeps this drive from shutting down the server under test.
  { route: 'POST /api/office/shut-down', method: 'POST', url: '/api/office/shut-down' },
  // THE OFFICE'S OWN TERMINALS, wave 13u. Every door reaches the terminal holder on this machine, so a caller from
  // another computer is refused before any handler runs. The drives carry no key, so the doors the person's key reaches
  // from another computer since round 14 are refused here too.
  { route: 'GET /api/terminals', method: 'GET', url: '/api/terminals' },
  { route: 'POST /api/terminals', method: 'POST', url: '/api/terminals' },
  { route: 'GET /api/terminals/:id/stream', method: 'GET', url: '/api/terminals/no-such-terminal/stream' },
  { route: 'POST /api/terminals/:id/input', method: 'POST', url: '/api/terminals/no-such-terminal/input' },
  { route: 'POST /api/terminals/:id/resize', method: 'POST', url: '/api/terminals/no-such-terminal/resize' },
  { route: 'POST /api/terminals/:id/close', method: 'POST', url: '/api/terminals/no-such-terminal/close' },
  { route: 'POST /api/terminals/holder/start', method: 'POST', url: '/api/terminals/holder/start' },
  // RESTARTING THE TERMINAL HOLDER, wave 13u round 23: it stops the holder on this machine by its
  // recorded process group, which ends every terminal it holds, and starts a new one here.
  { route: 'POST /api/terminals/holder/restart', method: 'POST', url: '/api/terminals/holder/restart' },
  { route: 'GET /api/terminals/:id/last-line', method: 'GET', url: '/api/terminals/no-such-terminal/last-line' },
  { route: 'POST /api/terminals/:id/keep-my-line', method: 'POST', url: '/api/terminals/no-such-terminal/keep-my-line' },
  // THE PERSON'S TYPING KEPT WITH NO PRESS, wave 13u round 4: the switch and the note are read from the holder on this machine.
  { route: 'GET /api/terminals/:id/keeping', method: 'GET', url: '/api/terminals/no-such-terminal/keeping' },
  { route: 'PUT /api/terminals/:id/keeping', method: 'PUT', url: '/api/terminals/no-such-terminal/keeping' },
  // THE INSTALL PRESS, wave 13u round 3: the list runs programs on this machine, and the press installs programs on it.
  { route: 'GET /api/harnesses', method: 'GET', url: '/api/harnesses' },
  { route: 'POST /api/harnesses/install', method: 'POST', url: '/api/harnesses/install' },
  // A READINESS CHECKLIST, wave 13u round 13: raising one or signing it can run a gated operation on this machine.
  { route: 'POST /api/readiness', method: 'POST', url: '/api/readiness' },
  { route: 'POST /api/readiness/:id/sign', method: 'POST', url: '/api/readiness/no-such-checklist/sign' },
  { route: 'POST /api/readiness/:id/sign-as-the-person', method: 'POST', url: '/api/readiness/no-such-checklist/sign-as-the-person' },
  // START AT LOGIN, wave 13u piece H9: nothing is read or written for a caller from another computer.
  { route: 'GET /api/office/start-at-login', method: 'GET', url: '/api/office/start-at-login' },
  { route: 'POST /api/office/start-at-login', method: 'POST', url: '/api/office/start-at-login' },
  // THE DATA FOLDER, criteria DF19 to DF21: the read and both presses are about this computer's files, database and
  // process table, so a caller from another computer is refused before any handler runs.
  { route: 'GET /api/office/data-folder', method: 'GET', url: '/api/office/data-folder' },
  { route: 'POST /api/office/data-folder/move', method: 'POST', url: '/api/office/data-folder/move' },
  { route: 'POST /api/office/data-folder/confirm', method: 'POST', url: '/api/office/data-folder/confirm' },
  // THE SANDBOX MEMORY LIMIT: the password dialog appears on this computer's screen.
  { route: 'GET /api/office/sandbox-memory-cap', method: 'GET', url: '/api/office/sandbox-memory-cap' },
  { route: 'POST /api/office/sandbox-memory-cap', method: 'POST', url: '/api/office/sandbox-memory-cap' },
  // Destination settings read and write this computer's host secrets file.
  { route: 'GET /api/office/storage-destinations', method: 'GET', url: '/api/office/storage-destinations' },
  { route: 'POST /api/office/storage-destinations', method: 'POST', url: '/api/office/storage-destinations' },
  { route: 'POST /api/terminals/agents', method: 'POST', url: '/api/terminals/agents' },
  // THE WAY BACK, wave 13u round 10: the read looks at this machine's processes, and the press starts a program here.
  { route: 'GET /api/terminals/agents/:agent/way-back', method: 'GET', url: '/api/terminals/agents/no-such-agent/way-back' },
  { route: 'POST /api/terminals/agents/:agent/way-back', method: 'POST', url: '/api/terminals/agents/no-such-agent/way-back' },
  // AN AGENT'S TMUX PANE, wave 13u round 10: ps and tmux on this machine, and a terminal here that types into the pane.
  { route: 'GET /api/terminals/agents/:agent/pane', method: 'GET', url: '/api/terminals/agents/no-such-agent/pane' },
  { route: 'POST /api/terminals/agents/:agent/pane', method: 'POST', url: '/api/terminals/agents/no-such-agent/pane' },
  { route: 'GET /api/terminals/agents/:agent/steps', method: 'GET', url: '/api/terminals/agents/no-such-agent/steps' },
  // A QUICK INPUT, wave 13u round 21: the holder on this machine types into the asking agent's terminal here.
  { route: 'POST /api/terminals/quick-input', method: 'POST', url: '/api/terminals/quick-input' },
  // RESUMING AN INTERRUPTED RUN, criterion W7. The press leads to a run started on this machine, so a
  // caller from another computer is refused before any handler runs.
  {
    route: 'POST /api/office/interrupted-runs/:session/resume',
    method: 'POST',
    url: '/api/office/interrupted-runs/no-such-run/resume',
  },
  // THE OFFICE'S OWN KEYS, criterion U2. The read asks each agent tool on this machine about its own
  // key, and setting or testing one writes or reads a file beside the database on this machine, so a
  // caller from another computer is refused before any handler runs.
  { route: 'GET /api/office/keys', method: 'GET', url: '/api/office/keys' },
  { route: 'POST /api/office/keys/set', method: 'POST', url: '/api/office/keys/set' },
  { route: 'POST /api/office/keys/test', method: 'POST', url: '/api/office/keys/test' },
  { route: 'GET /api/settings/provider-keys', method: 'GET', url: '/api/settings/provider-keys' },
  { route: 'POST /api/settings/provider-keys', method: 'POST', url: '/api/settings/provider-keys' },
  { route: 'POST /api/settings/provider-keys/trial', method: 'POST', url: '/api/settings/provider-keys/trial' },
  // THE MAIL TOOL, which a decision of the owner's covers. It runs under the owner's login on
  // this computer, so a caller from another computer is refused before any handler runs, and nothing is installed.
  { route: 'GET /api/office/mail-tool', method: 'GET', url: '/api/office/mail-tool' },
  { route: 'POST /api/office/mail-tool/install', method: 'POST', url: '/api/office/mail-tool/install' },
  // AND THE OWNER'S PRESS THAT TURNS IT OFF. Nothing is turned off for a
  // caller from another computer.
  { route: 'POST /api/office/mail-tool/disable', method: 'POST', url: '/api/office/mail-tool/disable' },
  { route: 'POST /api/office/mail-tool/take-back-key', method: 'POST', url: '/api/office/mail-tool/take-back-key' },
  // AND THE OWNER'S READ OF THE TOOL'S OWN SETTINGS THROUGH THE OFFICE. From
  // another computer only their own key over an encrypted door reaches it, so a caller that does not
  // prove the owner is refused before the tool is asked.
  { route: 'GET /api/office/mail-tool/state', method: 'GET', url: '/api/office/mail-tool/state' },
  // AND THE PERSON'S THREE PRESSES ON THE TOOL'S OWN SETTINGS: a caller that does not prove the person is refused before
  // the tool is asked.
  { route: 'POST /api/office/mail-tool/addresses', method: 'POST', url: '/api/office/mail-tool/addresses' },
  { route: 'POST /api/office/mail-tool/account', method: 'POST', url: '/api/office/mail-tool/account' },
  { route: 'POST /api/office/mail-tool/test', method: 'POST', url: '/api/office/mail-tool/test' },
  // PUSH. The signing key and the devices are in the same
  // key file, so a caller from another computer that does not prove the owner is refused before any
  // handler runs.
  { route: 'GET /api/office/push', method: 'GET', url: '/api/office/push' },
  { route: 'POST /api/office/push/devices', method: 'POST', url: '/api/office/push/devices' },
  { route: 'POST /api/office/push/devices/remove', method: 'POST', url: '/api/office/push/devices/remove' },
  { route: 'POST /api/office/push/test', method: 'POST', url: '/api/office/push/test' },
  // NAMING THE OFFICE'S OWNER. Only the person names themselves, in their own
  // browser on the computer the office runs on, so a caller from another computer is refused before
  // any handler runs.
  { route: 'POST /api/office/owner', method: 'POST', url: '/api/office/owner' },
  // THE ENTRY THAT FOLLOWS THE PERSON, F15 point 1. It writes a skill link and three hook lines into
  // the owner's home directory on this computer, so a caller from another computer is refused
  // before any handler runs.
  { route: 'POST /api/office/install-the-entry', method: 'POST', url: '/api/office/install-the-entry' },
  // THE SAME ENTRY, FOR CODEX AND OPENCODE. The piece that split the skill, F15 point 5. The plan reads this
  // computer's own directories and the write is the person's press, for the same reason as the entry above.
  {
    route: 'GET /api/office/install-the-entry/other-runtimes',
    method: 'GET',
    url: '/api/office/install-the-entry/other-runtimes',
  },
  {
    route: 'POST /api/office/install-the-entry/other-runtimes',
    method: 'POST',
    url: '/api/office/install-the-entry/other-runtimes',
  },
  // THE SANDBOXES' LOGINS. The file is on this machine and the sandboxes that
  // read it run here, so a caller from another computer is refused before any handler runs.
  { route: 'GET /api/office/sandbox-logins', method: 'GET', url: '/api/office/sandbox-logins' },
  { route: 'POST /api/office/sandbox-logins/set', method: 'POST', url: '/api/office/sandbox-logins/set' },
  { route: 'POST /api/office/sandbox-logins/clear', method: 'POST', url: '/api/office/sandbox-logins/clear' },
  // THE PROVIDER ROUTER'S KEY SLOTS, item 12 of the key layer. The slots file is in the owner's home on this computer, so a
  // caller from another computer is refused before any handler runs.
  { route: 'GET /api/provider-router/key-slots', method: 'GET', url: '/api/provider-router/key-slots' },
  { route: 'POST /api/provider-router/pin', method: 'POST', url: '/api/provider-router/pin' },
  { route: 'POST /api/provider-router/key-slots/add', method: 'POST', url: '/api/provider-router/key-slots/add' },
  { route: 'POST /api/provider-router/key-slots/remove', method: 'POST', url: '/api/provider-router/key-slots/remove' },
  { route: 'POST /api/resources/sweep', method: 'POST', url: '/api/resources/sweep' },
  { route: 'POST /api/resources/:id/release', method: 'POST', url: '/api/resources/no-such-resource/release' },
  // Withdrawing signals nothing, but it changes what the list of what is running on THIS machine
  // says, and that list is what somebody tidying up acts on.
  { route: 'POST /api/resources/:id/withdraw', method: 'POST', url: '/api/resources/no-such-resource/withdraw' },
  // The machine's shared test seats: the holder is a process group in THIS machine's process table,
  // and giving a seat back lets the next run on this machine start.
  { route: 'POST /api/slots/acquire', method: 'POST', url: '/api/slots/acquire' },
  { route: 'POST /api/slots/:id/release', method: 'POST', url: '/api/slots/no-such-slot/release' },
  { route: 'POST /api/sessions/discover', method: 'POST', url: '/api/sessions/discover' },
  // The office's own pass removes ended gate choices on this machine.
  { route: 'POST /api/worker/gates/run-out', method: 'POST', url: '/api/worker/gates/run-out' },
  // The message worker's doors. Every one is about a run that is a process in THIS machine's process
  // table, so a caller on another computer is refused before any handler runs.
  { route: 'GET /api/worker/queue', method: 'GET', url: '/api/worker/queue' },
  { route: 'GET /api/worker/runs', method: 'GET', url: '/api/worker/runs' },
  { route: 'GET /api/worker/waits', method: 'GET', url: '/api/worker/waits' },
  { route: 'GET /api/worker/merges', method: 'GET', url: '/api/worker/merges' },
  { route: 'POST /api/worker/merges/hand-backs/:problem/a-person-must-look', method: 'POST', url: '/api/worker/merges/hand-backs/no-such-problem/a-person-must-look' },
  { route: 'POST /api/worker/merges/hand-backs/:problem/take-back', method: 'POST', url: '/api/worker/merges/hand-backs/no-such-problem/take-back' },
  { route: 'POST /api/worker/merges/hand-backs/:problem/fixed-on-main', method: 'POST', url: '/api/worker/merges/hand-backs/no-such-problem/fixed-on-main' },
  { route: 'POST /api/worker/merges/:entry/hour-over', method: 'POST', url: '/api/worker/merges/no-such-entry/hour-over' },
  { route: 'GET /api/worker/resumes', method: 'GET', url: '/api/worker/resumes' },
  {
    route: 'POST /api/worker/runs/:session/resumed',
    method: 'POST',
    url: '/api/worker/runs/no-such-run/resumed',
  },
  {
    route: 'POST /api/worker/waits/:session/over',
    method: 'POST',
    url: '/api/worker/waits/no-such-run/over',
  },
  {
    route: 'POST /api/worker/runs/:session/cut-off',
    method: 'POST',
    url: '/api/worker/runs/no-such-run/cut-off',
  },
  { route: 'POST /api/worker/messages/:id/taken', method: 'POST', url: '/api/worker/messages/no-such-message/taken' },
  { route: 'POST /api/worker/messages/:id/held', method: 'POST', url: '/api/worker/messages/no-such-message/held' },
  {
    route: 'POST /api/worker/messages/:id/needs-no-run',
    method: 'POST',
    url: '/api/worker/messages/no-such-message/needs-no-run',
  },
  {
    route: 'POST /api/worker/messages/:id/answered',
    method: 'POST',
    url: '/api/worker/messages/no-such-message/answered',
  },
  // The next rounds, wave 13j round loop-2: the worker here starts the sandbox launcher here.
  { route: 'GET /api/worker/rounds', method: 'GET', url: '/api/worker/rounds' },
  { route: 'POST /api/worker/rounds/:run/held', method: 'POST', url: '/api/worker/rounds/no-such-run/held' },
  { route: 'POST /api/worker/rounds/:run/starting', method: 'POST', url: '/api/worker/rounds/no-such-run/starting' },
  { route: 'POST /api/worker/rounds/:run/ended', method: 'POST', url: '/api/worker/rounds/no-such-run/ended' },
  // The worker runs, wave 13j round loop-3: the worker here starts the sandbox launcher here.
  { route: 'GET /api/worker/worker-runs', method: 'GET', url: '/api/worker/worker-runs' },
  { route: 'POST /api/worker/worker-runs/:run/starting', method: 'POST', url: '/api/worker/worker-runs/no-such-run/starting' },
  { route: 'POST /api/worker/worker-runs/:run/ended', method: 'POST', url: '/api/worker/worker-runs/no-such-run/ended' },
]

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]
let otherMachines: Server
let thisMachine: string
let anotherMachine: string

/**
 * THE HOME DIRECTORY THE SWEEPS RUN UNDER, made here and removed at the end.
 *
 * `installTheEntry` works the home out with `os.homedir()`, which is `$HOME` on this machine. One
 * route in `DRIVES` is the entry press, and a press writes a skill link and three hook lines into
 * that home. Setting `HOME` to this scratch directory before the sweeps is what keeps both of them
 * off the owner's own `~/.claude`, and `theOwnersHome()` is what reads it back. Set in `beforeAll`
 * and restored in `afterAll`, the way `tests/the-entry-follows-the-person.test.ts` does it.
 */
let scratchHome: string
let originalHome: string | undefined

/** A scratch checkout that is NOT a linked worktree: `.git` is a directory, as in an ordinary clone. */
function aNormalCheckout(): string {
  const checkout = mkdtempSync(join(tmpdir(), 'mole-office-entry-checkout-'))
  mkdirSync(join(checkout, '.git'))
  mkdirSync(join(checkout, '.claude', 'skills', 'mole-office'), { recursive: true })
  writeFileSync(join(checkout, '.claude', 'skills', 'mole-office', 'SKILL.md'), '# a skill\n', 'utf8')
  mkdirSync(join(checkout, 'tools'), { recursive: true })
  writeFileSync(join(checkout, 'tools', 'session-hook.mjs'), '// the hook\n', 'utf8')
  return checkout
}

beforeAll(async () => {
  originalHome = process.env.HOME
  scratchHome = mkdtempSync(join(tmpdir(), 'mole-office-local-only-home-'))
  process.env.HOME = scratchHome

  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()

  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // THE PRODUCT'S OWN SECOND LISTENER, not a copy of it written here.
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
  await app.close()
  t.close()
  process.env.HOME = originalHome
  rmSync(scratchHome, { recursive: true, force: true })
})

const HEADERS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

async function ask(door: string, drive: Drive): Promise<{ status: number; code: string; error: string; detail: string; noStore: boolean }> {
  const res = await fetch(`${door}${drive.url}`, {
    method: drive.method,
    headers: HEADERS,
    ...(drive.method === 'GET' ? {} : { body: '{}' }),
  })
  const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string; detail?: string }
  return { status: res.status, code: body.code ?? '', error: body.error ?? '', detail: body.detail ?? '', noStore: res.headers.get('cache-control') === 'no-store' }
}

describe('the drives and the route table are the same list', () => {
  it('has a drive for every route declared local', () => {
    const declared = routes.filter((one) => one.reach === 'local').map((one) => `${one.method} ${one.path}`)
    const driven = new Set(DRIVES.map((one) => one.route))
    expect(declared.filter((one) => !driven.has(one))).toEqual([])
  })

  it('names a route that really exists in every drive', () => {
    const live = new Set(routes.map((one) => `${one.method} ${one.path}`))
    expect(DRIVES.map((one) => one.route).filter((one) => !live.has(one))).toEqual([])
  })

  it('drives more than a handful, so the sweep below is a sweep', () => {
    expect(DRIVES.length).toBeGreaterThan(10)
  })
})

describe('through the listener for other machines', () => {
  /** Mutation: declare POST /api/resources/sweep remote instead of local. */
  it('refuses the ended-run row sweep because the process reading belongs to this computer', async () => {
    const answer = await ask(anotherMachine, { route: 'POST /api/resources/sweep', method: 'POST', url: '/api/resources/sweep' })
    expect(answer.status).toBe(403)
    expect(answer.error).toContain('another computer')
    expect(answer.detail).toContain('POST /api/resources/sweep')
  })

  it('refuses every act kept on this machine, and names the ones it did not', async () => {
    // A 403 ALONE DOES NOT SAY WHICH RULE REFUSED. These drives name nobody and carry no key, and a request like that
    // from a machine this office does not trust is refused 403 by its own rule whatever the route's
    // reach. So with a status check alone, a route declared `remote` by mistake
    // was still answered 403 and its
    // drive passed: wave 13u's round 21 declared POST /api/terminals/quick-input remote as a mutation and this case stayed
    // green. Each drive must meet the refusal for an act kept on this machine, by its code, naming its own route.
    const answered: string[] = []
    for (const drive of DRIVES) {
      const answer = await ask(anotherMachine, drive)
      if (answer.status !== 403 || answer.code !== 'keptOnTheOfficesComputer' || !answer.detail.includes(drive.route)) {
        answered.push(`${drive.route} -> ${String(answer.status)} ${answer.code === '' ? answer.error.slice(0, 120) : answer.code}`)
      }
    }
    expect(answered).toEqual([])
  })

  it('keeps the known private reach refusal exact without exposing attempt values or query input', async () => {
    const marker = 'invented-private-query-marker'
    for (const drive of DRIVES.filter(one => isPrivateLoginRequest(one.url))) {
      const answer = await ask(anotherMachine, { ...drive, url: `${drive.url}?code=${marker}` })
      expect(answer.status, drive.route).toBe(403)
      expect(answer.code, drive.route).toBe('keptOnTheOfficesComputer')
      expect(answer.detail, drive.route).toContain(drive.route)
      expect(answer.noStore, drive.route).toBe(true)
      expect(JSON.stringify(answer), drive.route).not.toContain(marker)
      if (drive.route.includes(':attempt')) expect(answer.detail, drive.route).not.toContain('a'.repeat(32))
    }
  })

  it('says what was refused, that nothing was done, and where it can be done', async () => {
    const answer = await ask(anotherMachine, { route: 'POST /api/import', method: 'POST', url: '/api/import' })
    expect(answer.status).toBe(403)
    expect(answer.error).toContain('another computer')
    expect(answer.error).toContain('Nothing was written')
    expect(answer.error).toContain('the computer Mole Office is running on')
    // No networking words in the sentence a person reads. The machinery is in `detail`.
    for (const word of ['loopback', '127.0.0.1', 'listener', 'tailnet', 'socket']) {
      expect(answer.error.toLowerCase()).not.toContain(word)
    }
    expect(answer.detail).toContain('POST /api/import')
    expect(answer.detail).toContain('arrival: another machine')
  })

  it('answers a route another machine may ask for, so this is not a blanket refusal', async () => {
    const res = await fetch(`${anotherMachine}/api/health`)
    expect(res.status).toBe(200)
    // UNDER AN AGENT'S NAME: a request from a machine the office does not trust that names nobody and carries no key is
    // refused for that, which is not a question of where a route may be asked from.
    const listing = await fetch(`${anotherMachine}/api/records`, {
      headers: { ...HEADERS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-synthetic-reader' },
    })
    expect(listing.status).toBe(200)
  })

  it('leaves a request that matched no route to the ordinary 404, because that is not a permission question', async () => {
    const res = await fetch(`${anotherMachine}/api/there-is-no-such-endpoint`)
    expect(res.status).toBe(404)
  })
})

describe('through the listener for this machine', () => {
  it('refuses none of them for where they came from', async () => {
    // TWO SAFE ROUTES ONLY, and the reason is at the top of this file: the hook refuses before any
    // handler runs, so the sweep above does nothing, and the same sweep through THIS door would run
    // the import and the export for real.
    // A LOCAL ROUTE THAT IS SAFE TO REACH THROUGH THIS DOOR. The queue read used to be this case and
    // is `remote` now (criterion P21), so it no longer says anything about a `local` route. A
    // dispatch of a conversation that does not exist reaches the handler and is refused by it,
    // which is the same distinction: getting to the handler at all is the claim.
    const dispatch = await ask(thisMachine, {
      route: 'POST /api/agent/threads/:id/dispatch',
      method: 'POST',
      url: '/api/agent/threads/no-such-thread/dispatch',
    })
    expect(dispatch.status).not.toBe(403)
    expect(dispatch.error).not.toContain('another computer')

    const resource = await ask(thisMachine, { route: 'POST /api/resources', method: 'POST', url: '/api/resources' })
    // 400 and not 403: the hook let it through and the route's own body check refused it. That is
    // the distinction this case exists for -- reaching the handler at all is the claim.
    expect(resource.status).toBe(400)
    expect(resource.error).not.toContain('another computer')
  })
})

/**
 * THE ENTRY PRESS WRITES INTO THE SCRATCH HOME, NOT THE OWNER'S OWN.
 *
 * Problem fOfbpC0SKC-f: the drive row for `POST /api/office/install-the-entry` is a real press, and
 * a press wrote the running worktree's path into the owner's own `~/.claude`. The sweeps above now
 * run under `scratchHome`, and this case proves what that home is for: the one implementation the
 * door calls writes the skill link and the settings file there, and reports those paths, so nothing
 * can have gone to the real home.
 *
 * WHY THE SHARED FUNCTION IS DRIVEN RATHER THAN THE ROUTE. In this worktree the door's own checkout
 * is a linked worktree, so the door refuses before it reaches the write (the door's own refusal is
 * tested in `tests/the-entry-follows-the-person.test.ts`). The write itself is `installTheEntry`,
 * which the door and the terminal tool both call, so this case pins it with an ordinary checkout
 * whose `.git` is a directory. `theOwnersHome()` is what a real press uses, and that is what the
 * scratch `HOME` above points at.
 *
 * MUTATION: remove the `process.env.HOME = scratchHome` line in `beforeAll`. `theOwnersHome()` then
 * answers the runner's own home, the write lands there instead, and both path assertions below go
 * red while the real home is still never touched (the runner's home is a scratch directory too).
 */
describe('the entry the sweep could press', () => {
  it('writes the skill link and the settings file into the scratch home, and names those paths', async () => {
    const checkout = aNormalCheckout()
    try {
      const result = await installTheEntry({ home: theOwnersHome(), checkout })
      expect(result.ok, result.ok ? '' : result.says).toBe(true)
      if (!result.ok) return
      expect(result.settingsPath).toBe(join(scratchHome, '.claude', 'settings.json'))
      expect(result.skillLink).toBe(join(scratchHome, '.claude', 'skills', 'mole-office'))
      expect(existsSync(result.settingsPath), 'the settings file is not in the scratch home').toBe(true)
      expect(lstatSync(result.skillLink).isSymbolicLink()).toBe(true)
      expect(readlinkSync(result.skillLink)).toBe(join(checkout, '.claude', 'skills', 'mole-office'))
    } finally {
      rmSync(checkout, { recursive: true, force: true })
    }
  })
})

describe('an in-process caller is not treated as remote', () => {
  it('passes a local-only route, because no listener could have seen it', async () => {
    // The dispatch, which is `local` (criterion P22). An injected request is on no socket, so no
    // listener saw it and the rule does not apply — it reaches the handler and is refused there for
    // naming a conversation that is not, which is a 404 rather than the hook's 403.
    const res = await app.inject({ method: 'POST', url: '/api/agent/threads/no-such-thread/dispatch' })
    expect(res.statusCode).not.toBe(403)
    expect(res.body).not.toContain('another computer')
  })

  it('records that it came through neither door, rather than filing it as one of them', async () => {
    await app.inject({ method: 'GET', url: '/api/health' })
    // `client_origin` is null for a caller no listener saw. `local` would claim a measurement
    // nobody made, and `remote` would refuse every migration in the product.
    const rows = t.client.sqlite
      .prepare("SELECT client_origin AS o FROM api_calls WHERE route = '/api/health' ORDER BY at_ms DESC LIMIT 1")
      .all() as { o: string | null }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.o).toBeNull()
  })

  it('files a request through the door for other machines as remote, so the null above means something', async () => {
    await fetch(`${anotherMachine}/api/health`)
    const rows = t.client.sqlite
      .prepare("SELECT client_origin AS o FROM api_calls WHERE route = '/api/health' ORDER BY at_ms DESC LIMIT 1")
      .all() as { o: string | null }[]
    expect(rows[0]?.o).toBe('remote')
  })
})

describe('the second listener is on loopback', () => {
  it('bound 127.0.0.1 and nothing wider', () => {
    const bound = otherMachines.address()
    expect(bound).not.toBeNull()
    expect(typeof bound).not.toBe('string')
    expect((bound as AddressInfo).address).toBe('127.0.0.1')
  })

  it('refuses to come up on a wider address, and says nothing is being served', async () => {
    // THE CHECK IS THE CLAIM. A comment saying "loopback only" is not a check; asking the socket
    // what it bound is. This drives the refusal by asking for a bind the function must reject.
    const { listenForOtherMachines } = await import('../src/server/index.ts')
    await expect(listenForOtherMachines(app, 0, '0.0.0.0')).rejects.toThrow(/must be on loopback/)
  })
})

describe('the one setting, and unset is not the same as blank', () => {
  const held = process.env.MOLE_OFFICE_REMOTE_PORT

  afterAll(() => {
    if (held === undefined) delete process.env.MOLE_OFFICE_REMOTE_PORT
    else process.env.MOLE_OFFICE_REMOTE_PORT = held
  })

  it('reads unset as off, which is the state every installation is in', async () => {
    const { remotePortFromEnv } = await import('../src/server/index.ts')
    delete process.env.MOLE_OFFICE_REMOTE_PORT
    expect(remotePortFromEnv()).toBeNull()
  })

  it('refuses a blank value rather than reading it as absence', async () => {
    const { remotePortFromEnv } = await import('../src/server/index.ts')
    process.env.MOLE_OFFICE_REMOTE_PORT = ''
    expect(() => remotePortFromEnv()).toThrow(/empty setting is not a port/)
  })

  it('refuses something that is not a port number', async () => {
    const { remotePortFromEnv } = await import('../src/server/index.ts')
    process.env.MOLE_OFFICE_REMOTE_PORT = 'yes please'
    expect(() => remotePortFromEnv()).toThrow(/not a port number/)
  })

  it('reads a real port, so the refusals above are about the value', async () => {
    const { remotePortFromEnv } = await import('../src/server/index.ts')
    process.env.MOLE_OFFICE_REMOTE_PORT = '8788'
    expect(remotePortFromEnv()).toBe(8788)
  })
})
