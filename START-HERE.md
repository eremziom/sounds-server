# Infinite Zoom Specification Pack — how to install

This archive is intended to be extracted into the **root** of the existing `sounds-server` repository.

## 1. Inspect before copying

Check for an existing `AGENTS.md`. If it exists, **merge** the new rules rather than replacing the old file. Check whether `docs/infinite-zoom/` already exists and review conflicts.

## 2. Copy files

Copy `docs/infinite-zoom/` into the repository root. Copy or merge `AGENTS.md` into the repository root. `START-HERE.md` is an installation guide and does not need to be committed.

## 3. Commit documentation separately

A documentation-only commit is recommended after review. This archive has **not** changed your GitHub repository.

## 4. Open VS Code / Codex

Open the repository root, not only `apps/ui`. Start a new Codex conversation with:

> Read `AGENTS.md` and `docs/infinite-zoom/README.md`, then `decision-log.md`, `architecture.md`, `implementation-plan.md`, and `acceptance-criteria.md`. Verify the current codebase against the specification. We are preparing IZ-181 Engine Foundation. First show the proposed files and focused tests; do not edit code until I approve.

## 5. Important fidelity note

The pack consolidates **approved architectural outcomes** from a long discussion. It is **not** a verbatim export of every historical message, and does not recreate every sub-ID. Some fine-grained details are intentionally marked as deferred. If you require a literal conversation archive, export it separately from ChatGPT; do not use that archive as the primary implementation specification.
