// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW THE BRIEF REACHES EACH TOOL AN AGENT RUNS IN, AND WHAT IS SAID WHEN IT DOES NOT.
 *
 * Criterion I2: every adapted framework gets the brief at start, by the mechanism each has. The
 * four tools do not have the same mechanism and pretending they do would put a claim in the report
 * that no run backs up. So this file says, once, which mechanism each one gets it through.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO MECHANISMS, AND WHY IT IS TWO AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * **A start hook** is a command a tool runs before the first turn, whose printed output goes into
 * that turn's context. Claude Code has one and Mole Office already uses it: `tools/session-hook.mjs`
 * files the session record and prints the state of the project. Adding the brief's opening to what
 * it prints is the whole of Claude Code's answer.
 *
 * **The first message** is the prompt the worker hands a run when it starts it. Codex, OpenCode and
 * Kimi CLI are all started by the worker with a prompt, so the brief goes at the top of it.
 *
 * THE RULES FILE WAS TRIED FIRST AND IT DOES NOT HOLD. Codex, OpenCode and Kimi all read
 * `AGENTS.md`, and `src/worker/rules.ts` already writes it, so putting the brief there looked like
 * one mechanism for three tools. Measured on 6 September 2026: Codex 0.147.0 reads a project
 * document only up to `project_doc_max_bytes`, which is 32,768 by default, and DROPS THE WHOLE FILE
 * above it without saying anything. The rules file this repository writes is 32,653 bytes — 115
 * bytes under the cliff — so adding a brief of any size took the rules away as well. Given a
 * 34,272-byte file Codex answered that nothing about a brief was in its context and spent 1,204
 * tokens; given a 279-byte one it quoted the brief back exactly. A mechanism that silently loses
 * everything at a size nobody watches is not a mechanism.
 *
 * CLAUDE CODE DOES NOT USE THE FIRST MESSAGE FOR THIS. Its runs are also started with a prompt, but
 * a person's own Claude Code session — the common case here — is not started by the worker at all,
 * and the hook reaches both. That asymmetry is the reason this file exists.
 *
 * ---------------------------------------------------------------------------------------
 * A RUNTIME WITH NO ENTRY HERE STOPS A TEST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/every-adapted-framework-is-briefed-at-its-start.test.ts` walks `AGENT_RUNTIMES` and fails
 * when one of them has no entry. A fifth tool cannot be adapted without somebody saying how an
 * agent running in it learns what the project is.
 */
import { AGENT_RUNTIMES, type AgentRuntime } from './participants.ts'

/** The two ways a tool can be handed the brief before it starts working. */
export type BriefingMechanism = 'start-hook' | 'first-message'

/** How one tool gets the brief, and what a person has to have done for it to arrive. */
export interface Briefing {
  /** Which of the two mechanisms this tool uses. */
  how: BriefingMechanism
  /** The thing that carries it, named the way a person would name it. */
  carriedBy: string
  /** What has to be true for the brief to reach a run of this tool. */
  needs: string
}

export const BRIEFINGS: Readonly<Record<AgentRuntime, Briefing>> = {
  /**
   * A DSH WORKER IS HANDED ITS BRIEF AS THE PROMPT, BY THE TOOL THAT STARTS IT, and not by anything
   * in this repository. `~/.cache/mole-office/dsh/run-worker.sh` reads a brief file and passes its
   * whole text as the task. So the mechanism is 'first-message' like Codex and OpenCode, and the
   * difference is who does it: the office's own worker never starts a dsh run.
   */
  dsh: {
    how: 'first-message',
    carriedBy: 'the brief file ~/.cache/mole-office/dsh/run-worker.sh passes as the task',
    needs:
      'Somebody has to have written the brief file and started the worker with it. The office does ' +
      'not start a dsh run and does not build its prompt, so a dsh session nobody briefed gets no ' +
      'brief at all — there is no second way to reach it.',
  },
  'claude-code': {
    how: 'start-hook',
    carriedBy: 'tools/session-hook.mjs, run by Claude Code as a SessionStart hook',
    needs:
      'The hook has to be wired up in the settings file of the directory the session starts in. ' +
      'Git cannot carry that file; tools/session-hook.mjs holds the block to paste back, and the ' +
      'hook says so itself when it cannot find its own wiring.',
  },
  codex: {
    how: 'first-message',
    carriedBy: "the prompt the worker starts the run with, built by src/worker/prompt.ts",
    needs:
      'The run has to be one the worker started. A Codex session a person opens by hand gets no ' +
      'brief: Codex has a session-start hook of its own, in ~/.codex/hooks.json, and nothing here ' +
      'writes into a person\'s home directory.',
  },
  opencode: {
    how: 'first-message',
    carriedBy: "the prompt the worker starts the run with, built by src/worker/prompt.ts",
    needs:
      'The run has to be one the worker started. OpenCode has no start hook that runs a command, ' +
      'so there is no second way to reach a session somebody else opened.',
  },
  kimi: {
    how: 'first-message',
    carriedBy: "the prompt the worker starts the run with, built by src/worker/prompt.ts",
    needs:
      'The run has to be one the worker started. Whether Kimi CLI has a start hook has never been ' +
      'measured on this machine, so nothing else is claimed for it.',
  },
}

/** The heading the brief goes under wherever it is handed over. One place, so a reader can find it. */
export const THE_BRIEF_HEADING = 'THE STATE OF THIS PROJECT, read when this run started'

/**
 * The sentence that goes above the brief, so nobody reads a snapshot as a live reading. It names
 * the request that gives the current one.
 */
export const THE_BRIEF_IS_A_SNAPSHOT =
  'This is what Mole Office said when this run started. It is a snapshot and it does not update. ' +
  'Ask GET /api/brief for the state now, and GET /api/project/bootstrap for what contradicts itself.'

/** Every runtime that has no entry above. Empty is the answer this file is written to keep true. */
export function runtimesWithNoBriefing(): AgentRuntime[] {
  return AGENT_RUNTIMES.filter((runtime) => !(runtime in BRIEFINGS))
}
