// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The owner-watching gate, and the watch inside serve-dev, each end their group, and the server group
 * their supervisor started, within a few seconds of a SIGKILL of their owner. The watch inside does
 * nothing in a process that does not lead its group.
 *
 * tests/the-owner-watching-gate.ts says why the stable tests start their made-up office's supervisor
 * through that file and not under commandThatStopsWithItsOwner. This file is the one proof of both
 * watches for every test that uses them.
 *
 * Mutations, each after a control:
 * - take the watch (the setInterval) out of the gate, and the first case fails with the gate's group
 *   and the server's group still running;
 * - take the setInterval out of the watch inside, and the second case fails the same way;
 * - take the check that its process leads its group out of the watch inside, and the third case fails
 *   with the leader's group gone.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { aLineThatEndsWithItsOwner, commandThatWatchesItsOwnerFromInside, commandUnderTheOwnerWatchingGate } from './the-owner-watching-gate.ts'

/** The live processes in a process group, read from /proc. A zombie has ended and is not counted. */
function membersOf(pgid: number): number[] {
  const members: number[] = []
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    let stat: string
    try { stat = readFileSync(`/proc/${name}/stat`, 'utf8') } catch (e: any) { if (['ENOENT', 'ESRCH'].includes(e.code)) continue; throw e }
    const [state, , group] = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    if (Number(group) === pgid && state !== 'Z' && state !== 'X') members.push(Number(name))
  }
  return members
}

/**
 * Starts a made-up supervisor with the command `commandFor` gives, for a stand-in owner, kills the owner
 * with SIGKILL, and expects no process left in the supervisor's group or in the server's group.
 */
async function theGroupsEndWithTheirOwner(commandFor: (args: string[], ownerPid: number) => { command: string; args: string[] }): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'owner-watching-gate-'))
  // A made-up supervisor of the stable tests' shape: its server leads a group of its own, and a TERM to
  // the supervisor is passed on to that group. It writes down the server's pid for this case.
  mkdirSync(join(folder, 'tools'))
  writeFileSync(join(folder, 'tools/serve-dev.mjs'), `import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});writeFileSync('server.pid',String(child.pid));child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}});`)
  // The stand-in for this test worker, which ends with this worker. A SIGKILL gives it no chance to run any cleanup of its own.
  const standIn = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner()}setInterval(()=>{},1000)`], { stdio: 'ignore' })
  const owned: number[] = []
  try {
    if (!standIn.pid) throw new Error('The stand-in owner did not start.')
    const started = commandFor(['tools/serve-dev.mjs'], standIn.pid)
    const leader = spawn(started.command, started.args, { cwd: folder, detached: true, stdio: 'ignore', env: { PATH: process.env.PATH } })
    owned.push(leader.pid!)
    for (let n = 0; n < 100 && !existsSync(join(folder, 'server.pid')); n++) await delay(100)
    owned.push(Number(readFileSync(join(folder, 'server.pid'), 'utf8')))
    expect(owned.map(membersOf).every(members => members.length > 0), 'serve-dev\'s group and the server are running').toBe(true)
    standIn.kill('SIGKILL')
    for (let n = 0; n < 50 && owned.some(pgid => membersOf(pgid).length > 0); n++) await delay(100)
    expect(owned.flatMap(membersOf), 'no process is left in serve-dev\'s group or the server\'s group').toEqual([])
  } finally {
    standIn.kill('SIGKILL')
    for (const pgid of owned) { try { process.kill(-pgid, 'SIGTERM') } catch (e: any) { if (e.code !== 'ESRCH') throw e } }
    rmSync(folder, { recursive: true, force: true })
  }
}

it('ends the gate\'s group and the server\'s group within a few seconds of a SIGKILL of its owner', async () => {
  await theGroupsEndWithTheirOwner(commandUnderTheOwnerWatchingGate)
})

it('ends the group of a serve-dev that leads it with the watch inside, and the server\'s group, within a few seconds of a SIGKILL of its owner', async () => {
  await theGroupsEndWithTheirOwner(commandThatWatchesItsOwnerFromInside)
})

it('does nothing from inside a process that does not lead its group', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'owner-watching-inside-'))
  const standIn = spawn(process.execPath, ['-e', `${aLineThatEndsWithItsOwner()}setInterval(()=>{},1000)`], { stdio: 'ignore' })
  let leader: number | undefined
  try {
    if (!standIn.pid) throw new Error('The stand-in owner did not start.')
    const watched = commandThatWatchesItsOwnerFromInside(['-e', 'setInterval(()=>{},1000)'], standIn.pid)
    // A group leader that starts the watched process inside its own group, as a child handed serve-dev's
    // --import would be. It writes down that process's pid for this case.
    const lead = spawn(process.execPath, ['-e', `const{spawn}=require('node:child_process');const child=spawn(process.argv[1],JSON.parse(process.argv[2]),{stdio:'ignore'});require('node:fs').writeFileSync('watched.pid',String(child.pid));setInterval(()=>{},1000)`, watched.command, JSON.stringify(watched.args)], { cwd: folder, detached: true, stdio: 'ignore', env: { PATH: process.env.PATH } })
    leader = lead.pid!
    for (let n = 0; n < 100 && !existsSync(join(folder, 'watched.pid')); n++) await delay(100)
    const both = [leader, Number(readFileSync(join(folder, 'watched.pid'), 'utf8'))].sort((a, b) => a - b)
    expect(membersOf(leader).sort((a, b) => a - b), 'the leader and the watched process are running').toEqual(both)
    standIn.kill('SIGKILL')
    // Six of the watch's turns, after the owner is gone.
    await delay(1500)
    expect(membersOf(leader).sort((a, b) => a - b), 'the leader and the watched process are still running').toEqual(both)
  } finally {
    standIn.kill('SIGKILL')
    if (leader !== undefined) { try { process.kill(-leader, 'SIGTERM') } catch (e: any) { if (e.code !== 'ESRCH') throw e } }
    rmSync(folder, { recursive: true, force: true })
  }
})
