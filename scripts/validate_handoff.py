from __future__ import annotations

import argparse
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]

ENTRYPOINT_FILES = [
    "README.md",
    "00_START_HERE_FOR_NEW_AI_AGENT.md",
    "docs/archive/HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md",
    "docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md",
    "docs/archive/BOS_M004_DEVELOPMENT_HANDOFF.md",
    "docs/archive/BOS_M005_DEVELOPMENT_HANDOFF.md",
    "docs/archive/HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md",
    "MANIFEST.md",
]

BASELINE_FILES = [
    "docs/archive/03_IMPLEMENTATION_PLAN_V1_2.md",
    "docs/archive/04_DATA_CONTRACTS.md",
    "docs/archive/06_ACCEPTANCE_TESTS.md",
    "agents/Div7_MissionControl/AGENTS.md",
    "agents/Div1_HCO/AGENTS.md",
    "agents/Div2_MasterPlanner/AGENTS.md",
    "agents/Div3_Treasury/AGENTS.md",
    "agents/Div4_Production/AGENTS.md",
    "agents/Div5_QualificationsLibraryLearning/AGENTS.md",
    "agents/Div6_External/AGENTS.md",
    "company-template/bos-company-template.json",
    "plugin-bos-light/src/contracts.ts",
    "plugin-bos-light/src/bpi.ts",
    "plugin-bos-light/tests/acceptance.test.ts",
]

V141_DOCTRINE_FILES = [
    "docs/BOS_Light_v1_4_1_CANONICAL_ORG.md",
    "docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md",
    "docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md",
    "docs/BOS_Light_v1_4_1_Data_Contracts.md",
    "docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md",
]

V141_SKILL_FILES = [
    "skills/SKILL_HCO_ROUTING_CONTROL.md",
    "skills/SKILL_EXTERNAL_IO_GATEWAY.md",
    "skills/SKILL_KNOWLEDGE_QUARANTINE.md",
    "skills/SKILL_DIV5_AUTORESEARCH.md",
    "skills/SKILL_AGENT_STAFFING_AND_HATS.md",
    "skills/SKILL_CIRCUIT_BREAKER_HCO.md",
    "skills/SKILL_TREASURY_BUDGET_ACCESS.md",
]

REQUIRED_FILES = ENTRYPOINT_FILES + BASELINE_FILES + V141_DOCTRINE_FILES + V141_SKILL_FILES

ENTRYPOINT_REQUIRED_TERMS = {
    "README.md": ["v1.4", "validate_handoff.py"],
    "00_START_HERE_FOR_NEW_AI_AGENT.md": ["v1.4", "SKILL_HCO_ROUTING_CONTROL.md", "validation"],
    "docs/archive/HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md": ["v1.4.1", "A12-A20", "validate_handoff.py"],
    "docs/archive/BOS_M002_DEVELOPMENT_HANDOFF.md": ["Canonical doctrine update", "v1.4.1"],
    "docs/archive/BOS_M005_DEVELOPMENT_HANDOFF.md": ["M005", "runtime-evidence", "live"],
    "docs/archive/HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md": ["Canonical doctrine update", "v1.4.1", "A12-A20"],
}

V141_REQUIRED_TERMS = {
    "docs/BOS_Light_v1_4_1_CANONICAL_ORG.md": ["Div1.HCO", "Div6.External", "Package inventory"],
    "docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md": ["v1.4.1", "Div5", "Div6"],
    "docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md": ["external", "Div3", "Div6"],
    "docs/BOS_Light_v1_4_1_Data_Contracts.md": ["RoutingRequest", "ExternalIoRequest", "TrustLevel"],
    "docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md": ["A12", "A20", "acceptance"],
    "skills/SKILL_HCO_ROUTING_CONTROL.md": ["Div1.HCO", "external IO", "Failure behavior"],
    "skills/SKILL_EXTERNAL_IO_GATEWAY.md": ["Div6.External", "quarantine", "Failure behavior"],
    "skills/SKILL_KNOWLEDGE_QUARANTINE.md": ["Div5", "quarantine", "Failure behavior"],
    "skills/SKILL_DIV5_AUTORESEARCH.md": ["Div5", "external", "Failure behavior"],
    "skills/SKILL_AGENT_STAFFING_AND_HATS.md": ["staffing", "hats", "Failure behavior"],
    "skills/SKILL_CIRCUIT_BREAKER_HCO.md": ["circuit", "Div1.HCO", "Failure behavior"],
    "skills/SKILL_TREASURY_BUDGET_ACCESS.md": ["Div3", "budget", "Failure behavior"],
}

MANIFEST_ROW_RE = re.compile(r"^\| `(?P<path>[^`]+)` \| (?P<size>\d+) \| `(?P<sha>[0-9a-f]{64})` \|$")


@dataclass(frozen=True)
class ManifestEntry:
    size: int
    sha256: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_manifest(root: Path) -> dict[str, ManifestEntry]:
    manifest_path = root / "MANIFEST.md"
    if not manifest_path.exists():
        return {}

    entries: dict[str, ManifestEntry] = {}
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        match = MANIFEST_ROW_RE.match(line.strip())
        if match:
            entries[match.group("path")] = ManifestEntry(
                size=int(match.group("size")),
                sha256=match.group("sha"),
            )
    return entries


def iter_manifest_paths(root: Path) -> Iterable[str]:
    excluded_dirs = {"node_modules", "dist", "coverage", "__pycache__"}
    root_resolved = root.resolve()
    for path in sorted(root.rglob("*")):
        rel_path = path.relative_to(root)
        rel = rel_path.as_posix()
        if path.is_dir():
            continue
        if path.is_symlink():
            continue
        try:
            path.resolve().relative_to(root_resolved)
        except ValueError:
            continue
        if any(part.startswith(".") or part in excluded_dirs for part in rel_path.parts):
            continue
        if rel == "MANIFEST.md":
            continue
        yield rel


def _manifest_file(root: Path, rel: str) -> Path:
    path = root / rel
    if path.is_symlink():
        raise ValueError(f"Manifest path escapes repository root or is a symlink: {rel}")
    resolved = path.resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"Manifest path escapes repository root: {rel}") from exc
    return path


def build_manifest(root: Path) -> str:
    lines = [
        "# Manifest",
        "",
        "Generated: 2026-05-30",
        "",
        "| File | Size | SHA256 |",
        "|---|---:|---|",
    ]
    for rel in iter_manifest_paths(root):
        path = _manifest_file(root, rel)
        lines.append(f"| `{rel}` | {path.stat().st_size} | `{sha256_file(path)}` |")
    return "\n".join(lines) + "\n"


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []

    for rel in REQUIRED_FILES:
        path = root / rel
        if path.is_symlink():
            errors.append(f"Required file must not be a symlink: {rel}")
        elif not path.exists():
            errors.append(f"Missing required file: {rel}")
        elif path.is_file() and path.stat().st_size == 0:
            errors.append(f"Empty required file: {rel}")

    for rel, terms in {**ENTRYPOINT_REQUIRED_TERMS, **V141_REQUIRED_TERMS}.items():
        path = root / rel
        if not path.exists() or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        lowered_text = text.lower()
        for term in terms:
            if term.lower() not in lowered_text:
                errors.append(f"Stale or incomplete content: {rel} is missing term {term!r}")

    manifest_entries = parse_manifest(root)
    if not manifest_entries and (root / "MANIFEST.md").exists():
        errors.append("Stale manifest: MANIFEST.md has no parseable file rows")

    for rel in REQUIRED_FILES:
        if rel == "MANIFEST.md":
            continue
        path = root / rel
        if not path.exists() or not path.is_file():
            continue
        entry = manifest_entries.get(rel)
        if entry is None:
            errors.append(f"Stale manifest: missing entry for {rel}")
            continue
        actual_size = path.stat().st_size
        actual_sha = sha256_file(path)
        if entry.size != actual_size:
            errors.append(f"Stale manifest: {rel} size mismatch manifest={entry.size} actual={actual_size}")
        if entry.sha256 != actual_sha:
            errors.append(f"Stale manifest: {rel} sha256 mismatch manifest={entry.sha256} actual={actual_sha}")

    for rel in V141_DOCTRINE_FILES + V141_SKILL_FILES:
        if rel not in manifest_entries and (root / rel).exists():
            errors.append(f"Stale manifest: v1.4.1 package file not inventoried: {rel}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate BOS Light handoff package inventory.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root to validate")
    parser.add_argument("--write-manifest", action="store_true", help="Regenerate MANIFEST.md before validating")
    args = parser.parse_args()

    root = args.root.resolve()
    if args.write_manifest:
        (root / "MANIFEST.md").write_text(build_manifest(root), encoding="utf-8")

    errors = validate(root)
    if errors:
        raise SystemExit("Handoff package validation failed:\n" + "\n".join(f"- {error}" for error in errors))

    print(
        "Handoff package OK: "
        f"{root} ({len(REQUIRED_FILES)} required files; "
        f"{len(V141_DOCTRINE_FILES) + len(V141_SKILL_FILES)} v1.4.1 package files)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
