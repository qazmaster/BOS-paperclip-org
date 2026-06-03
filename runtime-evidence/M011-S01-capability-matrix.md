# M011 S01 Capability Matrix

Generated: 2026-06-03T00:25:52.991Z

## Status Counts

- confirmed: 5
- local-only: 4
- fallback-only: 5

## Capabilities

| Key | Status | Category | Evidence | Blockers |
|---|---|---|---|---|
| company.divisions_active | confirmed | live-runtime-proof | runtime-evidence/M005-S02-company-template-runtime-probe-live.json | none |
| resource.secret_resolution | confirmed | live-runtime-proof | runtime-evidence/M005-S03-resource-intake-runtime-probe-live.json | none |
| mission.lifecycle | confirmed | live-runtime-proof | runtime-evidence/M005-S05-e2e-mission-runtime-probe-live.json | none |
| artifact.issue_document_comment_native | confirmed | live-runtime-proof | runtime-evidence/M006-S00-runtime-capability-inventory.json<br>runtime-evidence/M006-S01-plugin-live-registration.json | none |
| git.local_hybrid_push | confirmed | live-runtime-proof | runtime-evidence/M005-S04-git-hybrid-runtime-probe-live.json | none |
| workflow.mission_intake | local-only | implemented-and-tested | runtime-evidence/M005-S05-e2e-governance-probe.json | missing_github_token, missing_paperclip_api_key |
| workflow.hitl_gates | local-only | implemented-and-tested | runtime-evidence/M005-S05-e2e-governance-probe.json | missing_github_token, missing_paperclip_api_key |
| workflow.branch_policy | local-only | implemented-and-tested | runtime-evidence/M005-S05-e2e-governance-probe.json | missing_github_token, missing_paperclip_api_key |
| workflow.qa_review | local-only | implemented-and-tested | runtime-evidence/M005-S05-e2e-governance-probe.json<br>plugin-bos-light/runtime-evidence/M010-S04-e2e-workflow.json | missing_github_token, missing_paperclip_api_key |
| workflow.pr_merge_ci | fallback-only | implemented-but-live-blocked | runtime-evidence/M005-S05-e2e-governance-probe.json | missing_github_token, missing_paperclip_api_key |
| plugin.host_registration | fallback-only | host-surface-blocked | runtime-evidence/M006-S01-plugin-live-registration.json | extended_route_discovery_unsupported, piko_tools_not_observed_extended, plugin_health_endpoint_unsupported, plugin_install_all_blocked, plugin_install_endpoint_unsupported, plugin_install_failed, plugin_not_found_extended_discovery, plugin_not_loaded, tool_registry_extended_unsupported |
| plugin.piko_tools | fallback-only | host-surface-blocked | runtime-evidence/M006-S01-plugin-live-registration.json | extended_route_discovery_unsupported, piko_tools_not_observed_extended, plugin_health_endpoint_unsupported, plugin_install_all_blocked, plugin_install_endpoint_unsupported, plugin_install_failed, plugin_not_found_extended_discovery, plugin_not_loaded, tool_registry_extended_unsupported |
| runtime.hermes_xiaomi_execution | fallback-only | runtime-execution-blocked | runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json | adapter_registry_auth_denied, missing_auth, missing_xiaomi_api_key, missing_xiaomi_base_url, test_environment_auth_denied |
| runtime.gsdpi_execution | fallback-only | runtime-execution-blocked | runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json | adapter_registry_unavailable, health_unavailable, missing_auth, test_environment_not_passing |

## Proof Gate Notes

- Plugin host registration and piko tools remain fallback-only unless supported host readback observes BOS Light and registered tools.
- Hermes and GSD-Pi remain fallback-only unless future runtime-execution-proof evidence includes the required adapter readback and bounded execution payloads.
- Native Paperclip mission/company/resource/git capabilities are listed separately from plugin-host capabilities to avoid over-promotion.
