// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * IcgsA-OGvbzL: the sandbox launcher gives Codex office_request without putting a key value in
 * arguments, files or its own lines. All keys and instance/handshake rows here are synthetic.
 * The real sandbox-start runs with a stand-in codex that records argv; only a local fixture is contacted.
 * RATbb8xNemOW / IcgsA-OGvbzL step 2: shell policy excludes the worker key; --starts-runs keeps it.
 * GX23T1MQs-aZ (inspector vtuzjBniM_iu): override placement was measured on Codex 0.159.2; exec needs them after exec.
 * f_hnh472ssVM: every Codex run with the office tool writes no shell snapshot, a worker's and a run that starts runs alike.
 * A snapshot is the commands' environment written to CODEX_HOME/shell_snapshots, and a killed run leaves it there.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aCommandsOfficeTool, aCommandsProgram, OFFICE_MCP_SERVER } from '../src/config/run-permissions.mjs'
import { THE_FACTS_VARIABLE, theFactsAStartIsGiven } from '../tools/sandbox-common.mjs'
import { THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { CODEX_FEATURES_OFF, DSH_FEATURES_OFF } from '../tools/harness-features-off.mjs'

const key = 'f6'.repeat(32)
const env = {
  MOLE_AGENT_KEY: key, MOLE_OFFICE_AGENT: 'synthetic-worker', MOLE_OFFICE_SESSION: 'synthetic-session',
  MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: 'http://127.0.0.1:1',
}
// THE SANDBOX'S FACTS, as the launcher on the host gives them to the helper. The helper reads them from its environment
// and never from the instance's folder, so a start by hand is given them as the launcher would give them.
const facts = { instance: 'synthetic', template: 'synthetic', containerRow: 'synthetic-container' }
const theFactsGiven = { [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts) }
const officeOverrides = [
  '-c', 'mcp_servers.mole_office.command="node"',
  '-c', `mcp_servers.mole_office.args=${JSON.stringify([join(process.cwd(), 'tools/office-mcp.mjs')])}`,
  '-c', 'mcp_servers.mole_office.env_vars=["MOLE_OFFICE_AGENT","MOLE_OFFICE_SESSION","MOLE_OFFICE_WORKSPACE","MOLE_OFFICE_API","MOLE_AGENT_KEY","MOLE_OFFICE_RUN_OUTPUT","CODEX_HOME"]',
  '-c', 'mcp_servers.mole_office.enabled=true',
]
const policy = ['-c', 'shell_environment_policy.exclude=["MOLE_AGENT_KEY"]']
const noSnapshot = ['-c', 'features.shell_snapshot=false']
const overrides = [...officeOverrides, ...policy, ...noSnapshot]
const codexIsFast = THE_RUNTIMES_FAST_MODE.codex
const theFastFlag = codexIsFast ? ['-c', 'service_tier=fast'] : []
let dir = ''
beforeAll(() => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  dir = mkdtempSync(join(process.cwd(), '.logs/codex-launcher-'))
  mkdirSync(join(dir, 'bin'))
  // THE FAKE ALSO WRITES DOWN THE OUTPUT FILE ITS LAUNCHER NAMED TO IT, if any, beside the fixture (case 16).
  writeFileSync(join(dir, 'bin/codex'), `#!${process.execPath}\nprocess.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(join(dir, 'run-output-seen'))}, process.env.MOLE_OFFICE_RUN_OUTPUT ?? '(none)')\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n`)
  chmodSync(join(dir, 'bin/codex'), 0o755)
  writeFileSync(join(dir, 'bin/dsh'), `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n`, { mode: 0o755 })
  writeFileSync(join(dir, 'instance.json'), JSON.stringify(facts))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function launched(label: string, flags: string[], command: string[]) {
  const handshake = join(dir, label)
  mkdirSync(handshake)
  writeFileSync(join(handshake, 'row.json'), JSON.stringify({ id: 'synthetic-row' }))
  const before = existsSync(join(dir, 'logs')) ? readdirSync(join(dir, 'logs')) : []
  const child = spawn(process.execPath, [
    'tools/sandbox-start.mjs', '--instance', dir, '--cwd', dir, '--as', env.MOLE_OFFICE_AGENT,
    '--session', env.MOLE_OFFICE_SESSION, '--workspace', env.MOLE_OFFICE_WORKSPACE, '--api', env.MOLE_OFFICE_API,
    '--handshake', handshake, '--wait', '--timeout', '5', ...flags, '--', ...command,
  ], { env: withAPrivateTmpToSweep({ ...withoutInheritedEffort(), ...env, ...theFactsGiven, PATH: join(dir, 'bin') + ':' + process.env['PATH'] }, dir) })
  let out = ''
  let err = ''
  child.stdout.on('data', (c) => { out += String(c) })
  child.stderr.on('data', (c) => { err += String(c) })
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
  expect(code, err).toBe(0)
  expect(out + err).not.toContain(key)
  const folder = readdirSync(join(dir, 'logs')).find((name) => !before.includes(name))!
  const record = JSON.parse(readFileSync(join(dir, 'logs', folder, 'start.json'), 'utf8')) as { command: string[] }
  expect(JSON.stringify(record)).not.toContain(key)
  return { argv: JSON.parse(out) as string[], record, err }
}

describe('Codex’s sandbox office tool arguments', () => {
  it.each(['agent', 'plain', 'plain-env'])('B18 helper refuses wrong Codex flags before its own filing or gate: %s', async mode => {
    const requests: string[] = []
    const server = createServer((req, res) => { requests.push(`${req.method} ${req.url}`); res.statusCode = 403; res.end('{"error":"synthetic refusal"}') })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const starts = () => existsSync(join(dir, 'logs')) ? readdirSync(join(dir, 'logs')).filter(name => existsSync(join(dir, 'logs', name, 'start.json'))) : []
    const before = starts()
    try {
      const flags = mode === 'agent'
        ? ['--agent', 'synthetic-worker', '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--worktree', dir, '--cut-from', 'main']
        : ['--wait', ...(mode === 'plain-env' ? ['--plain-env'] : [])]
      const child = spawn(process.execPath, ['tools/sandbox-start.mjs', '--instance', dir, '--cwd', dir,
        '--as', env.MOLE_OFFICE_AGENT, '--session', env.MOLE_OFFICE_SESSION, '--workspace', 'default', '--api', api,
        ...flags, '--', 'env', 'SYNTHETIC=value', 'codex', '-s', 'danger-full-access', '-a', 'on-request', 'exec'],
        { env: { ...withoutInheritedEffort(), HOME: join(dir, 'synthetic-home'), ...env, ...theFactsGiven, MOLE_OFFICE_API: api } })
      let out = '', err = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c)
      const code = await new Promise<number | null>(done => child.on('close', done))
      expect(code).not.toBe(0)
      expect(err).toMatch(/Codex.*-a on-request.*-s danger-full-access -a never.*before exec/)
      expect(out).toBe('')
      expect(requests).toEqual([])
      expect(starts()).toEqual(before)
    } finally { await new Promise<void>(done => server.close(() => done())) }
  })
  // Mutations, each alone: compare the whole path; treat an empty command or dsh as Codex.
  it('14: reads codex, an absolute codex path, dsh and an empty command as before', () => {
    for (const [command, program, isCodex] of [
      [['codex'], 'codex', true],
      [['/usr/bin/codex'], 'codex', true],
      [['dsh'], 'dsh', false],
      [[], '', false],
    ] as const) {
      expect(aCommandsProgram(command)).toEqual({ program, isCodex })
    }
  })

  // Mutations: overrides back after the program's name; overrides removed; shell policy taken out.
  it('1: puts exact overrides right after exec for new and resumed commands, with root options and absolute program paths', () => {
    expect(OFFICE_MCP_SERVER).toBe(join(process.cwd(), 'tools/office-mcp.mjs'))
    for (const command of [
      ['codex', 'exec', '--json', 'hello'],
      ['/usr/bin/codex', 'exec', 'resume', 'synthetic-id'],
      ['codex', '-s', 'danger-full-access', '-a', 'never', 'exec', 'hello'],
      ['codex', '-s', 'danger-full-access', '-a', 'never', 'exec', 'resume', 'synthetic-id'],
    ]) {
      const answer = aCommandsOfficeTool(command, env)
      const at = command.indexOf('exec') + 1
      expect(answer.command).toEqual([...command.slice(0, at), ...overrides, ...command.slice(at)])
      expect(answer.says.join(' ')).toContain('office_request')
    }
  })

  // Mutation: the key’s value written into an argument alongside the variable names.
  it('2: writes only variable names, never the key’s value, and leaves the environment intact', () => {
    const before = { ...env }
    const answer = aCommandsOfficeTool(['codex', 'exec'], env)
    expect(answer.command).toContain(overrides[5])
    for (const word of [...answer.command, ...answer.says]) expect(word).not.toContain(key)
    expect(env).toEqual(before)
    expect(answer.command).toContain(policy[1])
  })

  // Mutations, each alone: plainEnv guard removed; non-Codex guard removed; identity guard removed.
  it('3: adds none for plain-env, another program or any missing identity variable', () => {
    expect(aCommandsOfficeTool(['codex', 'exec'], env, { plainEnv: true })).toEqual({ command: ['codex', 'exec'], says: [] })
    expect(aCommandsOfficeTool(['node', 'worker.mjs'], env)).toEqual({ command: ['node', 'worker.mjs'], says: [] })
    for (const name of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_API']) {
      expect(aCommandsOfficeTool(['codex', 'exec'], { ...env, [name]: undefined }).command).toEqual(['codex', 'exec'])
      expect(aCommandsOfficeTool(['codex', 'exec'], { ...env, [name]: ' ' }).command).toEqual(['codex', 'exec'])
    }
  })

  // Mutations: overrides back after the program's name; launcher omits the helper; worker line removed.
  it('4: the real launcher gives new and resumed Codex commands the overrides right after exec and says what it gave', async () => {
    for (const tail of [['exec', 'hello'], ['exec', 'resume', 'synthetic-id']]) {
      const answer = await launched(tail.length === 2 ? 'new' : 'resumed', ['--verbose'], ['codex', ...tail])
      // A Codex start with no model now receives no effort and no tier: Codex's own configuration decides.
      expect(answer.argv).toEqual([...CODEX_FEATURES_OFF, 'exec', ...overrides, ...tail.slice(1)])
      expect(answer.argv.some((word) => word.startsWith('model_reasoning_effort='))).toBe(false)
      expect(answer.argv.some((word) => word.startsWith('service_tier='))).toBe(false)
      expect(answer.err).toContain("Codex's own configuration decides")
      expect(answer.record.command).toEqual(['codex', ...answer.argv])
      expect(answer.err).toContain('Codex gets office_request')
      expect(answer.err).toContain('no permission flags given')
      expect(answer.err).not.toContain('codex runs with full permissions')
      expect(answer.err).toContain("Codex's commands get no MOLE_AGENT_KEY; office_request still has it (RATbb8xNemOW).")
      // 16: A RUN THAT PRINTS TO ITS STARTER'S SCREEN KEEPS NO OUTPUT FILE, so none is named.
      expect(readFileSync(join(dir, 'run-output-seen'), 'utf8')).toBe('(none)')
    }
  })

  // Mutation: launcher rebuilds office identity for a plain command and passes plainEnv: false.
  it('5: the real launcher gives plain-env and no-office-variables Codex commands no MCP overrides', async () => {
    const plain = await launched('plain', ['--plain-env'], ['codex', 'exec'])
    // No effort and no tier reach a Codex start with no model: Codex's own configuration decides.
    // Its switch that turns Codex's subagents off goes in all the same (tools/harness-features-off.mjs).
    expect(plain.argv).toEqual([...CODEX_FEATURES_OFF, 'exec'])
    expect(plain.argv.some((word) => word.startsWith('model_reasoning_effort='))).toBe(false)
    expect(plain.argv.some((word) => word.startsWith('service_tier='))).toBe(false)
    expect(plain.err).toContain("Codex's own configuration decides")
    expect(plain.err).not.toContain('Codex gets office_request')
    const noOffice = await launched('no-office', ['--no-office-variables'], ['codex', 'exec'])
    expect(noOffice.argv).toEqual([...CODEX_FEATURES_OFF, 'exec'])
    expect(noOffice.argv.some((word) => word.startsWith('model_reasoning_effort='))).toBe(false)
    expect(noOffice.argv.some((word) => word.startsWith('service_tier='))).toBe(false)
    expect(noOffice.err).toContain("Codex's own configuration decides")
    expect(noOffice.err).not.toContain('Codex gets office_request')
  })

  // Mutation: exec's placement is applied to an interactive command with no subcommand.
  it('6: keeps overrides right after codex for the interactive form, with or without options and a prompt', () => {
    for (const command of [['codex'], ['codex', '-s', 'danger-full-access', '-a', 'never'], ['codex', '--no-alt-screen', 'hello']]) {
      expect(aCommandsOfficeTool(command, env).command).toEqual([command[0], ...overrides, ...command.slice(1)])
    }
  })

  // Mutations, each alone: exec searched for anywhere, including an option's value; option values not skipped.
  it('7: skips option values named exec before finding the subcommand or interactive form', () => {
    for (const option of ['-m', '--model', '-p', '--profile', '-c', '--config', '--enable', '--disable', '-s', '--sandbox', '-a', '--ask-for-approval', '-C', '--cd', '-i', '--image', '--add-dir', '--local-provider', '--remote', '--remote-auth-token-env']) {
      expect(aCommandsOfficeTool(['codex', option, 'exec'], env).command).toEqual(['codex', ...overrides, option, 'exec'])
      expect(aCommandsOfficeTool(['codex', option, 'exec', 'exec', 'hello'], env).command).toEqual(['codex', option, 'exec', 'exec', ...overrides, 'hello'])
    }
    for (const option of ['--model=exec', '-mexec', '--no-alt-screen', '--oss']) {
      expect(aCommandsOfficeTool(['codex', option, 'exec', 'hello'], env).command).toEqual(['codex', option, 'exec', ...overrides, 'hello'])
    }
  })

  // Mutation: exec searched for anywhere in the command, including another subcommand's arguments.
  it('8: leaves every other subcommand and words after -- with the existing placement', () => {
    for (const command of [
      ['codex', 'mcp', 'list'], ['codex', 'review', 'exec'], ['codex', '-m', 'exec', 'mcp', 'list'],
      ['codex', '--', 'exec'], ['codex', 'hello', 'exec'],
    ]) {
      expect(aCommandsOfficeTool(command, env).command).toEqual([command[0], ...overrides, ...command.slice(1)])
    }
  })

  // Mutation: startsRuns ignored, so a run that starts runs receives the exclusion too.
  it('9: keeps the key in commands for a run that starts runs, while giving it office_request', () => {
    const answer = aCommandsOfficeTool(['codex', 'exec', 'hello'], env, { startsRuns: true })
    expect(answer.command).toEqual(['codex', 'exec', ...officeOverrides, ...noSnapshot, 'hello'])
    expect(answer.says).toContain("--starts-runs: Codex's commands keep MOLE_AGENT_KEY, because this run starts runs.")
    for (const word of [...answer.command, ...answer.says]) expect(word).not.toContain(key)
  })

  // Mutation: e no longer recognized as exec, so the overrides precede e.
  it('10: puts office overrides and the shell policy after the e alias, skipping option values named e', () => {
    for (const command of [
      ['codex', 'e', 'hello'], ['/usr/bin/codex', '-s', 'danger-full-access', '-a', 'never', 'e', 'resume', 'synthetic-id'],
      ['codex', '-m', 'e', 'e', 'hello'],
    ]) {
      const at = command.lastIndexOf('e') + 1
      expect(aCommandsOfficeTool(command, env).command).toEqual([...command.slice(0, at), ...overrides, ...command.slice(at)])
    }
    expect(aCommandsOfficeTool(['codex', '-m', 'e'], env).command).toEqual(['codex', ...overrides, '-m', 'e'])
  })

  // Mutations, each alone: the snapshot switch taken out; the switch kept only for a worker, not for a run that starts runs.
  it('17: turns Codex shell snapshots off for a worker and for a run that starts runs, and says so', () => {
    for (const startsRuns of [false, true]) {
      const answer = aCommandsOfficeTool(['codex', 'exec', 'hello'], env, { startsRuns })
      const at = answer.command.indexOf(noSnapshot[1]!)
      expect(at, `startsRuns=${startsRuns}`).toBeGreaterThan(answer.command.indexOf('exec'))
      expect(answer.command[at - 1]).toBe('-c')
      expect(answer.command.indexOf('hello')).toBeGreaterThan(at)
      expect(answer.says).toContain("Codex writes no shell snapshot, so its commands' environment is not copied to disk.")
    }
  })

  // Mutations, each alone: helper does not pass startsRuns to aCommandsOfficeTool; supervisor line removed.
  // Non-Codex mutation: take out the helper's line saying --starts-runs changes nothing.
  it.each(['codex', 'dsh'])('11: the real helper honors --starts-runs for %s and says what it changes', async (program) => {
    // --run reads a synthetic run and files its process row with this local fixture only.
    let group: number | undefined
    const effortWrites: unknown[] = []
    const office = createServer(async (req, reply) => {
      reply.setHeader('content-type', 'application/json')
      if (req.method === 'GET' && req.url?.startsWith('/api/records/synthetic-run')) {
        // The run already carries a doing line, as a run the launcher files does, so the helper keeps it and the
        // record door's only write is the effort. A doing line written over one the run holds is red here too.
        reply.end(JSON.stringify({ record: { kind: 'session', data: {
          servingAgent: env.MOLE_OFFICE_AGENT, state: 'finished', doing: 'the doing line the synthetic run already carries',
          sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
        } } }))
      } else if (req.method === 'GET' && req.url?.startsWith('/api/office/run-models/for/')) {
        // The launcher now reads this door on every start; this stand-in answers a Codex effort.
        reply.end(JSON.stringify({ model: null, effort: program === 'codex' ? 'xhigh' : null, effortFrom: program === 'codex' ? "the owner's rule" : 'none' }))
      } else if (req.method === 'PATCH' && req.url === '/api/records/synthetic-run') {
        // Selected effort is written before spawn, through the same record door as the real office.
        let body = ''
        for await (const chunk of req) body += chunk
        effortWrites.push(JSON.parse(body))
        reply.end('{}')
      } else if (req.method === 'POST' && req.url === '/api/resources') {
        let body = ''
        for await (const chunk of req) body += chunk
        group = JSON.parse(body).pidInContainer
        reply.statusCode = 201
        reply.end(JSON.stringify({ resource: { id: 'synthetic-row', key: String(group), pgid: group } }))
      } else {
        reply.statusCode = 404
        reply.end(JSON.stringify({ error: 'No fixture for this request.' }))
      }
    })
    await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
    try {
      const child = spawn(process.execPath, [
        'tools/sandbox-start.mjs', '--in-background', '--instance', dir, '--cwd', dir,
        '--run', 'synthetic-run', '--starts-runs', '--verbose', '--api', `http://127.0.0.1:${(office.address() as AddressInfo).port}`,
        '--', join(dir, 'bin', program), 'exec', 'hello',
      ], { env: withAPrivateTmpToSweep({ ...withoutInheritedEffort(), ...env, ...theFactsGiven, PATH: join(dir, 'bin') + ':' + process.env['PATH'] }, dir) })
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk) => { out += chunk })
      child.stderr.on('data', (chunk) => { err += chunk })
      const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
      expect(code, err).toBe(0)
      expect(effortWrites).toEqual(program === 'codex' ? [{ dataPatch: { effort: 'xhigh' } }] : [])
      const start = JSON.parse(out.trim()) as { command: string[]; out: string }
      const argv = program === 'codex' ? [...CODEX_FEATURES_OFF, '-s', 'danger-full-access', '-a', 'never', 'exec', ...officeOverrides, ...noSnapshot, 'hello', '-c', 'model_reasoning_effort=xhigh', ...theFastFlag] : [...DSH_FEATURES_OFF, 'exec', 'hello']
      expect(start.command).toEqual([join(dir, 'bin', program), ...argv])
      expect(JSON.parse(readFileSync(start.out, 'utf8'))).toEqual(argv)
      expect(out + err).not.toContain(key)
      if (program === 'codex') {
        // 16: A CODEX RUN THAT KEEPS ITS OUTPUT IS TOLD WHICH FILE IT IS, for its seal's receipt.
        // Mutation: the launcher's line that names it taken out.
        expect(readFileSync(join(dir, 'run-output-seen'), 'utf8')).toBe(start.out)
        expect(start.out.endsWith('/logs/synthetic-run/out')).toBe(true)
        expect(err).toContain("--starts-runs: Codex's commands keep MOLE_AGENT_KEY, because this run starts runs.")
        expect(err).not.toContain('--starts-runs changes nothing')
      } else {
        expect(err).toContain('--starts-runs changes nothing for a dsh command: only Codex and Claude Code commands have their key taken out of their shell.')
      }
      expect(err).not.toContain("Codex's commands get no MOLE_AGENT_KEY")
    } finally {
      if (group !== undefined) {
        try { process.kill(-group, 'SIGTERM') } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
      await new Promise<void>((closed) => office.close(() => closed()))
    }
  })

  // Mutation: helper's starts-runs/plain-env refusal removed.
  it('12: the real helper refuses --starts-runs with --plain-env before starting anything', () => {
    const before = readdirSync(join(dir, 'logs'))
    const answer = spawnSync(process.execPath, [
      'tools/sandbox-start.mjs', '--instance', dir, '--starts-runs', '--plain-env', '--wait', '--', 'codex', 'exec',
    ], { env: { ...withoutInheritedEffort(), ...env, ...theFactsGiven }, encoding: 'utf8', timeout: 5000 })
    expect(answer.status, answer.stderr).toBe(2)
    expect(answer.stderr).toContain('--starts-runs cannot be used with --plain-env: such a command holds no key.')
    expect(readdirSync(join(dir, 'logs'))).toEqual(before)
  })

  // Mutation: helper's starts-runs/own-command refusal removed.
  it('13: the real helper refuses --starts-runs without --agent or --run before starting anything', () => {
    const before = readdirSync(join(dir, 'logs'))
    const handshake = join(dir, 'refused-starts-runs')
    mkdirSync(handshake)
    writeFileSync(join(handshake, 'row.json'), JSON.stringify({ id: 'synthetic-row' }))
    const seen = join(dir, 'refused-command-ran')
    const answer = spawnSync(process.execPath, [
      'tools/sandbox-start.mjs', '--instance', dir, '--cwd', dir, '--starts-runs', '--wait',
      '--timeout', '5', '--handshake', handshake, '--', process.execPath, '-e',
      `require('fs').writeFileSync(${JSON.stringify(seen)}, 'started')`,
    ], { env: { ...withoutInheritedEffort(), ...env, ...theFactsGiven }, encoding: 'utf8', timeout: 5000 })
    expect(answer.status, answer.stderr).toBe(2)
    expect(answer.stderr).toContain("--starts-runs needs an agent's run (--agent or --run): a plain command holds no run key, so there is nothing to keep.")
    expect(existsSync(seen)).toBe(false)
    expect(existsSync(join(handshake, 'pid.json'))).toBe(false)
    expect(readdirSync(join(dir, 'logs'))).toEqual(before)
  })

})
