<!--
Thanks for contributing to SuperDuck!

Before opening this PR, please:
- Read AGENTS.md for repo conventions and per-app build / test commands.
- Run the verification checklist below for the apps you changed.
- Use a Conventional Commits title (feat:/fix:/refactor:/chore:/docs:/test:/perf:),
  with an optional scope like `crx`, `cli`, `sidepanel`, `mcp`, `ci`.
- For security issues, do NOT open a public PR; use GitHub Security Advisories.
-->

## Summary

<!--
A 1-3 sentence description of WHAT this PR does and WHY.
Link the related issue: "Closes #123" / "Refs #456".
-->

Closes #

## Type of change

<!-- Check all that apply. -->
- [ ] feat — new user-visible feature
- [ ] fix — bug fix
- [ ] refactor — internal change with no user-visible behavior change
- [ ] perf — performance improvement
- [ ] docs — documentation only
- [ ] test — tests only
- [ ] chore / ci — build, tooling, dependency, or CI work
- [ ] breaking change (please describe migration below)

## Affected components

<!-- Check all that apply. See AGENTS.md for the layout. -->
- [ ] `chrome-crx/` (extension, sidepanel, service worker, MCP runtime)
- [ ] `chrome-native-host/` (`superduck` CLI, MCP server, native messaging host)
- [ ] `coworkd/` (cowork daemon)
- [ ] `npm/` (release distribution)
- [ ] `desktop/` / `mac-native-addon/`
- [ ] Root tooling (`.github/workflows`, `scripts/`, `AGENTS.md`, hooks)

## Implementation notes

<!--
Anything reviewers should know:
- Design decisions and trade-offs.
- Files that intentionally got large / were split.
- Subtle invariants, race conditions, performance considerations.
- New dependencies (justify the addition).
-->

## Screenshots / recordings

<!--
For UI changes (`chrome-crx/sidepanel`, options page, indicators), attach before/after
screenshots or short screen recordings. Delete this section if not applicable.
-->

## Verification

<!--
Show the commands you ran locally and that they passed.
Pick the lines that apply to the components you changed; delete the rest.
-->

```bash
# chrome-crx
cd chrome-crx
bun install
bun run lint
bun run typecheck
bun run test           # vitest run (unit + integration)
bun run test:coverage  # coverage gate (lines/statements/branches >= 90, functions >= 55)
bun run build          # validates production build

# chrome-native-host
cd chrome-native-host
make lint              # golangci-lint
make test              # go test ./...
make test-coverage     # MIN_COVERAGE gate
make                   # builds native-host / mcp-server / superduck

# Manual smoke (chrome-crx)
# 1. `bun run build`
# 2. Load `chrome-crx/dist/` as an unpacked extension at chrome://extensions
# 3. Open the side panel (Cmd+E / Ctrl+E) and exercise the changed flow

# Manual smoke (chrome-native-host)
# cd chrome-native-host && go run ./testdata/server -addr :8765 &
# ./testdata/run_cli_test.sh
```

## Tests added / updated

<!-- What tests cover this change? If "none", explain why. -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated (`chrome-crx/tests/integration/*`, `chrome-native-host/testdata/*`)
- [ ] No tests needed because: <!-- e.g. docs-only / config-only -->

## Backward compatibility & rollout

- [ ] Backward compatible (no breaking change for existing users)
- [ ] Behind a feature flag (GrowthBook / Statsig) — flag name:
- [ ] Requires `manifest.json` permission change — listed below:
- [ ] Requires user-visible migration / re-auth — described below:

<!-- Migration / rollout notes go here if any box above is checked. -->

## Security & privacy

- [ ] No new secrets / API keys are committed.
- [ ] No new PII is logged; sensitive fields are scrubbed.
- [ ] New external network calls (if any) are documented above with the destination and purpose.
- [ ] `.gitignore` still covers any newly produced artifacts.

## Reviewer checklist

- [ ] Title follows Conventional Commits (e.g. `feat(crx): ...`).
- [ ] PR is focused — unrelated cleanups are split into separate PRs.
- [ ] CI is green (`Lint (Go)`, `Test Coverage` workflows).
- [ ] Documentation updated if user-visible behavior or developer commands changed (`README.md`, `AGENTS.md`).
