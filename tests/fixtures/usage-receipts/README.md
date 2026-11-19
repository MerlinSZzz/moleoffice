# Runtime envelopes captured on this machine

Captured by an agent on 8 September 2026 at 16:49 BST, through each adapter's own `start` and `commandFor`, in `~/.cache/mole-office/<an agent's folder>/builders/flow-1c/captures`. Prompt: “Reply with only the word ok. Do not use tools.” The supplied office API was the unused port 1. No live office run was started. Raw stdout is committed unchanged.

- Claude Code 2.1.263: `claude -p <prompt> --output-format json --model opus`; answered ok. Model usage names claude-opus-5. Input excludes cached reads and cache creation.
- Codex CLI 0.153.4: `codex exec --json -o <answer> -C <capture-directory> --skip-git-repo-check <prompt>`; answered ok. Stdout contains no model announcement or duration; stderr only says “Reading additional input from stdin...”. Input includes cached input.
- OpenCode 1.18.29: `opencode run --format json --dir <capture-directory> <prompt>`; answered ok. Step finish gives tokens and cost; no model or duration. The supplied total equals input + output + cache read + cache write, demonstrating exclusive input on this capture.
- Kimi 1.50.0: `kimi --print -p <prompt> -w <capture-directory> -S mole-office-flow1c-capture-kimi --output-format stream-json --final-message-only`; refused with `LLM not set`. This is real failure evidence, not a successful Kimi usage capture. The adapter's measured final-only format emits assistant content without usage; the successful shape test is explicitly synthetic.

All four process groups and live resource rows were recorded and released. No tokens, model, duration or price were estimated. Claude multi-model envelopes leave the singular model absent; the run total cannot honestly be attributed to one model.
