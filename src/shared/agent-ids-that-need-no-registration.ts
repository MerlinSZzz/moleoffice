// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `THE_AGENT_WORKER_ID` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `AGENT_IDS_THAT_NEED_NO_REGISTRATION` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { THE_DEV_SUPERVISOR_ID, THE_MESSAGE_WORKER_ID, THE_OFFICE_WRITER_ID, THE_SESSION_HOOK_ID, THE_WORLD_SWEEP_ID } from '@shared/participants.ts'

/**
 * THE NAME THE AGENT WORKER (`tools/agent-worker.mjs`) SENDS AS ITS ACTOR, on every request it makes while
 * it serves queued runs. Named once, for the list below and for `theMessageReader` in lib/messages.ts,
 * which lets it read the conversations it runs.
 */
export const THE_AGENT_WORKER_ID = 'mole-office-agent-worker'
/**
 * THE AGENT IDS THAT WRITE RECORDS UNDER A NAME NO REGISTRY ROW HOLDS, AND WHY.
 *
 * THE ONE PRINCIPLE THIS LIST FOLLOWS. An agent id no registry row holds may write only if it is
 * one of three things. (a) A program of the office or of this checkout, declared on this list with
 * the evidence of where it writes. (b) Inside a test world, that world's starter or one of its
 * secretaries, which chapter 8 rule 5 grants the owner's authority there;
 * `whyAnUnregisteredAgentMayNotWrite` in `records/unregistered-agent.ts` reads that from
 * `actor.theOwnersAuthority` and not from this list. (c) A caller inside this server's own process,
 * which the refusal does not ask because it arrived on no socket. Anything that works as an agent
 * registers first.
 *
 * Every one of these is a piece of the office or a tool beside it, not an agent somebody runs and
 * registers. The list is stated once, here, and the refusal that reads it is in
 * `src/server/lib/records/unregistered-agent.ts`; each entry names where in the tree it writes, so
 * a reader can check the claim rather than trust it. A new writer that is not an agent must be
 * added here with the same evidence, and nothing is guessed in.
 *
 * RETIRED AGENTS ARE NOT ON THIS LIST. They are still registered — `participantForActor` reads
 * their row whatever its `retired` flag — and the rules that refuse a retired agent are asked
 * elsewhere. Adding one here would take it out from under those rules.
 */
export const AGENT_IDS_THAT_NEED_NO_REGISTRATION: readonly string[] = [
  // THE OFFICE'S OWN WRITER. `src/server/lib/faults.ts:58` defines THE_OFFICE and writes through it
  // in process; `src/server/lib/inspection.ts` exports the same actor (at :2022) and writes through
  // it in `releaseOrRefuse` and `theOfficeStartsTheCheck`; `src/server/lib/office.ts`
  // (`reportThisWorldToTheOffice`, `reportThisWorldsDeathToTheOffice`,
  // `tellTheOfficeThisWorldIsCalled`) and `src/server/lib/visits.ts` (`reportHeldVisitsToTheOffice`,
  // `reportThisVisitEndedToTheOffice`) send it over HTTP when this server speaks to the office it
  // belongs to. The office is not an agent anybody started, so no registration row can hold it.
  THE_OFFICE_WRITER_ID,
  // THE OFFICE'S OWN MESSAGE WORKER. `src/server/lib/worker.ts:95` is THE_WORKER and
  // `src/worker/index.ts:430` sends it as the actor when a run names no agent of its own. It is a
  // piece of machinery this server runs, not an agent on the contacts list.
  THE_MESSAGE_WORKER_ID,
  // THE SESSION HOOK. `for-agents/session-hook.mjs` writes session records as `AGENT ?? THE_SESSION_HOOK_ID`,
  // so a checkout with no agent named files under this name. Chapter 9 rule 1 keeps the hook alive
  // before any project identity exists, so it cannot be asked to register first. The slash keeps any
  // agent from registering it.
  THE_SESSION_HOOK_ID,
  // THE SESSION HOOK BEFORE IT HAD A NAME OF ITS OWN. A hook installed before THE_SESSION_HOOK_ID
  // existed still files under `claude-code` when no agent is named, and older rows carry it.
  'claude-code',
  // THE BROWSER APP. `vite.config.ts:666` files this dev server's own session row over HTTP and
  // closes the rows an earlier start replaced. It is the dev page server, not an agent.
  'vite/the-browser-app',
  // THE DEV SUPERVISOR. `tools/serve-dev.mjs` files and patches the session row for the supervisor
  // process it runs, under this name (its headers are at :549, :609, :642 and elsewhere there).
  THE_DEV_SUPERVISOR_ID,
  // THE ISOLATED-WORLD TOOL. `tools/isolated-mole-office.mjs` reads and patches session rows in the
  // copy it started, under this name, in `writeTheWorldDown`, `sayTheWorldIsGone`,
  // `closeTheHoldingRowThisWorldLeft`, `whoHoldsTheOwnersAuthorityIn` and `start` (its headers are
  // at :433, :489, :544, :646 and :841 there). The copy is the world's own database, and the tool is
  // not an agent.
  'tools/isolated-mole-office.mjs',
  // THE AGENT WORKER. `tools/agent-worker.mjs:120` sends this name as the actor on every request it
  // makes while it serves queued runs, and `:387` files the worker's own session record under it. It
  // is the thing that runs the runs, not an agent on the contacts list, so no registry row can hold it.
  THE_AGENT_WORKER_ID,
  // THE WORLD SWEEP. `tools/close-worlds-nobody-serves.mjs:103` closes a world's row over HTTP as
  // `mole-office/the-world-sweep`, through POST /api/office/worlds/:id/close. It tidies the ledger
  // when a server was killed before it could report its own death, and it is not an agent anybody
  // started, so no registration row can hold it.
  THE_WORLD_SWEEP_ID,
  // THE BROWSER TEST HARNESS. `tests/helpers.ts`'s `registerThisTestsServers` files each browser
  // test's own session record and registers the API and the browser app that serve it, under this
  // name, against the test's own API. It is a program of this checkout rather than an agent anybody
  // registers, so no registration row can hold it.
  'vitest/liveApp',
]
