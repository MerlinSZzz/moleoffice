// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN UPLOADED PICTURE REALLY IS, BY ITS FIRST BYTES.
 * `pictureTypeOf` was moved byte for byte out of src/server/lib/avatars.ts, with no change of behaviour.
 * That file re-exports it. It takes a Node `Buffer`, so it has a file of its own.
 */

import { isUploadableAvatarType, type UploadableAvatarType } from '@shared/participants.ts'
import { typeOfBytes } from '@shared/file-signatures.ts'

/**
 * What the first bytes of a file say it really is, or null when they say none of the three.
 *
 * The signatures are declared once, in src/shared/file-signatures.ts, beside the other types the
 * office recognises by their bytes; this door keeps the three it takes.
 */
export function pictureTypeOf(bytes: Buffer): UploadableAvatarType | null {
  const type = typeOfBytes(bytes)
  return isUploadableAvatarType(type) ? type : null
}
