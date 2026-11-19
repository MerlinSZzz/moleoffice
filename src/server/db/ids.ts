// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY 12-CHARACTER ID THE OFFICE MAKES, made here (decision cvQAUoJTDYbB, wave 13w round 6b).
 *
 * An id is nanoid's 12 characters, from A to Z, a to z, 0 to 9, - and _, except that its first character is a letter or
 * a digit, never a dash or an underscore. An id that began with -p had the shape of a password glued to -p, and the key
 * rule could not tell the two apart (problems 57EQjUX6s7kA and k82AM7IZmPV8). An id that begins with a dash is also read
 * as an option when it is passed to a command-line tool. Ids made before this stay as they are; the key rule looks those
 * up (src/server/lib/message-keys.ts).
 *
 * THE REST OF THE ID IS NANOID'S, as it was. Only a first character that is a dash or an underscore is drawn again, from
 * the 62 letters and digits, so every first character is equally likely and the other 11 are untouched.
 */
import { createHash } from 'node:crypto'

import { customAlphabet, nanoid } from 'nanoid'

import { couldBeAHandle } from '@shared/participants.ts'
import { anIdFromAHash } from './hash-id.ts'

/**
 * THE ONE PLACE THAT SAYS HOW AN OFFICE ID BEGINS: with one of these 62 letters and digits (wave 13w round 7). An id
 * worked out from a hash follows the same rule (`anIdFromAHash` in src/server/lib/hash-id.ts reads both from here).
 */
export const AN_IDS_FIRST_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Whether `id` begins as an office id must: with a letter or a digit. */
export function beginsAsAnOfficeId(id: string): boolean {
  return id !== '' && AN_IDS_FIRST_CHARACTERS.includes(id.charAt(0))
}

const A_LETTER_OR_A_DIGIT = customAlphabet(AN_IDS_FIRST_CHARACTERS, 1)

/** The label and the count while ids are made in turn (`idsInTurn`), and null while they are drawn at random. */
let theTurn: { label: string; count: number } | null = null

/** A new id: 12 characters of nanoid's alphabet, beginning with a letter or a digit. Fixed while `idsInTurn` is in force. */
export function anOfficeId(): string {
  if (theTurn !== null) return anIdFromAHash(theNextDraw(theTurn))
  const id = nanoid(12)
  return beginsAsAnOfficeId(id) ? id : A_LETTER_OR_A_DIGIT() + id.slice(1)
}

/**
 * THE ID A NEW AGENT'S ROW IS GIVEN: an office id that could not be a handle. It draws again while the draw could be a
 * handle, because the re-mint of the registry reads an id that could be a handle as legacy or uncertain. Fixed while
 * `idsInTurn` is in force, because `anOfficeId` is.
 */
export function anIdForAnAgent(): string {
  let id = anOfficeId()
  while (couldBeAHandle(id)) id = anOfficeId()
  return id
}

/** The seed a new agent's drawing is made from: 24 of nanoid's characters. Fixed while `idsInTurn` is in force. */
export function aSeedForADrawing(): string {
  return theTurn === null ? nanoid(24) : theNextDraw(theTurn).toString('base64url').slice(0, 24)
}

/**
 * THE DRAWS OF A SEED THAT WRITES A FRESH DATABASE, made in turn and not at random (wave 13y round 37).
 *
 * The review seeds a fresh database each time and photographs it. With random draws two reviews of one commit drew
 * different pages: records written in one second are listed in the order of their ids, and an agent's drawing is made
 * from a seed drawn at random. While this is in force, each draw is the SHA-256 of the label and a count instead, so a
 * program that writes the same rows in the same order gets the same ids and the same drawings. scripts/reset.ts sets it,
 * after it has deleted the database and before it migrates a new one, so no id it makes can meet one made before.
 *
 * It returns the function that ends it. Setting it twice is refused, because two labels would share one count.
 */
export function idsInTurn(label: string): () => void {
  if (theTurn !== null) throw new Error(`Ids are already made in turn, under the label "${theTurn.label}".`)
  const turn = { label, count: 0 }
  theTurn = turn
  return () => {
    if (theTurn === turn) theTurn = null
  }
}

function theNextDraw(turn: { label: string; count: number }): Buffer {
  turn.count += 1
  return createHash('sha256').update(`${turn.label}\0${String(turn.count)}`).digest()
}
