// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * How long a file's name may be, in characters. A filename is at most 255 bytes on the filesystems this runs on.
 * The number is kept in src/shared so that a test can read it without loading the database.
 */
export const MAX_REPORT_FILE_NAME = 512
