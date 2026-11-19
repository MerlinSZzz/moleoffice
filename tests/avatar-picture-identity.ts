// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect } from 'vitest'
import { AVATAR_DISPOSITIONS, AVATAR_STORED_SIDE } from '../src/server/lib/avatar-compression.ts'
import type { AvatarUploadDescription } from '../src/server/lib/avatars.ts'
import { AVATAR_DIRECTORY } from '../src/shared/participants.ts'

export const pictureHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/** The original is obtained independently from the offer or press, never from the stored result. */
export async function expectPictureIdentity(original: Buffer, served: Buffer, upload: AvatarUploadDescription): Promise<void> {
  expect(upload.originalHash, 'the stored picture came from another original').toBe(pictureHash(original))
  expect(upload.originalBytes).toBe(original.length)
  expect(upload.storedHash, 'the served picture differs from the recorded result').toBe(pictureHash(served))
  expect(upload.storedBytes).toBe(served.length)
  expect(upload.bytesSaved).toBe(original.length - served.length)
  if (upload.disposition !== AVATAR_DISPOSITIONS.resized) {
    expect(served, 'an unchanged picture lost its original bytes').toEqual(original)
    return
  }
  expect(served.length).toBeLessThan(original.length)
  // These choice tests use PNG: compare lossless decoded pixels against the selected source,
  // independently resized to the exported policy bound. A self-consistent wrong blob fails here.
  const sharp = createRequire(import.meta.url)('sharp')
  const wanted = await sharp(original).resize({
    width: AVATAR_STORED_SIDE, height: AVATAR_STORED_SIDE, fit: 'inside', withoutEnlargement: true,
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const actual = await sharp(served).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect([actual.info.width, actual.info.height, actual.info.channels, actual.info.depth])
    .toEqual([wanted.info.width, wanted.info.height, wanted.info.channels, wanted.info.depth])
  expect(actual.data, 'the encoded pixels are not the selected picture').toEqual(wanted.data)
}

/** Discover this made-up office's provenance by its fields, without copying storage filenames. */
export function pictureRecords(officeRoot: string): { path: string; data: AvatarUploadDescription & { assetId?: string } }[] {
  return readdirSync(join(officeRoot, AVATAR_DIRECTORY), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => {
      const path = join(entry.parentPath, entry.name)
      return { path, data: JSON.parse(readFileSync(path, 'utf8')) }
    })
}

/** Bind an HTTP asset to this test office's immutable original manifest and upload receipt. */
export async function expectStoredPicture(officeRoot: string, url: string, original: Buffer, served: Buffer): Promise<AvatarUploadDescription> {
  const records = pictureRecords(officeRoot)
  const manifests = records.filter(record => record.data.assetId === undefined && record.data.originalHash === pictureHash(original))
  expect(manifests, 'no unique manifest describes the independently selected original').toHaveLength(1)
  const upload = manifests[0]!.data
  await expectPictureIdentity(original, served, upload)
  expect(readFileSync(join(officeRoot, upload.path))).toEqual(served)
  const assetId = url.slice('/api/assets/'.length)
  expect(url).toBe(`/api/assets/${assetId}`)
  const receipts = records.map(record => record.data)
    .filter(receipt => receipt.assetId === assetId && receipt.originalHash === pictureHash(original))
  expect(receipts.length, 'no receipt binds this original to the participant asset').toBeGreaterThan(0)
  for (const receipt of receipts) expect(receipt).toMatchObject(upload)
  return upload
}
