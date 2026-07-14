---
name: go-linter-specialist
description: "Automates the setup of golangci-lint. Helps create configurations activating optimal linters to balance code quality and false positives."
---

# go-linter-specialist Skill

This skill instructs the agent on how to manage and enforce code quality standard through linters in Go projects.

## golangci-lint Orchestration
When tasked with linting or setting up CI/CD for a project, you must orchestrate `golangci-lint`:
1. **Configuration Generation:** Generate highly optimized `.golangci.yml` configurations that activate necessary specific linters (up to 90+ if helpful).
2. **Critical Linters:** Always ensure indispensable linters are enabled:
   - `errcheck` (for unhandled errors)
   - `govet` (for shadowed variables and standard toolchain checks)
   - `staticcheck` (for deprecated code detection and static analysis)
3. **Balance Quality and Comfort:** Adjust the configuration to disable overly aggressive warnings that do not meaningfully contribute to code quality. Balance rigorous safety with developer comfort.
4. **Integration with Hooks:** Remind the developer to use `PostToolUse` hooks to auto-format files using `go fmt` and `goimports` to save time before linting runs.
