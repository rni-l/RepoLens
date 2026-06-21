# Hierarchical Tags Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one unified multi-level tag system where each project can be assigned to multiple tag nodes, with AI-assisted tag suggestions that require user confirmation.

**Architecture:** Keep tags as a first-class tree in SQLite and keep project assignment as a many-to-many join. Existing flat string tags migrate into root-level tag nodes so current data keeps working while the UI moves to hierarchical paths. AI generation is an optional suggestion layer that reads project metadata and the existing tag tree, returns candidate tag paths, and only persists changes after the user accepts them.

**Tech Stack:** React, TypeScript, Vite, Node.js, SQLite via `node:sqlite`, Tauri command bridge, provider-agnostic AI tag suggestion adapter.

---

## Product Spec

RepoLens has one manual organization model: hierarchical tags.

Do not add a separate category model. A tag can have a parent tag, and a project can be linked to multiple tags from anywhere in the tree.

Examples:

```txt
业务域 / 水健康 / 数据转换
业务域 / 清洁客服 / 训练数据
项目类型 / CLI 工具
项目类型 / Web App
维护状态 / 高频使用
```

Project assignment examples:

```txt
water-product-transform-info
- 业务域 / 水健康 / 数据转换
- 项目类型 / CLI 工具
- 维护状态 / 高频使用

myself-todo
- 项目类型 / Web App
- 维护状态 / 自用核心
```

Filtering by a parent tag includes all descendants. Filtering by `业务域 / 水健康` should include projects tagged with `业务域 / 水健康 / 数据转换`.

Searching by text should match tag names and full tag paths. Searching `水健康` or `数据转换` should find projects assigned to `业务域 / 水健康 / 数据转换`.

The project detail panel should show assigned tags as readable full paths. The project table can show compact chips using the leaf name first, with the full path available through title text.

## Scope

In scope:

- Create, update, delete, and list hierarchical tags.
- Assign multiple tag nodes to a project.
- Preserve current flat project tags by migrating each existing string tag into a root-level tag.
- Filter projects by one or more tag IDs.
- Include descendant tags when filtering by a parent tag.
- Search projects by assigned tag name and full path.
- Generate AI-assisted tag suggestions for a single project.
- Accept AI suggestions by creating missing tag path nodes and linking the project.
- Update mock API data so the Vite-only app demonstrates the behavior.

Out of scope for this iteration:

- Tag colors and icons.
- Drag-and-drop tag tree reordering.
- Bulk assignment across many selected projects.
- Fully automatic AI assignment without user review.
- Batch AI tagging across the full project library.
- Tag aliases or synonyms.
- Import/export.

## Data Model

Add a `tags` table and replace string-based assignments with tag IDs.

```sql
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(parent_id, name),
  FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_tag_links (
  project_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (project_id, tag_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_path ON tags(path);
CREATE INDEX IF NOT EXISTS idx_project_tag_links_tag_id ON project_tag_links(tag_id);
```

Keep the existing `project_tags` table only as migration input. After migration succeeds, new code should read and write `project_tag_links`.

Recommended path format:

```txt
业务域/水健康/数据转换
```

Use `/` as the storage delimiter and render it as `业务域 / 水健康 / 数据转换` in the UI. Trim whitespace around names. Reject empty names. Reject `/` in tag names for the first version to avoid ambiguous paths.

## Type Contracts

Modify `src/shared/types.ts` and re-export from `src/lib/types.ts`.

```ts
export type TagNode = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  depth: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectTag = {
  id: string;
  name: string;
  path: string;
};

export type TagCreateInput = {
  name: string;
  parentId?: string | null;
};

export type TagUpdatePatch = {
  name?: string;
  parentId?: string | null;
};

export type AiTagSuggestion = {
  id: string;
  kind: "existing_tag" | "new_tag_path";
  tagId?: string;
  path: string;
  segments: string[];
  confidence: number;
  rationale: string;
  sourceFields: Array<
    | "name"
    | "path"
    | "description"
    | "readmeSummary"
    | "techStacks"
    | "commands"
    | "entryFiles"
  >;
};

export type GenerateTagSuggestionsInput = {
  projectId: string;
  maxSuggestions?: number;
  allowNewTags?: boolean;
};

export type GenerateTagSuggestionsResult = {
  projectId: string;
  suggestions: AiTagSuggestion[];
  model: string;
  promptPreview: string;
  createdAt: string;
};

export type ApplyTagSuggestionsInput = {
  projectId: string;
  suggestions: Array<{
    tagId?: string;
    segments: string[];
  }>;
  mode: "append" | "replace";
};

export type AiTaggingStatus = {
  available: boolean;
  provider: string;
  model: string | null;
  reason?: "not_configured" | "disabled";
};
```

Change projects from string tags to structured tags:

```ts
export type ProjectListItem = {
  // existing fields...
  tags: ProjectTag[];
};

export type ProjectUpdatePatch = {
  // existing fields...
  tagIds?: string[];
};

export type ProjectFilters = {
  // existing fields...
  tagIds?: string[];
};
```

Extend `AppApi`:

```ts
listTags(): Promise<TagNode[]>;
createTag(input: TagCreateInput): Promise<TagNode>;
updateTag(id: string, patch: TagUpdatePatch): Promise<TagNode>;
deleteTag(id: string): Promise<void>;
getAiTaggingStatus(): Promise<AiTaggingStatus>;
generateTagSuggestions(input: GenerateTagSuggestionsInput): Promise<GenerateTagSuggestionsResult>;
applyTagSuggestions(input: ApplyTagSuggestionsInput): Promise<ProjectDetail>;
```

## Backend Behavior

`RepoLensDatabase.migrate()` should create the new tables and run an idempotent migration from old flat tags:

1. Read distinct `project_tags.tag`.
2. Create one root-level row in `tags` for each distinct string.
3. Link each project to the matching tag in `project_tag_links`.
4. Leave `project_tags` in place during this iteration for rollback safety, but stop writing to it.

Tag IDs should be deterministic from the full path so repeated migration is safe:

```ts
idFromPath("tag", tagPath)
```

When creating or moving a tag, recompute `path` for that tag and every descendant. Prevent cycles by rejecting a move when the new parent is the tag itself or any descendant.

When deleting a tag, delete its descendants through `ON DELETE CASCADE`. Project links should disappear through foreign keys.

When updating a project's tags, replace all project links with the provided `tagIds`. Ignore duplicate IDs, reject unknown IDs, and preserve existing project field behavior for description/start/test commands.

`listProjects(filters)` should support tag filtering:

- If `filters.tagIds` is empty or absent, no tag filter is applied.
- For each selected tag ID, collect that tag plus descendants by `path`.
- A project matches if it has at least one linked tag inside the selected tag subtrees.
- Query search should include `tags.name` and `tags.path`.

## AI-Assisted Tag Generation

AI assistance should help the user create and assign multi-level tags, but it must not become an unreviewed background mutation.

The first version supports project-level suggestions:

1. User selects one project.
2. User clicks `AI 建议标签`.
3. Backend builds a small metadata payload from that project and the current tag tree.
4. AI returns up to `maxSuggestions` candidate tag paths.
5. UI shows each suggestion with path, confidence, and rationale.
6. User chooses suggestions to apply.
7. Backend creates missing path nodes if needed and links the project.

Default metadata payload:

```ts
type AiTagProjectPayload = {
  project: {
    name: string;
    path: string;
    description: string;
    readmeSummary: string | null;
    techStacks: string[];
    startCommand: string | null;
    testCommand: string | null;
    entryFiles: string[];
  };
  existingTags: Array<{
    id: string;
    path: string;
  }>;
};
```

Privacy rule: do not send source-code file contents in this iteration. Use project metadata already stored in RepoLens. If README content is needed later, add a separate opt-in because README files can contain internal details.

Provider rule: keep the backend AI integration behind a small adapter so the app is not hard-wired to one vendor.

```ts
export type AiTagProvider = {
  name: string;
  model: string;
  generateTagSuggestions(payload: AiTagProjectPayload): Promise<AiTagSuggestion[]>;
};
```

MVP provider behavior:

- Add a deterministic mock provider for tests and Vite-only demo mode.
- Add an OpenAI-compatible provider adapter only if `REPOLENS_AI_API_KEY` is configured.
- Store non-secret config, such as provider and model, in `app_settings`.
- Do not store API keys in SQLite. Use environment variables for MVP; use OS keychain later if needed.

AI output validation:

- Parse model output as JSON only.
- Require `segments` as a non-empty string array.
- Trim every segment.
- Reject empty segments.
- Reject segments containing `/`.
- Normalize confidence into `0..1`.
- Match an existing tag by exact path before creating a new path.
- Deduplicate suggestions by normalized path.
- Cap returned suggestions to `maxSuggestions`, default `5`.

Suggested prompt contract:

```txt
You suggest hierarchical tags for a local code project.
Prefer existing tag paths when they fit.
Only create new paths when existing tags are not enough.
Return JSON with suggestions only.
Each suggestion must include segments, confidence, rationale, and sourceFields.
Do not suggest technology stack tags when techStacks already captures that information unless it is useful for organization.
```

Applying suggestions must be idempotent. If `segments` already resolve to an existing tag path, reuse that tag. If not, create missing ancestors and the leaf tag, then link the project to the leaf tag.

## Frontend Behavior

Add a tag management surface without turning the app into a settings maze.

Recommended first UI:

- Add a sidebar nav item: `标签`.
- Add a `TagTreePanel` in the right-side stack or a new page section.
- Add a `ProjectTagPicker` inside `ProjectDetailPanel`.
- Add tag filter chips/dropdown to `ProjectSearchBar`.
- Add an `AiTagSuggestionPanel` in `ProjectDetailPanel` for project-level suggestions.

The detail panel should save tag assignment by `tagIds`:

```ts
onSave({
  description,
  startCommand: startCommand.trim() || null,
  testCommand: testCommand.trim() || null,
  tagIds: selectedTagIds
});
```

The project table should render assigned tags:

```tsx
project.tags.slice(0, 4).map((tag) => (
  <span className="tag" key={tag.id} title={tag.path}>
    {tag.name}
  </span>
))
```

The mock API should include a tag tree and project tag assignments so the feature can be developed and reviewed in browser mode before Tauri wiring is complete.

AI suggestion UI behavior:

- Button label: `AI 建议标签`.
- Disabled state: no selected project, request in progress, or AI provider unavailable.
- Loading copy: `正在生成标签建议`.
- Empty result copy: `没有找到合适的新标签建议`.
- Each suggestion shows full path, confidence, rationale, and whether it uses an existing tag or will create a new path.
- Suggestions are unchecked by default unless confidence is at least `0.8`.
- Primary action: `应用所选标签`.
- Secondary action: `查看发送给 AI 的摘要`, showing `promptPreview`.
- Applying suggestions uses append mode by default, not replace mode.

## API Bridge

Update `src/lib/tauri.ts`:

```ts
listTags: () => call("list_tags"),
createTag: (input) => call("create_tag", { input }),
updateTag: (id, patch) => call("update_tag", { id, patch }),
deleteTag: (id) => call("delete_tag", { id }),
getAiTaggingStatus: () => call("get_ai_tagging_status"),
generateTagSuggestions: (input) => call("generate_tag_suggestions", { input }),
applyTagSuggestions: (input) => call("apply_tag_suggestions", { input })
```

Update `src/backend/cli.ts` with the same command names so local command-style testing stays possible.

If the real Tauri command layer exists later, use the same command names there.

## Error Handling

Use `RepoLensError` codes:

```txt
tag_not_found
tag_name_required
tag_name_invalid
tag_duplicate
tag_cycle
ai_not_configured
ai_request_failed
ai_invalid_response
database_failed
```

User-facing behavior:

- Empty tag names show a short validation message.
- Duplicate sibling tag names should not create another row.
- Deleting a tag should require confirmation in UI because descendants and project links are also removed.
- Unknown tag IDs in project update should fail instead of silently dropping assignment.
- AI unavailable should show a setup hint instead of breaking manual tag workflows.
- Invalid AI output should be reported as a retryable generation failure and should not mutate tags.

## Implementation Tasks

### Task 1: Add Shared Types

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/lib/types.ts`

**Steps:**

1. Add `TagNode`, `ProjectTag`, `TagCreateInput`, and `TagUpdatePatch`.
2. Change project `tags` fields from `string[]` to `ProjectTag[]`.
3. Change `ProjectUpdatePatch.tags?: string[]` to `tagIds?: string[]`.
4. Change `ProjectFilters.tags?: string[]` to `tagIds?: string[]`.
5. Add AI suggestion and AI status types.
6. Extend `AppApi` with tag CRUD and AI methods.
7. Run `npm run typecheck`.

Expected: TypeScript errors appear in existing callers, proving the contract changed.

### Task 2: Add Database Tables and Migration

**Files:**

- Modify: `src/backend/database.ts`
- Test: `tests/tags.test.ts`

**Steps:**

1. Write a failing test that inserts legacy flat `project_tags` rows, reopens the database, and expects root-level `tags` plus `project_tag_links`.
2. Add `tags` and `project_tag_links` table creation to `migrate()`.
3. Add an idempotent `migrateFlatTags()` helper.
4. Run the focused test.

Expected: Legacy tags become structured root tags without duplicate rows on repeated database open.

### Task 3: Add Tag CRUD

**Files:**

- Modify: `src/backend/database.ts`
- Modify: `src/backend/appService.ts`
- Modify: `src/backend/cli.ts`
- Test: `tests/tags.test.ts`

**Steps:**

1. Test creating root and child tags.
2. Test duplicate sibling rejection.
3. Test renaming a parent recomputes descendant paths.
4. Test moving a tag under its own descendant fails with `tag_cycle`.
5. Implement `listTags`, `createTag`, `updateTag`, and `deleteTag`.
6. Wire service and CLI dispatch.

Expected: Tags are returned ordered by `path ASC`, with `depth` derived from path segments.

### Task 4: Replace Project Tag Assignment

**Files:**

- Modify: `src/backend/database.ts`
- Test: `tests/tags.test.ts`
- Test: `tests/scanner.test.ts`

**Steps:**

1. Update project mapping to return `ProjectTag[]`.
2. Update `updateProject` to accept `tagIds`.
3. Stop writing to legacy `project_tags`.
4. Adjust existing scanner preservation test to assert structured tags.
5. Add a test that rescans preserve manually assigned tag links.

Expected: Project tags are durable user metadata and scans do not overwrite them.

### Task 5: Add Tag Filtering and Search

**Files:**

- Modify: `src/backend/database.ts`
- Test: `tests/tags.test.ts`

**Steps:**

1. Test filtering by a leaf tag.
2. Test filtering by a parent tag includes projects linked to descendants.
3. Test query search matches tag name and full path.
4. Implement SQL or post-query filtering using tag subtree paths.

Expected: `listProjects({ tagIds: [parentId] })` returns descendant matches.

### Task 6: Update Mock API and Tauri Wrapper

**Files:**

- Modify: `src/lib/mockApi.ts`
- Modify: `src/lib/tauri.ts`

**Steps:**

1. Add mock tag tree data.
2. Convert mock projects to structured tag assignments.
3. Implement mock tag CRUD.
4. Implement mock tag filtering.
5. Add tag and AI command wrappers in `tauri.ts`.
6. Add mock AI status and suggestion behavior in `mockApi.ts`.
7. Run `npm run typecheck`.

Expected: Vite development mode can demo multi-level tags without Tauri.

### Task 7: Add AI Suggestion Service Contract

**Files:**

- Create: `src/backend/aiTagProvider.ts`
- Modify: `src/backend/appService.ts`
- Modify: `src/backend/cli.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/mockApi.ts`
- Test: `tests/ai-tags.test.ts`

**Steps:**

1. Add `AiTagProjectPayload` and `AiTagProvider` internal backend types.
2. Add a deterministic mock provider that returns suggestions from project metadata.
3. Add `generateTagSuggestions` service method.
4. Add `getAiTaggingStatus` service method.
5. Add JSON validation for provider output.
6. Add command dispatch and frontend API wrapper.
7. Test that no source-code file contents are included in the payload.
8. Test that invalid AI output fails with `ai_invalid_response`.

Expected: The API can generate validated suggestions without mutating tags.

### Task 8: Apply AI Suggestions Safely

**Files:**

- Modify: `src/backend/database.ts`
- Modify: `src/backend/appService.ts`
- Test: `tests/ai-tags.test.ts`

**Steps:**

1. Add database helper `findOrCreateTagPath(segments: string[]): TagNode`.
2. Add service method `applyTagSuggestions`.
3. Test applying an existing tag suggestion reuses the tag.
4. Test applying a new path creates missing ancestors.
5. Test applying duplicate suggestions creates one link.
6. Test append mode preserves existing project tags.
7. Test replace mode replaces existing project tags.

Expected: Applying AI suggestions is idempotent and only mutates after explicit user action.

### Task 9: Add UI Components

**Files:**

- Create: `src/components/TagTreePanel.tsx`
- Create: `src/components/ProjectTagPicker.tsx`
- Create: `src/components/AiTagSuggestionPanel.tsx`
- Modify: `src/components/ProjectDetailPanel.tsx`
- Modify: `src/components/ProjectTable.tsx`
- Modify: `src/components/ProjectSearchBar.tsx`
- Modify: `src/pages/ProjectLibraryPage.tsx`
- Modify: `src/styles.css`

**Steps:**

1. Load tags in `ProjectLibraryPage`.
2. Add tag filter state and pass `tagIds` into `ProjectFilters`.
3. Render tag chips in the project table.
4. Replace comma-separated tag input with `ProjectTagPicker`.
5. Add `TagTreePanel` for create/rename/delete.
6. Add `AiTagSuggestionPanel` in the project detail panel.
7. Keep layout dense and consistent with the current operational UI.

Expected: User can create nested tags, assign multiple tags to a project, request AI suggestions, apply selected suggestions, filter by a parent tag, and see results update.

### Task 10: AI Provider Configuration

**Files:**

- Create: `src/backend/openAiCompatibleTagProvider.ts`
- Modify: `src/backend/appService.ts`
- Modify: `src/backend/database.ts`
- Test: `tests/ai-tags.test.ts`

**Steps:**

1. Add provider selection from `app_settings` with fallback to mock provider in development.
2. Add environment-variable API key lookup through `REPOLENS_AI_API_KEY`.
3. Add optional `REPOLENS_AI_BASE_URL` and `REPOLENS_AI_MODEL`.
4. Return `ai_not_configured` when real provider is selected without an API key.
5. Test provider config without making network calls by injecting a fake fetch function.

Expected: AI provider setup is explicit, testable, and does not store secrets.

### Task 11: Final Verification

**Files:**

- Verify all touched files.

**Steps:**

1. Run `npm test`.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Start `npm run dev`.
5. Use the browser to verify:
   - tag creation
   - nested tag creation
   - project assignment
   - parent tag filtering
   - search by tag path
   - AI suggestion generation
   - applying selected AI suggestions
   - AI unavailable state
   - delete confirmation

Expected: Automated checks pass and the local browser flow works without layout overlap.

## Acceptance Criteria

- Existing flat tags migrate into root-level hierarchical tags.
- A project can have zero, one, or many tags.
- Tags can be nested at least three levels deep.
- Assigning tags to one project does not affect scan metadata.
- Filtering by a parent tag includes descendant tag assignments.
- Searching by tag leaf name or path finds linked projects.
- Duplicate sibling tag names are rejected.
- Moving a tag cannot create a cycle.
- Deleting a tag removes descendants and project links.
- AI suggestions do not mutate data until the user applies them.
- AI suggestions can reuse existing tags or create missing tag paths during apply.
- AI generation sends only stored project metadata, not source-code file contents.
- AI provider secrets are not stored in SQLite.
- Manual tagging still works when AI is unavailable.
- Mock API and real backend expose the same AppApi shape.
