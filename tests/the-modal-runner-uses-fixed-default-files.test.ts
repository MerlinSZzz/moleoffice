// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Fixed default files, requested in g8XKAYEr4LC7 for the owner's second opinion.
 * Every token, Python response and repository is synthetic. Each case has its own HOME and .env.
 * The executable stands in for Python; these tests never call Modal or read the real Modal folder.
 * The test builds `modal` with arguments.mjs's `theModalParts`, the builder the office uses, given the test's own
 * reader, so a drift in the real object is caught here (condition oEOpTYrxqkcK).
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { settingNamed, settingValue } from '../src/config/settings.mjs'
import { aSecondOpinion, whetherASecondOpinionCanBeTaken } from '../tools/merge-tool/second-opinion.mjs'
import { receiptsFile } from '../tools/modal-tests.mjs'

/** The folder the made-up command line names, made under the system temporary folder and removed after the file. */
const ARGUMENTS_WORKDIR = mkdtempSync(join(tmpdir(), 'modal-runner-arguments-'))
/** arguments.mjs reads the command line when it loads, so this file loads it once in beforeAll, with a made-up one. */
let theModalParts: typeof import('../tools/merge-tool/arguments.mjs')['theModalParts']

const TOOL = resolve('tools/modal-tests.mjs')
const SETTINGS = resolve('src/config/settings.mjs')
const TOKEN = 'MOLE_OFFICE_MODAL_TOKEN_FILE'
const PYTHON = 'MOLE_OFFICE_MODAL_PYTHON'
const SYNTHETIC_TOKEN = 'Synthetic token; never a credential or a real observation.'
let root: string
let home: string
let envFile: string
let token: string
let python: string
let repo: string
let commit: string
let launcher: string

beforeAll(async () => {
  // arguments.mjs reads the command line as it loads and exits 2 on a usage error, so the import is dynamic: argv must
  // describe a made-up run before the module is evaluated, and it is put back as soon as the import returns.
  const argv = process.argv
  process.argv = ['node', 'made-up-reader', '--entry', 'made-up-entry', '--session', 'made-up-run', '--api', 'http://127.0.0.1:0', '--workdir', ARGUMENTS_WORKDIR]
  try {
    ;({ theModalParts } = await import('../tools/merge-tool/arguments.mjs'))
  } finally {
    process.argv = argv
  }
})

afterAll(() => {
  rmSync(ARGUMENTS_WORKDIR, { recursive: true, force: true })
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'modal-default-files-'))
  home = join(root, 'home')
  mkdirSync(home)
  vi.stubEnv('HOME', home)
  expect(homedir()).toBe(home)
  envFile = join(root, '.env')
  writeFileSync(envFile, '')
  token = join(home, '.cache/mole-office/modal/token.toml')
  python = join(home, '.cache/mole-office/modal/venv/bin/python')
  repo = join(root, 'repo')
  mkdirSync(join(repo, 'tests'), { recursive: true })
  writeFileSync(join(repo, 'tests/synthetic.test.ts'), 'Synthetic tracked test file.')
  const git = (args: string[]) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' } })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  git(['init', '-q', '-b', 'main'])
  git(['add', '.'])
  git(['commit', '-q', '-m', 'Synthetic test tree'])
  commit = git(['rev-parse', 'HEAD'])
  launcher = join(root, 'launch.mjs')
  // The exported entry takes the same settings reader as eligibility, with a temporary .env path.
  writeFileSync(launcher, `import { main } from ${JSON.stringify(TOOL)}; import { settingValue } from ${JSON.stringify(SETTINGS)}; process.exitCode = await main(process.argv.slice(2), name => settingValue(name, process.env, ${JSON.stringify(envFile)}));\n`)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

function validToken(path = token) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, SYNTHETIC_TOKEN, { mode: 0o600 })
}

function validPython(path = python) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `#!${process.execPath}\nconst fs = require('node:fs'); const plan = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); fs.writeFileSync(plan.reportFile, JSON.stringify({success:true, testResults:plan.files.map(file => ({name:plan.checkout+'/'+file, status:'passed', assertionResults:[]}))})); fs.writeFileSync(${JSON.stringify(join(root, 'used-token-path.json'))}, JSON.stringify(process.env.MODAL_CONFIG_PATH)); console.log(JSON.stringify({kind:'modal-tests-result', reportFile:plan.reportFile, sandboxSeconds:1, sandboxId:'synthetic-sandbox'}));\n`, { mode: 0o700 })
}

function setting(env: Record<string, string> = {}) {
  return (name: string) => settingValue(name, env, envFile)
}

function can(env: Record<string, string> = {}) {
  return whetherASecondOpinionCanBeTaken({ runner: 'synthetic-runner', theRealRunner: TOOL, env: {}, modal: theModalParts(setting(env)) })
}

function launch(env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [launcher, '--repo', repo, '--commit', commit, '--out', join(root, 'report.json'), '--', 'tests/synthetic.test.ts'], { encoding: 'utf8', env: { PATH: process.env['PATH'], HOME: home, ...env }, timeout: 20_000 })
}

async function refused(off: string, env: Record<string, string> = {}) {
  expect(can(env).off).toBe(off)
  const run = vi.fn()
  const git = vi.fn()
  const red = [{ file: 'tests/synthetic.test.ts', pair: null }]
  const result = await aSecondOpinion({ tree: repo, M: commit, stillRed: red, runner: 'synthetic-runner', theRealRunner: TOOL, outFolder: root, run, git, log: () => {}, env: {}, modal: theModalParts(setting(env)) })
  expect(result).toEqual({ cleared: [], kept: red, says: ` No second opinion on Modal was taken: ${off}.` })
  expect(run).not.toHaveBeenCalled()
  expect(git).not.toHaveBeenCalled()
  expect(result.says).not.toContain(SYNTHETIC_TOKEN)
}

it('takes a second opinion with unset variables and valid default files, and starts with both default paths', () => {
  validToken()
  validPython()
  expect(can()).toEqual({ off: null, cap: 42.5 })
  const result = launch()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.split('\n')[0]).toBe(`Modal tests: starting with token file ${token} (the default) and Python ${python} (the default).`)
  expect(result.stdout + result.stderr).not.toContain(SYNTHETIC_TOKEN)
  expect(JSON.parse(readFileSync(join(root, 'used-token-path.json'), 'utf8'))).toBe(token)
  expect(receiptsFile()).toBe(join(home, '.cache/mole-office/modal/receipts.jsonl'))
  expect(JSON.parse(readFileSync(receiptsFile(), 'utf8')).outcome).toBe('passed')
  for (const [name, path] of [[TOKEN, '~/.cache/mole-office/modal/token.toml'], [PYTHON, '~/.cache/mole-office/modal/venv/bin/python']]) {
    const words = settingNamed(name!).what + ' ' + settingNamed(name!).absentMeans
    expect(words).toContain(path)
    expect(settingNamed(name!).what).toContain('0600')
    expect(settingNamed(name!).absentMeans).toContain('0600')
  }
})

it.each(['token', 'Python'])('names the missing default %s file and calls nothing', async (missing) => {
  if (missing === 'Python') validToken()
  const off = missing === 'token'
    ? `there is no Modal token file at ${token} (the default; ${TOKEN} is not set), so the Modal runner cannot start`
    : `there is no executable Python at ${python} (the default; ${PYTHON} is not set), so the Modal runner cannot start`
  await refused(off)
  expect(launch().status).toBe(2)
  expect(existsSync(join(root, 'used-token-path.json'))).toBe(false)
})

it('refuses a default token with mode 0644 and says it must be 0600', async () => {
  validToken()
  validPython()
  chmodSync(token, 0o644)
  await refused(`the Modal token file at ${token} (the default; ${TOKEN} is not set) must be a regular file owned by this user with mode 0600, so the Modal runner cannot start`)
  const result = launch()
  expect(result.status).toBe(2)
  expect(result.stderr).toContain('0600')
  expect(existsSync(join(root, 'used-token-path.json'))).toBe(false)
})

it('refuses a token symlink to a regular 0600 file', async () => {
  validToken()
  validPython()
  const target = join(root, 'synthetic-linked-token.toml')
  validToken(target)
  rmSync(token)
  symlinkSync(target, token)
  await refused(`the Modal token file at ${token} (the default; ${TOKEN} is not set) must be a regular file owned by this user with mode 0600, so the Modal runner cannot start`)
  expect(launch().status).toBe(2)
  expect(existsSync(join(root, 'used-token-path.json'))).toBe(false)
})

it.each(['the environment', '.env'])('uses another valid file from %s ahead of the default and names the setting', async (layer) => {
  validToken()
  validPython()
  const otherToken = join(root, 'synthetic-other-token.toml')
  const otherPython = join(root, 'synthetic-other-python')
  validToken(otherToken)
  validPython(otherPython)
  const values = { [TOKEN]: otherToken, [PYTHON]: otherPython }
  const env = layer === '.env' ? {} : values
  writeFileSync(envFile, `${TOKEN}=${token}\n${PYTHON}=${python}\n`)
  if (layer === '.env') writeFileSync(envFile, `${TOKEN}=${otherToken}\n${PYTHON}=${otherPython}\n`)
  expect(can(env).off).toBeNull()
  const result = launch(env)
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.split('\n')[0]).toBe(`Modal tests: starting with token file ${otherToken} (the setting) and Python ${otherPython} (the setting).`)
  expect(JSON.parse(readFileSync(join(root, 'used-token-path.json'), 'utf8'))).toBe(otherToken)
  expect(result.stdout + result.stderr).not.toContain(SYNTHETIC_TOKEN)
  rmSync(otherToken)
  await refused(`there is no Modal token file at ${otherToken} (the setting ${TOKEN}), so the Modal runner cannot start`, env)
  validToken(otherToken)
  chmodSync(otherPython, 0o600)
  await refused(`there is no executable Python at ${otherPython} (the setting ${PYTHON}), so the Modal runner cannot start`, env)
})

it.each(['the environment', '.env'])('reads the month cap from %s through the reader the test gives theModalParts', (layer) => {
  validToken()
  validPython()
  // A CAP THAT IS NEITHER THE SHIPPED 42.5 NOR A VALUE THIS MACHINE SETS, so only the test's own reader can give it.
  const cap = 'MOLE_OFFICE_MODAL_MONTHLY_CAP_USD'
  const env: Record<string, string> = layer === '.env' ? {} : { [cap]: '7.25' }
  if (layer === '.env') writeFileSync(envFile, `${cap}=7.25\n`)
  expect(can(env)).toEqual({ off: null, cap: 7.25 })
})
