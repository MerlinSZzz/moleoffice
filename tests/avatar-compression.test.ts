// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Acceptance for the reviewed static-image policy, before implementation.
 *
 * src/server/lib/avatar-compression.ts keeps its synchronous callers by using one bounded Node
 * child with lazy sharp loading. Cache is off, native concurrency is one, and input pixels, input
 * bytes, output/error buffers and elapsed time are bounded. A format/decode/timeout failure is
 * reported, never hidden as success. An unavailable codec is a named unchanged disposition.
 * Static PNG/JPEG/WebP above twice the actual largest drawn avatar side are reduced in their own
 * format; smaller pictures and animations retain their original bytes. No image is enlarged and
 * no larger encoding replaces its original. ICC, EXIF orientation and alpha survive reduction.
 *
 * Additional files named for this criterion: src/server/api/participants.ts exposes upload facts;
 * package.json/package-lock.json pin sharp; scripts/avatar-codec-in-a-bundle.mjs and
 * scripts/bundle.mjs copy its native/transitive runtime files and include their licence notices.
 * tests/avatar-codec-packaging.test.ts holds that packaging. A durable receipt is appended for every
 * upload, including repeat originals and unavailable-codec outcomes. No UI files or migrations change.
 * Product screenshots and exact drawn-size pixel comparisons remain mandatory review evidence;
 * these tests cannot establish the absence of a visible change.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { avatarPng, avatarPngChunk, avatarPngParts, avatarOverPixelLimit } from './avatar-upload-fixtures.ts'
import { typeOfBytes } from '../src/shared/file-signatures.ts'

const seam = vi.hoisted(() => ({ module: null as string | null, ownerFlag: null as string | null, pixels: null as number | null, calls: [] as { args: string[]; options: Record<string, unknown> }[] }))
vi.mock('node:module', async (original) => {
  const actual = await original<typeof import('node:module')>()
  return { ...actual, createRequire: (url: string) => {
    const require = actual.createRequire(url)
    const resolve = require.resolve.bind(require)
    require.resolve = Object.assign((name: string, options?: unknown) => name === 'sharp' && seam.module !== null ? seam.module : resolve(name, options as never), require.resolve)
    return require
  } }
})
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, spawnSync: (command: string, args: string[], options: Record<string, unknown>) => {
    seam.calls.push({ args, options })
    const actualArgs = [...(seam.ownerFlag === null ? args : [...args.slice(0, -1), ...(seam.ownerFlag === '' ? [] : [seam.ownerFlag])])]
    if (seam.pixels !== null) actualArgs[3] = JSON.stringify({ ...JSON.parse(actualArgs[3]!), pixels: seam.pixels })
    return actual.spawnSync(command, actualArgs, options as never)
  } }
})

let codec: typeof import('../src/server/lib/avatar-compression.ts')
let sharp: any
let folder: string
let testDb: import('./helpers.ts').TestDb
beforeAll(async () => {
  testDb = await (await import('./helpers.ts')).freshDb()
  codec = await import('../src/server/lib/avatar-compression.ts')
  sharp = createRequire(import.meta.url)('sharp')
  folder = mkdtempSync(join(tmpdir(), 'avatar-codec-test-'))
}, 60_000)
afterAll(() => { seam.module = null; testDb?.close(); if (folder) rmSync(folder, { recursive: true, force: true }) })

describe('bounded static avatar compression', () => {
  it('imports compression policy without opening or creating a database', () => {
    const database = join(folder, 'pure-import-must-not-create.db')
    const result = join(folder, 'pure-import-result.json')
    const program = 'import{writeFileSync}from"node:fs";const codec=await import(process.argv[1]);writeFileSync(process.argv[2],JSON.stringify({side:codec.AVATAR_STORED_SIDE}))'
    execFileSync(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx/esm'), '--input-type=module', '-e', program, resolve('src/server/lib/avatar-compression.ts'), result], {
      env: { PATH: process.env.PATH, MOLE_OFFICE_DB: database }, timeout: 30_000,
    })
    expect(JSON.parse(readFileSync(result, 'utf8')).side).toBe(codec.AVATAR_STORED_SIDE)
    expect(existsSync(database), 'a pure codec import created a database').toBe(false)
    expect(readdirSync(folder).filter(name => name.startsWith('pure-import-must-not-create.db'))).toEqual([])
  })

  it('uses only the installed OS codec operation and refuses a probe without it', async () => {
    const { freshDb } = await import('./helpers.ts')
    const db = await freshDb()
    try {
      const resources = await import('../src/server/lib/resources.ts')
      const localCodec = await import('../src/server/lib/avatar-compression.ts')
      const bytes = avatarPng(60)
      const runAvatarCodec = vi.fn((_input: unknown) => ({ status: 0, stdout: Buffer.from(JSON.stringify({ disposition: localCodec.AVATAR_DISPOSITIONS.small })), stderr: Buffer.alloc(0) }))
      resources.useOsProbe({ ...resources.LINUX_PROBE, platform: 'fixture', runAvatarCodec } as unknown as typeof resources.LINUX_PROBE)
      try {
        const before = seam.calls.length
        expect(localCodec.compressAvatar(bytes, 'image/png').bytes).toEqual(bytes)
        expect(runAvatarCodec).toHaveBeenCalledTimes(1)
        expect(runAvatarCodec.mock.calls[0]).toEqual([expect.objectContaining({ bytes, format: 'png' })])
        expect(seam.calls.length).toBe(before)
        resources.useOsProbe({ ...resources.LINUX_PROBE, platform: 'fixture' } as typeof resources.LINUX_PROBE)
        expect(() => localCodec.compressAvatar(bytes, 'image/png')).toThrow(/codec/i)
      } finally { resources.useOsProbe(resources.LINUX_PROBE) }
    } finally { db.close() }
  })

  it('derives a bound twice the largest real avatar drawing, including profile and appearance', () => {
    const sources=(folder:string):string[]=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(join(folder,entry.name)):entry.name.endsWith('.tsx')?[join(folder,entry.name)]:[])
    const callers = sources('src/web')
    const sides = callers.flatMap(file => [...readFileSync(file,'utf8').matchAll(/<Avatar\b[\s\S]*?\/>/g)].flatMap(call => [...call[0].matchAll(/\bsize=\{(\d+)\}/g)].map(size => Number(size[1]))))
    expect(sides.length).toBeGreaterThan(0)
    expect(codec.AVATAR_STORED_SIDE).toBe(Math.max(...sides) * 2)
  })

  for (const format of ['png','jpeg','webp'] as const) it(`reduces static ${format} in its own format, retaining profile, orientation and alpha`, async () => {
    const bound = codec.AVATAR_STORED_SIDE
    let image = sharp(avatarPng(10, bound * 4, bound * 2)).withMetadata({ orientation: 6 }).withIccProfile('p3')
    if (format === 'jpeg') image = image.flatten({ background: '#f1d7a3' }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
    else if (format === 'webp') image = image.webp({ lossless: true })
    else image = image.png()
    const bytes = await image.toBuffer()
    const before = await sharp(bytes).metadata()
    const result = codec.compressAvatar(bytes, `image/${format}`)
    const after = await sharp(result.bytes).metadata()
    expect(result.disposition).toBe(codec.AVATAR_DISPOSITIONS.resized)
    expect(typeOfBytes(result.bytes)).toBe(typeOfBytes(bytes))
    expect(Math.max(after.width,after.height)).toBe(bound)
    expect(after.width / after.height).toBe(before.width / before.height)
    expect(after.orientation).toBe(before.orientation)
    expect(after.icc).toEqual(before.icc)
    expect(after.hasAlpha).toBe(before.hasAlpha)
    if (before.hasAlpha) {
      const raw = await sharp(result.bytes).ensureAlpha().raw().toBuffer()
      expect([...raw].filter((_, index) => index % 4 === 3).some(alpha => alpha < 255)).toBe(true)
    }
    expect(result.bytes.length).toBeLessThan(bytes.length)
  }, 60_000)

  it('keeps pictures at or below the bound byte for byte and does not enlarge them', () => {
    for (const side of [codec.AVATAR_STORED_SIDE, Math.floor(codec.AVATAR_STORED_SIDE / 2)]) {
      const bytes = avatarPng(11,side,side)
      const result = codec.compressAvatar(bytes, 'image/png')
      expect(result.disposition).toBe(codec.AVATAR_DISPOSITIONS.small)
      expect(result.bytes).toEqual(bytes)
    }
  })

  it('keeps all animation frames, delays and compositing metadata byte for byte', async () => {
    const side = codec.AVATAR_STORED_SIDE * 2
    const still = avatarPng(12, side, side)
    const chunks = avatarPngParts(still)
    const control = Buffer.alloc(8); control.writeUInt32BE(2)
    const frame = (sequence: number): Buffer => { const f=Buffer.alloc(26); f.writeUInt32BE(sequence); f.writeUInt32BE(side,4); f.writeUInt32BE(side,8); f.writeUInt16BE(1,20); f.writeUInt16BE(10,22); return f }
    const data = chunks.find(c=>c.type==='IDAT')!.data
    const animated = Buffer.concat([still.subarray(0,8),chunks[0]!.whole,avatarPngChunk('acTL',control),avatarPngChunk('fcTL',frame(0)),avatarPngChunk('IDAT',data),avatarPngChunk('fcTL',frame(1)),avatarPngChunk('fdAT',Buffer.concat([Buffer.from([0,0,0,2]),data])),chunks.at(-1)!.whole])
    const result = codec.compressAvatar(animated,'image/png')
    expect(result.disposition).toBe(codec.AVATAR_DISPOSITIONS.animated)
    expect(result.bytes).toEqual(animated)
    const stillWebp = await sharp(avatarPng(13,side,side)).webp({lossless:true}).toBuffer()
    const chunk = (type:string,data:Buffer):Buffer=>{const head=Buffer.alloc(8);head.write(type);head.writeUInt32LE(data.length,4);return Buffer.concat([head,data,Buffer.alloc(data.length%2)])}
    const frameData:Buffer[]=[]
    for(let at=12;at<stillWebp.length;){const n=stillWebp.readUInt32LE(at+4),type=stillWebp.toString('ascii',at,at+4);if(['VP8L','VP8 ','ALPH'].includes(type))frameData.push(stillWebp.subarray(at,at+8+n+n%2));at+=8+n+n%2}
    const extended=Buffer.alloc(10);extended[0]=0x12;extended.writeUIntLE(side-1,4,3);extended.writeUIntLE(side-1,7,3)
    const frameHeader=Buffer.alloc(16);frameHeader.writeUIntLE(side-1,6,3);frameHeader.writeUIntLE(side-1,9,3);frameHeader.writeUIntLE(100,12,3)
    const frameChunk=chunk('ANMF',Buffer.concat([frameHeader,...frameData]))
    const body=Buffer.concat([Buffer.from('WEBP'),chunk('VP8X',extended),chunk('ANIM',Buffer.alloc(6)),frameChunk,frameChunk])
    const riff=Buffer.alloc(8);riff.write('RIFF');riff.writeUInt32LE(body.length,4)
    const webp=Buffer.concat([riff,body])
    expect((await sharp(webp,{animated:true}).metadata()).pages).toBe(2)
    const kept=codec.compressAvatar(webp,'image/webp')
    expect(kept.disposition).toBe(codec.AVATAR_DISPOSITIONS.animated)
    expect(kept.bytes).toEqual(webp)
  }, 60_000)

  it('makes an unloadable native codec an explicit unchanged outcome while the module still imports', () => {
    const unavailable = join(folder,'unavailable.cjs')
    writeFileSync(unavailable,'throw new Error("native image module unavailable for this platform")')
    seam.module = unavailable
    try {
      const bytes = avatarPng(14,codec.AVATAR_STORED_SIDE*2,codec.AVATAR_STORED_SIDE*2)
      const result = codec.compressAvatar(bytes,'image/png')
      expect(result.disposition).toBe(codec.AVATAR_DISPOSITIONS.unavailable)
      expect(result.bytes).toEqual(bytes)
    } finally { seam.module = null }
  })

  it('requires a valid stop flag naming its actual parent before native work starts', () => {
    const bytes = avatarPng(66)
    for (const flag of ['', '--stop-with-pid=invalid', '--stop-with-pid=0', '--stop-with-pid=1']) {
      seam.ownerFlag = flag
      try { expect(() => codec.compressAvatar(bytes, 'image/png')).toThrow(/parent|owner|stop-with-pid/i) }
      finally { seam.ownerFlag = null }
    }
  })

  it('bounds native work, disables its cache and uses one codec thread', () => {
    seam.calls.length=0
    const result=codec.compressAvatar(avatarPng(15,codec.AVATAR_STORED_SIDE*2,codec.AVATAR_STORED_SIDE*2),'image/png')
    const call=seam.calls.at(-1)!
    expect(call.options.input).toBeInstanceOf(Buffer)
    expect(call.options.timeout).toBe(codec.AVATAR_CODEC_TIMEOUT_MS)
    expect(call.options.maxBuffer).toBe(codec.AVATAR_CODEC_BUFFER_BYTES)
    expect(Number(call.options.timeout)).toBeGreaterThan(0)
    expect(Number(call.options.maxBuffer)).toBeGreaterThan(0)
    expect(result.native?.cacheMemory).toBe(0)
    expect(result.native?.cacheItems).toBe(0)
    expect(result.native?.concurrency).toBe(1)
    expect(result.native?.inputPixelLimit).toBe(codec.AVATAR_INPUT_PIXEL_LIMIT)
  })

  it('refuses malformed codec input or incomplete child output instead of silently claiming compression', () => {
    expect(()=>codec.compressAvatar(Buffer.from('not an image'),'image/png')).toThrow()
    expect(()=>codec.compressAvatar(avatarPng(16),'image/jpeg')).toThrow()
    const broken=join(folder,'broken.cjs')
    writeFileSync(broken,'module.exports = () => { throw new Error("decode failed") }')
    seam.module=broken
    try { expect(()=>codec.compressAvatar(avatarPng(16),'image/png')).toThrow() } finally { seam.module=null }
    const incomplete=join(folder,'incomplete.cjs')
    writeFileSync(incomplete,'process.stdout.write("incomplete codec output");process.exit(0)')
    seam.module=incomplete
    try { expect(()=>codec.compressAvatar(avatarPng(16),'image/png')).toThrow() } finally { seam.module=null }
    for(const answer of [{disposition:'unrecognized codec outcome'},{disposition:codec.AVATAR_DISPOSITIONS.resized},{disposition:codec.AVATAR_DISPOSITIONS.resized,base64:''},{disposition:codec.AVATAR_DISPOSITIONS.resized,base64:avatarPng(16).toString('base64')}]){
      writeFileSync(incomplete,`process.stdout.write(${JSON.stringify(JSON.stringify(answer))});process.exit(0)`)
      seam.module=incomplete
      try { expect(()=>codec.compressAvatar(avatarPng(16),'image/png')).toThrow() } finally { seam.module=null }
    }
  })

  it('enforces a test-owned input pixel ceiling with a safely decodable PNG', () => {
    // The real child receives a small ceiling, so removing its limit cannot allocate an enormous image.
    const pixels = codec.AVATAR_STORED_SIDE ** 2
    const image = avatarOverPixelLimit(pixels)
    const header = avatarPngParts(image).find(chunk => chunk.type === 'IHDR')!.data
    expect(header.readUInt32BE(0) * header.readUInt32BE(4)).toBeGreaterThan(pixels)
    seam.pixels = pixels
    try {
      expect(() => codec.compressAvatar(image, 'image/png')).toThrow(/pixel limit/i)
      const child = seam.calls.at(-1)!
      expect(child.options.timeout).toBe(codec.AVATAR_CODEC_TIMEOUT_MS)
    } finally { seam.pixels = null }
  })

  it('does not replace an image with an encoding that saves no bytes', async () => {
    const source=await sharp({create:{width:codec.AVATAR_STORED_SIDE*2,height:codec.AVATAR_STORED_SIDE*2,channels:3,background:'#ffffff'}}).png({palette:true,compressionLevel:9}).toBuffer()
    const result=codec.compressAvatar(source,'image/png')
    expect(result.bytes.length).toBeLessThanOrEqual(source.length)
    if(result.disposition!==codec.AVATAR_DISPOSITIONS.resized) expect(result.bytes).toEqual(source)
    // Exercise the policy independently of a native encoder's changing compression choices.
    const larger=join(folder,'larger.cjs')
    writeFileSync(larger,`const pipeline={metadata:async()=>({format:'png',width:${codec.AVATAR_STORED_SIDE*2},height:${codec.AVATAR_STORED_SIDE*2}}),resize(){return this},keepMetadata(){return this},keepIccProfile(){return this},png(){return this},toBuffer:async()=>Buffer.alloc(${source.length+1})};function image(){return pipeline};image.cache=()=>({memory:{max:0},items:{max:0}});image.concurrency=()=>1;module.exports=image`)
    seam.module=larger
    try {
      const kept=codec.compressAvatar(source,'image/png')
      expect(kept.disposition).toBe(codec.AVATAR_DISPOSITIONS.noSaving)
      expect(kept.bytes).toEqual(source)
    } finally { seam.module=null }
  })
})
