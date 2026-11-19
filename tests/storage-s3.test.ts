// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE S3-COMPATIBLE DESTINATION (tools/storage/S3-CRITERIA.md). The offline storage command uploads to a stand-in s3
 * server started inside this test process, on a made-up office with made-up credentials. No real credential, bucket
 * or backup store is used, and nothing here leaves this machine.
 *
 * The stand-in checks every request's Signature Version 4 itself. Its signer is first checked against the four
 * examples AWS publishes for the Authorization header ("Signature Calculations for the Authorization Header: Transferring
 * Payload in a Single Chunk"), so a signature the stand-in accepts is one an s3 server would accept. Those examples'
 * host is only signed, never contacted, and their access key id is not written here because the signature does not
 * include it. The stand-in also refuses a date more than 15 minutes from the real clock, pages its listings at two keys,
 * and can be told to refuse one upload.
 *
 * The command line is started with `spawn`, never `spawnSync`: the stand-in answers from this process's event loop.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { DEFAULT_UPLOAD_POLICY, DESTINATION_SETTING, type UploadPolicy } from '../src/shared/storage/destinations.ts'
import { readReceipt, receiptFolder, type UploadReceipt } from '../src/config/storage/receipts.ts'

/** Written with its region, which the saved shape takes from this round on. */
interface S3Destination { name: string; kind: 's3'; target: { endpoint: string; bucket: string; region: string; prefix: string }; policy: UploadPolicy; limitBytes: number; enabled: boolean }
interface TheS3Tool {
  uploadS3(options: { database: string; destination: S3Destination; now?: Date; spool?: string }): Promise<UploadReceipt>
  restoreS3(options: { database: string; destination: S3Destination; base: string; change?: string; into: string; spool?: string }): Promise<{ files: number }>
}
const THE_S3_TOOL = '../tools/storage/s3.ts'

const BUCKET = 'made-up-bucket', REGION = 'made-up-region-1', PREFIX = 'made-up-office/trial/'
const login = { accessKeyId: 'MADEUPACCESSID', secretAccessKey: 'made-up-secret/for-the-stand-in', sessionToken: 'made-up-session-token' }
const EMPTY = createHash('sha256').update('').digest('hex')

// --- The test's own Signature Version 4 signer -------------------------------------------------------------------
const enc = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const hex = (b: string | Buffer): string => createHash('sha256').update(b).digest('hex')
const hmac = (key: string | Buffer, s: string): Buffer => createHmac('sha256', key).update(s).digest()
const canonicalPath = (path: string): string => path.split('/').map(enc).join('/')
interface Signed { method: string; path: string; query: [string, string][]; headers: Record<string, string>; payload: string; region: string; secret: string; at: string }
/** `path` is already in its canonical encoding, `query` is decoded, `headers` holds only the signed ones, named in lower case. */
function signature(r: Signed): string {
  const query = r.query.map(([k, v]) => [enc(k), enc(v)] as const).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const names = Object.keys(r.headers).sort()
  const canonical = [r.method, r.path, query, names.map((n) => `${n}:${r.headers[n]!.trim().replace(/\s+/g, ' ')}\n`).join(''), names.join(';'), r.payload].join('\n')
  const day = r.at.slice(0, 8), scope = `${day}/${r.region}/s3/aws4_request`
  const key = hmac(hmac(hmac(hmac(`AWS4${r.secret}`, day), r.region), 's3'), 'aws4_request')
  return createHmac('sha256', key).update(['AWS4-HMAC-SHA256', r.at, scope, hex(canonical)].join('\n')).digest('hex')
}

// --- The stand-in s3 server ---------------------------------------------------------------------------------------
interface Asked { method: string; key: string; query: Record<string, string>; status: number; code: string | null }
const objects = new Map<string, Buffer>()
const asked: Asked[] = []
let refuse: ((method: string, key: string) => boolean) | null = null
const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
interface Answer { status: number; body: Buffer | string; code: string | null }
/** Every refusal's body names the stand-in and the secret, so a tool that repeats a body is caught. */
const refusal = (status: number, code: string): Answer => ({ status, code, body: `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>The made-up stand-in refused this; it knows ${login.secretAccessKey}.</Message></Error>` })
function answer(req: IncomingMessage, body: Buffer, rawPath: string, query: [string, string][]): Answer {
  if (canonicalPath(rawPath.split('/').map((p) => decodeURIComponent(p)).join('/')) !== rawPath) return refusal(400, 'InvalidURI')
  const auth = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, ?SignedHeaders=([a-z0-9;-]+), ?Signature=([0-9a-f]{64})$/.exec(String(req.headers.authorization ?? ''))
  if (auth === null) return refusal(403, 'AccessDenied')
  const [, id, day, region, signedNames, given] = auth as unknown as [string, string, string, string, string, string]
  if (id !== login.accessKeyId) return refusal(403, 'InvalidAccessKeyId')
  if (region !== REGION) return refusal(400, 'AuthorizationHeaderMalformed')
  const at = String(req.headers['x-amz-date'] ?? '')
  if (!/^\d{8}T\d{6}Z$/.test(at) || at.slice(0, 8) !== day) return refusal(403, 'AccessDenied')
  const when = Date.UTC(+at.slice(0, 4), +at.slice(4, 6) - 1, +at.slice(6, 8), +at.slice(9, 11), +at.slice(11, 13), +at.slice(13, 15))
  if (Math.abs(when - Date.now()) > 15 * 60_000) return refusal(403, 'RequestTimeTooSkewed')
  const names = signedNames.split(';')
  if (!['host', 'x-amz-content-sha256', 'x-amz-date', 'x-amz-security-token'].every((n) => names.includes(n))) return refusal(403, 'AccessDenied')
  if (req.headers['x-amz-security-token'] !== login.sessionToken) return refusal(403, 'InvalidToken')
  const payload = String(req.headers['x-amz-content-sha256'] ?? '')
  if (payload !== hex(body)) return refusal(400, 'XAmzContentSHA256Mismatch')
  const headers: Record<string, string> = {}
  for (const n of names) { const v = req.headers[n]; if (typeof v !== 'string') return refusal(403, 'AccessDenied'); headers[n] = v }
  if (signature({ method: req.method ?? '', path: rawPath, query, headers, payload, region: REGION, secret: login.secretAccessKey, at }) !== given) return refusal(403, 'SignatureDoesNotMatch')
  const parts = rawPath.split('/').map((p) => decodeURIComponent(p))
  if (parts[1] !== BUCKET) return refusal(404, 'NoSuchBucket')
  const key = parts.slice(2).join('/'), q = Object.fromEntries(query)
  if (req.method === 'GET' && key === '') {
    if (q['list-type'] !== '2') return refusal(400, 'InvalidArgument')
    const prefix = q['prefix'] ?? '', after = q['continuation-token'] === undefined ? null : Buffer.from(q['continuation-token'], 'base64').toString('utf8')
    const keys = [...objects.keys()].filter((k) => k.startsWith(prefix) && (after === null || k > after)).sort()
    const page = keys.slice(0, 2), more = keys.length > 2
    const listed = page.map((k) => `<Contents><Key>${xml(k)}</Key><LastModified>2026-10-25T12:00:00.000Z</LastModified><ETag>&quot;${hex(objects.get(k)!).slice(0, 32)}&quot;</ETag><Size>${String(objects.get(k)!.length)}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join('')
    const next = more ? `<NextContinuationToken>${Buffer.from(page.at(-1)!).toString('base64')}</NextContinuationToken>` : ''
    return { status: 200, code: null, body: `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${BUCKET}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${String(page.length)}</KeyCount><MaxKeys>2</MaxKeys><IsTruncated>${String(more)}</IsTruncated>${next}${listed}</ListBucketResult>` }
  }
  if (key === '') return refusal(400, 'InvalidRequest')
  if (req.method === 'PUT') {
    if (refuse?.('PUT', key) === true) return refusal(500, 'InternalError')
    objects.set(key, body); return { status: 200, code: null, body: '' }
  }
  if (req.method === 'GET') { const held = objects.get(key); return held === undefined ? refusal(404, 'NoSuchKey') : { status: 200, code: null, body: held } }
  if (req.method === 'DELETE') { objects.delete(key); return { status: 204, code: null, body: '' } }
  return refusal(405, 'MethodNotAllowed')
}
function standIn(): Server {
  return createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const [rawPath = '/', rawQuery = ''] = (req.url ?? '/').split('?', 2)
      const query: [string, string][] = rawQuery === '' ? [] : rawQuery.split('&').map((p) => { const [k = '', v = ''] = p.split('=', 2); return [decodeURIComponent(k), decodeURIComponent(v)] })
      const a = answer(req, Buffer.concat(chunks), rawPath, query)
      asked.push({ method: req.method ?? '', key: rawPath.split('/').slice(2).map((p) => decodeURIComponent(p)).join('/'), query: Object.fromEntries(query), status: a.status, code: a.code })
      res.writeHead(a.status, { 'content-type': 'application/xml' }); res.end(a.status === 204 ? undefined : a.body)
    })
  })
}

// --- The made-up office -------------------------------------------------------------------------------------------
let t: TestDb, s3: TheS3Tool, server: Server, port = 0, home = '', spool = '', office = '', oldHome: string | undefined
let base: UploadReceipt, change: UploadReceipt
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
async function file(path: string, body: string | Buffer, category = 'text'): Promise<string> {
  const target = join(dirname(t.file), path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body)
  const { registerStorageFile } = await import('../src/server/lib/storage/inventory.ts'); registerStorageFile(t.client.sqlite, { path, category: category as never, bytes: Buffer.byteLength(body), fingerprint: sha(body) }); return target
}
const dest = (name: string, limitBytes = 100_000_000): S3Destination => ({ name, kind: 's3', target: { endpoint: `http://127.0.0.1:${String(port)}`, bucket: BUCKET, region: REGION, prefix: PREFIX }, policy: { ...DEFAULT_UPLOAD_POLICY }, limitBytes, enabled: true })
/** The credentials go in through the settings page's own writer, so the tool is proved to read the line that writer writes. */
async function giveItALogin(name: string): Promise<void> {
  const { destinationSecretStore } = await import('../src/server/lib/storage/destination-secrets.ts')
  destinationSecretStore().change(name, { action: 'replace', values: login })
}
const place = (name: string): string => `${PREFIX}${office}/${name}/`
const under = (prefix: string): string[] => [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
const bytesUnder = (prefix: string): number => under(prefix).reduce((n, k) => n + objects.get(k)!.length, 0)
const upload = (d: S3Destination, day: string): Promise<UploadReceipt> => s3.uploadS3({ database: t.file, destination: d, now: new Date(day), spool })
function everyFileUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? everyFileUnder(join(folder, e.name)) : [join(folder, e.name)]))
}
function keepsNoSecret(text: string | Buffer): void {
  for (const value of Object.values(login)) expect(Buffer.from(text).includes(Buffer.from(value)), 'a credential was kept or shown').toBe(false)
}

beforeAll(async () => {
  oldHome = process.env['HOME']
  home = aTestDatabaseFolder('s3-home'); process.env['HOME'] = home
  spool = aTestDatabaseFolder('s3-spool')
  t = await freshDb()
  office = sha((t.client.sqlite.prepare('SELECT id FROM installation WHERE only_row=1').get() as { id: string }).id)
  server = standIn(); await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); port = (server.address() as AddressInfo).port
  s3 = (await import(THE_S3_TOOL)) as TheS3Tool
})
afterAll(async () => {
  await new Promise<void>((done) => { if (server === undefined) done(); else server.close(() => done()) })
  t?.close()
  if (oldHome === undefined) delete process.env['HOME']; else process.env['HOME'] = oldHome
  for (const folder of [home, spool]) if (folder !== '') removeThisTestFolder(folder)
})

it('checks signatures as AWS\'s four published examples do', () => {
  const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', host = 'examplebucket.s3.amazonaws.com', at = '20130524T000000Z'
  const plain = { host, 'x-amz-content-sha256': EMPTY, 'x-amz-date': at }
  const example = (method: string, path: string, query: [string, string][], headers: Record<string, string>, payload = EMPTY): string => signature({ method, path: canonicalPath(path), query, headers, payload, region: 'us-east-1', secret, at })
  expect(example('GET', '/test.txt', [], { ...plain, range: 'bytes=0-9' })).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41')
  const welcome = hex('Welcome to Amazon S3.')
  expect(example('PUT', '/test$file.text', [], { host, date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-content-sha256': welcome, 'x-amz-date': at, 'x-amz-storage-class': 'REDUCED_REDUNDANCY' }, welcome)).toBe('98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd')
  expect(example('GET', '/', [['lifecycle', '']], plain)).toBe('fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543')
  expect(example('GET', '/', [['max-keys', '2'], ['prefix', 'J']], plain)).toBe('34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7')
})

it('uploads a weekly base under the prefix, the office and the name, sending pack.json last', async () => {
  await file('report-files/first.txt', 'made-up first file')
  await file('report-files/second note & more.txt', 'made-up second file')
  await giveItALogin('trial')
  const from = asked.length
  base = await upload(dest('trial'), '2026-10-25T12:00:00Z')
  expect(base).toMatchObject({ status: 'uploaded', kind: 'base', base: null, error: null })
  expect(base.pack?.startsWith(place('trial'))).toBe(true)
  expect(base.pack!.slice(place('trial').length)).toMatch(/^[^/]+$/)
  const sent = asked.slice(from).filter((a) => a.method === 'PUT')
  expect(sent.every((a) => a.status === 200), JSON.stringify(sent)).toBe(true)
  expect(sent.at(-1)?.key).toBe(`${base.pack!}/pack.json`)
  const before = sent.slice(0, -1).map((a) => a.key)
  expect(before).toEqual([...before].sort())
  expect(under(`${base.pack!}/`)).toEqual(sent.map((a) => a.key).sort())
  expect(objects.get(`${base.pack!}/files/report-files/second note & more.txt`)?.toString()).toBe('made-up second file')
  expect(JSON.parse(objects.get(`${base.pack!}/pack.json`)!.toString())).toMatchObject({ kind: 'base', office, base: null })
  expect(base.sentBytes).toBe(bytesUnder(`${base.pack!}/`))
  expect(base.heldBytes).toBe(base.sentBytes)
  expect(readReceipt({ database: t.file, destination: 'trial', spool })).toEqual(base)
  const kept = receiptFolder({ database: t.file, spool })
  expect(readdirSync(kept).filter((name) => name.startsWith('.work-'))).toEqual([])
  for (const one of everyFileUnder(kept)) keepsNoSecret(readFileSync(one))
  for (const key of under(place('trial'))) keepsNoSecret(objects.get(key)!)
  keepsNoSecret(JSON.stringify(base))
})

it('sends only what changed since the week\'s base, names it, and restores the pair from the bucket', async () => {
  await file('report-files/third.txt', 'made-up third file')
  const from = asked.length
  change = await upload(dest('trial'), '2026-10-26T12:00:00Z')
  expect(change).toMatchObject({ status: 'uploaded', kind: 'change', base: base.pack })
  expect(asked.slice(from).some((a) => a.method === 'GET' && a.key === `${base.pack!}/manifest.sqlite`)).toBe(true)
  expect(under(`${change.pack!}/files/`)).toEqual([`${change.pack!}/files/report-files/third.txt`])
  expect(JSON.parse(objects.get(`${change.pack!}/pack.json`)!.toString())).toMatchObject({ kind: 'change', base: base.pack!.split('/').at(-1) })
  expect(change.heldBytes).toBe(bytesUnder(place('trial')))
  const into = join(spool, 'restored-from-the-bucket')
  const restored = await s3.restoreS3({ database: t.file, destination: dest('trial'), base: base.pack!, change: change.pack!, into, spool })
  const listed = new Database(join(into, 'storage-omissions.sqlite'), { readonly: true })
  try { expect(restored.files).toBe((listed.prepare('SELECT count(*) n FROM files').get() as { n: number }).n) } finally { listed.close() }
  expect(readFileSync(join(into, 'report-files/first.txt'), 'utf8')).toBe('made-up first file')
  expect(readFileSync(join(into, 'report-files/second note & more.txt'), 'utf8')).toBe('made-up second file')
  expect(readFileSync(join(into, 'report-files/third.txt'), 'utf8')).toBe('made-up third file')
  const db = new Database(join(into, 'office.db'), { readonly: true })
  try { expect(db.pragma('integrity_check', { simple: true })).toBe('ok') } finally { db.close() }
  expect(readdirSync(receiptFolder({ database: t.file, spool })).filter((name) => name.startsWith('.work-'))).toEqual([])
})

it('refuses a base whose manifest differs from what its pack.json declares, before sending anything', async () => {
  const key = `${base.pack!}/manifest.sqlite`, original = objects.get(key)!
  objects.set(key, Buffer.concat([original, Buffer.from('made-up tampering')]))
  const from = asked.length
  try { await expect(upload(dest('trial'), '2026-10-27T12:00:00Z')).rejects.toThrow(/hash|manifest/i) } finally { objects.set(key, original) }
  expect(asked.slice(from).filter((a) => a.method === 'PUT')).toEqual([])
  expect(readReceipt({ database: t.file, destination: 'trial', spool })).toMatchObject({ status: 'failed', pack: null, sentBytes: 0 })
})

it('counts every object under its place, reads every listing page, and keeps core past the held limit', async () => {
  objects.set(`${place('trial')}left-by-hand/notes & sizes.txt`, Buffer.alloc(5_000, 1))
  const held = bytesUnder(place('trial')), from = asked.length
  const r = await upload(dest('trial', held + 1), '2026-10-27T12:00:00Z')
  expect(asked.slice(from).some((a) => a.method === 'GET' && a.query['list-type'] === '2' && a.query['continuation-token'] !== undefined)).toBe(true)
  expect(r).toMatchObject({ status: 'uploaded', kind: 'change', base: base.pack, warning: true })
  expect(r.heldBytes).toBe(held + r.sentBytes)
  expect(r.omittedFiles).toBeGreaterThan(0)
  expect(under(`${r.pack!}/files/`)).toEqual([])
  expect(objects.has(`${r.pack!}/office.db`)).toBe(true)
})

it('refuses a destination with no credentials line before any request', async () => {
  const from = asked.length
  await expect(upload(dest('no-login'), '2026-10-27T12:00:00Z')).rejects.toThrow(/credential/i)
  expect(asked.length).toBe(from)
  expect(readReceipt({ database: t.file, destination: 'no-login', spool })).toMatchObject({ status: 'failed', pack: null, sentBytes: 0 })
})

it('withdraws every object an attempt sent when one upload is refused, pack.json first', async () => {
  const keys = [...objects.keys()].sort(), held = bytesUnder(place('trial')), from = asked.length
  refuse = (method, key) => method === 'PUT' && key.endsWith('/pack.json')
  let error: unknown
  try { await upload(dest('trial'), '2026-10-27T13:00:00Z') } catch (e) { error = e } finally { refuse = null }
  expect(String(error)).toContain('500')
  keepsNoSecret(String(error)); expect(String(error)).not.toContain('stand-in')
  const attempt = asked.slice(from)
  expect(attempt.filter((a) => a.method === 'PUT').length).toBeGreaterThan(1)
  const deletes = attempt.filter((a) => a.method === 'DELETE')
  expect(deletes[0]?.key.endsWith('/pack.json')).toBe(true)
  expect([...objects.keys()].sort()).toEqual(keys)
  const last = readReceipt({ database: t.file, destination: 'trial', spool })
  expect(last).toMatchObject({ status: 'failed', pack: null, sentBytes: 0, heldBytes: held })
  keepsNoSecret(JSON.stringify(last)); expect(last?.error).not.toContain('stand-in')
})

it('uploads and restores from the command line, reading its login and spool under the home folder', async () => {
  const d = dest('trial-command')
  t.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(DESTINATION_SETTING, JSON.stringify([d]))
  await giveItALogin(d.name)
  const env: Record<string, string | undefined> = { ...process.env, HOME: home }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY') delete env[name]
  const command = (args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> => new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(process.cwd(), 'tools/storage/upload.ts'), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString() }); child.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    child.once('error', fail); child.once('close', (code) => done({ code, stdout, stderr }))
  })
  const up = await command(['upload', '--database', t.file, '--destination', d.name])
  expect(up.code, up.stderr).toBe(0)
  keepsNoSecret(up.stdout + up.stderr)
  const receipt = JSON.parse(up.stdout) as UploadReceipt
  expect(receipt).toMatchObject({ status: 'uploaded', kind: 'base', destination: d.name })
  expect(receipt.pack?.startsWith(place(d.name))).toBe(true)
  expect(existsSync(join(home, '.cache/mole-office/sandboxes/.storage-uploads'))).toBe(true)
  const into = join(spool, 'restored-by-the-command')
  const back = await command(['restore', '--database', t.file, '--destination', d.name, '--base', receipt.pack!, '--into', into])
  expect(back.code, back.stderr).toBe(0)
  keepsNoSecret(back.stdout + back.stderr)
  expect(readFileSync(join(into, 'report-files/third.txt'), 'utf8')).toBe('made-up third file')
  const help = await command(['--help'])
  expect(help.stdout).toContain('s3')
})
