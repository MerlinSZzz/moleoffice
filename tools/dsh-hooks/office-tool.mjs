// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * dsh's profile still calls officeToolPlugin. The request and its four rules live in ../office-request.mjs.
 * IcgsA-OGvbzL: messages hX_qDiISkTCp, xu5mbrN9ucmN and t_YPyiwf07YJ add Codex's MCP adapter.
 * Step 2 takes the key out of the shell of a Codex worker that starts nothing, once step 1 is proven on a real worker.
 */
import { askTheOffice, A_REFUSED_WRITE, aWrite, OFFICE_REQUEST, THE_LONGEST_WAIT_MS, officeRequestDefinition, renderOfficeAnswer } from '../office-request.mjs'
export { askTheOffice, whereTheRequestGoes, withoutKeys, theRunsIdentity, A_KEY_SHOWN_AS, OFFICE_REQUEST, THE_METHODS, THE_LONGEST_REPLY, THE_LONGEST_WAIT_MS } from '../office-request.mjs'

/** @typedef {import('../office-request.mjs').ARequest} ARequest */
/**
 * THE TOOL, made with dsh's own defineTool, which the profile's plugin hands in.
 * @param {{ defineTool: (options: any) => any, fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv }} input
 */
export function theOfficeRequestTool({ defineTool, fetchImpl = fetch, env = process.env }) {
  return defineTool({
    name: OFFICE_REQUEST,
    ...officeRequestDefinition,
    timeoutMs: THE_LONGEST_WAIT_MS + 5_000,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'integer', required: true },
          location: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          body: { type: 'string', required: true },
          cut: { type: 'boolean', required: true },
          added: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          projectionRefused: { type: 'boolean' },
        },
      },
      render: renderOfficeAnswer,
    },
    async execute(/** @type {ARequest} */ args, /** @type {any} */ exec) {
      return askTheOffice({ ...args, fields: args.fields === undefined ? 'short' : args.fields }, { fetchImpl, env: withTheSessionOf(exec, env) })
    },
    finalizeContent: withTheWordsOnARefusedWrite,
  })
}

/**
 * dsh'S OWN REFUSAL OF A WRITE'S ARGUMENTS, WITH THE ONE PATH ADDED (problem fO_gBrFz9Ax9). dsh refuses arguments that do
 * not fit the definition before execute runs (ToolArgsError, code INVALID_ARGS), so the refusal is in its words, not
 * ours. It hands every final result to finalizeContent, a refusal of the arguments too, and the model reads what comes
 * back (dsh 0.1.5-rc.2: finishScheduledExecution and applyFinalContent in @deepseek-ai/dsh-tools lib/index.js:3257-3281,
 * and types/schema.d.ts:209-217; seen in round zq9ZwpqLKHqz with s3-dsh-args-refusal-probe.mjs). A refusal of the tool's
 * own carries the words already, and dsh does not call this for a call it collapses in its ptc mode.
 * @param {any} exec
 * @param {any} result
 */
export function withTheWordsOnARefusedWrite(exec, result) {
  if (result?.isError !== true || result.error?.info?.code !== 'INVALID_ARGS') return undefined
  if (!aWrite(exec?.arguments?.method)) return undefined
  return [...result.content, { type: 'text', text: `(${A_REFUSED_WRITE})` }]
}

/**
 * THE TOOL'S ENVIRONMENT WITH THE dsh SESSION THAT CALLED IT, so the run's own seal reads that session's transcript
 * (tools/the-seal-receipt.mjs, condition 2). dsh hands a tool its call as the second argument, and the call
 * names its session in `agent.session.header.id`, the same id dsh gives its shell tools as DSH_SESSION_ID (measured in
 * dsh 0.1.5-rc.2: dispatchToolBody in @deepseek-ai/dsh-tools, and @deepseek-ai/dsh-shell-env). A subagent's session
 * (`origin: 'subagent'`) is not the run's own, so none is named for it, and neither is one the process itself inherited.
 * @param {any} exec
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function withTheSessionOf(exec, env) {
  const rest = { ...env }
  delete rest['DSH_SESSION_ID']
  const header = exec?.agent?.session?.header
  const id = header?.id
  return typeof id === 'string' && id !== '' && header?.origin !== 'subagent' ? { ...rest, DSH_SESSION_ID: id } : rest
}

/**
 * THE PLUGIN'S WORK: register the tool. `ctx` is dsh's plugin context, with the tools service injected.
 * @param {{ tools: { register: (tool: any) => unknown } }} ctx
 * @param {{ defineTool: (options: any) => any }} dsh
 */
export function officeToolPlugin(ctx, dsh) {
  ctx.tools.register(theOfficeRequestTool({ defineTool: dsh.defineTool }))
}
