// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER OF EVERY TEST OFFICE, IN A MODULE THAT IMPORTS NOTHING.
 *
 * tests/every-test-process-is-given-the-test-offices-owner.ts runs before every test file and needs only
 * this value. Read from tests/a-page-of-a-test-office.ts, it would load that file's imports as well, the
 * word tables among them, before every test file. So the value is written here, and that file exports it
 * again: a test reads it from there, and that file says why the value is an invented person.
 */

/** The owner of every test office: an id and a name, both invented and nobody's. */
export const THE_TEST_OFFICES_OWNER: Readonly<{ id: string; name: string }> = Object.freeze({ id: 'jory', name: 'Jory' })
