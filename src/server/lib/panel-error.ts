// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { CodedRefusal } from '@shared/refusal-codes.ts'

/**
 * A refusal with an English message and an HTTP status, which defaults to 400.
 * Agents and logs keep that message. A code and its values let ErrorNote draw the same refusal
 * in the page's language, from the word lists. Without a code, the page keeps its existing reading.
 * `detail` holds any exact headers, paths or requests for an agent and Developer mode.
 * These readings describe the same facts.
 */
export class PanelError extends Error {
  readonly code?: CodedRefusal['code']
  readonly values?: CodedRefusal['values']
  /**
   * THE ONE THING A REFUSAL DID WRITE, in a sentence beside the message, which stays the refusing door's own words.
   * Set by the verdict door when it records its refusal as a step of the run's flow run.
   */
  recorded?: string
  constructor(
    message: string,
    readonly status = 400,
    /** The same refusal for an agent and for Developer mode: exact paths, headers and requests. */
    readonly detail?: string,
    /**
     * SET ONLY WHEN THE THING ASKED FOR EXISTS AND IS IN ANOTHER PROJECT.
     *
     * A sentence cannot be pressed. The reader of *"Switch to greenhouse and open it there"* has been
     * told in words to do something the product could do for them, so the browser gets the two
     * facts it needs to draw the button instead: which record, and which project. It turns the
     * project id into the project's name itself, because it already holds that list — sending the
     * name from here as well would be the same fact worked out in two places.
     */
    readonly elsewhere?: { title: string; workspaceId: string; recordId: string },
    /**
     * The same refusal in one English sentence, under 90 characters, written beside the message.
     * For an ordinary refusal without a code, ErrorNote draws this reason and folds the message. A coded
     * refusal uses its page sentence from the word lists. This field stays intact in the reply.
     */
    readonly reason?: string,
    /** The page's reading. The English message and the status keep their existing meanings. */
    refusal?: CodedRefusal,
  ) {
    super(message)
    this.code = refusal?.code
    this.values = refusal?.values
  }
}
