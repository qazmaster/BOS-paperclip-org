# S08 Replan

**Milestone:** M002
**Slice:** S08
**Blocker Task:** T03
**Created:** 2026-05-29T15:03:55.125Z

## Blocker Description

T03 proved the selected hermes_local plus Codex backend path has a supported Paperclip config surface, but current Paperclip testEnvironment fails for /BOS and /BOSA with hermes_cli_not_found. T04 cannot run until Hermes CLI is installed/exposed in the Paperclip execution environment through a supported env/admin path and T03 readiness is repeated.

## What Changed

Added T05 to remediate the Hermes CLI prerequisite through supported environment/admin boundaries and repeat the T03 readiness proof before T04 can run. Completed T01-T03 are preserved; T04 remains gated on successful readiness evidence.
