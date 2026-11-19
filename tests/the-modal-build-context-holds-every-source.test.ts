// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The plan's build context must contain the sources of its cut Dockerfile.
 * Repositories, credentials and the executable below are synthetic. No Modal call is made.
 * Mutation recipes (tools/modal-tests.mjs): copy only dsh; omit keep-alive;
 * remove source validation; skip ADD; reject every --from, or accept absent stages.
 * Each recipe is run after a green control and followed by a restored green run.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { cutDockerfile } from '../tools/modal-tests.mjs'

const TOOL = resolve('tools/modal-tests.mjs')
const TEMPLATE = resolve('sandboxes/mole-office-dev')
const boundary = 'FROM mole-office-dev AS with-extra-packages\nCOPY absent-after-the-cut /ignored\n'
let root: string
let template: string
let runner: string
let repo: string
let commit: string
let token: string
let program: string

function put(name: string, text = `Synthetic contents of ${name}.`) {
  const path = join(template, name)
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'modal-context-proof-'))
  template = join(root, 'sandboxes/mole-office-dev')
  runner = join(root, 'tools/modal-tests.mjs')
  repo = join(root, 'repo')
  for (const dir of [template, join(root, 'tools'), join(root, 'home'), join(root, 'tmp'), join(repo, 'tests')]) mkdirSync(dir, { recursive: true })
  cpSync(TOOL, runner)
  // Only code dependencies are shared. The template is this test's own directory.
  symlinkSync(resolve('src'), join(root, 'src'), 'dir')
  put('dsh/package.json')
  put('second-file')
  put('a file with spaces')
  writeFileSync(join(repo, 'tests/synthetic.test.ts'), 'Synthetic tracked test.')
  function git(args: string[]) {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: {
      PATH: process.env.PATH, HOME: join(root, 'home'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
    } })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  git(['init', '-q', '-b', 'main']); git(['add', '.']); git(['commit', '-q', '-m', 'Synthetic tree'])
  commit = git(['rev-parse', 'HEAD'])
  token = join(root, 'synthetic-token.toml')
  writeFileSync(token, 'Synthetic token, never a credential.', { mode: 0o600 })
  program = join(root, 'synthetic-python')
  writeFileSync(program, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(root, 'driver-called'))}, 'Synthetic driver call');\n`, { mode: 0o700 })
})

afterEach(() => { rmSync(root, { recursive: true, force: true }) })

function plan(dockerfile?: string) {
  if (dockerfile !== undefined) put('Dockerfile', dockerfile + boundary)
  const answer = spawnSync(process.execPath, [dockerfile === undefined ? TOOL : runner,
    '--repo', repo, '--commit', commit, '--out', join(root, 'report.json'), '--plan-only', '--', 'tests/synthetic.test.ts'], {
    encoding: 'utf8', timeout: 20_000, env: {
      PATH: process.env.PATH, HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'),
      MOLE_OFFICE_MODAL_TOKEN_FILE: token, MOLE_OFFICE_MODAL_PYTHON: program,
    },
  })
  expect(existsSync(join(root, 'driver-called'))).toBe(false)
  return answer
}

it.each([
  ['COPY shell', 'COPY dsh/package.json second-file /opt/\n', 'second-file'],
  ['ADD shell', 'COPY dsh/package.json /opt/dsh/\nADD second-file /opt/\n', 'second-file'],
  ['COPY flags and JSON', 'COPY --chown=1000:1000 --chmod=755 ["dsh/package.json", "a file with spaces", "/opt/"]\n', 'a file with spaces'],
  ['ADD flags and JSON', 'COPY dsh/package.json /opt/dsh/\nADD --chmod=644 ["second-file", "/opt/"]\n', 'second-file'],
  ['shell quotes', 'COPY --chown=1000:1000 dsh/package.json "a file with spaces" /opt/\n', 'a file with spaces'],
  ['continued COPY', 'COPY dsh/package.json \\\n# A comment inside a synthetic continuation.\n second-file \\\n /opt/\n', 'second-file'],
  ['directory', 'COPY dsh/ /opt/dsh/\nCOPY second-file /opt/\n', 'second-file'],
])('copies dsh and the second source from a stand-in template: %s', (_name, instruction, second) => {
  const source = 'FROM synthetic AS mole-office-dev\n' + instruction
  const answer = plan(source)
  expect(answer.status, answer.stderr).toBe(0)
  const result = JSON.parse(answer.stdout)
  for (const name of ['dsh/package.json', second!]) expect(readFileSync(join(result.contextPath, name))).toEqual(readFileSync(join(template, name)))
  expect(readFileSync(result.dockerfilePath, 'utf8')).toBe(source)
  expect(result).toMatchObject({ commit, files: ['tests/synthetic.test.ts'] })
})

it('puts every source of the real cut template, including keep-alive, in the plan context', () => {
  const answer = plan()
  expect(answer.status, answer.stderr).toBe(0)
  const result = JSON.parse(answer.stdout)
  const cut: string = cutDockerfile(readFileSync(join(TEMPLATE, 'Dockerfile'), 'utf8'))
  expect(readFileSync(result.dockerfilePath, 'utf8')).toBe(cut)
  // Read the real template independently of the runner's source collector. This template uses
  // plain paths; fail explicitly if it changes to a form this assertion cannot interpret.
  const instructions = cut.split('\n').filter(line => /^\s*(COPY|ADD)\s/iu.test(line))
  expect(instructions.length).toBeGreaterThan(0)
  const sources = instructions.flatMap(line => {
    expect(line, 'Update this independent template assertion for the new syntax.').toMatch(/^\s*(COPY|ADD)\s+[\w./ -]+$/iu)
    return line.trim().split(/\s+/u).slice(1, -1)
  })
  expect(sources).toContain('keep-alive')
  for (const name of sources) {
    expect(existsSync(join(result.contextPath, name)), `Missing template source: ${name}`).toBe(true)
    expect(readFileSync(join(result.contextPath, name))).toEqual(readFileSync(join(TEMPLATE, name)))
  }
})

it.each(['../x', 'dsh/../../x', 'absolute', 'missing-file', 'outside-link', 'outside-directory/file', 'dsh/'])('refuses and names a source missing from or outside the template: %s', (kind) => {
  writeFileSync(join(root, 'sandboxes/x'), 'Synthetic file outside the template.')
  const outside = join(root, 'outside')
  mkdirSync(outside); writeFileSync(join(outside, 'file'), 'Synthetic outside contents.')
  symlinkSync(join(outside, 'file'), join(template, 'outside-link'))
  symlinkSync(outside, join(template, 'outside-directory'), 'dir')
  if (kind === 'dsh/') symlinkSync(join(outside, 'file'), join(template, 'dsh/outside-child'))
  const source = kind === 'absolute' ? join(outside, 'file') : kind
  const answer = plan(`FROM synthetic AS mole-office-dev\nCOPY ${source} /y\n`)
  expect(answer.status, answer.stderr).toBe(2)
  expect(answer.stderr).toContain(source)
  expect(answer.stderr).toMatch(/template|outside/iu)
  expect(answer.stdout).toBe('')
})

it('copies an in-template symlink as usable context contents', () => {
  symlinkSync('second-file', join(template, 'inside-link'))
  const answer = plan('FROM synthetic AS mole-office-dev\nCOPY inside-link /opt/\n')
  expect(answer.status, answer.stderr).toBe(0)
  const result = JSON.parse(answer.stdout)
  rmSync(join(template, 'second-file'))
  expect(readFileSync(join(result.contextPath, 'inside-link'), 'utf8')).toBe('Synthetic contents of second-file.')
})

it.each(['builder', '0'])('leaves COPY from retained stage %s alone without looking for a context source', (stage) => {
  const source = `FROM synthetic AS builder\nRUN touch /built-only-in-the-image\nFROM synthetic AS mole-office-dev\nCOPY --from=${stage} --chown=1000:1000 ["/built-only-in-the-image", "/opt/"]\nCOPY second-file /opt/\n`
  const answer = plan(source)
  expect(answer.status, answer.stderr).toBe(0)
  const result = JSON.parse(answer.stdout)
  expect(readFileSync(result.dockerfilePath, 'utf8')).toBe(source)
  expect(readFileSync(join(result.contextPath, 'second-file'), 'utf8')).toBe('Synthetic contents of second-file.')
})

it.each(['with-extra-packages', 'absent-stage', '3'])('refuses and names COPY from stage %s absent from the cut', (stage) => {
  const answer = plan(`FROM synthetic AS mole-office-dev\nCOPY --from=${stage} /artifact /opt/\n`)
  expect(answer.status, answer.stderr).toBe(2)
  expect(answer.stderr).toContain(stage)
  expect(answer.stderr).toMatch(/stage.*cut|cut.*stage/iu)
  expect(answer.stdout).toBe('')
})
