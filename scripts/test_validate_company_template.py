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
    ("Div1.Executive", "CEO / Mission Owner", None, "Div1_Executive", "Coherent company direction"),
    ("Div2.MasterPlanner", "Product Planning / Shaping", "Div1.Executive", "Div2_MasterPlanner", "Well-shaped work"),
    ("Div3.Production", "Delivery / Build", "Div1.Executive", "Div3_Production", "Completed accepted artifacts"),
    ("Div4.Operations", "Process / Reliability", "Div1.Executive", "Div4_Operations", "Stable execution flow"),
    ("Div5.Qualifications", "QA / Security / Knowledge", "Div1.Executive", "Div5_Qualifications", "Verified work"),
    ("Div6.Resources", "Budget / Capacity", "Div1.Executive", "Div6_Resources", "Budget-fit work"),
    ("Div7.Strategy", "Decision Protocol / Adaptation", "Div1.Executive", "Div7_Strategy", "High-quality decisions under uncertainty"),
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
            "vague_goal": "Div1.Executive -> Div2.MasterPlanner",
            "backlog_shaping": "Div2.MasterPlanner",
            "implementation": "Div3.Production",
            "process_incident": "Div4.Operations",
            "qa_security_review": "Div5.Qualifications",
            "budget_capacity": "Div6.Resources",
            "complex_decision": "Div7.Strategy",
        },
        "rituals": ["daily_pulse", "weekly_review", "batch_approval_ritual"],
    }


def write_fixture(root: Path, template: dict | None = None) -> None:
    template = copy.deepcopy(template if template is not None else valid_template())
    (root / "company-template").mkdir(parents=True)
    (root / "agents").mkdir(parents=True)
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
            del template["divisions"][2]["vfp"]

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("company-template/bos-company-template.json", joined)
        self.assertIn("Div3.Production", joined)
        self.assertIn("missing field 'vfp'", joined)

    def test_missing_agent_profile_reports_referenced_path(self):
        def mutate(_root: Path, template: dict) -> None:
            template["divisions"][1]["agent_profile"] = "agents/Div2_MasterPlanner/MISSING.md"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("Div2.MasterPlanner.agent_profile", joined)
        self.assertIn("agents/Div2_MasterPlanner/MISSING.md", joined)

    def test_malformed_route_reports_route_context_and_bad_target(self):
        def mutate(_root: Path, template: dict) -> None:
            template["routing_rules"]["implementation"] = "Div3.Production -> Div9.Unknown"

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("routing_rules.implementation", joined)
        self.assertIn("malformed route", joined)
        self.assertIn("Div9.Unknown", joined)

    def test_org_chart_compatibility_gap_reports_missing_division(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_fixture(root)
            (root / "company-template" / "org-chart.mmd").write_text("Div1.Executive\n", encoding="utf-8")
            errors = validator.validate(root)

        joined = "\n".join(errors)
        self.assertIn("company-template/org-chart.mmd", joined)
        self.assertIn("compatibility issue", joined)
        self.assertIn("Div2.MasterPlanner", joined)

    def test_exactly_seven_divisions_boundary(self):
        def mutate(_root: Path, template: dict) -> None:
            template["divisions"] = template["divisions"][:6]

        errors = self.validate_fixture(mutate)
        joined = "\n".join(errors)
        self.assertIn("expected exactly 7 divisions, found 6", joined)
        self.assertIn("missing BOS Light division ids", joined)


if __name__ == "__main__":
    unittest.main(verbosity=2)
