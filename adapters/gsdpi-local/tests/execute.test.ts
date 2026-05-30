import test from "node:test";
import assert from "node:assert/strict";
import { createServerAdapter, type CommandRunner } from "../src/index.js";

function runner(result: Partial<Awaited<ReturnType<CommandRunner>>>): CommandRunner {
  return async () => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: "",
    stderr: "",
    ...result,
  });
}

test("testEnvironment passes when the configured command returns a version", async () => {
  const adapter = createServerAdapter({ command: "gsd" }, { runner: runner({ stdout: "gsd-pi 1.2.3\n" }) });

  const result = await adapter.testEnvironment();

  assert.equal(result.adapterType, "gsdpi_local");
  assert.equal(result.status, "pass");
  assert.equal(result.version, "gsd-pi 1.2.3");
  assert.equal(result.checks[0].code, "gsd_version");
});

test("testEnvironment fails closed when the command is unavailable", async () => {
  const adapter = createServerAdapter({ command: "gsd" }, { runner: runner({ exitCode: 127, stderr: "not found" }) });

  const result = await adapter.testEnvironment();

  assert.equal(result.status, "fail");
  assert.equal(result.checks[0].code, "gsd_command_unavailable");
});

test("execute parses BosAdapterResult JSON from stdout", async () => {
  const payload = {
    resultJson: {
      bosAdapterResult: {
        schemaVersion: "1.0",
        runId: "run-1",
        adapterType: "gsdpi_local",
        status: "succeeded",
        gateResults: [{ gateId: "Div4-smoke", status: "passed" }],
      },
    },
  };
  const adapter = createServerAdapter({ command: "gsd" }, { runner: runner({ stdout: `noise\n${JSON.stringify(payload)}\n` }) });

  const result = await adapter.execute({ runId: "run-1", args: ["--json"] });

  assert.equal(result.resultJson.bosAdapterResult.adapterType, "gsdpi_local");
  assert.equal(result.resultJson.bosAdapterResult.status, "succeeded");
  const firstGate = result.resultJson.bosAdapterResult.gateResults?.[0] as { gateId?: string } | undefined;
  assert.equal(firstGate?.gateId, "Div4-smoke");
});

test("execute returns blocked result when stdout does not contain parseable result JSON", async () => {
  const adapter = createServerAdapter({ command: "gsd" }, { runner: runner({ exitCode: 1, stdout: "plain text" }) });

  const result = await adapter.execute({ runId: "run-2" });

  assert.equal(result.resultJson.bosAdapterResult.status, "blocked");
  assert.match(result.resultJson.bosAdapterResult.error, /parseable BosAdapterResult/);
});

test("execute reports timeout as a blocked result", async () => {
  const adapter = createServerAdapter({ command: "gsd" }, { runner: runner({ exitCode: null, signal: "SIGTERM", timedOut: true }) });

  const result = await adapter.execute({ runId: "run-timeout" });

  assert.equal(result.timedOut, true);
  assert.equal(result.resultJson.bosAdapterResult.status, "blocked");
  assert.match(result.resultJson.bosAdapterResult.error, /timed out/);
});

test("diagnostics expose secret key names but not secret values", async () => {
  const adapter = createServerAdapter(
    { command: "gsd", env: { OPENAI_API_KEY: "sk-super-secret-value", SAFE_FLAG: "1" } },
    { runner: runner({ stdout: "gsd-pi 1.2.3\n" }) },
  );

  const result = await adapter.testEnvironment();
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.diagnostics.secretEnvKeys, ["OPENAI_API_KEY"]);
  assert.equal(serialized.includes("sk-super-secret-value"), false);
});
