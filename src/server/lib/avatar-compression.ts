// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { osProbe } from './os-probe.ts'
import { createRequire } from 'node:module'

// The largest avatar currently drawn is 64 CSS pixels, on the profile and appearance pages.
// The source-discovery test checks this bound against every avatar call in the browser app.
export const AVATAR_STORED_SIDE = 64 * 2
export const AVATAR_INPUT_PIXEL_LIMIT = 16 * 1024 * 1024
export const AVATAR_CODEC_TIMEOUT_MS = 5_000
export const AVATAR_CODEC_BUFFER_BYTES = 8 * 1024 * 1024
export const AVATAR_DISPOSITIONS = {
  resized: 'resized',
  small: 'already within size bound',
  animated: 'animated picture',
  unavailable: 'codec unavailable',
  noSaving: 'encoding would not save bytes',
  timeBound: 'codec did not finish: time bound',
  pixelBound: 'codec did not finish: pixel bound',
  outputBound: 'codec did not finish: output bound',
  childFailed: 'codec did not finish: child failed',
  launchFailed: 'codec did not finish: launch failed',
  processingFailed: 'codec did not finish: image processing failed',
  invalidResult: 'codec did not finish: invalid result',
  unknownFailure: 'codec did not finish: unknown reason',
} as const

export interface CompressedAvatar {
  bytes: Buffer
  disposition: (typeof AVATAR_DISPOSITIONS)[keyof typeof AVATAR_DISPOSITIONS]
  native?: { cacheMemory: number; cacheItems: number; concurrency: number; inputPixelLimit: number; peakRssBytes: number }
}

/** Only a fixed disposition crosses the upload boundary; native diagnostics are not page text. */
export class AvatarCodecFailure extends Error {
  constructor(readonly disposition: CompressedAvatar['disposition'], message: string) { super(message) }
}

const require = createRequire(import.meta.url)

/** PNG animation is declared by its chunk, even where the native PNG reader only sees a still. */
function animatedPng(bytes: Buffer): boolean {
  for (let at = 8; at + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(at)
    if (size > bytes.length - at - 12) return false
    if (bytes.toString('ascii', at + 4, at + 8) === 'acTL') return true
    at += size + 12
  }
  return false
}

function animatedWebp(bytes: Buffer): boolean {
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4)
    if (size > bytes.length - at - 8) return false
    if (bytes.toString('ascii', at, at + 4) === 'ANIM') return true
    at += 8 + size + (size & 1)
  }
  return false
}

export function compressAvatar(bytes: Buffer, mime: string): CompressedAvatar {
  if (mime === 'image/png' && animatedPng(bytes)) return { bytes, disposition: AVATAR_DISPOSITIONS.animated }
  if (mime === 'image/webp' && animatedWebp(bytes)) return { bytes, disposition: AVATAR_DISPOSITIONS.animated }
  let entry: string
  try { entry = require.resolve('sharp') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
    return { bytes, disposition: AVATAR_DISPOSITIONS.unavailable }
  }
  const probe = osProbe()
  if (probe.runAvatarCodec === undefined) throw new AvatarCodecFailure(AVATAR_DISPOSITIONS.unavailable, 'The installed OS probe cannot run the avatar codec.')
  const child = probe.runAvatarCodec({
    bytes, entry, format: mime.slice('image/'.length), side: AVATAR_STORED_SIDE,
    pixels: AVATAR_INPUT_PIXEL_LIMIT, dispositions: AVATAR_DISPOSITIONS,
    timeoutMs: AVATAR_CODEC_TIMEOUT_MS, maxBufferBytes: AVATAR_CODEC_BUFFER_BYTES,
  })
  if (child.error !== undefined) {
    const code = (child.error as NodeJS.ErrnoException).code
    const disposition = code === 'ETIMEDOUT' ? AVATAR_DISPOSITIONS.timeBound
      : code === 'ENOBUFS' || code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? AVATAR_DISPOSITIONS.outputBound
      : ['ENOENT', 'EACCES', 'EPERM', 'EAGAIN', 'ENOMEM', 'EMFILE', 'ENFILE', 'E2BIG'].includes(code ?? '') ? AVATAR_DISPOSITIONS.launchFailed
      : AVATAR_DISPOSITIONS.unknownFailure
    throw new AvatarCodecFailure(disposition, child.error.message)
  }
  if (child.status !== 0) {
    let disposition: CompressedAvatar['disposition'] = AVATAR_DISPOSITIONS.childFailed
    try {
      const failure = JSON.parse(child.stdout.toString('utf8'))?.failure
      if (failure === AVATAR_DISPOSITIONS.pixelBound || failure === AVATAR_DISPOSITIONS.processingFailed) disposition = failure
    } catch { /* A child that stops without its failure record has no more specific known reason. */ }
    throw new AvatarCodecFailure(disposition, child.stderr.toString('utf8') || 'The avatar codec did not finish.')
  }
  const invalid = (): never => { throw new AvatarCodecFailure(AVATAR_DISPOSITIONS.invalidResult, 'The avatar codec returned an invalid result.') }
  let answer: { disposition: CompressedAvatar['disposition']; base64?: string; native?: CompressedAvatar['native'] }
  try { answer = JSON.parse(child.stdout.toString('utf8')) as typeof answer }
  catch { return invalid() }
  if (answer === null || typeof answer !== 'object' || !Object.values(AVATAR_DISPOSITIONS).includes(answer.disposition)) return invalid()
  if (answer.disposition === AVATAR_DISPOSITIONS.resized) {
    if (typeof answer.base64 !== 'string') return invalid()
    const encoded = Buffer.from(answer.base64, 'base64')
    if (encoded.length === 0 || encoded.length >= bytes.length) return invalid()
    return { bytes: encoded, disposition: answer.disposition, native: answer.native }
  }
  return { bytes, disposition: answer.disposition, native: answer.native }
}
