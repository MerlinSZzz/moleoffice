#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Draw candidate mole looks for the office map through OpenRouter, from the words in
 * plugins/office-map/tools/mole-looks/prompts.json. This is process tooling of the whole
 * repository, not of the plugin: it lives beside tools/openrouter.mjs because it imports from it.
 * Models in OpenRouter's Image API catalog use POST /images: the catalog identifies that door and its capabilities.
 * Models only in the general catalog use POST /chat/completions with image output.
 * https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 * https://openrouter.ai/blog/insights/image-generation-models-compared/
 * Each request is made once. The spending limit is checked between requests, so
 * the last request may pass it. An unknown cost is counted, not guessed.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, existsSync, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theSubscriptionThatCarries, theKey, shown, theFolder, readAsJSON, dollars, THE_API } from './openrouter.mjs'
import { theLiveOfficesPorts } from './live-office-ports.mjs'
import { localStamp } from '../src/shared/time.ts'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(readFileSync(join(here, '../plugins/office-map/tools/mole-looks/prompts.json'), 'utf8'))
const fail = message => { throw new Error(message) }
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16)
const options = {}
for (let i = 0; i < process.argv.slice(2).length; i++) {
  const args = process.argv.slice(2), arg = args[i]
  if (arg === '--dry-run') { if (options.dry) fail('Repeated --dry-run.'); options.dry = true; continue }
  const names = { '--models': 'models', '--reference': 'reference', '--out': 'out', '--most-dollars': 'limit', '--figures': 'figures', '--api': 'api' }
  const name = names[arg]
  if (!name || options[name] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) fail(`Invalid or repeated option: ${arg}`)
  options[name] = args[++i]
}
let key = null
async function main() {
  if (!options.models || !options.reference || !options.out || options.limit === undefined) fail('--models, --reference, --out and --most-dollars are required.')
  const limit = Number(options.limit)
  if (!Number.isFinite(limit) || limit <= 0) fail('--most-dollars must be a positive number.')
  const models = options.models.split(',')
  if (new Set(models).size !== models.length || models.some(m => !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(m))) fail('Model ids must be distinct provider/model ids.')
  for (const model of models) {
    if (/^openai\//i.test(model)) fail(`${model} is carried by the Codex subscription through its built-in image tool.`)
    const carried = theSubscriptionThatCarries(model)
    if (carried) fail(`${model} is ${carried.family}. ${carried.instead}`)
  }
  const requested = options.figures ? options.figures.split(',') : spec.figures.map(f => f.id)
  if (new Set(requested).size !== requested.length || requested.some(id => !spec.figures.some(f => f.id === id))) fail('The figure list contains an unknown or repeated id.')
  const figures = requested.map(id => spec.figures.find(f => f.id === id))
  const base = new URL(options.api || THE_API)
  if (base.username || base.password || base.search || base.hash || !((base.protocol === 'https:' && base.host === 'openrouter.ai') || ((base.protocol === 'http:' || base.protocol === 'https:') && base.hostname === '127.0.0.1'))) fail('--api must be OpenRouter or 127.0.0.1.')
  if (base.hostname === '127.0.0.1') {
    const ports = theLiveOfficesPorts(process.env).ports
    const unreadable = ports.find(one => one.port === null)
    if (unreadable) fail(`The live office's ports could not be read: ${unreadable.said}`)
    if (ports.some(one => new URL(`${base.protocol}//localhost:${one.port}`).port === base.port)) fail("--api must not use the live office's port.")
  }
  const api = base.href.replace(/\/$/, '')
  const reference = readFileSync(resolve(options.reference))
  if (hash(reference) !== spec.reference.sha256First16) fail('The reference picture has the wrong sha256.')
  let candidate = resolve(options.out), tail = []
  while (!existsSync(candidate)) { tail.unshift(candidate.split('/').pop()); const parent = dirname(candidate); if (parent === candidate) fail('Cannot resolve output folder.'); candidate = parent }
  const out = resolve(realpathSync(candidate), ...tail)
  const roots = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: here, encoding: 'utf8' }).split('\0').filter(s => s.startsWith('worktree ')).map(s => realpathSync(s.slice(9)))
  if (roots.some(root => { const r = relative(root, out); return r === '' || (!r.startsWith('..' + '/') && r !== '..' && !isAbsolute(r)) })) fail('--out must be outside every git worktree.')
  for (let parent = out;; parent = dirname(parent)) {
    if (existsSync(join(parent, '.git'))) fail('--out must be outside every git worktree.')
    if (dirname(parent) === parent) break
  }
  async function get(path) {
    const response = await fetch(api + path, { redirect: 'error', signal: AbortSignal.timeout(30000) })
    const text = await response.text()
    if (!response.ok) fail(`Public catalog ${path} returned ${response.status}: ${shown(text, key)}`)
    const parsed = readAsJSON(text)
    if (parsed.answerIs !== 'json') fail(`Public catalog ${path} did not return JSON: ${shown(text, key)}`)
    return parsed.answer
  }
  const imageCatalog = await get('/images/models')
  if (!Array.isArray(imageCatalog.data)) fail('The image catalog has no data list.')
  let general = null
  if (models.some(id => !imageCatalog.data.some(m => m.id === id))) {
    general = await get('/models')
    if (!Array.isArray(general.data)) fail('The model catalog has no data list.')
  }
  const details = []
  for (const id of models) {
    const image = imageCatalog.data.find(m => m.id === id)
    const model = image || general?.data.find(m => m.id === id)
    if (!model || !Array.isArray(model.architecture?.output_modalities) || !model.architecture.output_modalities.includes('image')) fail(`${id} is not on the public model list with image output.`)
    if (figures.some(f => f.group === 'village') && !model.architecture?.input_modalities?.includes('image')) fail(`${id} does not accept the reference picture.`)
    if (image) {
      const params = model.supported_parameters || {}
      if (params.aspect_ratio && !params.aspect_ratio.values?.includes('1:1')) fail(`${id} does not list a square aspect ratio.`)
      if (figures.some(f => f.group === 'village') && (!params.input_references || params.input_references.max < 1)) fail(`${id} does not list reference support.`)
      const endpoints = await get(`/images/models/${id}/endpoints`)
      if (!Array.isArray(endpoints.endpoints)) fail(`${id} has no endpoint list.`)
      const prices = endpoints.endpoints.flatMap(e => Array.isArray(e.pricing) ? e.pricing : [])
      const perImage = prices.filter(p => p.billable === 'output_image' && p.unit === 'image' && typeof p.cost_usd === 'number' && Number.isFinite(p.cost_usd) && p.cost_usd >= 0)
      const estimate = perImage.length ? `output estimate from ${dollars(Math.min(...perImage.map(p => p.cost_usd)) * figures.length)} for ${figures.length} images; reference and other charges may add to it` : 'no calculable image estimate'
      console.log(`${id}: ${prices.length ? 'public rates ' + shown(JSON.stringify(prices), key) + '; ' + estimate : 'no price given'}.`)
      details.push({ id, door: '/images', model })
    } else {
      const prices = model.pricing
      console.log(`${id}: ${prices && Object.keys(prices).length ? 'public rates ' + shown(JSON.stringify(prices), key) + '; total depends on usage' : 'no price given'}.`)
      details.push({ id, door: '/chat/completions', model })
    }
  }
  if (!options.dry) key = theKey().key
  const refUrl = `data:image/png;base64,${reference.toString('base64')}`
  let spent = 0, unknown = 0
  for (const { id, door, model } of details) for (const figure of figures) {
    if (spent >= limit) { console.log(`Stopped at ${dollars(spent)}; ${unknown} call(s) had no cost. ${id} ${figure.id} was not sent.`); process.exitCode = 3; return }
    const words = [spec.frame, figure.group === 'village' ? spec.styleWithReference : spec.styleFree, figure.words].join(' ')
    const attached = figure.group === 'village'
    let body
    if (door === '/images') {
      body = { model: id, prompt: words, n: 1 }
      if (model.supported_parameters?.aspect_ratio) body.aspect_ratio = '1:1'
      if (model.supported_parameters?.output_format?.values?.includes('png')) body.output_format = 'png'
      if (attached) body.input_references = [{ type: 'image_url', image_url: { url: options.dry ? `sha256:${spec.reference.sha256First16}` : refUrl } }]
    } else {
      body = { model: id, modalities: ['image', 'text'], messages: [{ role: 'user', content: [{ type: 'text', text: words }, ...(attached ? [{ type: 'image_url', image_url: { url: options.dry ? `sha256:${spec.reference.sha256First16}` : refUrl } }] : [])] }], usage: { include: true }, image_config: { aspect_ratio: '1:1' } }
    }
    if (options.dry) { console.log(JSON.stringify({ model: id, figure: figure.id, door, body })); continue }
    const start = performance.now(), at = localStamp(new Date())
    const entry = { figure: figure.id, words, referenceAttached: attached, model: id, door, file: null, pixelSize: null, sha256: null, at, seconds: null, cost: null, outcome: 'failed', error: null }
    let bytes = null
    try {
      const response = await fetch(api + door, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(300000) })
      const text = await response.text(), parsed = readAsJSON(text)
      const answer = parsed.answerIs === 'json' ? parsed.answer : null
      const cost = answer?.usage?.cost
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) entry.cost = cost
      if (!response.ok) fail(`HTTP ${response.status}: ${shown(text, key)}`)
      if (!answer) fail(`Invalid JSON: ${shown(text, key)}`)
      const data = door === '/images' ? answer.data?.[0]?.b64_json : answer.choices?.[0]?.message?.images?.[0]?.image_url?.url?.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s)?.[1]
      if (typeof data !== 'string' || data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data) || /=/.test(data.slice(0, -2)) || Buffer.from(data, 'base64').toString('base64') !== data) fail('The response did not contain a valid image.')
      bytes = Buffer.from(data, 'base64')
      const metadata = await sharp(bytes).metadata()
      if (!metadata.width || !metadata.height || !metadata.format) fail('The returned picture has no readable pixel size or format.')
      entry.pixelSize = [metadata.width, metadata.height]
      entry.format = metadata.format
      entry.sha256 = hash(bytes)
      entry.file = `raw/${figure.id}.png`
      entry.outcome = 'saved'
    } catch (error) { entry.error = shown(error instanceof Error ? error.message : String(error), key) }
    entry.seconds = Math.round((performance.now() - start) / 10) / 100
    if (entry.cost === null) unknown++; else spent += entry.cost
    const folder = join(out, id.replace('/', '__')), raw = join(folder, 'raw')
    const writeErrors = []
    try {
      mkdirSync(raw, { recursive: true })
      for (const path of [folder, raw]) if (lstatSync(path).isSymbolicLink()) fail(`Output folder is a link: ${path}`)
      if (bytes && entry.outcome === 'saved') {
        const fd = openSync(join(folder, entry.file), constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600)
        try { writeSync(fd, bytes) } finally { closeSync(fd) }
      }
    } catch (error) { entry.outcome = 'failed'; entry.error = shown(`Could not write picture: ${error.message}`, key); writeErrors.push(entry.error) }
    try {
      const ledgerPath = join(folder, 'runs.json')
      if (existsSync(ledgerPath) && lstatSync(ledgerPath).isSymbolicLink()) fail('The runs file is a link.')
      const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []
      if (!Array.isArray(ledger)) fail(`${ledgerPath} is not a list.`)
      ledger.push(entry)
      const fd = openSync(ledgerPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600)
      try { writeSync(fd, JSON.stringify(ledger, null, 2) + '\n') } finally { closeSync(fd) }
    } catch (error) { writeErrors.push(shown(`Could not write runs.json: ${error.message}`, key)) }
    try {
      const receiptFolder = theFolder(); mkdirSync(receiptFolder, { recursive: true, mode: 0o700 })
      const stat = lstatSync(receiptFolder)
      if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) fail('The receipts folder must be owned by this user and private.')
      const fd = openSync(join(receiptFolder, 'receipts.jsonl'), constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
      try { const held = fstatSync(fd); if (!held.isFile() || held.uid !== process.getuid?.()) fail('The receipts file must be owned by this user.'); fchmodSync(fd, 0o600); writeSync(fd, JSON.stringify({ at, cost: entry.cost, model: id, figure: figure.id, outcome: entry.outcome, seconds: entry.seconds }) + '\n') } finally { closeSync(fd) }
    } catch (error) { writeErrors.push(shown(`Could not write receipt: ${error.message}`, key)) }
    if (writeErrors.length) { console.error(writeErrors.join('; ')); process.exitCode = 1; return }
    console.log(`${id} ${figure.id}: ${entry.outcome}; ${entry.cost === null ? 'no cost given' : dollars(entry.cost)}; known total ${dollars(spent)}; ${unknown} call(s) with no cost.${entry.error ? ' ' + entry.error : ''}${entry.format && entry.format !== 'png' ? ` The unchanged bytes are ${entry.format}, despite the requested .png name.` : ''}`)
    if (entry.outcome !== 'saved') { process.exitCode = 1; return }
  }
}
main().catch(error => { console.error(shown(error instanceof Error ? error.message : String(error), key)); process.exitCode = 1 })
