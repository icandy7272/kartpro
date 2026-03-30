# Track Semantics Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a session-scoped track semantics layer that lets KartPro identify key exit corners, linked corner groups, and setup/sacrifice corners, then use that understanding in coaching output with lightweight user confirmation.

**Architecture:** Add a pure semantic analysis layer above the existing corner geometry instead of sprinkling new heuristics through the UI. The delivery path is: test harness -> track skeleton builder -> conservative semantic inference -> centralized session-derived-data rebuild -> semantic-aware coaching output -> lightweight confirmation panel. Persist semantics on `TrainingSession` in phase 1, and leave `TrackProfile` semantic memory as optional future work.

**Tech Stack:** TypeScript, React 19, Vite, Dexie, Leaflet, Vitest, Testing Library

---

## File Map

### Create

- `src/test/setup.ts`
  - Vitest + Testing Library setup for jsdom assertions.
- `src/lib/analysis/__tests__/analysis-smoke.test.ts`
  - Confirms the repo can run a basic Vitest test before deeper work starts.
- `src/lib/analysis/__tests__/semantic-fixtures.ts`
  - Shared reference-lap, corner, and analysis fixtures for semantic tests.
- `src/lib/analysis/__tests__/semantic-track-semantics.test.ts`
  - Covers straight extraction, wrap-around distance, and relationship scaffolding.
- `src/lib/analysis/__tests__/semantic-inference.test.ts`
  - Covers confidence policy and candidate generation.
- `src/lib/analysis/__tests__/session-derived-data.test.ts`
  - Covers centralized rebuild after initial import and later corner edits.
- `src/lib/analysis/__tests__/semantic-coaching.test.ts`
  - Covers semantic-aware report generation.
- `src/components/__tests__/SemanticConfirmationPanel.test.tsx`
  - Covers confirm / reject / override interactions.
- `src/lib/analysis/semantic-types.ts`
  - Domain contracts for semantic tags, confirmations, and relationships.
- `src/lib/analysis/track-semantics.ts`
  - Builds straight segments and adjacency relationships from `session.corners` plus the reference lap.
- `src/lib/analysis/semantic-inference.ts`
  - Infers high-confidence active tags and medium-confidence confirmation candidates.
- `src/lib/analysis/session-derived-data.ts`
  - Shared rebuild entry point for `analyses` plus `trackSemantics`.
- `src/lib/analysis/semantic-coaching.ts`
  - Converts `TrackSemanticModel` into semantic-aware coaching context for `generateFullAnalysis`.
- `src/lib/analysis/semantic-actions.ts`
  - Pure immutable helpers for confirm / reject / override / skip transitions.
- `src/components/SemanticConfirmationPanel.tsx`
  - Compact panel for pending semantic confirmations.

### Modify

- `package.json`
  - Add test scripts and test-only dev dependencies.
- `package-lock.json`
  - Lock file update for the new test stack.
- `vite.config.ts`
  - Add Vitest configuration using jsdom.
- `src/types/index.ts`
  - Extend `TrainingSession` with `trackSemantics` using a type-only import.
- `src/App.tsx`
  - Replace duplicated session assembly with the shared rebuild helper.
  - Add a real `handleUpdateSession` that persists edited sessions.
- `src/components/Layout.tsx`
  - Use the shared rebuild helper after corner edits.
  - Render the confirmation panel and route semantic actions back into session state.
- `src/components/AnalysisReport.tsx`
  - Show semantic-aware labels and evidence inside the existing coaching section.
- `src/lib/analysis/full-analysis.ts`
  - Accept `semanticModel?` and delegate semantic-specific narrative generation to `semantic-coaching.ts`.

### Verify And Likely Leave Unchanged

- `src/lib/storage.ts`
  - Current session persistence already serializes the full `TrainingSession` payload as JSON, so phase 1 should only touch this file if typings or summary logic force it.
- `src/lib/track-profiles.ts`
  - Do not edit in phase 1 unless stretch-scope profile persistence is explicitly chosen.
- `src/components/AICoach.tsx`
  - Leave chat-panel redesign out of scope for this phase.
- `src/components/TrackMap.tsx`
  - Keep map changes optional; the primary confirmation UI lives in `Layout.tsx`.

## Scope Guardrails

- Keep semantic persistence session-scoped in phase 1.
- Do not redesign the AI chat panel.
- Do not add a heavy multi-step wizard.
- Do not let UI components invent their own semantic heuristics.
- Do not widen the semantic taxonomy beyond:
  - `must-hit-exit`
  - `compound-corner`
  - `setup-corner`
  - `sacrifice-entry`

## Task 1: Add a Real Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/analysis/__tests__/analysis-smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from 'vitest'

describe('analysis test harness', () => {
  it('runs a basic vitest assertion in this repo', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify the harness is missing**

Run: `./node_modules/.bin/vitest run src/lib/analysis/__tests__/analysis-smoke.test.ts`

Expected: FAIL because `vitest` is not installed or configured yet.

- [ ] **Step 3: Install and configure the test stack**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Run the smoke test to verify the harness works**

Run: `npm run test -- src/lib/analysis/__tests__/analysis-smoke.test.ts`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test/setup.ts src/lib/analysis/__tests__/analysis-smoke.test.ts
git commit -m "test: add vitest harness for analysis modules"
```

## Task 2: Build the Semantic Domain and Track Skeleton

**Files:**
- Create: `src/lib/analysis/semantic-types.ts`
- Create: `src/lib/analysis/track-semantics.ts`
- Create: `src/lib/analysis/__tests__/semantic-fixtures.ts`
- Create: `src/lib/analysis/__tests__/semantic-track-semantics.test.ts`

- [ ] **Step 1: Write failing tests for straight extraction and adjacency**

```ts
import { describe, expect, it } from 'vitest'
import { buildTrackSkeleton } from '../track-semantics'
import { makeReferenceLap, makeSemanticCorners } from './semantic-fixtures'

describe('buildTrackSkeleton', () => {
  it('measures straights between each corner exit and the next corner entry', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSemanticCorners(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.straights.map((s) => Math.round(s.lengthM))).toEqual([90, 12, 140])
  })

  it('handles the last-corner wrap back to corner 1', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSemanticCorners(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.straights[2]).toEqual(
      expect.objectContaining({ fromCornerId: 3, toCornerId: 1 })
    )
  })

  it('creates relationship scaffolding for short adjacent connectors', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSemanticCorners(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.relationships).toContainEqual(
      expect.objectContaining({
        type: 'compound-candidate',
        fromCornerId: 2,
        toCornerId: 3,
      })
    )
  })
})
```

- [ ] **Step 2: Run the new test file and verify it fails**

Run: `npm run test -- src/lib/analysis/__tests__/semantic-track-semantics.test.ts`

Expected: FAIL with missing module errors for `semantic-types.ts` / `track-semantics.ts`.

- [ ] **Step 3: Implement the domain types and skeleton builder**

```ts
// semantic-types.ts
export type SemanticTagType =
  | 'must-hit-exit'
  | 'compound-corner'
  | 'setup-corner'
  | 'sacrifice-entry'

export interface TrackSemanticModel {
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

```ts
// track-semantics.ts
export function buildTrackSkeleton(args: {
  corners: Corner[]
  referenceLap: Lap
}): Pick<TrackSemanticModel, 'corners' | 'straights' | 'relationships'> {
  // Measure corner-to-corner straights from the reference lap only.
  // Do not infer tags here.
}
```

- [ ] **Step 4: Run the skeleton tests again**

Run: `npm run test -- src/lib/analysis/__tests__/semantic-track-semantics.test.ts`

Expected: PASS with all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/semantic-types.ts src/lib/analysis/track-semantics.ts src/lib/analysis/__tests__/semantic-fixtures.ts src/lib/analysis/__tests__/semantic-track-semantics.test.ts
git commit -m "feat: add track semantic skeleton builder"
```

## Task 3: Implement Conservative Semantic Inference

**Files:**
- Modify: `src/lib/analysis/semantic-types.ts`
- Create: `src/lib/analysis/semantic-inference.ts`
- Create: `src/lib/analysis/__tests__/semantic-inference.test.ts`
- Modify: `src/lib/analysis/__tests__/semantic-fixtures.ts`

- [ ] **Step 1: Write failing inference tests for confidence policy**

```ts
import { describe, expect, it } from 'vitest'
import { inferTrackSemantics } from '../semantic-inference'
import { makeInferenceFixture } from './semantic-fixtures'

describe('inferTrackSemantics', () => {
  it('marks a long-straight entry corner as high-confidence must-hit-exit', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(model.semanticTags).toContainEqual(
      expect.objectContaining({
        tagType: 'must-hit-exit',
        targetCornerIds: [3],
        status: 'auto-active',
      })
    )
  })

  it('surfaces medium-confidence compound guesses as pending confirmations', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(model.pendingConfirmations).toContainEqual(
      expect.objectContaining({
        tagType: 'compound-corner',
        targetCornerIds: [5, 6],
        recommendation: 'review',
      })
    )
  })

  it('does not auto-activate low-confidence setup or sacrifice labels', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(
      model.semanticTags.some(
        (tag) => tag.tagType === 'setup-corner' && tag.status === 'auto-active'
      )
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run the inference tests to verify they fail**

Run: `npm run test -- src/lib/analysis/__tests__/semantic-inference.test.ts`

Expected: FAIL because `inferTrackSemantics` does not exist yet.

- [ ] **Step 3: Implement conservative inference with explainable confidence**

```ts
const HIGH_CONFIDENCE = 0.8
const MEDIUM_CONFIDENCE = 0.55

if (score >= HIGH_CONFIDENCE) {
  semanticTags.push({
    id,
    tagType,
    targetCornerIds,
    confidence: score,
    reasonCodes,
    explanation,
    status: 'auto-active',
  })
} else if (score >= MEDIUM_CONFIDENCE) {
  pendingConfirmations.push({
    id,
    tagType,
    targetCornerIds,
    confidence: score,
    prompt,
    recommendation: 'review',
  })
}
```

```ts
export function inferTrackSemantics(args: InferTrackSemanticsArgs): TrackSemanticModel {
  const skeleton = buildTrackSkeleton({
    corners: args.corners,
    referenceLap: args.referenceLap,
  })

  // Build only high-confidence active tags by default.
  // Medium confidence becomes confirmation work.
  // Low confidence is omitted from active coaching.
}
```

- [ ] **Step 4: Run the inference tests again**

Run: `npm run test -- src/lib/analysis/__tests__/semantic-inference.test.ts`

Expected: PASS with the confidence policy enforced.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/semantic-types.ts src/lib/analysis/semantic-inference.ts src/lib/analysis/__tests__/semantic-fixtures.ts src/lib/analysis/__tests__/semantic-inference.test.ts
git commit -m "feat: infer conservative track semantics"
```

## Task 4: Centralize Session-Derived Data Rebuild

**Files:**
- Create: `src/lib/analysis/session-derived-data.ts`
- Create: `src/lib/analysis/__tests__/session-derived-data.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Write a failing test for the shared rebuild entry point**

```ts
import { describe, expect, it } from 'vitest'
import { rebuildSessionDerivedData } from '../session-derived-data'
import { makeSessionFixture } from './semantic-fixtures'

describe('rebuildSessionDerivedData', () => {
  it('returns analyses and a semantic model from the same source geometry', () => {
    const fixture = makeSessionFixture()
    const rebuilt = rebuildSessionDerivedData(fixture)

    expect(rebuilt.analyses).toHaveLength(fixture.laps.length)
    expect(rebuilt.trackSemantics?.sourceLapId).toBe(fixture.fastestLapId)
  })

  it('regenerates pending confirmations after corner geometry changes', () => {
    const fixture = makeSessionFixture()
    const rebuilt = rebuildSessionDerivedData({
      ...fixture,
      corners: fixture.corners.slice(0, fixture.corners.length - 1),
    })

    expect(rebuilt.trackSemantics?.pendingConfirmations).not.toEqual(
      fixture.previousPendingConfirmations
    )
  })
})
```

- [ ] **Step 2: Run the rebuild test to verify it fails**

Run: `npm run test -- src/lib/analysis/__tests__/session-derived-data.test.ts`

Expected: FAIL because `session-derived-data.ts` does not exist yet.

- [ ] **Step 3: Implement the shared rebuild helper and wire it into app state**

```ts
// src/types/index.ts
import type { TrackSemanticModel } from '../lib/analysis/semantic-types'

export interface TrainingSession {
  id: string
  filename: string
  date: Date
  laps: Lap[]
  analyses: LapAnalysis[]
  corners: Corner[]
  startFinishLine?: { lat1: number; lng1: number; lat2: number; lng2: number }
  trackSemantics?: TrackSemanticModel
}
```

```ts
// src/lib/analysis/session-derived-data.ts
export function rebuildSessionDerivedData(args: {
  laps: Lap[]
  corners: Corner[]
  startFinishLine?: TrainingSession['startFinishLine']
  filename: string
  date: Date
  trackId?: string
}): Pick<TrainingSession, 'analyses' | 'trackSemantics'> {
  // 1. Rebuild lap analyses against the fastest/reference lap.
  // 2. Run semantic inference from that same canonical geometry.
  // 3. Return both derived outputs together so callers cannot forget one.
}
```

```ts
// src/App.tsx
const handleUpdateSession = useCallback((updated: TrainingSession | null) => {
  setCurrentSession(updated)
  if (updated) {
    saveSession(updated).then(refreshHistory).catch(() => {})
  }
}, [refreshHistory])
```

Use `rebuildSessionDerivedData(...)` in:
- the auto-analysis success path in `App.tsx`
- `handleTrackSetupComplete` in `App.tsx`
- `handleAddCorner` and `handleDeleteCorner` in `Layout.tsx`

- [ ] **Step 4: Run focused tests and a type/build check**

Run: `npm run test -- src/lib/analysis/__tests__/session-derived-data.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/App.tsx src/components/Layout.tsx src/lib/analysis/session-derived-data.ts src/lib/analysis/__tests__/session-derived-data.test.ts
git commit -m "refactor: centralize session analysis and semantic rebuild"
```

## Task 5: Make Coaching Output Semantic-Aware

**Files:**
- Create: `src/lib/analysis/semantic-coaching.ts`
- Create: `src/lib/analysis/__tests__/semantic-coaching.test.ts`
- Modify: `src/lib/analysis/full-analysis.ts`

- [ ] **Step 1: Write failing tests for semantic-aware report generation**

```ts
import { describe, expect, it } from 'vitest'
import { generateFullAnalysis } from '../full-analysis'
import { makeCoachingFixture } from './semantic-fixtures'

describe('generateFullAnalysis with semanticModel', () => {
  it('prioritizes must-hit-exit corners in track strategy output', () => {
    const fixture = makeCoachingFixture()
    const report = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses,
      fixture.semanticModel
    )

    expect(report.trackStrategy.overallApproach).toContain('关键出弯')
    expect(report.trackStrategy.cornerRoles.find((r) => r.corner === 'T3')?.role).toBe('直道入口弯')
  })

  it('treats compound-corner tags as one linked priority zone', () => {
    const fixture = makeCoachingFixture()
    const report = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses,
      fixture.semanticModel
    )

    expect(report.trackStrategy.priorityZones[0]?.zone).toContain('T5→T6')
  })

  it('still returns a valid report when semanticModel is absent', () => {
    const fixture = makeCoachingFixture()

    expect(() =>
      generateFullAnalysis(fixture.laps, fixture.corners, fixture.analyses)
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the coaching tests and verify they fail**

Run: `npm run test -- src/lib/analysis/__tests__/semantic-coaching.test.ts`

Expected: FAIL because `generateFullAnalysis` does not yet accept `semanticModel`.

- [ ] **Step 3: Implement a dedicated semantic coaching adapter**

```ts
// src/lib/analysis/semantic-coaching.ts
export function buildSemanticCoachingContext(args: {
  corners: Corner[]
  analyses: LapAnalysis[]
  semanticModel?: TrackSemanticModel
  cornerScoring: FullAnalysis['cornerScoring']
  lapGroups: FullAnalysis['lapGroups']
}): Pick<FullAnalysis, 'trackStrategy' | 'cornerNarrative'> {
  // Translate tags into:
  // - corner roles
  // - overall approach
  // - priority zones
  // - semantic emphasis inside per-corner comments
}
```

```ts
// src/lib/analysis/full-analysis.ts
export function generateFullAnalysis(
  laps: Lap[],
  corners: Corner[],
  analyses: LapAnalysis[],
  semanticModel?: TrackSemanticModel
): FullAnalysis {
  // Keep existing metrics intact.
  // Move semantic-specific track strategy generation into semantic-coaching.ts.
}
```

Rules for this task:
- keep `theoreticalBest`, `brakingPattern`, `lapGroups`, and raw stats unchanged
- route semantic reasoning through analysis code, not UI code
- when `semanticModel` is missing, keep the current non-semantic coaching behavior instead of throwing

- [ ] **Step 4: Run the coaching tests**

Run: `npm run test -- src/lib/analysis/__tests__/semantic-coaching.test.ts`

Expected: PASS.

Run: `npm run test -- src/lib/analysis/__tests__/semantic-*.test.ts`

Expected: PASS for all semantic analysis tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/full-analysis.ts src/lib/analysis/semantic-coaching.ts src/lib/analysis/__tests__/semantic-coaching.test.ts
git commit -m "feat: feed track semantics into coaching analysis"
```

## Task 6: Add the Lightweight Semantic Confirmation UI

**Files:**
- Create: `src/lib/analysis/semantic-actions.ts`
- Create: `src/components/SemanticConfirmationPanel.tsx`
- Create: `src/components/__tests__/SemanticConfirmationPanel.test.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/AnalysisReport.tsx`

- [ ] **Step 1: Write a failing component test for the confirmation panel**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SemanticConfirmationPanel from '../SemanticConfirmationPanel'

describe('SemanticConfirmationPanel', () => {
  it('renders pending confirmations and routes confirm / reject actions', () => {
    const onConfirm = vi.fn()
    const onReject = vi.fn()

    render(
      <SemanticConfirmationPanel
        confirmations={[
          {
            id: 'cmp-1',
            tagType: 'compound-corner',
            targetCornerIds: [5, 6],
            confidence: 0.64,
            prompt: 'T5 和 T6 是否应该按组合弯处理？',
            recommendation: 'review',
          },
        ]}
        onConfirm={onConfirm}
        onReject={onReject}
        onOverride={vi.fn()}
        onSkip={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /确认/i }))
    expect(onConfirm).toHaveBeenCalledWith('cmp-1')
  })
})
```

- [ ] **Step 2: Run the panel test to verify it fails**

Run: `npm run test -- src/components/__tests__/SemanticConfirmationPanel.test.tsx`

Expected: FAIL because the component and action helpers do not exist yet.

- [ ] **Step 3: Implement pure semantic actions and the compact confirmation UI**

```ts
// src/lib/analysis/semantic-actions.ts
export function confirmSemanticTag(model: TrackSemanticModel, confirmationId: string): TrackSemanticModel {
  // Move the candidate into semanticTags as confirmed-active.
}

export function rejectSemanticTag(model: TrackSemanticModel, confirmationId: string): TrackSemanticModel {
  // Record rejection and remove the pending confirmation.
}
```

```tsx
// src/components/SemanticConfirmationPanel.tsx
export default function SemanticConfirmationPanel(props: {
  confirmations: SemanticConfirmation[]
  onConfirm: (id: string) => void
  onReject: (id: string) => void
  onOverride: (id: string, tagType: SemanticTagType) => void
  onSkip: (id: string) => void
}) {
  // Compact list UI, no modal, no wizard.
}
```

Wire it so that:
- `Layout.tsx` renders the panel near the map/report split
- `Layout.tsx` calls `generateFullAnalysis(laps, corners, session.analyses, session.trackSemantics)` so the report consumes semantic truth instead of stale heuristics
- semantic actions update `session.trackSemantics` immutably
- `onUpdateSession(updatedSession)` is called after every action so the session persists
- `AnalysisReport.tsx` shows semantic labels and evidence inside the existing `教练点评` section

- [ ] **Step 4: Run the panel test plus a build**

Run: `npm run test -- src/components/__tests__/SemanticConfirmationPanel.test.tsx`

Expected: PASS.

Run: `npm run build`

Expected: PASS with the new panel integrated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/semantic-actions.ts src/components/SemanticConfirmationPanel.tsx src/components/__tests__/SemanticConfirmationPanel.test.tsx src/components/Layout.tsx src/components/AnalysisReport.tsx
git commit -m "feat: add semantic confirmation workflow"
```

## Task 7: Final Verification and Manual Smoke

**Files:**
- Modify only if a bug is found during verification.

- [ ] **Step 1: Run the full automated suite**

Run: `npm run test -- --run`

Expected: PASS across analysis and component tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS and generate a production bundle without TypeScript errors.

- [ ] **Step 3: Manual smoke the user flow in the browser**

Checklist:
- upload or load a session and confirm `session.trackSemantics` is created
- verify only medium-confidence tags show in `SemanticConfirmationPanel`
- confirm one pending item and verify the `教练点评` wording updates immediately
- reject one pending item and verify it disappears from the panel
- add or delete a corner and verify semantics regenerate instead of staying stale
- confirm the page still works when semantic inference returns no active tags

- [ ] **Step 4: Commit any verification-only fixes**

```bash
git status --short
git add path/to/fix-1 path/to/fix-2
git commit -m "fix: close semantic coaching verification gaps"
```

Only do this step if manual verification uncovered a real issue that required a code change. Do not stage unrelated dirty-worktree files.
