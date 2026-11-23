// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Problem __4iR4FkFAGS, and a decision. All values below are invented.
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { copyTheFilesTheGuidedCommandsRead } from './the-files-the-guided-commands-read.ts'

const scripts = resolve('tools/key-setup')
const checker = join(scripts, 'keycheck.mjs')
const fake = 'example_FAKE_KEY_938271_TEST_ONLY'
const doFake = 'dop_v1_FAKE_DIGITALOCEAN_938271_TEST_ONLY'
const resendFake = 're_FAKE_RESEND_938271_TEST_ONLY'
const openaiFake = 'sk-proj-FAKE_OPENAI_938271_TEST_ONLY'
const openaiLegacyFake = 'sk-FAKE_OPENAI_938271_TEST_ONLY'
const scratch: string[] = []

function fixture() {
  // A FOLDER OF ITS OWN under the system's temporary folder, not inside .logs/: a fresh merge clone has no .logs/
  // until another test makes one, so this failed there with ENOENT (problem h09tYuNl1nd9).
  const root = mkdtempSync(join(tmpdir(), 'key-setup-test-'))
  scratch.push(root)
  const home = join(root, 'home')
  mkdirSync(home, { mode: 0o700 })
  const cred = join(home, '.config', 'mole-office-id')
  // Deliberately do not copy process.env: no real HOME, credentials, startup files or endpoints.
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, KEY_SETUP_NODE: process.execPath }
  return { root, home, cred, env }
}
type Fixture = ReturnType<typeof fixture>

function runCheck(f: Fixture, args: string[], input = '', extra: NodeJS.ProcessEnv = {}) {
  // A permissive umask makes a missing private creation mode observable.
  const result = spawnSync('bash', ['-c', 'umask 000; exec "$@"', 'keycheck', process.execPath, checker, ...args], {
    input, env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 5000,
  })
  if (result.error) throw result.error
  return { code: result.status, out: result.stdout + result.stderr }
}
function setup(f: Fixture, name: string, args: string[] = [], input = '', extra: NodeJS.ProcessEnv = {}) {
  const result = spawnSync('bash', [join(scripts, name), ...args], {
    input, env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 5000,
  })
  if (result.error) throw result.error
  return { code: result.status, out: result.stdout + result.stderr }
}
function privateFile(f: Fixture, name: string, value: string) {
  mkdirSync(f.cred, { recursive: true, mode: 0o700 })
  chmodSync(f.cred, 0o700)
  const file = join(f.cred, name)
  writeFileSync(file, value, { mode: 0o600 })
  return file
}
function noValue(out: string, value: string) {
  expect(out.includes(value), 'the complete value must stay hidden').toBe(false)
  // Also catch printing just the distinctive payload instead of the prefix.
  if (value.includes('FAKE_')) expect(out.includes(value.slice(value.indexOf('FAKE_')))).toBe(false)
}

function consumer(f: Fixture, file: string, options: { prefix?: string; min?: number; lang?: string } = {}, extra: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { readKey } from ${JSON.stringify(pathToFileURL(join(scripts, 'readkey.mjs')).href)};
    import { Refusal } from ${JSON.stringify(pathToFileURL(checker).href)};
    import fs from 'node:fs';
    try {
      const value = readKey(${JSON.stringify(file)}, ${JSON.stringify(options)});
      console.log(value === fs.readFileSync(${JSON.stringify(file)}, 'utf8') ? 'read correctly' : 'wrong value');
    } catch (error) {
      console.error(error instanceof Refusal ? error.message : 'Unexpected error type'); process.exitCode = 1;
    }
  `], { env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 5000 })
  if (result.error) throw result.error
  return { code: result.status, out: result.stdout + result.stderr }
}
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }) })

it('saves a good key atomically at mode 600 in a mode-700 folder without outputting it [mutation: write without chmod]', () => {
  const f = fixture(), file = join(f.cred, 'example.key')
  const result = runCheck(f, ['write', file, '--prefix', 'example_', '--min', '16'], `${fake}\n`)
  expect(result.code).toBe(0)
  expect(readFileSync(file, 'utf8') === fake).toBe(true)
  expect(statSync(file).mode & 0o7777).toBe(0o600)
  expect(statSync(f.cred).mode & 0o7777).toBe(0o700)
  expect(statSync(file).uid).toBe(process.getuid!())
  expect(statSync(f.cred).uid).toBe(process.getuid!())
  expect(readdirSync(f.cred)).toEqual(['example.key'])
  noValue(result.out, fake)
  const before = statSync(file).ino
  const second = runCheck(f, ['write', file, '--prefix', 'example_', '--min', '16'], fake)
  expect(second.code).toBe(0)
  expect(statSync(file).ino).not.toBe(before)
  expect(readdirSync(f.cred)).toEqual(['example.key'])
  noValue(second.out, fake)
  const checked = runCheck(f, ['file', file])
  expect(checked.code).toBe(0)
  expect(checked.out).toContain(file)
  expect(checked.out).toContain(`${Buffer.byteLength(fake)} bytes`)
  noValue(checked.out, fake)
})

it('sets mode 600 before the first byte and renames in the same folder [mutation: write without chmod]', () => {
  const f = fixture(), file = join(f.cred, 'example.key')
  const preload = join(f.root, 'observe-write.mjs'), observation = join(f.root, 'observation.json')
  writeFileSync(preload, `
    import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const write = fs.writeFileSync, rename = fs.renameSync;
    const seen = [];
    fs.writeFileSync = function(fd, ...args) {
      if (typeof fd === 'number') seen.push({ mode: fs.fstatSync(fd).mode & 0o7777, before: fs.fstatSync(fd).size });
      return write.call(this, fd, ...args);
    };
    fs.renameSync = function(from, to) { seen.push({ from, to }); return rename.call(this, from, to); };
    syncBuiltinESMExports();
    process.on('exit', () => write(${JSON.stringify(observation)}, JSON.stringify(seen)));
  `)
  const result = runCheck(f, ['write', file], fake, { NODE_OPTIONS: `--import=${preload}` })
  expect(result.code).toBe(0)
  const observed = JSON.parse(readFileSync(observation, 'utf8')) as [{ mode: number; before: number }, { from: string; to: string }]
  expect(observed[0]).toEqual({ mode: 0o600, before: 0 })
  expect(observed[1].to).toBe(file)
  expect(observed[1].from.startsWith(`${f.cred}/.key-`)).toBe(true)
  expect(observed[1].from.endsWith('.part')).toBe(true)
  noValue(result.out, fake)
})

it.each([
  ['space', 'example_FAKE BAD_938271_TEST_ONLY', 'The key contains whitespace or quotes. Paste only the key without spaces or quotes.'],
  ['quote', 'example_FAKE_"BAD_938271_TEST_ONLY', 'The key contains whitespace or quotes. Paste only the key without spaces or quotes.'],
  ['wrong prefix', 'wrong_FAKE_PREFIX_938271_TEST_ONLY', 'The key does not start with the expected prefix. Copy the correct provider key and return to the save step.'],
  ['too short', 'example_FAKE_', 'The key is too short. Copy the complete key and return to the save step.'],
  ['empty', '', 'The key is empty. Paste the key itself at the save step.'],
  ['multiple lines', `${fake}\n${fake}`, 'The key contains whitespace or quotes. Paste only the key without spaces or quotes.'],
  ['leading whitespace', ` ${fake}`, 'The key contains whitespace or quotes. Paste only the key without spaces or quotes.'],
])('refuses a %s key in one sentence without any value [mutation: echo the value in the refusal]', (_kind, value, sentence) => {
  const f = fixture(), file = join(f.cred, 'example.key')
  const result = runCheck(f, ['write', file, '--prefix', 'example_', '--min', '16'], `${value}\n`)
  expect(result.code).toBe(1)
  expect(result.out.trim()).toBe(sentence)
  expect(existsSync(f.cred)).toBe(false)
  if (value) noValue(result.out, value)
})

// Ki0xPUTAgE6M's note: a character no key has is refused when the key is saved, not misreported later by the trial.
it.each([
  ['a control character', `example_FAKE_\u0001_938271_TEST_ONLY`],
  ['the delete character', `example_FAKE_\u007f_938271_TEST_ONLY`],
  ['an invisible character', `example_FAKE_\u200b_938271_TEST_ONLY`],
])('refuses a key holding %s in one sentence without any value [mutation: accept any character]', (_kind, value) => {
  const f = fixture(), file = join(f.cred, 'example.key')
  const result = runCheck(f, ['write', file, '--prefix', 'example_', '--min', '16'], `${value}\n`)
  expect(result.code).toBe(1)
  expect(result.out.trim()).toBe('The key holds a character a key never has, such as a control or invisible one. Paste only the key itself.')
  expect(existsSync(f.cred)).toBe(false)
  noValue(result.out, value)
})

it.each(['file 644', 'folder 755', 'file link', 'folder link', 'ancestor link', 'file directory', 'missing file', 'folder file'])('refuses %s and names the path [mutation: accept any mode]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  let args = ['file', file], refusedPath = file
  if (kind === 'file 644') chmodSync(file, 0o644)
  if (kind === 'folder 755') { chmodSync(f.cred, 0o755); refusedPath = f.cred }
  if (kind === 'file link') {
    const link = join(f.cred, 'linked.key'); symlinkSync(file, link); args = ['file', link]; refusedPath = link
  }
  if (kind === 'folder link') {
    const link = join(f.root, 'linked-folder'); symlinkSync(f.cred, link); args = ['folder', link]; refusedPath = link
  }
  if (kind === 'ancestor link') {
    // The existing refusal case uses an unsafe linked ancestor; safe links are covered below.
    chmodSync(f.home, 0o777)
    const link = join(f.root, 'linked-home'); symlinkSync(f.home, link)
    args = ['file', join(link, '.config', 'mole-office-id', 'example.key')]; refusedPath = link
  }
  if (kind === 'file directory') {
    const directory = join(f.cred, 'directory.key'); mkdirSync(directory, { mode: 0o700 }); args = ['file', directory]; refusedPath = directory
  }
  if (kind === 'missing file') { refusedPath = join(f.cred, 'missing.key'); args = ['file', refusedPath] }
  if (kind === 'folder file') args = ['folder', file]
  const result = runCheck(f, args)
  expect(result.code).toBe(1)
  expect(result.out).toContain(JSON.stringify(refusedPath))
  expect(result.out.trim().split('\n')).toHaveLength(1)
  noValue(result.out, fake)
  // Folder subcommand itself must refuse 755, not just the file subcommand.
  if (kind === 'folder 755') {
    const folder = runCheck(f, ['folder', f.cred])
    expect(folder.code).toBe(1)
    expect(folder.out.trim()).toBe(`Folder ${JSON.stringify(f.cred)} must have mode 700. Run chmod 700 '${f.cred}', then try again.`)
    expect(statSync(f.cred).mode & 0o7777).toBe(0o755)
  }
})

it('refuses a different owner for both folder and file [mutation: omit owner checks]', () => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  const preload = join(f.root, 'another-owner.mjs')
  writeFileSync(preload, `
    import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const original = fs.lstatSync;
    fs.lstatSync = function(file, ...args) {
      const stat = original.call(this, file, ...args);
      if (file === process.env.TEST_OTHER_OWNER) stat.uid = process.getuid() + 1;
      return stat;
    }; syncBuiltinESMExports();
  `)
  for (const target of [file, f.cred]) {
    const result = runCheck(f, ['file', file], '', { NODE_OPTIONS: `--import=${preload}`, TEST_OTHER_OWNER: target })
    expect(result.code).toBe(1)
    expect(result.out).toContain(JSON.stringify(target))
    expect(result.out).toContain('is not owned by you.')
    noValue(result.out, fake)
  }
})

it('does not replace a bad destination or change its linked target [mutation: follow links when writing]', () => {
  const f = fixture(), target = privateFile(f, 'original.key', fake)
  const link = join(f.cred, 'link.key')
  symlinkSync(target, link)
  const result = runCheck(f, ['write', link], 'example_FAKE_REPLACEMENT_938271_TEST_ONLY')
  expect(result.code).toBe(1)
  expect(result.out.trim()).toBe(`Path ${JSON.stringify(link)} is a symbolic link. Use a real private key file at this path.`)
  expect(lstatSync(link).isSymbolicLink()).toBe(true)
  expect(readFileSync(target, 'utf8') === fake).toBe(true)
  expect(readdirSync(f.cred)).toEqual(['link.key', 'original.key'])
  chmodSync(target, 0o644)
  expect(runCheck(f, ['write', target], fake).code).toBe(1)
  expect(statSync(target).mode & 0o7777).toBe(0o644)
})

it.each(['setup-example.sh', 'setup-digitalocean.sh', 'setup-resend.sh', 'setup-openai.sh'])('%s lists all steps without touching HOME [mutation: --list runs setup]', (script) => {
  const f = fixture(), result = setup(f, script, ['--list'])
  expect(result.code).toBe(0)
  for (let n = 1; n <= 4; n++) expect(result.out).toMatch(new RegExp(`^${n}\\. .+\\(~[0-9]+ min\\)`, 'm'))
  expect(result.out).toContain('--from 1')
  expect(readdirSync(f.home)).toEqual([])
})

it('starts at step 3 and hides the typed secret, including with tracing requested [mutation: read_secret with echo on or printing the value]', () => {
  const f = fixture(), observation = join(f.root, 'read-flags'), startup = join(f.root, 'observe-read.sh')
  // Piped input cannot observe terminal echo. Record the real read flags without recording input.
  writeFileSync(startup, `read() { builtin printf '%s ' "$@" >> '${observation}'; builtin printf '\\n' >> '${observation}'; builtin read "$@"; }\n`)
  const result = setup(f, 'setup-example.sh', ['--from', '3'], `${fake}\n\n`, { BASH_ENV: startup })
  expect(result.code).toBe(0)
  expect(result.out).toContain('Step 3 of 4')
  expect(result.out).toContain('Step 4 of 4')
  expect(result.out).not.toContain('Step 1 of 4')
  expect(result.out).not.toContain('Step 2 of 4')
  expect(result.out).toContain('Example trial passed')
  const exampleFile = join(f.home, '.config', 'mole-office-key-example', 'example.key')
  expect(readFileSync(exampleFile, 'utf8') === fake).toBe(true)
  expect(readFileSync(observation, 'utf8')).toContain('-r -s SECRET')
  noValue(result.out, fake)
  const traced = spawnSync('bash', ['-x', join(scripts, 'setup-example.sh'), '--from', '3'], {
    input: `${fake}\n\n`, env: { ...f.env, KEY_SETUP_CRED_DIR: join(f.root, 'traced-cred') }, encoding: 'utf8', timeout: 5000,
  })
  expect(traced.status).toBe(0)
  noValue(traced.stdout + traced.stderr, fake)
})

it('runs the example from the beginning and keeps an existing key on no [mutation: overwrite without asking]', () => {
  const f = fixture()
  const result = setup(f, 'setup-example.sh', [], `\ny\n${fake}\n\n`)
  expect(result.code).toBe(0)
  for (let n = 1; n <= 4; n++) expect(result.out).toContain(`Step ${n} of 4`)
  noValue(result.out, fake)
  const file = join(f.home, '.config', 'mole-office-key-example', 'example.key'), before = statSync(file).ino
  const kept = setup(f, 'setup-example.sh', ['--from', '3'], 'n\n\n')
  expect(kept.code).toBe(0)
  expect(kept.out).toContain('Keeping the existing file.')
  expect(readFileSync(file, 'utf8') === fake).toBe(true)
  expect(statSync(file).ino).toBe(before)
  noValue(kept.out, fake)
})

it.each([
  ['Enter prompt', [], 'q\n', 1],
  ['yes/no prompt', ['--from', '2'], 'q\n', 2],
  ['secret prompt', ['--from', '3'], 'Q\n', 3],
])('q leaves at the %s with the exact way back [mutation: ignore q]', (_kind, args, input, step) => {
  const f = fixture(), result = setup(f, 'setup-example.sh', args, input)
  expect(result.code).toBe(0)
  expect(result.out).toContain(`Resume with: bash ${join(scripts, 'setup-example.sh')} --from ${step}`)
  expect(result.out).toContain('Stopping for now.')
  expect(result.out).not.toContain('Example trial passed')
  expect(existsSync(join(f.home, '.config', 'mole-office-key-example', 'example.key'))).toBe(false)
})

it.each([['Enter', [], ''], ['yes/no', ['--from', '2'], ''], ['secret', ['--from', '3'], ''], ['unfinished yes', ['--from', '2'], 'y'], ['unfinished secret', ['--from', '3'], fake]])('end of input at %s never counts as yes [mutation: EOF returns success]', (_kind, args, input) => {
  const f = fixture(), result = setup(f, 'setup-example.sh', args, input)
  expect(result.code).toBe(1)
  expect(result.out).toContain('Input ended; stopping.')
  expect(result.out).toContain(`--from ${args[1] ?? '1'}`)
  expect(existsSync(join(f.home, '.config', 'mole-office-key-example', 'example.key'))).toBe(false)
})

it('no stops with a reason, while an invalid yes/no answer asks again [mutation: accept every answer as yes]', () => {
  const f = fixture(), result = setup(f, 'setup-example.sh', ['--from', '2'], 'maybe\nn\n')
  expect(result.code).toBe(1)
  expect(result.out).toContain('Please answer y or n.')
  expect(result.out).toContain('This step did not work: Confirm the example account before continuing.')
  expect(result.out).toContain('--from 2')
  expect(result.out).not.toContain('Step 3 of 4')
})

it.each<[string, string[]]>([
  ['missing step', ['--from']], ['step zero', ['--from', '0']], ['step five', ['--from', '5']],
  ['arithmetic expression', ['--from', '1+1']], ['unknown option', ['--unknown']],
])('refuses invalid setup options: %s [mutation: skip option validation]', (_kind, args) => {
  const f = fixture(), result = setup(f, 'setup-example.sh', args)
  expect(result.code).toBe(2)
  expect(result.out).toMatch(/Use a whole step number|Invalid options/)
  expect(readdirSync(f.home)).toEqual([])
})

it('the Resend adaptation tries the saved key by the shared read-only trial and sends no mail [mutation: the local-only trial back]', async () => {
  // A COPY OF THE TOOLS AND THE TABLE, with only the Resend trial's origin moved to a loopback stand-in. The stand-in gives
  // Resend's documented answer to a key with Sending access only (https://resend.com/docs/api-reference/errors).
  const f = fixture(), copy = join(f.root, 'checkout'), tools = join(copy, 'tools', 'key-setup'), guard = join(f.root, 'only-the-stand-in.mjs')
  cpSync(scripts, tools, { recursive: true })
  copyTheFilesTheGuidedCommandsRead(resolve('.'), copy)
  const requests: { method?: string; url?: string; body: string }[] = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() })
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ statusCode: 401, message: 'This API key is restricted to only send emails.', name: 'restricted_api_key' }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a loopback test port')
  const tableFile = join(copy, 'src', 'config', 'provider-setup', 'providers.json')
  const rows = JSON.parse(readFileSync(tableFile, 'utf8')), row = rows.find((one: { id: string }) => one.id === 'resend')
  const path = new URL(row.trial.url).pathname, origin = `http://127.0.0.1:${address.port}`
  row.trial.url = `${origin}${path}`
  writeFileSync(tableFile, JSON.stringify(rows))
  writeFileSync(guard, `const real = globalThis.fetch;
    globalThis.fetch = (url, init) => { if (new URL(String(url)).origin !== ${JSON.stringify(origin)}) throw new Error('Only the stand-in may be asked'); return real(url, init) };`)
  const run = async (args: string[], input: string) => {
    const child = spawn('bash', [join(tools, 'setup-resend.sh'), ...args], { env: { ...f.env, NODE_OPTIONS: `--import=${guard}` }, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { out += chunk.toString() })
    const timer = setTimeout(() => child.kill(), 15000)
    const code = await new Promise<number | null>((done, reject) => {
      child.on('error', reject); child.on('close', done); child.stdin.end(input)
    }).finally(() => clearTimeout(timer))
    return { code, out }
  }
  try {
    const result = await run([], `\ny\n${resendFake}\n\n`)
    expect(result.code).toBe(0)
    const file = join(f.cred, 'resend.key')
    expect(readFileSync(file, 'utf8') === resendFake).toBe(true)
    expect(statSync(file).mode & 0o7777).toBe(0o600)
    expect(result.out).toContain('Sending access')
    expect(result.out).toContain('moleoffice.com')
    expect(result.out).toContain('没有登录核对过')
    expect(result.out).toContain(row.trialDescriptionZh)
    expect(requests).toEqual([{ method: 'GET', url: path, body: '' }])
    noValue(result.out, resendFake)
    writeFileSync(file, fake)
    const refused = await run(['--from', '4'], '\n')
    expect(refused.code).toBe(1)
    expect(refused.out).toContain('密钥不是以预期前缀开头。请复制正确的提供商密钥，再回到保存步骤。')
    expect(requests).toHaveLength(1)
    noValue(refused.out, fake)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
  }
}, 40000)

function descendantArguments(pid: number): string[] {
  // Inspect only the setup process we started and its descendants, never another worker.
  try {
    const argumentsHere = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number)
    return [...argumentsHere, ...children.flatMap(descendantArguments)]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function digitalOceanTrial(input: string, from: string[], status = 200) {
  const f = fixture(), file = privateFile(f, 'digitalocean.token', doFake)
  const commands = join(f.root, 'node-arguments'), shim = join(f.root, 'node-shim.sh')
  writeFileSync(shim, `#!/usr/bin/env bash\nbuiltin printf '%s\\n' "$@" >> '${commands}'\nexec '${process.execPath}' "$@"\n`, { mode: 0o700 })
  const requests: { method?: string; url?: string; headers: IncomingMessage['headers']; body: string }[] = []
  let argumentsAtRequest: string[] = [], setupPid = 0
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      argumentsAtRequest = descendantArguments(setupPid)
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() })
      // Even a provider response that repeats the key must never reach the transcript.
      res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 302 ? { Location: '/redirected' } : {}) })
      res.end(JSON.stringify({ account: { test: 'invented' }, reflected: doFake }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a loopback test port')
  try {
    const child = spawn('bash', [join(scripts, 'setup-digitalocean.sh'), ...from], {
      env: { ...f.env, KEY_SETUP_NODE: shim, KEY_SETUP_DO_BASE_URL: `http://127.0.0.1:${address.port}` }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    setupPid = child.pid!
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { out += chunk.toString() })
    const timer = setTimeout(() => child.kill(), 15000)
    const code = await new Promise<number | null>((done, reject) => {
      child.on('error', reject); child.on('close', done); child.stdin.end(input)
    }).finally(() => clearTimeout(timer))
    return { f, file, code, out, requests, argumentsAtRequest, commands: readFileSync(commands, 'utf8') }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
  }
}

it('DigitalOcean trial sends a token only in a header and never in process arguments [mutation: token in URL or on command line]', async () => {
  const result = await digitalOceanTrial('\n', ['--from', '4'])
  expect(result.code).toBe(0)
  expect(result.requests).toHaveLength(1)
  const request = result.requests[0]!
  expect(request.method).toBe('GET')
  expect(request.url).toBe('/v2/account')
  expect(request.headers.authorization === `Bearer ${doFake}`).toBe(true)
  expect(request.body).toBe('')
  for (const [name, value] of Object.entries(request.headers)) {
    if (name !== 'authorization') expect(JSON.stringify(value).includes(doFake)).toBe(false)
  }
  expect(result.argumentsAtRequest).toContain(join(scripts, 'trial.mjs'))
  noValue(result.argumentsAtRequest.join('\n'), doFake)
  noValue(result.commands, doFake)
  noValue(result.out, doFake)
  expect(result.out).toContain('GET /v2/account 通过')
}, 20000)

// Mutation: leave tag out of the scopes again. On 3 October 2026 a token made from this list could not create the tag that
// puts the firewall on the server from its start: DigitalOcean answered 403.
it('DigitalOcean full setup uses the restricted scopes and saves privately [mutation: print the value]', async () => {
  // This is a replacement run: the fixture already has an invented token, so y confirms replacing it.
  const result = await digitalOceanTrial(`\ny\ny\n${doFake}\n\n`, [])
  expect(result.code).toBe(0)
  expect(result.requests).toHaveLength(1)
  expect(readFileSync(result.file, 'utf8') === doFake).toBe(true)
  expect(statSync(result.file).mode & 0o7777).toBe(0o600)
  const row = JSON.parse(readFileSync(resolve('src/config/provider-setup/providers.json'), 'utf8')).find((one: { id: string }) => one.id === 'digitalocean')
  expect(result.out.includes(row.instructionsZh)).toBe(true)
  for (const [resource, actions] of Object.entries(row.permissions) as [string, string[]][]) {
    expect(result.out.includes(`${resource} 的 ${actions.join('、')}`)).toBe(true)
  }
  expect(result.out.includes(row.otherPermissionsOffZh)).toBe(true)
  expect(result.out.includes(row.expiryZh)).toBe(true)
  expect(result.out).toContain('没有登录核对过')
  noValue(result.out, doFake)
  noValue(result.commands, doFake)
}, 20000)

it('DigitalOcean refuses a failed trial without printing the provider response [mutation: print response body]', async () => {
  const result = await digitalOceanTrial('\n', ['--from', '4'], 401)
  expect(result.code).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.out).toContain('DigitalOcean 返回 HTTP 401。请核对令牌、到期日和权限，然后重试。')
  expect(result.out).toContain('--from 4')
  noValue(result.out, doFake)
}, 20000)

it('DigitalOcean refuses redirects before another request [mutation: follow redirects]', async () => {
  const result = await digitalOceanTrial('\n', ['--from', '4'], 302)
  expect(result.code).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.requests[0]!.url).toBe('/v2/account')
  noValue(result.out, doFake)
}, 20000)

it('refuses unsafe trial destinations before sending a request [mutation: allow arbitrary API hosts]', () => {
  const f = fixture(), preload = join(f.root, 'block-request.mjs'), calls = join(f.root, 'request-attempt')
  writeFileSync(preload, `import fs from 'node:fs'; globalThis.fetch = () => { fs.writeFileSync(${JSON.stringify(calls)}, 'attempted'); throw new Error('Network forbidden in this test'); };`)
  privateFile(f, 'digitalocean.token', doFake)
  const result = setup(f, 'setup-digitalocean.sh', ['--from', '4'], '\n', { KEY_SETUP_DO_BASE_URL: 'https://unverified.invalid', NODE_OPTIONS: `--import=${preload}` })
  expect(result.code).toBe(1)
  expect(result.out).toContain('DigitalOcean 试跑地址必须是官方 API 或本地测试服务器。请移除地址覆盖设置，或使用回环测试服务器。')
  expect(existsSync(calls)).toBe(false)
  noValue(result.out, doFake)
})

// 3glux5orTv2k; PFXqjfLKEsqi: repair instructions must survive save_secret's stop and identify the way back.
it.each(['folder', 'file'])('a %s mode refusal gives the repair command and resume step [mutation: omit chmod repair]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  const target = kind === 'folder' ? f.cred : file, expectedMode = kind === 'folder' ? '700' : '600'
  chmodSync(target, 0o755)
  const result = setup(f, 'setup-example.sh', ['--from', '3'], '', { KEY_SETUP_CRED_DIR: f.cred })
  expect(result.code).toBe(1)
  expect(result.out).toContain(`chmod ${expectedMode} '${target}'`)
  expect(result.out).toContain(`Resume with: bash ${join(scripts, 'setup-example.sh')} --from 3`)
  expect(statSync(target).mode & 0o7777).toBe(0o755)
  noValue(result.out, fake)
})

it('quotes a repair path so shell characters stay literal [mutation: omit chmod repair]', () => {
  const f = fixture(), folder = join(f.root, 'folder $(`invented`) "name"'), file = join(folder, 'example.key')
  mkdirSync(folder, { mode: 0o755 }); chmodSync(folder, 0o755)
  const refused = runCheck(f, ['write', file], fake)
  expect(refused.code).toBe(1)
  const command = refused.out.match(/Run (chmod 700 .+), then try again\./)?.[1]
  expect(command).toBeDefined()
  const repaired = spawnSync('bash', ['-c', command!], { env: f.env, encoding: 'utf8', timeout: 5000 })
  expect(repaired.status).toBe(0)
  expect(statSync(folder).mode & 0o7777).toBe(0o700)
  expect(runCheck(f, ['write', file], fake).code).toBe(0)
})

// 3glux5orTv2k: a step's time is in plain words, "about 1 minute" and "about 2 minutes".
it('says about 1 minute for a one-minute step and about 2 minutes for two [mutation: always minutes, or always minute]', () => {
  const f = fixture()
  const shown = spawnSync('bash', ['-c', 'HERE="$KEY_SETUP_SCRIPTS"; ME=x; titles=(One Two); minutes=(1 2); LANGUAGE=en; source "$HERE/common.sh"; head_of 1; head_of 2'], {
    env: { ...f.env, KEY_SETUP_SCRIPTS: scripts }, encoding: 'utf8', timeout: 5000,
  })
  expect(shown.status, shown.stderr).toBe(0)
  expect(shown.stdout).toContain('=== Step 1 of 2: One (about 1 minute) ===')
  expect(shown.stdout).toContain('=== Step 2 of 2: Two (about 2 minutes) ===')
})

// 3glux5orTv2k: only a path a plain single quote cannot hold gets ANSI-C quoting; the command still repairs it.
it("quotes a repair path holding a single quote so bash still repairs it [mutation: plain quotes always]", () => {
  const f = fixture(), folder = join(f.root, "the person's folder"), file = join(folder, 'example.key')
  mkdirSync(folder, { mode: 0o755 }); chmodSync(folder, 0o755)
  const refused = runCheck(f, ['write', file], fake)
  expect(refused.code).toBe(1)
  const command = refused.out.match(/Run (chmod 700 .+), then try again\./)?.[1]
  expect(command).toBeDefined()
  const repaired = spawnSync('bash', ['-c', command!], { env: f.env, encoding: 'utf8', timeout: 5000 })
  expect(repaired.status, repaired.stderr).toBe(0)
  expect(statSync(folder).mode & 0o7777).toBe(0o700)
  expect(runCheck(f, ['write', file], fake).code).toBe(0)
})

it.each(['file', 'folder'])('tells a wrong %s owner to have its owner repair it [mutation: omit owner repair]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake), target = kind === 'file' ? file : f.cred
  const preload = join(f.root, 'wrong-owner.mjs')
  writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const original = fs.lstatSync; fs.lstatSync = function(file, ...args) {
      const stat = original.call(this, file, ...args); if (file === ${JSON.stringify(target)}) stat.uid = process.getuid() + 1;
      return stat;
    }; syncBuiltinESMExports();`)
  const extra = { NODE_OPTIONS: `--import=${preload}` }, checked = runCheck(f, ['file', file], '', extra)
  expect(checked.code).toBe(1)
  expect(checked.out).toContain('Have its owner repair it')
  const read = consumer(f, file, { prefix: 'example_' }, extra)
  expect(read.code).toBe(1)
  expect(read.out).toBe(checked.out)
  noValue(read.out, fake)
})

it.each(['home', '.config', 'root-owned target'])('accepts a safe linked %s for checks, writing and consumer reads [mutation: refuse every link]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  const target = kind === '.config' ? join(f.home, '.config') : f.home
  const link = join(f.root, 'safe-link'); symlinkSync(target, link)
  const linkedFile = kind === '.config' ? join(link, 'mole-office-id', 'example.key') : join(link, '.config', 'mole-office-id', 'example.key')
  let extra: NodeJS.ProcessEnv = {}
  if (kind === 'root-owned target') {
    const preload = join(f.root, 'root-owned.mjs')
    writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
      const original = fs.statSync; fs.statSync = function(file, ...args) {
        const stat = original.call(this, file, ...args); if (file === ${JSON.stringify(link)}) stat.uid = 0; return stat;
      }; syncBuiltinESMExports();`)
    extra = { NODE_OPTIONS: `--import=${preload}` }
  }
  expect(runCheck(f, ['file', linkedFile], '', extra).code).toBe(0)
  expect(runCheck(f, ['write', linkedFile, '--prefix', 'example_'], fake, extra).code).toBe(0)
  const read = consumer(f, linkedFile, { prefix: 'example_' }, extra)
  expect(read.code).toBe(0)
  expect(read.out.trim()).toBe('read correctly')
  expect(readFileSync(file, 'utf8') === fake).toBe(true)
  noValue(read.out, fake)
})

it.each(['writable', 'wrong owner', 'dangling', 'not a folder'])('refuses an unsafe %s ancestor link with a repair [mutation: accept every ancestor link]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake), link = join(f.root, 'unsafe-link')
  const target = kind === 'dangling' ? join(f.root, 'absent') : kind === 'not a folder' ? file : f.home
  symlinkSync(target, link)
  if (kind === 'writable') chmodSync(target, 0o777)
  let extra: NodeJS.ProcessEnv = {}
  if (kind === 'wrong owner') {
    const preload = join(f.root, 'unsafe-owner.mjs')
    writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
      const original = fs.statSync; fs.statSync = function(file, ...args) {
        const stat = original.call(this, file, ...args); if (file === ${JSON.stringify(link)}) stat.uid = process.getuid() + 1; return stat;
      }; syncBuiltinESMExports();`)
    extra = { NODE_OPTIONS: `--import=${preload}` }
  }
  const linkedFile = join(link, '.config', 'mole-office-id', 'example.key')
  const result = runCheck(f, ['file', linkedFile], '', extra)
  expect(result.code).toBe(1)
  expect(result.out).toContain(JSON.stringify(link))
  const repair = { writable: 'chmod go-w', 'wrong owner': 'Have its owner repair it', dangling: 'Repair the link', 'not a folder': 'Point it to a safe folder' }[kind]
  expect(result.out).toContain(repair)
  const read = consumer(f, linkedFile, { prefix: 'example_' }, extra)
  expect(read.code).toBe(1)
  expect(read.out).toBe(result.out)
  noValue(read.out, fake)
})

it.each(['file 644', 'folder 755', 'file link', 'folder link', 'missing', 'directory'])('the consumer refuses %s with exactly the checker refusal [mutation: reader skips checks]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  let readFile = file
  if (kind === 'file 644') chmodSync(file, 0o644)
  if (kind === 'folder 755') chmodSync(f.cred, 0o755)
  if (kind === 'file link') { readFile = join(f.cred, 'linked.key'); symlinkSync(file, readFile) }
  if (kind === 'folder link') { const link = join(f.root, 'key-folder-link'); symlinkSync(f.cred, link); readFile = join(link, 'example.key') }
  if (kind === 'missing') readFile = join(f.cred, 'missing.key')
  if (kind === 'directory') { readFile = join(f.cred, 'directory.key'); mkdirSync(readFile, { mode: 0o700 }) }
  const checked = runCheck(f, ['file', readFile]), read = consumer(f, readFile, { prefix: 'example_' })
  expect(checked.code).toBe(1)
  expect(read.code).toBe(1)
  expect(read.out).toBe(checked.out)
  noValue(read.out, fake)
})

it('the consumer returns the exact value and refuses a wrong prefix without disclosing it [mutation: reader skips checks]', () => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  expect(consumer(f, file, { prefix: 'example_' }).out.trim()).toBe('read correctly')
  const refused = consumer(f, file, { prefix: 'other_' })
  expect(refused.code).toBe(1)
  expect(refused.out).toContain('Copy the correct provider key and return to the save step.')
  noValue(refused.out, fake)
})

it.each(['CLI', 'environment', 'reader option'])('the checker and reader use Chinese via %s [mutation: English only]', (kind) => {
  const f = fixture(), file = privateFile(f, 'example.key', fake)
  const extra = kind === 'environment' ? { KEY_SETUP_LANG: 'zh' } : {}
  const args = kind === 'CLI' ? ['--lang', 'zh'] : []
  const readerOptions = kind === 'environment' ? {} : { lang: 'zh' }
  if (kind !== 'reader option') {
    const success = runCheck(f, ['file', file, ...args], '', extra)
    expect(success.code).toBe(0)
    expect(success.out).toContain(`权限是 600，共 ${Buffer.byteLength(fake)} 字节`)
  }
  chmodSync(file, 0o644)
  const read = consumer(f, file, readerOptions, extra)
  expect(read.code).toBe(1)
  expect(read.out).toContain('的权限必须是 600。请运行 chmod 600')
  if (kind !== 'reader option') expect(runCheck(f, ['file', file, ...args], '', extra).out).toBe(read.out)
  noValue(read.out, fake)
})

it('the Chinese script shows a Chinese save refusal and the way back [mutation: English only]', () => {
  const f = fixture(), file = privateFile(f, 'resend.key', resendFake)
  chmodSync(file, 0o644)
  const result = setup(f, 'setup-resend.sh', ['--from', '3'])
  expect(result.code).toBe(1)
  expect(result.out).toContain('的权限必须是 600。请运行 chmod 600')
  expect(result.out).toContain('--from 3')
  noValue(result.out, resendFake)
})

it.each([403, 429, 500, 302])('DigitalOcean reports HTTP %s with the right repair [mutation: one trial failure message]', async (status) => {
  const result = await digitalOceanTrial('\n', ['--from', '4'], status)
  expect(result.code).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.out).toContain(`DigitalOcean 返回 HTTP ${status}。`)
  expect(result.out).toContain(status === 403 ? '请核对令牌、到期日和权限，然后重试。' : '请检查提供商状态和试跑地址，然后重试。')
  expect(result.out).not.toContain('网络无法连接')
  expect(result.out).toContain('--from 4')
  noValue(result.out, doFake)
}, 20000)

it.each(['DNS', 'network', 'timeout'])('DigitalOcean distinguishes a %s failure from a token refusal [mutation: one trial failure message]', (kind) => {
  const f = fixture(), preload = join(f.root, 'connection-failure.mjs'), calls = join(f.root, 'calls')
  privateFile(f, 'digitalocean.token', doFake)
  // Simulate each transport rejection at fetch, without DNS or outbound traffic.
  writeFileSync(preload, `import fs from 'node:fs';
    globalThis.fetch = async (url, options) => {
      fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ url, method: options.method, redirect: options.redirect, timed: options.signal instanceof AbortSignal }) + '\\n');
      throw ${kind === 'timeout' ? "new DOMException('Invented timeout', 'TimeoutError')" : `Object.assign(new TypeError('Invented connection failure'), { code: '${kind === 'DNS' ? 'ENOTFOUND' : 'ECONNREFUSED'}' })`};
    };`)
  const result = setup(f, 'setup-digitalocean.sh', ['--from', '4'], '\n', { NODE_OPTIONS: `--import=${preload}`, KEY_SETUP_DO_BASE_URL: 'http://127.0.0.1:12345' })
  expect(result.code).toBe(1)
  expect(result.out).toContain('网络无法连接 DigitalOcean。请检查网络连接后重试。')
  expect(result.out).not.toContain('请核对令牌')
  expect(result.out).toContain('--from 4')
  expect(readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(1)
  expect(JSON.parse(readFileSync(calls, 'utf8'))).toEqual({ url: 'http://127.0.0.1:12345/v2/account', method: 'GET', redirect: 'manual', timed: true })
  noValue(result.out, doFake)
})

it.each([['wrapped', `<${fake}>`], ['opening bracket', `${fake}<`], ['closing bracket', `${fake}>`]])('refuses %s angle brackets in an invented key [mutation: accept angle brackets]', (_kind, value) => {
  const f = fixture(), file = join(f.cred, 'example.key')
  const result = runCheck(f, ['write', file, '--prefix', 'example_'], `${value}\n`)
  expect(result.code).toBe(1)
  expect(result.out.trim()).toBe('The key contains angle brackets. Paste only the key without < or >.')
  expect(existsSync(file)).toBe(false)
  noValue(result.out, fake)
  privateFile(f, 'example.key', value)
  const read = consumer(f, file, { prefix: 'example_' })
  expect(read.code).toBe(1)
  expect(read.out).toBe(result.out)
  noValue(read.out, fake)
})

it.each(['setup-example.sh', 'setup-resend.sh', 'setup-digitalocean.sh', 'setup-openai.sh'])('%s returns a missing-key trial to the save step [mutation: skip missing-key return]', (script) => {
  const f = fixture(), result = setup(f, script, ['--from', '4'], 'q\n')
  expect(result.code).toBe(0)
  expect(result.out).toContain(script === 'setup-example.sh' ? 'No key has been saved yet; returning to step 3 to save it before the trial.' : '还没有保存密钥；先回到第 3 步保存密钥，再试跑。')
  expect(result.out).toContain('--from 3')
  expect(result.out).not.toContain('--from 4')
  expect(result.out).not.toContain('trial passed')
})

it.each(['en', 'zh'])('start clears only its own stale regular parts and reports it in %s [mutation: leave stale parts]', (lang) => {
  const f = fixture()
  privateFile(f, 'example.key', fake)
  const stale = '.key-12345678-1234-4123-8123-123456789abc.part'
  const link = '.key-12345678-1234-4123-8123-123456789abd.part'
  const directory = '.key-12345678-1234-4123-8123-123456789abe.part'
  const otherOwner = '.key-12345678-1234-4123-8123-123456789abf.part'
  writeFileSync(join(f.cred, stale), fake, { mode: 0o600 })
  symlinkSync(join(f.cred, 'example.key'), join(f.cred, link))
  mkdirSync(join(f.cred, directory), { mode: 0o700 })
  writeFileSync(join(f.cred, otherOwner), fake, { mode: 0o600 })
  for (const name of ['other.part', '.key-not-a-uuid.part', '.key-12345678-1234-1123-8123-123456789abc.part']) writeFileSync(join(f.cred, name), 'invented unrelated content')
  const preload = join(f.root, 'part-owner.mjs')
  writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const original = fs.lstatSync; fs.lstatSync = function(file, ...args) {
      const stat = original.call(this, file, ...args); if (file === ${JSON.stringify(join(f.cred, otherOwner))}) stat.uid = process.getuid() + 1; return stat;
    }; syncBuiltinESMExports();`)
  const result = setup(f, lang === 'en' ? 'setup-example.sh' : 'setup-resend.sh', ['--from', '3'], 'q\n', { KEY_SETUP_CRED_DIR: f.cred, NODE_OPTIONS: `--import=${preload}` })
  expect(result.code).toBe(0)
  expect(existsSync(join(f.cred, stale))).toBe(false)
  expect(readdirSync(f.cred).sort()).toEqual([link, directory, otherOwner, 'example.key', 'other.part', '.key-not-a-uuid.part', '.key-12345678-1234-1123-8123-123456789abc.part'].sort())
  expect(result.out).toContain(lang === 'en' ? `Removed 1 stale key temporary file(s) from ${JSON.stringify(f.cred)}.` : `已从 ${JSON.stringify(f.cred)} 清理 1 个遗留的密钥临时文件。`)
  expect(readFileSync(join(f.cred, 'example.key'), 'utf8') === fake).toBe(true)
  noValue(result.out, fake)
})

async function openaiTrial(key: string, status = 200, body?: string) {
  const f = fixture(), file = join(f.home, '.config', 'mole-office-openai', 'api-key')
  const guard = join(f.root, 'loopback-only.mjs'), commands = join(f.root, 'node-arguments'), shim = join(f.root, 'node-shim.sh')
  writeFileSync(guard, `const original = globalThis.fetch;
    globalThis.fetch = (url, options) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.pathname !== '/v1/models') throw new Error('Non-loopback request blocked');
      return original(url, options);
    };`)
  writeFileSync(shim, `#!/usr/bin/env bash\nbuiltin printf '%s\\n' "$@" >> '${commands}'\nexec '${process.execPath}' "$@"\n`, { mode: 0o700 })
  const requests: { method?: string; url?: string; headers: IncomingMessage['headers']; body: string }[] = []
  let argumentsAtRequest: string[] = [], setupPid = 0
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      argumentsAtRequest = descendantArguments(setupPid)
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() })
      res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 302 ? { Location: '/redirected' } : {}) })
      res.end(body ?? JSON.stringify({ data: [{ id: 'invented-1' }, { id: 'invented-2' }], reflected: key }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a loopback test port')
  try {
    const child = spawn('bash', [join(scripts, 'setup-openai.sh')], {
      env: { ...f.env, KEY_SETUP_NODE: shim, NODE_OPTIONS: `--import=${guard}`, KEY_SETUP_OPENAI_BASE_URL: `http://127.0.0.1:${address.port}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    setupPid = child.pid!
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { out += chunk.toString() })
    const timer = setTimeout(() => child.kill(), 15000)
    const code = await new Promise<number | null>((done, reject) => {
      child.on('error', reject); child.on('close', done); child.stdin.end(`\ny\n${key}\n\n`)
    }).finally(() => clearTimeout(timer))
    return { f, file, code, out, requests, argumentsAtRequest, commands: readFileSync(commands, 'utf8') }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
  }
}

it.each([openaiFake, openaiLegacyFake])('OpenAI setup saves an invented key and makes one read-only request', async (key) => {
  const result = await openaiTrial(key)
  expect(result.code).toBe(0)
  expect(readFileSync(result.file, 'utf8') === key).toBe(true)
  expect(statSync(result.file).mode & 0o7777).toBe(0o600)
  expect(statSync(join(result.f.home, '.config', 'mole-office-openai')).mode & 0o7777).toBe(0o700)
  expect(result.requests).toHaveLength(1)
  const request = result.requests[0]!
  expect(request.method).toBe('GET')
  expect(request.url).toBe('/v1/models')
  expect(request.body).toBe('')
  expect(request.headers.authorization === `Bearer ${key}`).toBe(true)
  for (const [name, value] of Object.entries(request.headers)) if (name !== 'authorization') noValue(JSON.stringify(value), key)
  expect(result.argumentsAtRequest).toContain(join(scripts, 'trial.mjs'))
  noValue(result.argumentsAtRequest.join('\n'), key)
  noValue(result.commands, key)
  noValue(result.out, key)
  for (const phrase of ['Mole Office', 'Restricted', 'images', 'auto-recharge', 'OFF', '现有余额', 'the person who provided this script', '没有登录核对过', 'HTTP 200', '返回 2 个模型', '不能证明允许生成图像', '不能证明余额足够']) expect(result.out).toContain(phrase)
}, 20000)

it.each([401, 302])('OpenAI trial reports HTTP %s without following redirects or showing responses', async (status) => {
  const result = await openaiTrial(openaiFake, status)
  expect(result.code).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.out).toContain(`OpenAI 返回 HTTP ${status}`)
  expect(result.out).toContain('--from 4')
  noValue(result.out, openaiFake)
}, 20000)

it.each(['not json', '{"data":{}}'])('OpenAI trial refuses a malformed success response without printing it', async (body) => {
  const result = await openaiTrial(openaiFake, 200, body)
  expect(result.code).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.out).toContain('HTTP 200')
  expect(result.out).not.toContain(body)
  noValue(result.out, openaiFake)
}, 20000)

it('OpenAI trial refuses invalid destination, key shape and file permissions before any request', () => {
  const f = fixture(), file = privateFile(f, 'api-key', openaiFake), calls = join(f.root, 'calls'), guard = join(f.root, 'no-network.mjs')
  writeFileSync(guard, `import fs from 'node:fs'; globalThis.fetch = () => { fs.writeFileSync(${JSON.stringify(calls)}, 'attempted'); throw new Error('blocked'); };`)
  const extra = { KEY_SETUP_CRED_DIR: f.cred, KEY_SETUP_OPENAI_BASE_URL: 'https://unverified.invalid', NODE_OPTIONS: `--import=${guard}` }
  const address = setup(f, 'setup-openai.sh', ['--from', '4'], '\n', extra)
  expect(address.code).toBe(1)
  expect(address.out).toContain('OpenAI 试跑地址必须是官方 API 或本地测试服务器')
  chmodSync(file, 0o644)
  const mode = setup(f, 'setup-openai.sh', ['--from', '4'], '\n', extra)
  expect(mode.code).toBe(1)
  expect(mode.out).toContain('的权限必须是 600')
  chmodSync(file, 0o600)
  writeFileSync(file, 'invalid_FAKE_OPENAI_938271_TEST_ONLY')
  const shape = setup(f, 'setup-openai.sh', ['--from', '4'], '\n', extra)
  expect(shape.code).toBe(1)
  expect(shape.out).toContain('密钥不是以预期前缀开头')
  expect(existsSync(calls)).toBe(false)
  noValue(address.out + mode.out + shape.out, openaiFake)
})

it('OpenAI setup rejects a short key and keeps an existing key when replacement is declined', () => {
  const f = fixture(), file = join(f.home, '.config', 'mole-office-openai', 'api-key')
  const short = setup(f, 'setup-openai.sh', ['--from', '3'], 'sk-short\n')
  expect(short.code).toBe(1)
  expect(short.out).toContain('密钥太短')
  expect(existsSync(file)).toBe(false)
  const folder = join(f.home, '.config', 'mole-office-openai')
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  writeFileSync(file, openaiFake, { mode: 0o600 })
  const kept = setup(f, 'setup-openai.sh', ['--from', '3'], 'n\nq\n')
  expect(kept.code).toBe(0)
  expect(kept.out).toContain('保留现在的文件')
  expect(readFileSync(file, 'utf8') === openaiFake).toBe(true)
  noValue(kept.out, openaiFake)
})

it('OpenAI trial reports a transport failure without disclosing a key', () => {
  const f = fixture(), guard = join(f.root, 'network-failure.mjs')
  privateFile(f, 'api-key', openaiFake)
  writeFileSync(guard, `globalThis.fetch = async () => { throw new Error('invented network failure'); };`)
  const result = setup(f, 'setup-openai.sh', ['--from', '4'], '\n', {
    KEY_SETUP_CRED_DIR: f.cred, KEY_SETUP_OPENAI_BASE_URL: 'http://127.0.0.1:12345', NODE_OPTIONS: `--import=${guard}`,
  })
  expect(result.code).toBe(1)
  expect(result.out).toContain('网络无法连接 OpenAI')
  expect(result.out).toContain('--from 4')
  noValue(result.out, openaiFake)
})
