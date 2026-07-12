# M014-S05 Hermes Upstream Diff

> **Slice:** S05 — Hermes Upstream Upgrade and MiniMax M3 Migration
> **Task:** T01 — Verify Hermes upstream and capture baseline
> **Generated:** 2026-07-12 by GSD auto-mode executor (M014-a9jj46/S05/T01)
> **Purpose:** Document the upstream identity of Hermes (`hermes-agent`), the local runtime pin, and the local Paperclip adapter compatibility patches so that T02 can pick a pinned target revision with provenance and T03 can migrate to MiniMax M3 without losing the secret-ref envelope.
> **Companion artifact:** `runtime-evidence/M014-S05-hermes-baseline.json`

---

## 1. Canonical Upstream Identity (verified)

| Field | Value | Source |
|-------|-------|--------|
| Repository owner | `NousResearch` | PyPI maintainer record |
| Repository name | `hermes-agent` | PyPI project page |
| Canonical URL | https://github.com/NousResearch/hermes-agent | GitHub repo page |
| PyPI project | `hermes-agent` | https://pypi.org/project/hermes-agent/ |
| Homepage | https://hermes-agent.nousresearch.com/ | PyPI project page |
| License | MIT (SPDX: MIT) | PyPI verified metadata |
| Author | Nous Research | PyPI project metadata |
| PyPI maintainers | `dakota-nous`, `sidbin` | PyPI verified metadata |
| Default branch | `main` | GitHub repo |
| Python constraint | `>=3.11,<3.14` | PyPI project metadata |
| Latest PyPI release observed | `0.18.2` | PyPI project page |
| Latest release published | 2026-07-08 | PyPI project page |

### Upstream signal: PyPI vs GitHub

The PyPI project and the GitHub repository are owned by the same author (Nous Research) and the PyPI project page links to https://hermes-agent.nousresearch.com/ as the homepage and to https://github.com/NousResearch/hermes-agent as the source. The MIT license and the maintainer pair `dakota-nous`/`sidbin` appear on the PyPI verified-metadata record, which means the canonical upstream is the GitHub repository and the canonical distribution channel is PyPI.

We therefore treat:

- **PyPI** as the source of truth for the **wheel + version pin** (this is what the Paperclip runtime actually installs).
- **GitHub** as the source of truth for the **commit SHA / source diff** (this is what provenance checks point at).
- **homepage** as the source of truth for **docs and provider configuration** (this is what T03 will use to look up the MiniMax provider contract).

---

## 2. Historical Pin vs Upstream Drift

| Field | Value | Source |
|-------|-------|--------|
| Hermes runtime currently pinned (Paperclip container) | `hermes-agent==0.15.2` | M002-S08 pip install log stdout (`Successfully installed hermes-agent-0.15.2`) |
| Pinned version label | `Hermes Agent v0.15.2 (2026.5.29.2)` | M002-S08 `installed_runtime.hermes_version_observed` |
| Pin install date | 2026-05-29 | M002-S08 `generated_at` |
| Upstream latest PyPI release | `0.18.2` | PyPI project page (this baseline) |
| Upstream latest PyPI release date | 2026-07-08 | PyPI project page |
| Drift between pin and latest | Pin is **4 releases behind** (0.16.x, 0.17.x, 0.18.x including 0.18.2) | Computed |
| Python constraint drift | 0.15.2 inherits `>=3.11,<3.14`; live runtime is `Python 3.13.5` — still in range | M002-S08 stdout + PyPI metadata |
| New pinned target selection | Deferred to T02 (`runtime-evidence/M014-S05-hermes-upgrade-contract.json`) | This slice plan |

The runtime pin is recorded but the **new pinned target** is **not** chosen in T01. T02 is the task that selects a pinned target revision after release and compatibility review.

---

## 3. Hermes Runtime Layout in the Paperclip Container

The runtime does **not** live in this repository. It lives inside the Paperclip container at `paperclip_sandbox-paperclip-1` (VPS `87.99.146.178`, sandbox path `/opt/paperclip-sandbox`).

```
/paperclip/hermes-runtime/                       # HERMES_USERBASE / PYTHONUSERBASE
├── bin/
│   ├── hermes                                   # upstream CLI entrypoint
│   ├── hermes-agent                             # upstream CLI entrypoint alias
│   ├── hermes-acp                               # upstream CLI entrypoint alias
│   └── hermes-paperclip                         # LOCAL PAPERCLIP WRAPPER (LHA-PYUSERBASE-WRAPPER)
└── lib/python3.13/site-packages/                # hermes-agent + openai + pydantic + ...
```

### `hermes-paperclip` wrapper (LHA-PYUSERBASE-WRAPPER)

The wrapper exists because Paperclip cannot modify the Debian system Python (Debian externally-managed, PEP 668) and cannot install Hermes into `/usr/local`. The wrapper solves this by exporting `PYTHONUSERBASE=/paperclip/hermes-runtime` before exec'ing the upstream `hermes` binary. The wrapper therefore:

1. Forces every Hermes run to use the userbase at `/paperclip/hermes-runtime/lib/python3.13/site-packages`.
2. Makes the runtime path discoverable from outside the wrapper.
3. Allows the wrapper to be swapped or replaced without touching the upstream wheel.

### Upstream CLI binaries (from `pip install hermes-agent`)

| Binary | Purpose |
|--------|---------|
| `hermes` | Primary CLI entrypoint. |
| `hermes-agent` | Alias used by some Paperclip adapter code. |
| `hermes-acp` | Alternate CLI for the ACP integration (TUI / Telegram / Discord). |

All three binaries land in `/paperclip/hermes-runtime/bin/` because they are not on PATH; the `hermes-paperclip` wrapper resolves them by absolute path.

---

## 4. Local Paperclip Adapter Compatibility Patches

These are the Paperclip-side patches that allow the upstream `hermes-agent` to be invoked under Paperclip as `hermes_local`. They live in the Paperclip image, **not in this repository**, but they ARE required for `hermes_local` to function and MUST be re-verified after any upgrade.

| Patch ID | Kind | Summary | Evidence | Reconciliation required |
|----------|------|---------|----------|------------------------|
| `LHA-PYUSERBASE-WRAPPER` | pyuserbase_wrapper | Wrapper at `/paperclip/hermes-runtime/bin/hermes-paperclip` exports `PYTHONUSERBASE=/paperclip/hermes-runtime` and re-invokes the upstream `hermes` CLI from the userbase. | M002-S08 step `wrapper_install` | yes |
| `LHA-PEP668-OVERRIDE` | pep668_install_override | First-time install used `pip --break-system-packages` against `/paperclip/hermes-runtime` because Debian Python is externally managed. This override must NOT be re-applied at upgrade time unless explicitly approved. | M002-S08 step `isolated_python_userbase_install` | yes |
| `LHA-ADAPTER-CLI-CONTRACT` | adapter_cli_contract | Paperclip process adapter for `hermes_local` calls `hermes-paperclip` with `provider` / `model` / `timeoutSec` / `graceSec` in `adapterConfig`. Output is captured as stdout/stderr excerpts and as a session id; `resultJson.bos` must be produced by the upstream hermes CLI itself. | M002-S10 + M005-S01 + Paperclip `/llms/agent-configuration/hermes_local.txt` | yes |
| `LHA-SECRET-REF-ENVELOPE` | secret_ref_envelope | `XIAOMI_API_KEY` and `XIAOMI_BASE_URL` are passed through the Paperclip secret-ref envelope; the adapter never sees the resolved values in the rendered `adapterConfig`. Migration to MiniMax M3 must keep the same secret-ref envelope shape. | M005-S01 `inputs.xiaomi_api_key_secret_ref_present` + `inputs.xiaomi_base_url_secret_ref_present` | yes |

**Reconciliation count: 4 of 4 patches require explicit re-verification after any upstream upgrade.**

---

## 5. Provider Registry and Profiles (Observed)

### Providers observed

| Slot | Provider | Model | Endpoint class | Endpoint secret_ref | Auth secret_ref | Evidence | Live state |
|------|----------|-------|----------------|---------------------|-----------------|----------|------------|
| primary | `xiaomi` | `mimo-v2.5-pro` | `openai-compatible` | `XIAOMI_BASE_URL` | `XIAOMI_API_KEY` | M005-S01 live proof | historical-only |
| fallback | `openai-codex` | `gpt-5.3-codex` | `codex-cli-local` | n/a (local codex-cli) | `OPENAI_API_KEY` | M002-S10 + M002-S08 | historical-only |

### Profiles observed

| Profile name | Provider | Model | Endpoint secret_ref | Auth secret_ref | Status |
|--------------|----------|-------|---------------------|-----------------|--------|
| `xiaomi-mimo-v2.5-pro` | `xiaomi` | `mimo-v2.5-pro` | `XIAOMI_BASE_URL` | `XIAOMI_API_KEY` | historical-primary; **to be deprecated by MiniMax M3 in T03** |
| `openai-codex-gpt-5.3` | `openai-codex` | `gpt-5.3-codex` | n/a | `OPENAI_API_KEY` | historical-fallback |

### Adapter flags observed (hermes_local)

| Flag | Value | Evidence |
|------|-------|----------|
| `hermesCommand` | `/paperclip/hermes-runtime/bin/hermes-paperclip` | M002-S10 + M005-S01 |
| `provider` | `xiaomi` (primary) / `openai-codex` (fallback) | M002-S10 + M005-S01 |
| `model` | `mimo-v2.5-pro` (primary) / `gpt-5.3-codex` (fallback) | M002-S10 + M005-S01 |
| `timeoutSec` | `300` (xiaomi) / `90` (openai-codex) | M002-S10 + M005-S01 |
| `graceSec` | `5` | M002-S10 + M005-S01 |

---

## 6. Xiaomi / Mimo Behavior (Before Baseline)

This is the **before** baseline for the MiniMax M3 migration in T03. All values are HISTORICAL OBSERVATIONS only; the live runtime may have drifted since 2026-06-01.

| Signal | Observed value | Source |
|--------|----------------|--------|
| Session id format | `YYYYMMDD_HHMMSS_<6hex>` (e.g. `20260601_023233_1fa370`) | M005-S01 run.stderrExcerpt |
| stdout marker | `Hermes Agent (model=mimo-v2.5-pro, timeout=300s)` | M005-S01 run.stdoutExcerpt |
| exit code | `0` | M005-S01 run.exitCode |
| timeout fired | `false` | M005-S01 run.timeoutFired |
| wake count delta | `1` | M005-S01 run.wakeCountDelta |
| `resultJson` | `{}` (empty object) | M005-S01 run.resultJson |
| BOS-shaped result | **NOT produced** | R5/R6 standards — empty `resultJson` is not a passing BOS-shaped result |
| Bypass / denial observed | `denying command` (timeout gating in early probes) | M005-S01 stdout tail of early probe variants |
| Rollback capability | M002-S08 retains hermes-agent at `/paperclip/hermes-runtime`; previous version not pinned to a separate userbase; rollback requires reinstall of the previous wheel | M002-S08 environment_after.pip_state |

---

## 7. What T02 Will Need From This Diff

T02 must, at minimum, cite each row of this document and answer:

1. **Which pinned target revision is selected, and why?** (cites §2 and §3.)
2. **Does the new wheel still install under `PYTHONUSERBASE=/paperclip/hermes-runtime` and the `hermes-paperclip` wrapper, without re-applying `LHA-PEP668-OVERRIDE`?** (cites §3 and §4.)
3. **Does the new wheel still honor `provider` / `model` / `timeoutSec` / `graceSec` from `adapterConfig` and still emit a `resultJson.bos`?** (cites §4 and §5.)
4. **Does the new wheel preserve the `XIAOMI_BASE_URL` / `XIAOMI_API_KEY` secret-ref envelope so MiniMax M3 can be substituted without changing Paperclip adapter source?** (cites §4 row `LHA-SECRET-REF-ENVELOPE` and §5.)
5. **Is the rolled-back runtime retained?** (cites §6 row `rollback_capability_observed`.)

T02 answers YES/NO to each of these and writes the result into `runtime-evidence/M014-S05-hermes-upgrade-contract.json`.

---

## 8. What T03 Will Need From This Diff

T03 must, at minimum, cite each row of this document and prove:

1. **The MiniMax M3 provider name + endpoint mode + model spelling is the one declared by upstream NousResearch** (cites §1) — NOT an arbitrary string.
2. **The MiniMax M3 credentials are passed via secret_ref only** (cites §4 row `LHA-SECRET-REF-ENVELOPE`).
3. **No Xiaomi endpoint, no Xiaomi session id, and no `mimo-v2.5-pro` model spelling appears in the bounded run** (cites §6 to define what counts as a Xiaomi artifact).
4. **The bounded run produces a schema-valid `resultJson.bos`** (cites §6 row `result_json_observed_status` to define the gap to close).

---

## 9. Provenance and Re-Readback

| Field | Value |
|-------|-------|
| Upstream remote readback method | `fetch_page` on PyPI + GitHub (independent of the live VPS) |
| Upstream remote readback timestamp | 2026-07-12 (this run) |
| Live runtime readback | NOT performed in T01 — S02 verdict is H-INCONCLUSIVE |
| Live runtime readback required before T02 | yes |
| Live runtime readback required before T03 | yes |
| Forbidden actions in T01 | any destructive docker command, any live mutation, any direct paperclip.oysana.com POST/PUT/PATCH/DELETE |

---

## 10. Secret / Credential Redaction Posture

This document and the companion `M014-S05-hermes-baseline.json` contain **no credential values**. Forbidden substring shapes (each one would have triggered a redaction failure if present):

- `XIAOMI_API_KEY=`
- `OPENAI_API_KEY=`
- `XIAOMI_BASE_URL=`
- `Authorization: Bearer `
- `sk-`
- `tp-`

The only UUID literals that appear in the baseline are listed in the approved-allowlist block in `credential_redaction_posture.approved_uuid_allowlist`. They are either (a) historical evidence pointers that are explicitly flagged as not-to-be-reused, or (b) ephemeral Paperclip workspace / run ids from M002-S08 install runs.