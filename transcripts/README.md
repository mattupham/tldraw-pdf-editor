# AI transcripts

Raw Claude Code session logs from the phases that built this project. Committed because the [H2 README explicitly asks for them](../SPEC.md#8-submission-hygiene).

## Format

Each file is a [JSONL](https://jsonlines.org/) stream of Claude Code messages — one JSON object per line. Fields of interest:

- `role` — `"user"` or `"assistant"`
- `content` — the prompt or response (may be a string or an array of content blocks for tool calls / tool results)
- `timestamp` — wall-clock time

Tool calls (`Read`, `Edit`, `Bash`, `Grep`, etc.) and their results are inlined as content blocks — the full back-and-forth is preserved, not just the summarised diffs.

## Layout

One subdirectory per Linear ticket (e.g. `phase-5-pin-tool/` for MATT-133). Files inside are named `<timestamp>-<short-slug>.jsonl` so chronological order falls out of alphabetical sort. Where a phase spanned multiple sessions, the filenames make the sequence explicit — relying on file mtime doesn't work because `cp` re-stamps them at archive time.

`transcripts/**/*.jsonl` is in `.gitignore`, so new Claude sessions don't get swept into accidental diffs. Adding a curated file is a deliberate `git add -f path/to.jsonl`.

## How to read them

Opening a JSONL directly in an editor works but is dense. A quick filter to see only user prompts:

```bash
jq -r 'select(.role == "user") | .content | if type == "string" then . else (. | tostring) end' <file>.jsonl | head -50
```

…or with `fx` / `jless` for interactive browsing.
