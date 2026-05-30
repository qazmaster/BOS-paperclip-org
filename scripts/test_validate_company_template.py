#!/usr/bin/env python3
"""Negative coverage for scripts/validate_company_template.py."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent / "validate_company_template.py"
SPEC = importlib.util.spec_from_file_location("validate_company_template", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

DIVISIONS = [
    ("Div7.MissionControl", "Mission Control / Strategy", None, "Div7_MissionControl", "Accepted missions framed into strategic intent"),
    ("Div1.HCO", "Head Communication Office", "Div7.MissionControl", "Div1_HCO", "Correct routing, dispatch and escalation"),
    ("Div2.MasterPlanner", "Shaping / Product Planning", "Div1.HCO", "Div2_MasterPlanner", "Well-shaped work"),
    ("Div3.Treasury", "Treasury / Budget / Access", "Div1.HCO", "Div3_Treasury", "Budget-fit and access-feasible work"),
    ("Div4.Production", "Production / Build / Delivery", "Div1.HCO", "Div4_Production", "Completed accepted artifacts"),
    ("Div5.QualificationsLibraryLearning", "Qualifications / Library / Learning", "Div1.HCO", "Div5_QualificationsLibraryLearning", "Verified, sanitized work"),
    ("Div6.External", "External / DMZ", "Div1.HCO", "Div6_External", "External evidence collected and quarantined"),
]


def valid_template() -> dict:
    return {
        "schema_version": "0.1-test",
        "name": "BOS Light Company Template for Paperclip",
        "mission": "Test mission",
        "divisions": [
            {
                "id": division_id,
                "title": title,
                "reports_to": reports_to,
                "agent_profile": f"agents/{folder}/AGENTS.md",
                "vfp": vfp,
            }
            for division_id, title, reports_to, folder, vfp in DIVISIONS
        ],
        "routing_rules": {
            "high_level_mission": "Div7.MissionControl -> Div1.HCO",
            "backlog_shaping": "Div1.HCO -> Div2.MasterPlanner",
            "budget_capacity": "Div1.HCO -> Div3.Treasury",
            "implementation": "Div1.HCO -> Div4.Production",
            "qa_security_review": "Div1.HCO -> Div5.QualificationsLibraryLearning",
            "external_io_request": "Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External",
            "complex_decision": "Div1.HCO -> Div7.MissionControl",
        },
        "rituals": ["daily_pulse", "weekly_review", "batch_approval_ritual"],
    }


def write_fixture(root: Path, template: dict | None = None) -> None:
    template = copy.deepcopy(template if template is not None else valid_template())
    (root / "company-template").mkdir(parents=True)
    (root / "agents").mkdir(parents=True, exist_ok=True)
    for division_id, _title, _reports_to, folder, _vfp in DIVISIONS:
        profile_dir = root / "agents" / folder
        profile_dir.mkdir(parents=True)
        (profile_dir / "AGENTS.md").write_text(f"# {division_id}\n\n## Identity\n", encoding="utf-8")
    (root / "agents" / "README.md").write_text("\n".join(division_id for division_id, *_ in DIVISIONS), encoding="utf-8")
    (root / "company-template" / "org-chart.mmd").write_text("\n".join(division_id for division_id, *_ in DIVISIONS), encoding="utf-8")
    (root / "company-template" / "task-routing.md").write_text("\n".join(division_id for division_id, *_ in DIVISIONS), encoding="utf-8")
    (root / "company-template" / "rituals.md").write_text(
        "# Daily Pulse\n# Weekly Review\n# Batch Approval Ritual\n",
        encoding="utf-8",
    )
    (root / "company-template" / "bos-company-template.json").write_text(
        json.dumps(template, indent=2), encoding="utf-8"
    )


class CompanyTemplateValidatorTests(unittest.TestCase):
    def validate_fixture(self, mutate=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            template = valid_template()
            if mutate is not None:
                mutate(root, template)
            write_fixture(root, template)
            return validator.validate(root)

    def test_valid_fixture_passes(self):
        self.assertEqual([], self.validate_fixture())

    def test_missing_required_division_field_reports_division_and_field(self):
        def mutate(_root: Path, template: dict) -> None:
            del template["divisions"][4]["vfp"]

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("company-template/bos-company-template.json", joined)
        self.assertIn("Div4.Production", joined)
        self.assertIn("missing field 'vfp'", joined)

    def test_missing_agent_profile_reports_referenced_path(self):
        def mutate(_root: Path, template: dict) -> None:
            template["divisions"][2]["agent_profile"] = "agents/Div2_MasterPlanner/MISSING.md"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("Div2.MasterPlanner.agent_profile", joined)
        self.assertIn("agents/Div2_MasterPlanner/MISSING.md", joined)

    def test_malformed_route_reports_route_context_and_bad_target(self):
        def mutate(_root: Path, template: dict) -> None:
            template["routing_rules"]["implementation"] = "Div1.HCO -> Div9.Unknown"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("routing_rules.implementation", joined)
        self.assertIn("malformed route", joined)
        self.assertIn("Div9.Unknown", joined)

    def test_org_chart_compatibility_gap_reports_missing_division(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_fixture(root)
            (root / "company-template" / "org-chart.mmd").write_text("Div7.MissionControl\n", encoding="utf-8")
            errors = validator.validate(root)

        joined = "\n".join(errors)
        self.assertIn("company-template/org-chart.mmd", joined)
        self.assertIn("compatibility issue", joined)
        self.assertIn("Div1.HCO", joined)

    def test_legacy_division_id_is_rejected_as_inactive_contract(self):
        def mutate(_root: Path, template: dict) -> None:
            template["divisions"][0]["id"] = "Div7.Strategy"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("legacy division ids are not active BOS Light v1.4.1 ids", joined)
        self.assertIn("Div7.Strategy", joined)
        self.assertIn("missing BOS Light v1.4.1 division ids", joined)
        self.assertIn("Div7.MissionControl", joined)

    def test_stale_agent_profile_path_reports_expected_profile(self):
        def mutate(root: Path, template: dict) -> None:
            stale_profile = root / "agents" / "Div1_Executive" / "AGENTS.md"
            stale_profile.parent.mkdir(parents=True)
            stale_profile.write_text("# Div1.HCO\n\nStale legacy profile path fixture.\n", encoding="utf-8")
            template["divisions"][1]["agent_profile"] = "agents/Div1_Executive/AGENTS.md"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("Div1.HCO.agent_profile", joined)
        self.assertIn("stale legacy profile path", joined)
        self.assertIn("expected 'agents/Div1_HCO/AGENTS.md'", joined)
        self.assertIn("found 'agents/Div1_Executive/AGENTS.md'", joined)

    def test_unexpected_route_semantics_report_expected_route(self):
        def mutate(_root: Path, template: dict) -> None:
            template["routing_rules"]["implementation"] = "Div1.HCO -> Div3.Treasury -> Div4.Production"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("routing_rules.implementation", joined)
        self.assertIn("expected v1.4.1 route 'Div1.HCO -> Div4.Production'", joined)
        self.assertIn("found 'Div1.HCO -> Div3.Treasury -> Div4.Production'", joined)

    def test_exactly_seven_divisions_boundary(self):
        def mutate(_root: Path, template: dict) -> None:
            template["divisions"] = template["divisions"][:6]

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("expected exactly 7 divisions, found 6", joined)
        self.assertIn("missing BOS Light v1.4.1 division ids", joined)


if __name__ == "__main__":
    unittest.main(verbosity=2)
