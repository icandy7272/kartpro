# Track Semantics Design

Date: 2026-03-30
Project: KartPro
Focus: Phase 1 upgrade of the "world-class racing coach" foundation

## Summary

KartPro already extracts laps, corners, speed traces, racing-line deviations, and coaching-style findings. The current weakness is not lack of data, but lack of a unified race-engineering truth layer. Coaching logic is currently spread across multiple modules and mostly reasons per-corner instead of reasoning about the circuit as a structured system.

This design introduces a new intermediate layer, the `TrackSemanticModel`, between telemetry geometry and coaching logic. The model captures higher-level circuit meaning such as:

- key exit corners / long-straight entry corners
- compound corner candidates
- setup corners / sacrifice-entry corners
- confidence and explanation for each semantic judgment
- low-confidence semantic candidates that can be confirmed or corrected by the user

The first phase uses a hybrid workflow:

- automatic analysis remains the default
- users may still confirm or adjust start/finish and corner geometry through the existing setup flow
- semantic judgments are auto-generated, but low-confidence candidates are surfaced for lightweight confirmation
- the system must prefer conservative uncertainty over confident misclassification
- phase 1 semantic inference is anchored to the existing `session.corners` master list and the fastest-lap reference geometry already used by the product

## Why This Phase Comes First

The product goal is to coach drivers like a world-class racing coach. That requires the system to understand not just "where each corner is" but "what each corner means in the context of the whole lap."

Without this layer, coaching can only say:

- brake later here
- carry more minimum speed there
- exit better from this corner

It cannot reliably say:

- sacrifice this entry to win the next straight
- treat T5 and T6 as one rhythm, not two independent corners
- this is not the slowest corner, but it is the highest ROI corner because its exit dominates the next segment

That is the gap this phase addresses.

## Goals

- Create a single semantic truth layer that sits above lap and corner geometry.
- Make higher-level circuit meaning available to all future coaching outputs.
- Preserve automatic analysis as the default workflow.
- Allow lightweight user confirmation for uncertain semantic judgments.
- Avoid strong coaching conclusions when semantic confidence is low.
- Improve coaching quality in `full-analysis.ts` without redesigning the whole product in the same phase.

## Non-Goals

- Full redesign of the AI chat experience.
- Full redesign of the dashboard layout.
- Replacing the existing manual start/finish and corner editing flow.
- Solving all track-profile persistence and cross-session personalization in this phase.
- Rewriting export, PDF, or VBO workflows.

## Approved Product Decisions

The following choices were validated during brainstorming:

- Use a hybrid approach: automatic first, with targeted user correction where needed.
- In phase 1, users may confirm corner boundaries and numbering, but higher-level track semantics should still be primarily auto-inferred.
- Support both:
  - key exit corners / long-straight entry corners
  - compound corners / sacrifice-entry / setup semantics
- Prioritize correctness of key-exit / long-straight-entry detection over broader semantics.
- If the system is uncertain, prefer surfacing a candidate for confirmation instead of making a confident wrong claim.
- Low-confidence semantics should appear as lightweight candidates with one-click confirm / reject / override, not as a blocking wizard.

## Approaches Considered

### 1. Lightweight patch layer

Add a small semantic tagging pass on top of the current corner list and keep the rest of the architecture as-is.

Pros:

- fast to ship
- low immediate code churn

Cons:

- deepens the existing split-brain architecture
- future coaching logic remains fragmented
- semantics become patchy metadata instead of a stable shared model

### 2. Semantic skeleton layer

Create a dedicated shared circuit semantics layer between telemetry geometry and coaching logic.

Pros:

- gives the system a durable "track meaning" model
- lets coaching, comparisons, and future AI all consume the same truth
- supports explainable confidence and user confirmation cleanly

Cons:

- requires more careful design up front
- touches multiple modules indirectly

### 3. Manual-first semantic authoring

Generate auto suggestions, but require user confirmation of most higher-level semantic labels before coaching uses them.

Pros:

- lowest risk of false semantic claims

Cons:

- too much friction for the first phase
- weakens the product's "smart coach" feel

### Recommendation

Adopt approach 2, but stage delivery like approach 1:

- build the semantic skeleton layer now
- keep the first shipping scope intentionally narrow
- only introduce a small number of high-value semantic types in phase 1

## Architecture

### Layer 1: Telemetry truth layer

Existing layer, still responsible for:

- raw GPS points
- lap detection
- corner detection
- start/finish geometry
- speed and timing metrics

Primary current sources:

- `src/App.tsx`
- `src/lib/analysis/lap-detection.ts`
- `src/lib/analysis/corner-detection.ts`
- `src/lib/analysis/track-analysis.ts`

This layer answers: "What happened geometrically and temporally?"

### Layer 2: Track semantic model

New layer added in this phase.

It transforms geometry into structured circuit meaning:

- which corners matter most for exit propagation
- which adjacent corners behave like one compound rhythm
- which corners should be treated as setup or sacrifice points
- how confident the system is in each conclusion
- which conclusions are safe to use automatically
- which conclusions need confirmation

This layer answers: "What role does each segment play in the lap?"

### Layer 3: Coaching decision layer

Consumes the semantic model plus existing performance data to generate higher-quality coaching.

This layer should stop reasoning from isolated corner heuristics alone and instead reason from:

- strategic role of the corner
- downstream speed propagation
- linked-corner dependencies
- confidence-aware semantics

This layer answers: "What should the driver change, and why does it matter?"

## New Data Model

### `TrackSemanticModel`

Proposed top-level shape:

```ts
interface TrackSemanticModel {
  trackId: string
  version: number
  sourceLapId: number
  corners: CornerSemantic[]
  straights: StraightSemantic[]
  relationships: CornerRelationship[]
  semanticTags: SemanticTag[]
  pendingConfirmations: SemanticConfirmation[]
}
```

### Data ownership and persistence

To stay aligned with the current codebase, the semantic model should have one required home and one optional durable home:

- required in phase 1: attach the model to the current `TrainingSession`
- optional stretch only: persist confirmed / overridden semantic decisions into `TrackProfile`

Concretely:

- `sourceLapId` should refer to the fastest lap already used as the reference lap for corner geometry
- `trackId` should resolve to `matchedProfile.id` when a track profile exists
- if no profile exists yet, scope the semantic model to the current session and do not block phase 1 on cross-session semantic persistence

This keeps phase 1 focused: semantic truth is available immediately inside the active session, while long-term memory remains a follow-up enhancement rather than a hidden requirement.

### `CornerSemantic`

```ts
interface CornerSemantic {
  cornerId: number
  name: string
  startIndex: number
  apexIndex: number
  endIndex: number
  angleDeg: number
  direction: 'left' | 'right'
  baseCornerType: string
  followingStraightLengthM: number
  importanceScore: number
  activeTagTypes: SemanticTag['tagType'][]
}
```

`CornerSemantic` should summarize per-corner geometry and priority context only. It should not become a second source of truth for confirmation state. Final semantic decisions must live in `semanticTags`.

### `StraightSemantic`

```ts
interface StraightSemantic {
  id: string
  fromCornerId: number
  toCornerId: number
  lengthM: number
  isLong: boolean
}
```

### `CornerRelationship`

```ts
interface CornerRelationship {
  type: 'compound-candidate' | 'setup-for-next' | 'exit-dominates-next-segment'
  fromCornerId: number
  toCornerId: number
  confidence: number
  reasonCodes: string[]
}
```

### `SemanticTag`

```ts
interface SemanticTag {
  id: string
  tagType: 'must-hit-exit' | 'compound-corner' | 'sacrifice-entry' | 'setup-corner'
  targetCornerIds: number[]
  confidence: number
  reasonCodes: string[]
  explanation: string
  status: 'auto-active' | 'confirmed-active' | 'rejected' | 'overridden-active'
  sourceTagId?: string
}
```

`SemanticTag` is the single source of truth for whether a semantic claim is currently active, rejected, or manually overridden.

### `SemanticConfirmation`

```ts
interface SemanticConfirmation {
  id: string
  tagType: SemanticTag['tagType']
  targetCornerIds: number[]
  confidence: number
  prompt: string
  recommendation: 'confirm' | 'review'
}
```

## Phase 1 Semantic Types

Phase 1 will support only a narrow set of high-value labels:

- `must-hit-exit`
  - key exit corner
  - long-straight entry corner
- `compound-corner`
  - adjacent corners that should be coached as a linked rhythm
- `setup-corner`
  - corner that primarily exists to prepare the next important segment
- `sacrifice-entry`
  - corner where slower entry may be strategically correct to unlock downstream gain

No broader semantic taxonomy should be added in this phase.

## Inference Strategy

### 1. Build the base track structure

After current auto-analysis completes:

- use the existing corner list
- treat `session.corners` as the canonical geometry for phase 1 semantic inference
- use the fastest/reference lap that already drives corner alignment as the source lap for straight extraction and downstream propagation checks
- derive straight segments between corners
- compute straight lengths
- compute adjacency and local corner-to-corner relationships

This creates a graph-like circuit skeleton rather than a flat list of corners.

### 2. Infer `must-hit-exit`

Primary signals:

- long following straight
- strong correlation between exit performance and lap outcome
- consistent speed propagation after the corner in quick-vs-slow comparisons

This label should be the most reliable in phase 1.

### 3. Infer `compound-corner`

Primary signals:

- very short straight between adjacent corners
- continuous directional rhythm
- strong evidence that quick laps treat the sequence as one combined maneuver

### 4. Infer `setup-corner` / `sacrifice-entry`

Primary signals:

- downstream corner or straight is more important than the current corner in isolation
- slower current entry produces better next-segment outcome
- local per-corner deltas alone do not explain the lap-time effect

### 5. Attach explainable confidence

Confidence must be built from interpretable evidence, not a black-box score only.

Each semantic label should store:

- confidence
- reason codes
- brief explanation string

Example reason codes:

- `LONG_STRAIGHT_AFTER_CORNER`
- `EXIT_SPEED_PROPAGATES`
- `ADJACENT_SHORT_STRAIGHT`
- `LINKED_RHYTHM_PATTERN`
- `DOWNSTREAM_GAIN_EXCEEDS_LOCAL_LOSS`

## Confidence Policy

This phase must prefer conservative failure over wrong certainty.

Suggested behavioral tiers:

- high confidence
  - safe to consume automatically in coaching logic
- medium confidence
  - surface as candidate with confirm / reject / override
- low confidence
  - do not use for strong coaching conclusions
  - may appear as informational candidate only

Exact numeric thresholds are implementation details, but the policy is product-critical.

## User Confirmation Flow

### Existing geometry confirmation

The current manual flow for start/finish and corner editing remains in place.

Users may still:

- fix start/finish
- add or remove corners
- confirm corner ordering and labeling

### New semantic confirmation

Do not introduce a separate heavy wizard in phase 1.

Instead, after geometry is stable:

- generate semantic candidates
- surface only the highest-value uncertain candidates
- allow one-click:
  - confirm
  - reject
  - override
  - skip

### Important principle

User confirmation should write back to the semantic layer, not mutate raw telemetry truth.

That means the system records:

- this label was auto-generated
- this label was user-confirmed
- this label was user-overridden

This preserves explainability and prevents the geometric layer from becoming polluted with coaching-specific edits.

## UI Placement

Phase 1 should keep interaction lightweight.

Recommended placement:

- main analysis page top area or a compact side panel in `Layout.tsx`
- map-adjacent semantic badges for affected corners where appropriate

Avoid:

- chat-only confirmation
- blocking full-screen semantic wizard

The coaching report should summarize circuit understanding, while the map provides spatial anchoring.

## Integration Plan

### New modules

- `src/lib/analysis/semantic-types.ts`
- `src/lib/analysis/track-semantics.ts`
- `src/lib/analysis/semantic-inference.ts`

### Existing modules to extend

- `src/App.tsx`
  - attach semantic inference after geometry analysis is stable
  - store the resulting semantic model on the session object before saving history
- `src/types/index.ts`
  - extend `TrainingSession` with the session-scoped semantic model
  - only add `TrackProfile` semantic cache fields if stretch persistence is explicitly chosen during planning
- `src/lib/storage.ts`
  - persist the session-scoped semantic model with the existing session payload
- `src/components/Layout.tsx`
  - surface pending semantic confirmations
- `src/lib/analysis/full-analysis.ts`
  - consume semantic tags in coaching narrative and training plan
- `src/lib/track-profiles.ts`
  - only touched if planning chooses the optional confirmed-tag cache on matched track profiles

### Optional new UI component

- `src/components/SemanticConfirmationPanel.tsx`

## Runtime integration contract

Implementation planning should assume the following data flow:

1. `App.tsx` or `TrackSetup` finalizes geometry and produces the current `TrainingSession`
2. semantic inference runs from `session.corners`, the fastest/reference lap, and the existing per-lap analyses
3. the resulting `TrackSemanticModel` is attached to the session
4. `generateFullAnalysis(...)` consumes the semantic model and emits semantic-aware coaching outputs
5. report and UI components render those outputs instead of re-inferring semantics locally

Recommended function boundary for phase 1:

```ts
generateFullAnalysis(laps, corners, analyses, semanticModel?)
```

That keeps semantic reasoning centralized in analysis code rather than leaking new heuristics into `Layout.tsx`, `AnalysisReport.tsx`, or `AICoach.tsx`.

## Scope Boundaries for Phase 1

In scope:

- semantic model
- inference pass
- lightweight confirmation UI
- wiring semantic truth into coaching narrative and training plan

Out of scope:

- redesign of the AI coach panel
- export changes
- full historical semantic memory and broad cross-session personalization
- large dashboard redesign
- exhaustive semantic taxonomy

## Error Handling

- If semantic inference fails, existing lap and corner analysis must still work.
- If confidence is low across the board, the product should degrade gracefully:
  - no strong semantic conclusions
  - no aggressive coaching claims based on uncertain semantics
- If users override semantic candidates, downstream coaching must immediately consume the confirmed values.
- Geometry edits must invalidate dependent semantic candidates and regenerate them.
- UI components must never silently fall back to their own corner-role heuristics when a semantic model is missing or stale; they should use existing non-semantic coaching instead.

## Testing Strategy

### Unit tests

- straight extraction between corners
- semantic tag generation for representative synthetic track shapes
- confidence tiering behavior
- invalidation / regeneration after geometry edits

### Integration tests

- auto-analysis -> semantic inference -> report rendering
- geometry confirmation -> semantic regeneration
- semantic confirmation -> coaching output changes

### Product validation

Use a few real track sessions to verify:

- key exit corner detection matches expert intuition
- compound-corner detection is directionally correct
- coaching output becomes more strategic, not just more verbose

## Risks

- Overfitting semantics to the current corner model may create false confidence.
- Phase 1 could become too heavy if too many semantic types are added.
- UI candidate prompts could become noisy if not aggressively prioritized.
- Coaching may still sound corner-local if `full-analysis.ts` consumes tags superficially.

## Open Planning Questions

These do not block the design, but will need concrete decisions during planning:

- what exact confidence thresholds define auto-use vs candidate UI
- whether `must-hit-exit` is represented as one tag or split into separate tags for clarity
- whether phase 1 ships with session-only persistence or also includes the narrow `TrackProfile` confirmed-tag cache as explicit stretch scope

## Expected Outcome

At the end of phase 1, KartPro should be able to say things like:

- "T3 is a key exit corner because it feeds the longest straight."
- "T5 and T6 should be driven as one linked rhythm."
- "T2 is not the biggest isolated time loser, but it is a setup corner for the highest-value exit."

The system should only make those claims when confidence is high or the user has confirmed them.
