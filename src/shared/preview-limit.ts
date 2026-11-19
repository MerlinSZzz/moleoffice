// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE SIZE LIMIT OF THE FILE DOOR, read by the door and by the page. GET /api/file (src/server/api/files.ts) refuses
 * a larger file that is not a video unless it is saved, and the chat offers such a file to save rather than to open or to
 * draw. One number for both, so the page never offers what the door refuses.
 *
 * The largest file that will be shown in the page, when it is not a video. 25 MB.
 *
 * A cap is needed because the page reads such a file whole before it shows it, and a sensor log is
 * not that. A video is exempt: the page hands its address to the player, which streams it a
 * stretch at a time. Any file, video or not, can also be saved whole with `download=1`, which has
 * no cap either, because the bytes go to disk rather than into the page.
 * The number is a judgement, published in the refusal and in the endpoint's own sentence so that
 * anybody who hits it is told the figure rather than left to infer one. It is NOT configurable:
 * there is no evidence yet that anybody needs a different number, and rule 6 says not to build the
 * knob until there is.
 *
 * WHAT MUST NOT HAPPEN AT THE CAP: sending the first 25 MB. Truncated bytes served under the
 * file's own name are the content-substitution failure in its quietest form — a half-written PDF
 * looks corrupt, and a half-written CSV looks complete and short.
 */
export const MAX_PREVIEW_BYTES = 25 * 1024 * 1024
