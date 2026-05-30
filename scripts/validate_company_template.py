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

EXPECTED_DIVISION_IDS = (
    "Div7.MissionControl",
    "Div1.HCO",
    "Div2.MasterPlanner",
    "Div3.Treasury",
    "Div4.Production",
    "Div5.QualificationsLibraryLearning",
    "Div6.External",
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
    extra_ids = sorted(actual_ids - expected_ids)
    if missing_ids:
        errors.add(TEMPLATE_PATH, "divisions", f"compatibility issue: missing BOS Light v1.4.1 division ids: {', '.join(missing_ids)}")
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

    for rule_name, route_value in sorted(routing_rules.items()):
        context = f"routing_rules.{rule_name}"
        if not isinstance(rule_name, str) or not rule_name.strip():
            errors.add(TEMPLATE_PATH, "routing_rules", "route names must be non-empty strings")
        if not isinstance(route_value, str) or not route_value.strip():
            errors.add(TEMPLATE_PATH, context, "malformed route: value must be a non-empty string")
            continue

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
