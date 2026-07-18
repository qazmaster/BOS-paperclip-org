#!/usr/bin/env node
'use strict';

/**
 * scripts/test_run_m015_s04_native_mission.js
 *
 * M015-4o8lfw / S04 / T03 — Hermetic tests for the bounded-intake +
 * read-only observer harness.
 *
 * Thin wrapper that loads the two part files; node:test discovers all
 * describe/it blocks once the parts register them at module load. Split
 * keeps each individual test file under the 50KB GSD budget while the
 * `node --test scripts/test_run_m015_s04_native_mission.js` command
 * (called from the task verification) still runs the entire suite.
 *
 * Part 1 (test_run_m015_s04_native_mission_part1.js) covers:
 *   - data/namespace/EXIT_CODES
 *   - loadRunnerInput (happy, missing admission, missing intake, malformed)
 *   - validateIntake (literal-boolean confirmation, required fields,
 *     assignee/parent invariant)
 *   - deriveMissionContext (auto-derive + custom + format validation)
 *   - parseArgs (CLI defaults, overrides, --help, unknown arg)
 *   - BoundedTransport (mode transitions, write surface enforcement)
 *   - runIntake (happy + transport/response errors)
 *   - MultipleIntakeError shape
 *   - runner module re-exports
 *
 * Part 2 (test_run_m015_s04_native_mission_part2.js) covers:
 *   - runObserver (terminal exit; budget exhausted; transport error;
 *     side-effect expansion detection)
 *   - aggregateMissionRun
 *   - evaluateMissionOutcome
 *   - deriveMissionStatus
 *   - writeRunnerEvidence refusal guard
 *   - runOnce end-to-end with MockTransport
 *   - HttpTransport (construct + URL composition)
 *   - printHelp smoke
 *
 * All tests are HERMETIC. In-memory fixtures + MockTransport record
 * calls; only the writeRunnerEvidence refusal test touches tmpdir() and
 * cleans up after itself.
 */

require('./test_run_m015_s04_native_mission_part1.js');
require('./test_run_m015_s04_native_mission_part2.js');
