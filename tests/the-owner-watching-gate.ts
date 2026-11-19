// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The two ways a stable test's made-up office runs its tools/serve-dev.mjs, so the office stops with
 * the test worker that started it.
 *
 * Neither is commandThatStopsWithItsOwner, because the stable upgrade refuses that one. The upgrade
 * accepts serve-dev either as its group's leader or as the direct child of a node -e gate that leads
 * the group, which is how the bootstrap starts it (checkTopology in tools/stable/stable-upgrade-processes.mjs).
 * It refuses any other process in that group, and the helper's shell watchdog is one. So the
 * watchdog's work is done by a process the upgrade accepts, one for each shape:
 * - commandUnderTheOwnerWatchingGate starts serve-dev under the gate. The gate watches its owner's pid
 *   and, once the owner is gone, sends TERM to its own group.
 * - commandThatWatchesItsOwnerFromInside starts serve-dev as the leader of its group. Node loads the
 *   watch into serve-dev itself with --import, so the group holds no other process. The watch reads
 *   once, from /proc/self/stat, whether its process leads its own group. If not, it does nothing, so a
 *   process that is handed the --import never ends a group it does not lead. Its timer is unref()'d,
 *   so the watch never keeps serve-dev running by itself.
 * Both count the owner as gone only when kill(owner, 0) fails with ESRCH; EPERM means it is alive.
 * Both still end the group after a SIGKILL of the owner.
 * the-owner-watching-gate-ends-its-group-when-its-owner-dies.test.ts proves both, once for every test
 * that starts a supervisor through this file.
 *
 * The rule test that knew both calls by name, the dev-stack test, was deleted on 12 November 2026.
 * Use both only with detached: true. In the caller's own group the gate's TERM would reach the
 * caller too, and the inside watch would do nothing.
 *
 * aLineThatEndsWithItsOwner is for the other processes a stable test starts: a helper, or a stand-in
 * for the test worker. It reads its owner with the product's watch for --stop-with-pid, by pid and
 * start time, and ends its own process once the owner is gone. aLineThatStopsAServerWithItsStarterOrOwner
 * is the same watch for a made-up server. It calls the server's own stop function once the process the
 * server's --stop-with-pid word names is gone, or once the server's owner is gone.
 *
 * The last part is how a stable test shows that its processes end with their owner. aStandInOwner
 * starts a stand-in for the test worker, which a case can kill with SIGKILL. theseGroupsEndAfterASigkillOf
 * kills an owner and expects no live process left in the groups a case started, within
 * A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect } from 'vitest'
import { processIdentity } from '../tools/stable/stable-upgrade-transaction.mjs'

/** The product's watch for --stop-with-pid, aWatchOnTheStarter, by its absolute path, for code a test writes. */
export const THE_PRODUCTS_STARTER_WATCH = resolve(import.meta.dirname, '../src/config/session-process.mjs')

/** How often a helper, a stand-in owner or the stable tests' made-up server looks at the process it ends with. */
export const AN_OWNER_IS_LOOKED_AT_EVERY_MS = 100

const WATCHING_GATE = `const{spawn}=require('node:child_process');const owner=Number(process.argv[3]);const child=spawn(process.argv[1],JSON.parse(process.argv[2]),{stdio:'inherit',env:process.env});child.on('exit',code=>process.exit(code??1));setInterval(()=>{try{process.kill(owner,0)}catch(e){if(e.code==='ESRCH')process.kill(0,'SIGTERM')}},250)`

/** The watch Node loads into serve-dev for commandThatWatchesItsOwnerFromInside, with the owner's pid written in. */
const insideWatch = (owner: number): string => `import{readFileSync}from'node:fs';const stat=readFileSync('/proc/self/stat','utf8');if(Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[2])===process.pid)setInterval(()=>{try{process.kill(${String(owner)},0)}catch(e){if(e.code==='ESRCH')process.kill(0,'SIGTERM')}},250).unref()`

/** The command that runs Node with `args` as the gate's one child. The gate ends its group once `ownerPid` is gone. */
export function commandUnderTheOwnerWatchingGate(args: string[], ownerPid = process.pid): { command: string; args: string[] } {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('The gate needs a positive owner pid.')
  return { command: process.execPath, args: ['-e', WATCHING_GATE, process.execPath, JSON.stringify(args), String(ownerPid)] }
}

/** The command that runs Node with `args` and the watch inside it. Started detached, it ends its own group once `ownerPid` is gone. */
export function commandThatWatchesItsOwnerFromInside(args: string[], ownerPid = process.pid): { command: string; args: string[] } {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('The watch needs a positive owner pid.')
  return { command: process.execPath, args: ['--import', `data:text/javascript,${encodeURIComponent(insideWatch(ownerPid))}`, ...args] }
}

/**
 * One line of JavaScript that ends its process once `ownerPid` is gone. aWatchOnTheStarter reads the owner's pid and
 * start time, so a pid given out again is not taken for the owner. Could not look is not gone, and then the process
 * keeps running. The line works in a CommonJS -e and in a module, and its timer never keeps the process running by itself.
 */
export function aLineThatEndsWithItsOwner(ownerPid = process.pid): string {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('The line needs a positive owner pid.')
  return `import(${JSON.stringify(THE_PRODUCTS_STARTER_WATCH)}).then(({aWatchOnTheStarter})=>{const owner=aWatchOnTheStarter(${String(ownerPid)});setInterval(()=>{if(owner().state==='gone')process.exit(0)},${String(AN_OWNER_IS_LOOKED_AT_EVERY_MS)}).unref()});`
}

/**
 * One line of JavaScript for a stable test's made-up server. It calls the server's function `stop` once, when the process
 * the server's --stop-with-pid word names is gone or when `ownerPid` is gone. aWatchOnTheStarter reads each one by pid
 * and start time. Could not look is not gone, and then the server keeps running. A server with no --stop-with-pid word
 * watches only its owner. Put the line after `stop` is declared. It works in a module and in a CommonJS -e, and its timer
 * never keeps the server running by itself.
 */
export function aLineThatStopsAServerWithItsStarterOrOwner(stop: string, ownerPid = process.pid): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(stop)) throw new Error('The line needs the name of the server\'s stop function.')
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('The line needs a positive owner pid.')
  return `import(${JSON.stringify(THE_PRODUCTS_STARTER_WATCH)}).then(({aWatchOnTheStarter})=>{const starter=process.argv.find(arg=>arg.startsWith('--stop-with-pid='));const watches=[...(starter?[aWatchOnTheStarter(Number(starter.split('=')[1]))]:[]),aWatchOnTheStarter(${String(ownerPid)})];const looking=setInterval(()=>{if(watches.some(watch=>watch().state==='gone')){clearInterval(looking);${stop}()}},${String(AN_OWNER_IS_LOOKED_AT_EVERY_MS)});looking.unref()});`
}

/**
 * How long a process a stable test starts may take to end once the process it ends with is gone. Each watch looks every
 * AN_OWNER_IS_LOOKED_AT_EVERY_MS, and a made-up worker looks at its server more often than that. After a server exits,
 * serve-dev and a gate each exit as soon as their child does. That chain takes well under a second. The rest of the bound
 * is room for a machine that runs three test files at once.
 */
export const A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS = 5_000

/**
 * Starts a stand-in for the test worker, for a case that kills an owner with SIGKILL, which gives it no chance to clean
 * up. It leads a group of its own and ends once its own owner is gone: this worker unless the case names another, so it
 * never outlives the test run. It is put in `kept`, for endTheStandIns after the case, and its pid is returned.
 */
export function aStandInOwner(kept: ChildProcess[], owner = process.pid): number {
  const standIn = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner(owner)}setInterval(()=>{},1000)`], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH } })
  if (!standIn.pid) throw new Error('The stand-in owner did not start.')
  kept.push(standIn)
  return standIn.pid
}

/** Kills each stand-in in `kept` that a case left running, with SIGKILL, waits until each has ended and empties the list. */
export async function endTheStandIns(kept: ChildProcess[]): Promise<void> {
  const left = kept.splice(0)
  for (const standIn of left) standIn.kill('SIGKILL')
  await Promise.all(left.map((standIn) => standIn.exitCode !== null || standIn.signalCode !== null ? undefined
    : new Promise<void>((ended) => standIn.once('exit', () => ended()))))
}

/** The live processes in group `pgid`, read with the upgrade's own processIdentity. A zombie has ended and is not counted. */
export function liveMembersOf(pgid: number): number[] {
  return readdirSync('/proc').filter((name) => /^\d+$/.test(name)).flatMap((name) => {
    try { const p = processIdentity(Number(name)); return p.pgid === pgid && p.state !== 'Z' && p.state !== 'X' ? [p.pid] : [] } catch (e: any) { if (['ENOENT', 'ESRCH'].includes(String(e.code))) return []; throw e }
  })
}

/** Kills `target` with SIGKILL (a negative pid is a whole group), then expects no live process in `pgids` within the bound. */
export async function theseGroupsEndAfterASigkillOf(target: number, pgids: number[]): Promise<void> {
  expect(pgids.filter((pgid) => liveMembersOf(pgid).length === 0), 'the groups that held no process before the SIGKILL').toEqual([])
  process.kill(target, 'SIGKILL')
  const until = Date.now() + A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS
  while (Date.now() < until && pgids.some((pgid) => liveMembersOf(pgid).length > 0)) await delay(100)
  expect(pgids.flatMap(liveMembersOf), `the processes left in groups ${pgids.join(', ')} ${A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS} ms after the SIGKILL`).toEqual([])
}
