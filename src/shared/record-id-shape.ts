// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The record-id candidates read by messages and anchored by the verdict door and inspector tool. */
// A hyphen can start or end a nanoid, so word boundaries are not ID boundaries. Check the
// whole alphabet on both sides, which also keeps a longer token from becoming a partial link.
// This finds candidates only; isARecordId decides.
export const TWELVE_ID_CHARACTERS = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])/g
