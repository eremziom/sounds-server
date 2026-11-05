# Codex instructions — sounds-server / Infinite Zoom

> **Proposed repository-root instructions.** Before copying into a repository, check whether an `AGENTS.md` already exists. If it does, **merge** these rules; do not overwrite existing project instructions.

## Scope
- The authoritative Infinite Zoom specification is `docs/infinite-zoom/README.md` and the documents linked from it.
- Before working on Infinite Zoom, read `README.md`, `architecture.md`, `decision-log.md`, `implementation-plan.md`, and the document relevant to the task.
- Specifications describe **intended behavior**, not necessarily current repository implementation. Inspect actual source before making changes.
- If specification and code differ, report the discrepancy; do not silently discard the specification or rewrite unrelated application code.
- User-approved decisions override earlier superseded proposals. See `decision-log.md`.
- Do not implement new features or modify the repository unless the current user request authorizes implementation.

## Integration invariants
- Preserve existing `ApplicationRuntime`, `MediaRuntime`, and the protected `/animations` route.
- Existing React Bits/WebThreads visualization is experimental; **do not reuse its animation implementation** as Infinite Zoom.
- One visual journey and one renderer; switching `background` ↔ `immersive` does not restart audio, animation, or camera.
- Audio playback must wait for critical visual readiness. Visual simulation starts on confirmed audio playback, not merely a Play click.
- Audio pause, stop, and end **freeze and preserve** the journey; subsequent audio Play resumes it. Only explicit `reset()` restarts the journey.
- `dispose()` is terminal and releases resources. Authentication/session teardown may dispose; track end must not.
- `registerStop` in MediaRuntime is an application teardown hook, **not** a per-track stop event.
- A source change does not by itself reset the journey; seeking does not reset it.
- Simulation advances in fixed 1/60-second steps, with deterministic inputs and seeded randomness. Do not bind animation progress to React rerenders.
- Never sacrifice coverage to improve rendering quality. Transitions require coverage validation and camera continuity.
- Never let an Infinite Zoom failure stop or manipulate music after audio playback has begun.
- Full Audio Data Contract, Journey Planner, all 12 behaviors, full Artwork Production Pipeline, and WebGPU are **outside the first vertical slice**.

## Engineering workflow
1. Inspect actual code and existing tests; identify ownership and potential conflicts.
2. Propose a bounded file-level change, then implement only the authorized scope.
3. Add focused tests for changed modules and direct dependencies; run those first.
4. Avoid running the entire monorepo suite on every minor edit. Run broader validation for shared infrastructure changes and before release.
5. Report changed files, test commands/results, and unresolved risks.
6. No commits, pushes, branches, PRs, or destructive operations unless explicitly requested.

## Code organization — intended, verify before creation
- Engine: `apps/ui/src/engines/infinite-zoom/`
- React adapter/presentation: `apps/ui/src/components/infinite-zoom/`
- Documents: `docs/infinite-zoom/`
- Avoid creating parallel audio elements, Web Audio graphs, simulation clocks, or WebGL renderers.

## Important caution
This pack is a consolidated design specification reconstructed from the approved discussions, **not a verbatim transcript**. The original discussion spans IZ-001–IZ-180, BL-001–BL-088, APP-001–APP-048; not every historical sub-ID is reproduced. Do not invent missing historical details or claim the pack is a line-by-line archival record.
