#!/usr/bin/env python3
"""Validate the BOS Light company template package.

The validator is intentionally deterministic and standard-library only so it can run
in a fresh checkout before any Paperclip import tooling or external services exist.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

EXPECTED_DIVISION_PROFILES = {
    "Div7.MissionControl": "agents/Div7_MissionControl/AGENTS.md",
    "Div1.HCO": "agents/Div1_HCO/AGENTS.md",
    "Div2.MasterPlanner": "agents/Div2_MasterPlanner/AGENTS.md",
    "Div3.Treasury": "agents/Div3_Treasury/AGENTS.md",
    "Div4.Production": "agents/Div4_Production/AGENTS.md",
    "Div5.QualificationsLibraryLearning": "agents/Div5_QualificationsLibraryLearning/AGENTS.md",
    "Div6.External": "agents/Div6_External/AGENTS.md",
}
EXPECTED_DIVISION_IDS = tuple(EXPECTED_DIVISION_PROFILES)
EXPECTED_REPORTING_LINES = {
    "Div7.MissionControl": None,
    "Div1.HCO": "Div7.MissionControl",
    "Div2.MasterPlanner": "Div1.HCO",
    "Div3.Treasury": "Div1.HCO",
    "Div4.Production": "Div1.HCO",
    "Div5.QualificationsLibraryLearning": "Div1.HCO",
    "Div6.External": "Div1.HCO",
}
EXPECTED_ROUTING_RULES = {
    "high_level_mission": "Div7.MissionControl -> Div1.HCO",
    "backlog_shaping": "Div1.HCO -> Div2.MasterPlanner",
    "budget_capacity": "Div1.HCO -> Div3.Treasury",
    "implementation": "Div1.HCO -> Div4.Production",
    "qa_security_review": "Div1.HCO -> Div5.QualificationsLibraryLearning",
    "external_io_request": "Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External -> Div5.QualificationsLibraryLearning",
    "paid_credentialed_external_io_request": "Div1.HCO -> Div5.QualificationsLibraryLearning -> Div3.Treasury -> Div6.External -> Div5.QualificationsLibraryLearning",
    "complex_decision": "Div1.HCO -> Div7.MissionControl",
}
EXTERNAL_IO_SECURITY_SNIPPETS = {
    Path("company-template/task-routing.md"): {
        "Div5 local check before external IO": "Div5 checks local knowledge first",
        "Div3 conditional paid/credentialed grant": "Div3.Treasury grants scoped access",
        "Div6-only external IO": "Div6.External is the only division allowed to touch web",
        "Div5 quarantine return": "Div6.External returns raw ExternalEvidencePacket / RawExternalEvidenceBundle output only to Div5.QualificationsLibraryLearning quarantine",
        "sanitized internal consumption": "internal divisions may consume only Div5-produced SanitizedKnowledgePacket",
    },
    Path("agents/Div1_HCO/AGENTS.md"): {
        "Div1 external route governance": "External requests -> Div5 local check -> Div3 grant if paid/credentialed -> Div6 collection -> Div5 quarantine/sanitization",
        "Div1 no external IO": "Div1 does not do external IO",
    },
    Path("agents/Div3_Treasury/AGENTS.md"): {
        "Div3 grants only to Div6": "Grants external API/service access only to Div6.External",
        "Div3 no external IO": "Div3 does not perform external IO",
    },
    Path("agents/Div5_QualificationsLibraryLearning/AGENTS.md"): {
        "Div5 quarantine": "Quarantine raw external evidence",
        "Div5 receives raw Div6 evidence": "Receives raw Div6 evidence only for quarantine/review",
    },
    Path("agents/Div6_External/AGENTS.md"): {
        "Div6 raw evidence destination": "Return raw evidence only to Div5 for quarantine",
        "Div6 must not bypass Div5": "Must not bypass Div5 validation",
    },
    Path("agents/README.md"): {
        "agents README external route": "External world -> Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External -> Div5.QualificationsLibraryLearning quarantine",
        "agents README Div3 conditional": "insert Div3.Treasury before Div6 when paid services, credentials, secrets, or access grants are required",
    },
}
LEGACY_DIVISION_IDS = {
    "Div1.Executive",
    "Div3.Production",
    "Div4.Operations",
    "Div5.Qualifications",
    "Div6.Resources",
    "Div7.Strategy",
}
LEGACY_PROFILE_PREFIXES = (
    "agents/Div1_Executive/",
    "agents/Div3_Production/",
    "agents/Div4_Operations/",
    "agents/Div5_Qualifications/",
    "agents/Div6_Resources/",
    "agents/Div7_Strategy/",
)

TEMPLATE_PATH = Path("company-template/bos-company-template.json")
SUPPORT_ASSETS = (
    Path("company-template/org-chart.mmd"),
    Path("company-template/task-routing.md"),
    Path("company-template/rituals.md"),
    Path("agents/README.md"),
)
REQUIRED_TEMPLATE_FIELDS = ("schema_version", "name", "mission", "divisions", "routing_rules", "rituals")
REQUIRED_DIVISION_FIELDS = ("id", "title", "reports_to", "agent_profile", "vfp")
DIVISION_TOKEN_RE = re.compile(r"\bDiv[1-7]\.[A-Za-z][A-Za-z0-9]*\b")


class ValidationErrorCollector:
    """Collect validation failures so one run reports all actionable context."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, path: Path | str, context: str, message: str) -> None:
        self.errors.append(f"{path}: {context}: {message}")

    def extend(self, failures: Iterable[tuple[Path | str, str, str]]) -> None:
        for path, context, message in failures:
            self.add(path, context, message)


def _display_path(root: Path, path: Path) -> Path:
    try:
        return path.resolve().relative_to(root.resolve())
    except ValueError:
        return path


def _load_template(root: Path, errors: ValidationErrorCollector) -> dict[str, Any] | None:
    template_file = root / TEMPLATE_PATH
    display_path = _display_path(root, template_file)
    if not template_file.exists():
        errors.add(display_path, "file", "missing required company template")
        return None
    try:
        loaded = json.loads(template_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.add(display_path, "json", f"malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return None
    except OSError as exc:
        errors.add(display_path, "file", f"unable to read template: {exc.strerror or exc}")
        return None
    if not isinstance(loaded, dict):
        errors.add(display_path, "json", "top-level value must be an object")
        return None
    return loaded


def _require_template_fields(template: Mapping[str, Any], errors: ValidationErrorCollector) -> None:
    for field in REQUIRED_TEMPLATE_FIELDS:
        if field not in template:
            errors.add(TEMPLATE_PATH, field, "missing required template field")


def _validate_divisions(template: Mapping[str, Any], root: Path, errors: ValidationErrorCollector) -> set[str]:
    raw_divisions = template.get("divisions")
    if not isinstance(raw_divisions, list):
        errors.add(TEMPLATE_PATH, "divisions", "missing field or value is not a list")
        return set()

    if len(raw_divisions) != 7:
        errors.add(TEMPLATE_PATH, "divisions", f"expected exactly 7 divisions, found {len(raw_divisions)}")

    division_ids: list[str] = []
    for index, division in enumerate(raw_divisions):
        context_id = f"divisions[{index}]"
        if not isinstance(division, dict):
            errors.add(TEMPLATE_PATH, context_id, "division entry must be an object")
            continue

        division_id = division.get("id")
        if isinstance(division_id, str) and division_id.strip():
            context_id = division_id
            division_ids.append(division_id)
        else:
            errors.add(TEMPLATE_PATH, f"divisions[{index}].id", "missing field or value is not a non-empty string")

        for field in REQUIRED_DIVISION_FIELDS:
            if field not in division:
                errors.add(TEMPLATE_PATH, context_id, f"missing field '{field}'")

        _validate_division_field_types(division, context_id, errors)
        _validate_agent_profile(division, context_id, root, errors)

    duplicates = sorted({division_id for division_id in division_ids if division_ids.count(division_id) > 1})
    for division_id in duplicates:
        errors.add(TEMPLATE_PATH, division_id, "duplicate division id")

    actual_ids = set(division_ids)
    expected_ids = set(EXPECTED_DIVISION_IDS)
    missing_ids = sorted(expected_ids - actual_ids)
    legacy_ids = sorted(actual_ids & LEGACY_DIVISION_IDS)
    extra_ids = sorted(actual_ids - expected_ids)
    if missing_ids:
        errors.add(TEMPLATE_PATH, "divisions", f"compatibility issue: missing BOS Light v1.4.1 division ids: {', '.join(missing_ids)}")
    if legacy_ids:
        errors.add(TEMPLATE_PATH, "divisions", f"compatibility issue: legacy division ids are not active BOS Light v1.4.1 ids: {', '.join(legacy_ids)}")
    if extra_ids:
        errors.add(TEMPLATE_PATH, "divisions", f"compatibility issue: unknown BOS Light v1.4.1 division ids: {', '.join(extra_ids)}")

    _validate_reports_to(raw_divisions, actual_ids, errors)
    return actual_ids


def _validate_division_field_types(
    division: Mapping[str, Any], context_id: str, errors: ValidationErrorCollector
) -> None:
    for field in ("id", "title", "agent_profile", "vfp"):
        value = division.get(field)
        if field in division and not (isinstance(value, str) and value.strip()):
            errors.add(TEMPLATE_PATH, f"{context_id}.{field}", "value must be a non-empty string")
    if "reports_to" in division:
        reports_to = division.get("reports_to")
        if reports_to is not None and not (isinstance(reports_to, str) and reports_to.strip()):
            errors.add(TEMPLATE_PATH, f"{context_id}.reports_to", "value must be null or a non-empty division id")


def _validate_agent_profile(
    division: Mapping[str, Any], context_id: str, root: Path, errors: ValidationErrorCollector
) -> None:
    profile_value = division.get("agent_profile")
    if not isinstance(profile_value, str) or not profile_value.strip():
        return

    profile_path = Path(profile_value)
    if profile_path.is_absolute() or ".." in profile_path.parts:
        errors.add(TEMPLATE_PATH, f"{context_id}.agent_profile", "profile path must be relative and stay inside the repository")
        return

    absolute_profile = root / profile_path
    display_profile = _display_path(root, absolute_profile)
    if not absolute_profile.exists():
        errors.add(TEMPLATE_PATH, f"{context_id}.agent_profile", f"missing agent profile: {display_profile}")
        return
    if not absolute_profile.is_file():
        errors.add(TEMPLATE_PATH, f"{context_id}.agent_profile", f"agent profile is not a file: {display_profile}")
        return

    try:
        profile_text = absolute_profile.read_text(encoding="utf-8")
    except OSError as exc:
        errors.add(display_profile, "file", f"unable to read agent profile: {exc.strerror or exc}")
        return

    division_id = division.get("id")
    expected_profile = EXPECTED_DIVISION_PROFILES.get(division_id) if isinstance(division_id, str) else None
    if expected_profile is not None and profile_value != expected_profile:
        stale_prefix = next((prefix for prefix in LEGACY_PROFILE_PREFIXES if profile_value.startswith(prefix)), None)
        reason = "stale legacy profile path" if stale_prefix is not None else "non-canonical profile path"
        errors.add(
            TEMPLATE_PATH,
            f"{context_id}.agent_profile",
            f"{reason}: expected '{expected_profile}', found '{profile_value}'",
        )

    if isinstance(division_id, str) and division_id not in profile_text:
        errors.add(display_profile, division_id, "compatibility issue: profile does not mention its division id")


def _validate_reports_to(
    raw_divisions: Sequence[Any], division_ids: set[str], errors: ValidationErrorCollector
) -> None:
    for index, division in enumerate(raw_divisions):
        if not isinstance(division, dict):
            continue
        division_id = division.get("id") if isinstance(division.get("id"), str) else f"divisions[{index}]"
        reports_to = division.get("reports_to")
        if isinstance(reports_to, str) and reports_to not in division_ids:
            errors.add(TEMPLATE_PATH, f"{division_id}.reports_to", f"unknown reporting target '{reports_to}'")
        if reports_to == division_id:
            errors.add(TEMPLATE_PATH, f"{division_id}.reports_to", "division cannot report to itself")
        expected_reports_to = EXPECTED_REPORTING_LINES.get(division_id) if isinstance(division_id, str) else None
        if division_id in EXPECTED_REPORTING_LINES and reports_to != expected_reports_to:
            expected_display = "null" if expected_reports_to is None else repr(expected_reports_to)
            found_display = "null" if reports_to is None else repr(reports_to)
            errors.add(
                TEMPLATE_PATH,
                f"{division_id}.reports_to",
                f"compatibility issue: expected v1.4.1 reporting target {expected_display}, found {found_display}",
            )


def _parse_route_targets(route_value: str) -> tuple[list[str], list[str]]:
    segments = [segment.strip() for segment in route_value.split("->")]
    malformed_segments = [segment for segment in segments if not segment]
    targets: list[str] = []
    for segment in segments:
        matches = DIVISION_TOKEN_RE.findall(segment)
        if not matches and segment:
            malformed_segments.append(segment)
        targets.extend(matches)
    return targets, malformed_segments


def _validate_routing_rules(template: Mapping[str, Any], division_ids: set[str], errors: ValidationErrorCollector) -> set[str]:
    routing_rules = template.get("routing_rules")
    referenced_targets: set[str] = set()
    if not isinstance(routing_rules, dict) or not routing_rules:
        errors.add(TEMPLATE_PATH, "routing_rules", "missing field or value is not a non-empty object")
        return referenced_targets

    expected_rule_names = set(EXPECTED_ROUTING_RULES)
    actual_rule_names = {rule_name for rule_name in routing_rules if isinstance(rule_name, str)}
    missing_rules = sorted(expected_rule_names - actual_rule_names)
    extra_rules = sorted(actual_rule_names - expected_rule_names)
    for rule_name in missing_rules:
        errors.add(TEMPLATE_PATH, f"routing_rules.{rule_name}", f"missing v1.4.1 routing rule; expected route '{EXPECTED_ROUTING_RULES[rule_name]}'")
    for rule_name in extra_rules:
        errors.add(TEMPLATE_PATH, f"routing_rules.{rule_name}", "unknown routing rule is not part of the active v1.4.1 contract")

    for rule_name, route_value in sorted(routing_rules.items()):
        context = f"routing_rules.{rule_name}"
        if not isinstance(rule_name, str) or not rule_name.strip():
            errors.add(TEMPLATE_PATH, "routing_rules", "route names must be non-empty strings")
        if not isinstance(route_value, str) or not route_value.strip():
            errors.add(TEMPLATE_PATH, context, "malformed route: value must be a non-empty string")
            continue

        expected_route = EXPECTED_ROUTING_RULES.get(rule_name)
        if expected_route is not None and route_value != expected_route:
            errors.add(
                TEMPLATE_PATH,
                context,
                f"compatibility issue: expected v1.4.1 route '{expected_route}', found '{route_value}'",
            )

        targets, malformed_segments = _parse_route_targets(route_value)
        if malformed_segments:
            errors.add(TEMPLATE_PATH, context, f"malformed route segment(s): {', '.join(repr(s) for s in malformed_segments)}")
        if not targets:
            errors.add(TEMPLATE_PATH, context, "malformed route: no division targets found")
            continue
        for target in targets:
            referenced_targets.add(target)
            if target not in division_ids:
                errors.add(TEMPLATE_PATH, context, f"malformed route target '{target}' is not a declared division")

    unrouted = sorted(division_ids - referenced_targets)
    if unrouted:
        errors.add(TEMPLATE_PATH, "routing_rules", f"compatibility issue: divisions not referenced by any route: {', '.join(unrouted)}")
    return referenced_targets


def _validate_support_assets(
    template: Mapping[str, Any], division_ids: set[str], routed_targets: set[str], root: Path, errors: ValidationErrorCollector
) -> None:
    asset_text: dict[Path, str] = {}
    for relative_path in SUPPORT_ASSETS:
        asset_file = root / relative_path
        if not asset_file.exists():
            errors.add(relative_path, "file", "missing required support asset")
            continue
        try:
            asset_text[relative_path] = asset_file.read_text(encoding="utf-8")
        except OSError as exc:
            errors.add(relative_path, "file", f"unable to read support asset: {exc.strerror or exc}")

    org_chart = asset_text.get(Path("company-template/org-chart.mmd"), "")
    if org_chart:
        for division_id in sorted(division_ids):
            if division_id not in org_chart:
                errors.add("company-template/org-chart.mmd", division_id, "compatibility issue: org chart does not include division")

    routing_doc = asset_text.get(Path("company-template/task-routing.md"), "")
    if routing_doc:
        for division_id in sorted(routed_targets or division_ids):
            if division_id not in routing_doc:
                errors.add("company-template/task-routing.md", division_id, "compatibility issue: task routing doc does not include routed division")

    rituals_doc = asset_text.get(Path("company-template/rituals.md"), "")
    if rituals_doc:
        raw_rituals = template.get("rituals")
        if not isinstance(raw_rituals, list):
            errors.add(TEMPLATE_PATH, "rituals", "missing field or value is not a list")
        else:
            for ritual in raw_rituals:
                if not isinstance(ritual, str) or not ritual.strip():
                    errors.add(TEMPLATE_PATH, "rituals", "ritual values must be non-empty strings")
                    continue
                readable = ritual.replace("_", " ").title()
                if readable not in rituals_doc and ritual not in rituals_doc:
                    errors.add("company-template/rituals.md", ritual, "compatibility issue: rituals doc does not include template ritual")

    agents_readme = asset_text.get(Path("agents/README.md"), "")
    if agents_readme:
        for division_id in sorted(division_ids):
            if division_id not in agents_readme:
                errors.add("agents/README.md", division_id, "compatibility issue: agents README does not include division")

    _validate_external_io_security_snippets(root, errors)


def _validate_external_io_security_snippets(root: Path, errors: ValidationErrorCollector) -> None:
    """Reject active docs/profiles that weaken the v1.4.1 external-IO quarantine route."""

    for relative_path, snippets in EXTERNAL_IO_SECURITY_SNIPPETS.items():
        asset_file = root / relative_path
        if not asset_file.exists():
            # The normal support/profile validation reports missing files; avoid duplicate noise here.
            continue
        try:
            asset_text = asset_file.read_text(encoding="utf-8")
        except OSError:
            # The normal support/profile validation reports unreadable files; avoid duplicate noise here.
            continue
        for context, required_snippet in snippets.items():
            if required_snippet not in asset_text:
                errors.add(
                    relative_path,
                    context,
                    f"external IO security invariant missing: expected text {required_snippet!r}",
                )


def validate(root: Path) -> list[str]:
    root = root.resolve()
    errors = ValidationErrorCollector()
    template = _load_template(root, errors)
    if template is None:
        return errors.errors

    _require_template_fields(template, errors)
    division_ids = _validate_divisions(template, root, errors)
    routed_targets = _validate_routing_rules(template, division_ids, errors)
    _validate_support_assets(template, division_ids, routed_targets, root, errors)
    return errors.errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate BOS Light company template import assets.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root containing company-template/ and agents/ (default: parent of scripts/).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    errors = validate(args.root)
    if errors:
        print("Company template validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Company template OK: 7 divisions, 7 agent profiles, org chart, routing, rituals, and agents README are compatible.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
