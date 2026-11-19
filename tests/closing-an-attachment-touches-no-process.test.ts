// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CLOSING AN ATTACHMENT ENDS A PERIOD OF PARTICIPATION AND LEAVES THE PROCESS RUNNING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE MEASUREMENT IS THE PROCESS AND NOT THE ROW
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief, section 14: *"Closing an attachment is NOT killing the provider runtime. Stop
 * runtime is a separate explicit operation."*
 *
 * A test that asserts the row left the open list proves nothing about that, and it is the cheapest
 * possible thing to fake. So this file starts a REAL child process, opens an attachment that says
 * it is that run, closes the attachment, and then asks the operating system whether the process is
 * still there with `ps`. If `closeAttachment` ever grows a kill, this goes red and the failure
 * message is the `ps` output.
 *
 * A test may spawn. Nothing under `src/` may start a process, but `scripts/` and `tools/` may: they
 * are things a person runs, not the server.
 * The same is true of a test measuring the machine.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION
 * ---------------------------------------------------------------------------------------
 *
 * Add `process.kill(pid)` to `closeAttachment` and the first test below goes red.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let attachments: typeof import('../src/server/lib/attachments.ts')
let child: ChildProcess | null = null

const AGENT = { type: 'agent', id: 'lifecycle-test' } as const
const WORKSPACE = 'default'

beforeEach(async () => {
  t = await freshDb()
  attachments = await import('../src/server/lib/attachments.ts')
})

afterEach(() => {
  if (child?.pid !== undefined && child.pid !== null) {
    // Kill by process GROUP, which is what this repository's own process hygiene asks for: five
    // orphaned-process incidents here, one of which served a deleted database for an afternoon.
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone. Nothing to do, and nothing to report to anybody.
    }
  }
  child = null
  t.close()
})

/**
 * Whether the operating system still has this process RUNNING. The whole `ps` line, for the failure.
 *
 * A LISTED PROCESS IS NOT A LIVE ONE, and this test was wrong about that until it was measured. A
 * killed child of a process that has not reaped it stays in the table as a ZOMBIE — `ps` prints the
 * row, the pid is there, and the process is dead. Killing the child before the close therefore left
 * the first version of this file GREEN, which is a test that would have passed with the fault it
 * exists to catch. The state letter is what tells the two apart: `Z` is a corpse waiting to be
 * collected, anything else is a process.
 */
function psSays(pid: number): { alive: boolean; line: string } {
  try {
    const out = execFileSync('ps', ['-o', 'pid=,stat=,args=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    if (out === '') return { alive: false, line: `ps found no process with pid ${pid}` }
    const state = out.split(/\s+/)[1] ?? ''
    return { alive: !state.startsWith('Z'), line: out }
  } catch {
    // `ps` exits non-zero when it matched nothing, which is the honest answer "it is not there".
    return { alive: false, line: `ps found no process with pid ${pid}` }
  }
}

describe('closing an attachment is not stopping a runtime', () => {
  it('leaves the real process running, read with ps after the close', () => {
    // `detached` so the child leads its own process group and the teardown above can kill the
    // group rather than one pid. `sleep 30` is long enough to outlive the test and short enough
    // that a missed teardown costs half a minute rather than an afternoon.
    child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    const pid = child.pid
    expect(pid, 'the test could not start a process, so it measures nothing').toBeDefined()
    if (pid === undefined) return

    const before = psSays(pid)
    expect(before.alive, `the child was not running before the close: ${before.line}`).toBe(true)

    const opened = attachments.openAttachment({
      workspaceId: WORKSPACE,
      actor: AGENT,
      title: 'a run with a real process behind it',
      providerSession: '3dea5df5-87ba-492f-82e7-454e48c9bd0e',
      machine: 'this one',
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      runtime: 'claude-code',
    })
    expect(opened.attachment.open).toBe(true)

    const closed = attachments.closeAttachment(opened.attachment.id, {
      workspaceId: WORKSPACE,
      actor: AGENT,
      how: 'agent-said',
      because: 'The stage it was opened for was finished and the agent said so.',
    })

    expect(closed.attachment.open).toBe(false)
    expect(closed.attachment.closedHow).toBe('agent-said')

    const after = psSays(pid)
    expect(
      after.alive,
      'closing an attachment stopped a process. It must never do that: the attachment is Mole Office\'s own record of ' +
        'a period of participation, and the provider owns its processes. ' + after.line,
    ).toBe(true)
    expect(after.line).toContain(String(pid))
  })

  it('says on every close that the process was not touched', () => {
    const opened = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run' })
    const closed = attachments.closeAttachment(opened.attachment.id, {
      workspaceId: WORKSPACE,
      actor: AGENT,
      how: 'person-said',
      because: 'The owner closed it from the agent list.',
    })
    expect(closed.says).toMatch(/was not touched/i)
    expect(closed.says).toMatch(/separate act/i)
    // The pages call the ledger of processes and ports by this name, so the reply does too.
    expect(closed.says).toContain('on the “Running on this machine” list,')
  })

  it('writes when, why and how together, and never a caller-supplied moment', () => {
    const opened = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run' })
    const closed = attachments.closeAttachment(opened.attachment.id, {
      workspaceId: WORKSPACE,
      actor: AGENT,
      how: 'went-stale',
      because: 'Nothing arrived from it for over the stale threshold, so Mole Office closed it.',
    })
    expect(closed.attachment.closedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(closed.attachment.closedBecause).toContain('stale threshold')
    expect(closed.attachment.closedHow).toBe('went-stale')
  })
})

describe('what a close refuses', () => {
  it('refuses a close with no reason, because a close nobody can read hides a failure', () => {
    const opened = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run' })
    expect(() =>
      attachments.closeAttachment(opened.attachment.id, {
        workspaceId: WORKSPACE,
        actor: AGENT,
        how: 'agent-said',
        because: '   ',
      }),
    ).toThrow(/no reason/i)
    // And nothing was written: the attachment is still open.
    const still = attachments.listAttachments({ workspaceId: WORKSPACE, openOnly: true })
    expect(still.map((one) => one.id)).toEqual([opened.attachment.id])
  })

  it('refuses to close the same attachment twice, and says when the first close was', () => {
    const opened = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run' })
    attachments.closeAttachment(opened.attachment.id, {
      workspaceId: WORKSPACE,
      actor: AGENT,
      how: 'provider-event',
      because: 'The session-end hook said the run ended.',
    })
    expect(() =>
      attachments.closeAttachment(opened.attachment.id, {
        workspaceId: WORKSPACE,
        actor: AGENT,
        how: 'person-said',
        because: 'Tidying up.',
      }),
    ).toThrow(/already closed/i)
  })

  it('refuses "parent-said" on an attachment that records no parent', () => {
    const opened = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run' })
    expect(() =>
      attachments.closeAttachment(opened.attachment.id, {
        workspaceId: WORKSPACE,
        actor: AGENT,
        how: 'parent-said',
        because: 'Its parent said so.',
      }),
    ).toThrow(/records no parent/i)
  })

  it('refuses to attach to an agent id that names nothing', () => {
    expect(() =>
      attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run', agentId: 'nobody' }),
    ).toThrow(/No agent has the id nobody/)
  })

  it('refuses to attach to a record that is not an agent', () => {
    const note = t.api.createRecord({
      kind: 'note',
      title: 'not an agent',
      workspaceId: WORKSPACE,
      data: { body: 'a note' },
      actor: AGENT,
    })
    expect(() =>
      attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'a run', agentId: note.id }),
    ).toThrow(/not a durable agent/)
  })
})

describe('what a new attachment reports rather than refuses', () => {
  it('names the other open attachments for the same provider session instead of refusing one', () => {
    // MEASURED, AND IT IS WHY THERE IS NO REFUSAL HERE: three live claude processes on this machine
    // on 27 August 2026 share one provider session id, so "one open attachment per provider
    // session" would have refused two runs that genuinely exist.
    const session = '3dea5df5-87ba-492f-82e7-454e48c9bd0e'
    const first = attachments.openAttachment({
      workspaceId: WORKSPACE,
      actor: AGENT,
      title: 'first run',
      providerSession: session,
    })
    const second = attachments.openAttachment({
      workspaceId: WORKSPACE,
      actor: AGENT,
      title: 'second run',
      providerSession: session,
    })

    expect(second.attachment.open).toBe(true)
    expect(second.alsoOpen.forThisProviderSession).toEqual([first.attachment.id])
    expect(second.alsoOpen.says).toMatch(/already in/i)
  })

  it('says plainly when nothing else is open', () => {
    const only = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'the only run' })
    expect(only.alsoOpen.forThisAgent).toEqual([])
    expect(only.alsoOpen.forThisProviderSession).toEqual([])
    expect(only.alsoOpen.says).toBe('Nothing else is open for this agent or this provider session.')
  })

  it('takes the short project-directory name from the whole path rather than being told it', () => {
    const opened = attachments.openAttachment({
      workspaceId: WORKSPACE,
      actor: AGENT,
      title: 'a run somewhere',
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline`,
    })
    const record = t.api.getRecord(opened.attachment.id)
    expect(record?.data['workspace']).toBe('proj_1st_baseline')
    expect(record?.data['workingDirectory']).toBe(`${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline`)
  })
})

describe('the list is one reading of one fact', () => {
  it('separates open from closed by the same rule one attachment answers with', () => {
    const open = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'still going' })
    const ended = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'over' })
    attachments.closeAttachment(ended.attachment.id, {
      workspaceId: WORKSPACE,
      actor: AGENT,
      how: 'agent-said',
      because: 'It said it was done.',
    })

    const all = attachments.listAttachments({ workspaceId: WORKSPACE })
    const openOnly = attachments.listAttachments({ workspaceId: WORKSPACE, openOnly: true })
    expect(all.length).toBe(2)
    expect(openOnly.map((one) => one.id)).toEqual([open.attachment.id])
    expect(all.every((one) => one.open === (one.closedAt === null))).toBe(true)
  })

  it('keeps a closed attachment and its history for ever rather than tidying it away', () => {
    const ended = attachments.openAttachment({ workspaceId: WORKSPACE, actor: AGENT, title: 'over' })
    attachments.closeAttachment(ended.attachment.id, {
      workspaceId: WORKSPACE,
      actor: AGENT,
      how: 'provider-event',
      because: 'The provider said the run ended.',
    })
    const still = attachments.listAttachments({ workspaceId: WORKSPACE }).find((one) => one.id === ended.attachment.id)
    expect(still?.closedBecause).toBe('The provider said the run ended.')
    expect(still?.openedAt).toBe(ended.attachment.openedAt)
  })
})
