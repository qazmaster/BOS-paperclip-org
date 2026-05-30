#!/usr/bin/env python3
"""Negative and no-runtime coverage for scripts/probe_paperclip_runtime.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "probe_paperclip_runtime.py"
SPEC = importlib.util.spec_from_file_location("probe_paperclip_runtime", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)

DIVISIONS = (
    ("Div7.MissionControl", "Div7_MissionControl", None),
    ("Div1.HCO", "Div1_HCO", "Div7.MissionControl"),
    ("Div2.MasterPlanner", "Div2_MasterPlanner", "Div1.HCO"),
    ("Div3.Treasury", "Div3_Treasury", "Div1.HCO"),
    ("Div4.Production", "Div4_Production", "Div1.HCO"),
    ("Div5.QualificationsLibraryLearning", "Div5_QualificationsLibraryLearning", "Div1.HCO"),
    ("Div6.External", "Div6_External", "Div1.HCO"),
)


def write_valid_repo(root: Path) -> None:
    (root / "company-template").mkdir(parents=True)
    (root / "agents").mkdir()
    divisions = []
    for division_id, folder, reports_to in DIVISIONS:
        profile = f"agents/{folder}/AGENTS.md"
        (root / "agents" / folder).mkdir()
        (root / profile).write_text(f"# {division_id}\nProfile for {division_id}.\n", encoding="utf-8")
        divisions.append(
            {
                "id": division_id,
                "title": f"Title for {division_id}",
                "reports_to": reports_to,
                "agent_profile": profile,
                "vfp": f"Value flow for {division_id}",
            }
        )

    template = {
        "schema_version": "0.1-test",
        "name": "BOS Light Company Template for Paperclip",
        "mission": "Fixture mission",
        "divisions": divisions,
        "routing_rules": {
            "high_level_mission": "Div7.MissionControl -> Div1.HCO",
            "backlog_shaping": "Div1.HCO -> Div2.MasterPlanner",
            "implementation": "Div1.HCO -> Div4.Production",
            "qa_security_review": "Div1.HCO -> Div5.QualificationsLibraryLearning",
            "budget_capacity": "Div1.HCO -> Div3.Treasury",
            "external_io_request": "Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External",
            "complex_decision": "Div1.HCO -> Div7.MissionControl",
        },
        "rituals": ["daily_pulse", "weekly_review", "batch_approval_ritual"],
    }
    (root / "company-template" / "bos-company-template.json").write_text(json.dumps(template, indent=2), encoding="utf-8")
    all_divisions = "\n".join(division_id for division_id, _, _ in DIVISIONS)
    (root / "company-template" / "org-chart.mmd").write_text(all_divisions, encoding="utf-8")
    (root / "company-template" / "task-routing.md").write_text(all_divisions, encoding="utf-8")
    (root / "company-template" / "rituals.md").write_text(
        "Daily Pulse\nWeekly Review\nBatch Approval Ritual\n", encoding="utf-8"
    )
    (root / "agents" / "README.md").write_text(all_divisions, encoding="utf-8")

    (root / "plugin-bos-light").mkdir()
    matrix = {
        "schema_version": "0.1-test",
        "plugin_key": "bos-light",
        "capabilities": [
            capability("company_template.import_export", "unvalidated"),
            capability("agents.syntax", "unvalidated"),
            capability("plugin.runtime.version_build", "unvalidated"),
            capability("plugin.runtime.registration", "unvalidated"),
            capability("config.api", "fallback-only"),
        ],
    }
    (root / "plugin-bos-light" / "capabilities.paperclip-runtime.json").write_text(
        json.dumps(matrix, indent=2), encoding="utf-8"
    )


def capability(key: str, status: str) -> dict:
    return {
        "key": key,
        "status": status,
        "paperclip_surface_name": f"Surface {key}",
        "evidence_source": "Fixture evidence source.",
        "runtime_evidence_field": f"paperclip.{key}",
        "fallback_path": "Fixture fallback path.",
        "blocker_text": "Fixture blocker text.",
    }


class PaperclipRuntimeProbeTests(unittest.TestCase):
    def with_fixture(self, callback):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_valid_repo(root)
            return callback(root)

    def test_no_runtime_mode_records_unvalidated_report_and_local_contract(self):
        def run(root: Path):
            return probe.build_report(root, None)

        report = self.with_fixture(run)
        self.assertEqual(0, report["posture"]["exit_code"])
        self.assertEqual("not-provided", report["paperclip"]["availability"])
        self.assertEqual("local-contract-valid", report["local_contract"]["company_template"]["status"])
        self.assertEqual([], report["local_contract"]["company_template"]["errors"])
        statuses = {entry["status"] for entry in report["capabilities"]}
        self.assertLessEqual(statuses, {"unvalidated", "fallback-only", "unsupported"})
        self.assertIn("unvalidated", statuses)

    def test_local_contract_reports_stale_profile_path_exactly(self):
        def run(root: Path):
            stale_profile = root / "agents" / "Div1_Executive" / "AGENTS.md"
            stale_profile.parent.mkdir(parents=True)
            stale_profile.write_text("# Div1.HCO\n\nStale legacy profile path fixture.\n", encoding="utf-8")
            template_path = root / "company-template" / "bos-company-template.json"
            template = json.loads(template_path.read_text(encoding="utf-8"))
            template["divisions"][1]["agent_profile"] = "agents/Div1_Executive/AGENTS.md"
            template_path.write_text(json.dumps(template, indent=2), encoding="utf-8")
            return probe.build_report(root, None)

        report = self.with_fixture(run)
        self.assertEqual("local-contract-invalid", report["local_contract"]["company_template"]["status"])
        joined = "\n".join(report["local_contract"]["company_template"]["errors"])
        self.assertIn("Div1.HCO.agent_profile", joined)
        self.assertIn("stale legacy profile path", joined)
        self.assertIn("agents/Div1_Executive/AGENTS.md", joined)
        self.assertIn("agents/Div1_HCO/AGENTS.md", joined)

    def test_local_contract_reports_stale_route_exactly(self):
        def run(root: Path):
            template_path = root / "company-template" / "bos-company-template.json"
            template = json.loads(template_path.read_text(encoding="utf-8"))
            template["routing_rules"]["external_io_request"] = "Div1.HCO -> Div6.External"
            template_path.write_text(json.dumps(template, indent=2), encoding="utf-8")
            return probe.build_report(root, None)

        report = self.with_fixture(run)
        self.assertEqual("local-contract-invalid", report["local_contract"]["company_template"]["status"])
        joined = "\n".join(report["local_contract"]["company_template"]["errors"])
        self.assertIn("routing_rules.external_io_request", joined)
        self.assertIn("expected v1.4.1 route 'Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External'", joined)
        self.assertIn("found 'Div1.HCO -> Div6.External'", joined)

    def test_missing_paperclip_path_is_unvalidated_health_not_failure(self):
        def run(root: Path):
            return probe.build_report(root, root / "missing-paperclip")

        report = self.with_fixture(run)
        self.assertEqual(0, report["posture"]["exit_code"])
        self.assertEqual("missing", report["paperclip"]["availability"])
        self.assertEqual("unvalidated", report["paperclip"]["status"])
        self.assertTrue(report["paperclip"]["malformed_evidence"])

    def test_empty_paperclip_path_behaves_like_no_runtime_mode(self):
        def run(root: Path):
            return probe.build_report(root, "")

        report = self.with_fixture(run)
        self.assertEqual("not-provided", report["paperclip"]["availability"])
        self.assertEqual("unvalidated", report["paperclip"]["status"])

    def test_paperclip_path_with_no_spec_files_stays_unvalidated(self):
        def run(root: Path):
            paperclip_dir = root / "paperclip"
            paperclip_dir.mkdir()
            return probe.build_report(root, paperclip_dir)

        report = self.with_fixture(run)
        self.assertEqual("present", report["paperclip"]["availability"])
        self.assertEqual([], report["paperclip"]["metadata_files"])
        self.assertEqual([], report["paperclip"]["spec_files"])
        self.assertEqual("unvalidated", report["paperclip"]["status"])

    def test_malformed_metadata_is_reported_as_malformed_evidence(self):
        def run(root: Path):
            paperclip_dir = root / "paperclip"
            paperclip_dir.mkdir()
            (paperclip_dir / "paperclip.json").write_text('{ "version": ', encoding="utf-8")
            return probe.build_report(root, paperclip_dir)

        report = self.with_fixture(run)
        joined = "\n".join(report["paperclip"]["malformed_evidence"])
        self.assertIn("paperclip.json", joined)
        self.assertIn("malformed JSON", joined)
        self.assertEqual("unvalidated", report["paperclip"]["status"])

    def test_metadata_secret_like_values_are_redacted(self):
        def run(root: Path):
            paperclip_dir = root / "paperclip"
            paperclip_dir.mkdir()
            (paperclip_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "paperclip-fixture",
                        "version": "1.2.3",
                        "api_key": "sk-live-secret-value",
                        "notes": "PAPERCLIP_TOKEN=token-value-123456",
                    }
                ),
                encoding="utf-8",
            )
            return probe.build_report(root, paperclip_dir)

        report = self.with_fixture(run)
        serialized = json.dumps(report, sort_keys=True)
        self.assertNotIn("sk-live-secret-value", serialized)
        self.assertNotIn("token-value-123456", serialized)
        self.assertIn("<redacted>", serialized)
        self.assertEqual("1.2.3", report["paperclip"]["version"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
