// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** How long the page offers undo, measured from the revocation's server timestamp. */
export const KEY_REVOCATION_UNDO_MS = 10_000

/** Extra server time for an undo pressed at the end of the offer to arrive. */
export const KEY_REVOCATION_UNDO_GRACE_MS = 1_000

// A rejected folder proposal can be put back during this offer.
export const FOLDER_REJECTION_UNDO_MS = 10_000
