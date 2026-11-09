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
- `zoomThrough` MUST follow `docs/infinite-zoom/zoomthrough-contract.md` (user clarification, 2026-11-05): B is initially a very small, visible, integral element in an authored portal region of A; the travel command must not introduce B.
- Latest user amendment (2026-11-05): Forest -> Nebula uses independent destination zoom. B stops at its original full-frame view while A continues until its authored portal fills the viewport. This supersedes the shared-camera/fixed rendered B-root requirement for this pair. Preserve one journey/renderer/clock and the source-authored aperture; see the latest amendment in `docs/infinite-zoom/zoomthrough-contract.md`. The authored Nebula -> Underwater Cavern link uses the same policy. Other portals retain fixed placement and common-camera growth unless explicitly configured.
- Distinguish the source portal region in A from the destination anchor in B. Preserve visual composition and C0/C1 camera continuity at handoff; coverage/stability tests alone do not establish visual acceptance.
- Never let an Infinite Zoom failure stop or manipulate music after audio playback has begun.
- Full Audio Data Contract, Journey Planner, all 12 behaviors, full Artwork Production Pipeline, and WebGPU are **outside the first vertical slice**.

## Engineering workflow

### Mandatory artwork authoring instructions
- For every new or revised Infinite Zoom artwork, read and follow
  [the shared artwork-authoring guidelines](apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md)
  before writing a scene brief, generating/editing images, authoring masks or
  packaging the artwork. These rules apply regardless of subject or style.
- Include the guideline version/link and scene-specific application in the
  package's `authoring-brief.md`; carry relevant requirements into each generation
  or editing prompt. Do not assume image tools read repository instructions.
- Every new or revised artwork, regardless of theme/style, must include a large
  number of integrated material details for local impulse lighting. Follow the
  shared guidelines for distribution, masks, timing and visual acceptance; generic
  detached lines/dots do not satisfy this requirement.
- Every new or revised artwork must also support optional complete environmental
  blackout while separately lit regions retain their animated colors/impulses
  from the first frame. Follow the shared guidelines for masks, smooth reveal,
  shadow precision, pause behavior and actual motion/zoom acceptance.
- Report motion/zoom QA evidence, uncertain boundaries and remaining corrections.
  A still preview or changed-pixel test alone does not establish production readiness.
- Every new or revised artwork must plan at least one element that travels
  through the visible frame as an integral part of its composition. Follow the
  shared guidelines for placement, trajectory, separated layers, background,
  occlusion and motion/zoom acceptance; camera motion alone does not qualify.
- Describe engine extensions separately from artwork production. A future creator
  must consume the shared guidelines rather than maintain a divergent copy.

### Implementation workflow
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
