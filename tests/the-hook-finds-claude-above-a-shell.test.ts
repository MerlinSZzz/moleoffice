// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOOK FINDS THE CLAUDE PROGRAM ABOVE THE SHELL THAT RUNS IT.
 *
 * Claude Code runs a hook command through `/bin/sh -c`, so the hook's immediate parent is a shell
 * and the claude program is one or more steps further up that chain. `theProcessBehindTheHook`
 * walks the parent chain, at most five steps and never past pid 1, and records the first process
 * that is the claude program by its own name or executable.
 *
 * WHAT IS PROVED, with a fake process table handed in place of `/proc`:
 *
 *   1. claude as the immediate parent is found;
 *   2. claude two steps up, through a shell, is found;
 *   3. claude three steps up, through two shells, is found;
 *   4. claude six steps up is NOT found, because the walk stops after five, and the not-found answer
 *      names every process it looked at, in order, and does not name the one it never reached;
 *   5. the walk stops at pid 1 and never climbs past it, even when the process above pid 1 would
 *      have named claude.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the five cases below, all green.
 *
 * MUTATION: in src/config/session-process.mjs, the walk was cut to the immediate parent by
 * changing the loop's bound from `MOST_STEPS_UP_THE_PARENT_CHAIN` to `1`, which is the old
 * one-process reading. Cases 2, 3 and 4 went red; case 1 (the immediate parent) and case 5 (pid 1)
 * stayed green, because neither of those needs a second step. The bound was put back.
 *
 * CONTROL AFTER THE RESTORE: the five cases, all green.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'

import { theProcessBehindTheHook } from '../src/config/session-process.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

/** A command line that names the claude program, as the versioned binary does. */
const CLAUDE = `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.0 --resume a-session`
/** A command line that is the shell Claude Code wraps a hook command in. */
const A_SHELL = '/bin/sh -c node /somewhere/tools/session-hook.mjs start'
/** The moment the fake process table says every process began. */
const START = new Date('2026-09-23T19:00:00.000Z')

interface AProcess {
  commandLine: string | null
  name: string | null
  executable: string | null
  parent: number | null
}

/** A process table for the fake reader, with what the walk asked it, in order. */
function aProcessTable(entries: [number, AProcess][]): {
  reads: {
    commandLineOf: (pid: number) => string | null
    nameOf: (pid: number) => string | null
    executableOf: (pid: number) => string | null
    parentOf: (pid: number) => number | null
    startTimeOf: (pid: number) => Date | null
  }
  commandLinesAsked: number[]
  parentsAsked: number[]
} {
  const table = new Map<number, AProcess>(entries)
  const commandLinesAsked: number[] = []
  const parentsAsked: number[] = []
  return {
    commandLinesAsked,
    parentsAsked,
    reads: {
      commandLineOf: (pid) => {
        commandLinesAsked.push(pid)
        return table.get(pid)?.commandLine ?? null
      },
      nameOf: (pid) => table.get(pid)?.name ?? null,
      executableOf: (pid) => table.get(pid)?.executable ?? null,
      parentOf: (pid) => {
        parentsAsked.push(pid)
        return table.get(pid)?.parent ?? null
      },
      startTimeOf: () => START,
    },
  }
}

/**
 * A process with the name and executable its command line belongs to: the claude program as the
 * owner's machine runs it, the shell `/bin/sh` is on this machine, or init.
 */
function aProcess(commandLine: string | null, parent: number | null): AProcess {
  const program =
    commandLine === CLAUDE
      ? { name: 'claude', executable: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.0` }
      : commandLine === A_SHELL
        ? { name: 'sh', executable: '/usr/bin/dash' }
        : { name: 'systemd', executable: '/usr/lib/systemd/systemd' }
  return { commandLine, ...program, parent }
}

describe('the hook finds the claude program above a wrapping shell', () => {
  it('finds claude as the immediate parent, which is the control', () => {
    const { reads } = aProcessTable([[100, aProcess(CLAUDE, 1)]])
    const found = theProcessBehindTheHook(100, reads)
    expect(found.recorded).toBe(true)
    expect(found.pid).toBe(100)
    expect(found.pidCommand).toBe(CLAUDE)
    expect(found.pidStartedAt).toBe(localStampOf(START))
    expect(found.why).toBeNull()
  })

  it('finds claude two steps up, through a shell', () => {
    const { reads, commandLinesAsked } = aProcessTable([
      [100, aProcess(A_SHELL, 200)],
      [200, aProcess(CLAUDE, 1)],
    ])
    const found = theProcessBehindTheHook(100, reads)
    expect(found.recorded).toBe(true)
    expect(found.pid).toBe(200)
    expect(found.pidCommand).toBe(CLAUDE)
    expect(commandLinesAsked).toEqual([100, 200])
  })

  it('finds claude three steps up, through two shells', () => {
    const { reads, commandLinesAsked } = aProcessTable([
      [100, aProcess(A_SHELL, 200)],
      [200, aProcess(A_SHELL, 300)],
      [300, aProcess(CLAUDE, 1)],
    ])
    const found = theProcessBehindTheHook(100, reads)
    expect(found.recorded).toBe(true)
    expect(found.pid).toBe(300)
    expect(found.pidCommand).toBe(CLAUDE)
    expect(commandLinesAsked).toEqual([100, 200, 300])
  })

  it('answers not found after five steps, naming every process it looked at, in order', () => {
    const { reads, commandLinesAsked } = aProcessTable([
      [100, aProcess(A_SHELL, 200)],
      [200, aProcess(A_SHELL, 300)],
      [300, aProcess(A_SHELL, 400)],
      [400, aProcess(A_SHELL, 500)],
      [500, aProcess(A_SHELL, 600)],
      [600, aProcess(CLAUDE, 1)],
    ])
    const found = theProcessBehindTheHook(100, reads)
    expect(found.recorded).toBe(false)
    expect(found.pid).toBeNull()
    // THE SIXTH PROCESS IS NEVER READ: the walk is five steps and no more.
    expect(commandLinesAsked).toEqual([100, 200, 300, 400, 500])
    const why = String(found.why)
    const positions = [100, 200, 300, 400, 500].map((pid) => why.indexOf(`${String(pid)}:`))
    expect(positions.every((at) => at >= 0), why).toBe(true)
    expect([...positions].sort((a, b) => a - b), why).toEqual(positions)
    expect(why).not.toContain('600')
  })

  it('stops at pid 1 and never reads the process above it', () => {
    const { reads, commandLinesAsked, parentsAsked } = aProcessTable([
      [100, aProcess(A_SHELL, 200)],
      [200, aProcess('/sbin/init', 1)],
      [1, aProcess('/sbin/init', 999)],
      [999, aProcess(CLAUDE, 0)],
    ])
    const found = theProcessBehindTheHook(100, reads)
    expect(found.recorded).toBe(false)
    // THE PROCESS ABOVE PID 1 NAMES CLAUDE, and it must not be reached or read.
    expect(commandLinesAsked).not.toContain(999)
    // PID 1'S OWN PARENT IS NEVER ASKED FOR, so the walk cannot leave the chain.
    expect(parentsAsked).not.toContain(1)
  })
})
