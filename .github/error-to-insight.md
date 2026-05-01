# Error → Insight Pipeline

This repo wires production error tracking (Sentry) and on-call paging
(PagerDuty) into actionable GitHub issues, so problems users hit in
production become trackable, labelled, prioritised work items that humans
and AI coding agents can pick up the same way they pick up any other issue.

```
   ┌──────────┐ webhook   ┌──────────────────────────┐
   │  Sentry  │──────────▶│ .github/workflows/       │── creates / updates
   └──────────┘           │ sentry-issue.yml         │     GitHub issues
                          └──────────────────────────┘
   ┌──────────┐ webhook   ┌──────────────────────────┐
   │PagerDuty │──────────▶│ .github/workflows/       │── creates / updates
   └──────────┘           │ pagerduty-incident-      │     GitHub issues
                          │ issue.yml                │
                          └──────────────────────────┘

  push to main ──▶ .github/workflows/sentry-release.yml
                   creates a Sentry release, associates commits,
                   enables suspect-commit links from Sentry → GitHub.
```

Why two directions? Sentry → GitHub gives you an issue to work on. The
release workflow gives Sentry the commit metadata it needs to deep-link
events back to GitHub blobs, mark issues "resolved by commit", and
attribute regressions to specific PRs.

## Repository configuration

| Kind   | Name                       | Required for                     |
| ------ | -------------------------- | -------------------------------- |
| secret | `SENTRY_DISPATCH_TOKEN`    | inbound Sentry webhook auth      |
| secret | `PAGERDUTY_DISPATCH_TOKEN` | inbound PagerDuty webhook auth   |
| secret | `SENTRY_AUTH_TOKEN`        | outbound Sentry release / commit |
| var    | `SENTRY_ORG`               | Sentry org slug, e.g. `superduck`|
| var    | `SENTRY_PROJECT`           | Sentry project slug              |
| var    | `SENTRY_ENVIRONMENT`       | optional, defaults to `production` |

The release workflow no-ops when `SENTRY_AUTH_TOKEN` is missing, so forks
and external contributors are never blocked.

## Outbound: GitHub commits → Sentry releases

`.github/workflows/sentry-release.yml` runs on every push to `main` that
touches `chrome-crx/**` or `chrome-native-host/**`. It uses
[`getsentry/action-release`](https://github.com/getsentry/action-release)
with `set_commits: auto`, which:

1. Creates a Sentry release named after the merge commit SHA.
2. Tells Sentry which commits are part of the release.
3. Lets Sentry compute suspect commits and link stack frames to GitHub
   source.

You can trigger it manually via the **Actions → Sentry release & commit
linking → Run workflow** button to override the environment.

## Inbound: Sentry alerts → GitHub issues

Configure Sentry to fire alert rules against this repo's
`repository_dispatch` endpoint with `event_type: sentry-issue`. The shape
is documented at the top of
[`.github/workflows/sentry-issue.yml`](workflows/sentry-issue.yml). The
workflow:

- Validates the shared `SENTRY_DISPATCH_TOKEN`.
- Searches existing open issues for one tagged with the same Sentry
  `issue_id` (stored in a hidden HTML comment marker).
- On match → comments the new occurrence count, escalates labels, and
  re-opens the issue if Sentry resurfaced it.
- On miss → opens a fresh issue with `type: bug`, `source: sentry`, the
  inferred `area:` label (mapped from the Sentry project), a computed
  `priority:` (P0–P3 based on level / event count / users impacted), and
  `status: triage`.

The issue body includes a direct link to the Sentry issue, the culprit,
release, environment, and a (truncated) stacktrace.

## Inbound: PagerDuty incidents → GitHub issues

Configure a PagerDuty Generic Webhook v3 against the same dispatch
endpoint with `event_type: pagerduty-incident`. The shape is documented
at the top of
[`.github/workflows/pagerduty-incident-issue.yml`](workflows/pagerduty-incident-issue.yml).

Behaviour mirrors the Sentry pipeline (dedupe-by-marker, comment on
status changes), with two extras:

- `urgency: high` issues open with `priority: P0` and
  `status: in-progress`.
- When PagerDuty fires a `resolved` event, the matching GitHub issue is
  automatically closed with `state_reason: completed`.

## Manual / local testing

You can synthesise a Sentry-style dispatch with the GitHub CLI to verify
the pipeline end-to-end without involving the real services:

```bash
gh api repos/$REPO/dispatches \
  -f event_type=sentry-issue \
  -f client_payload='{
        "issue_id": "fake-1",
        "title": "TypeError: cannot read properties of undefined",
        "project": "chrome-crx",
        "environment": "production",
        "level": "error",
        "issue_url": "https://example.sentry.io/issues/fake-1/",
        "event_count": 12,
        "user_count": 3
      }'
```

Re-run the same command and you should see the workflow add a comment
to the existing issue rather than opening a duplicate.
