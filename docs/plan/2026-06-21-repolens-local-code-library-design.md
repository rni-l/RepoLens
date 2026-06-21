# RepoLens Local Code Library Design

## Purpose

RepoLens is a local desktop app for managing a user's personal code folders across multiple locations on their own computer. It is not a Git replacement. Its first job is to answer:

- What code projects do I have locally?
- Where are they?
- What is each project for?
- How do I quickly reopen a project in the tools I use?

The first version should prioritize reliable local indexing, fast search, editable project notes, and one-click open actions.

## Confirmed Product Decisions

- Build RepoLens as a Tauri desktop application.
- Use Tauri, Node.js, React, TypeScript, and Vite as the implementation stack.
- Use React/Vite/TypeScript for the desktop UI.
- Use Node.js/TypeScript for product logic: filesystem scanning, metadata extraction, SQLite access, search, and open-action orchestration.
- Keep the Tauri native layer thin. Tauri provides the desktop shell and OS bridge; it should not become the main business-logic backend.
- Use SQLite as the local index database.
- Users explicitly configure scan root directories. RepoLens must not scan the whole computer by default.
- Automatic project detection uses strict marker rules.
- First-version project detection should focus on the user's likely local app/script repos. Do not add every ecosystem marker by default.
- Users can manually add projects missed by scanning.
- Project list rows must include quick actions for Folder, Terminal, iTerm2, VS Code, and Cursor.
- UI visual design will be produced separately and later converted into React components.
- AI-generated project summaries are a later enhancement, not required for the first version.

## First Version Scope

The first version is a personal local code project catalog.

In scope:

- Configure multiple scan roots.
- Enable or disable scan roots.
- Scan enabled roots recursively.
- Strictly detect code project roots.
- Save discovered projects to SQLite.
- Manually add a project by folder path.
- List, search, and filter projects.
- Edit project metadata.
- Preserve user-edited fields across future scans.
- Open a project folder in external tools.
- Mark missing project paths instead of deleting them automatically.

Out of scope:

- Git operation management.
- Team collaboration.
- Cloud sync.
- Full source-code understanding.
- Automatic AI summaries.
- Monorepo package-level indexing.
- Windows and Linux-specific polish beyond keeping the command abstraction extensible.

## Application Architecture

RepoLens has four main layers:

1. React/Vite frontend
2. Node.js/TypeScript application service layer
3. Thin Tauri desktop shell and bridge
4. SQLite local database

The frontend owns presentation and interaction state. It should call a small typed API wrapper instead of reaching directly into filesystem or database code.

The Node.js/TypeScript service layer owns the main product logic. This can be implemented as a local Node-powered service or sidecar managed by the Tauri app. The important boundary is that RepoLens product logic stays in JavaScript/TypeScript, not in Go or Rust:

- Filesystem traversal
- Project detection
- Metadata extraction
- SQLite reads and writes
- Search and filtering
- User field preservation
- External app availability checks
- External app launch orchestration

The Tauri layer stays intentionally small:

- Desktop window lifecycle
- Secure frontend-to-service bridge
- Native folder picker integration
- OS-level permissions and packaging constraints
- Minimal native glue required by Tauri

SQLite owns durable local state:

- Scan roots
- Project index
- User annotations
- Tags
- App settings

This split keeps future UI redesigns cheap. The generated HTML can be converted into React components without changing scan logic or storage contracts, and the product remains primarily in the JavaScript/TypeScript ecosystem.

## Frontend Structure

Recommended structure:

```txt
src/
  pages/
    ProjectLibraryPage.tsx
    ProjectDetailPage.tsx
    ScanSettingsPage.tsx
  components/
    ProjectTable.tsx
    ProjectRowActions.tsx
    ProjectSearchBar.tsx
    ScanRootList.tsx
    StatusBadge.tsx
    TagEditor.tsx
  lib/
    tauri.ts
    types.ts
```

Main pages:

- `ProjectLibraryPage`: searchable project list.
- `ProjectDetailPage`: project metadata, notes, commands, tags, and status.
- `ScanSettingsPage`: scan root configuration, scan actions, and manual project add.

Reusable components:

- `ProjectTable`: dense project list.
- `ProjectRowActions`: Folder, Terminal, iTerm2, Code, and Cursor buttons.
- `ProjectSearchBar`: keyword search and filters.
- `ScanRootList`: add, enable, disable, remove, and scan roots.
- `StatusBadge`: visual status value.
- `TagEditor`: project tag editor.

## Core Types

```ts
export type ProjectStatus =
  | "active"
  | "archived"
  | "experimental"
  | "learning"
  | "client"
  | "missing";

export type ProjectSource = "scan" | "manual";

export type FieldSource = "auto" | "user";

export type OpenAction =
  | "folder"
  | "terminal"
  | "iterm2"
  | "vscode"
  | "cursor";

export type ProjectListItem = {
  id: string;
  name: string;
  path: string;
  description: string;
  techStacks: string[];
  status: ProjectStatus;
  tags: string[];
  lastModifiedAt: string | null;
  source: ProjectSource;
  favorite: boolean;
};

export type ProjectDetail = ProjectListItem & {
  readmeSummary: string | null;
  startCommand: string | null;
  testCommand: string | null;
  entryFiles: string[];
  descriptionSource: FieldSource;
  startCommandSource: FieldSource;
  testCommandSource: FieldSource;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScanRoot = {
  id: string;
  path: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFilters = {
  query?: string;
  statuses?: ProjectStatus[];
  techStacks?: string[];
  tags?: string[];
  scanRootId?: string;
  source?: ProjectSource;
  favoriteOnly?: boolean;
};
```

## SQLite Schema

The first schema should stay compact and migration-friendly.

```sql
CREATE TABLE scan_roots (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  favorite INTEGER NOT NULL,
  description TEXT,
  description_source TEXT NOT NULL,
  readme_summary TEXT,
  tech_stacks TEXT NOT NULL,
  start_command TEXT,
  start_command_source TEXT NOT NULL,
  test_command TEXT,
  test_command_source TEXT NOT NULL,
  entry_files TEXT NOT NULL,
  last_modified_at TEXT,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_tags (
  project_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (project_id, tag),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

JSON arrays are acceptable for `tech_stacks` and `entry_files` in the first version. If filtering grows more complex, they can be normalized later.

## Tauri Command Interface

Frontend code should call commands only through `src/lib/tauri.ts`.

```ts
export async function listProjects(filters: ProjectFilters): Promise<ProjectListItem[]>;
export async function getProject(projectId: string): Promise<ProjectDetail>;
export async function updateProject(projectId: string, patch: ProjectUpdatePatch): Promise<ProjectDetail>;
export async function addManualProject(path: string): Promise<ProjectDetail>;
export async function deleteProject(projectId: string): Promise<void>;

export async function listScanRoots(): Promise<ScanRoot[]>;
export async function addScanRoot(path: string): Promise<ScanRoot>;
export async function updateScanRoot(id: string, patch: ScanRootUpdatePatch): Promise<ScanRoot>;
export async function removeScanRoot(id: string): Promise<void>;
export async function scanAllRoots(): Promise<ScanSummary>;
export async function scanRoot(rootId: string): Promise<ScanSummary>;

export async function detectOpenActions(): Promise<OpenActionAvailability[]>;
export async function openProject(projectId: string, action: OpenAction): Promise<void>;
```

Suggested command names:

```txt
list_projects
get_project
update_project
add_manual_project
delete_project
list_scan_roots
add_scan_root
update_scan_root
remove_scan_root
scan_all_roots
scan_root
detect_open_actions
open_project
```

## Scan Summary Contract

Scan commands return a summary instead of streaming every detail into the UI in the first version.

```ts
export type ScanSummary = {
  scannedRoots: number;
  discoveredProjects: number;
  addedProjects: number;
  updatedProjects: number;
  skippedDirs: number;
  errors: ScanError[];
};

export type ScanError = {
  path: string;
  kind:
    | "root_not_found"
    | "permission_denied"
    | "read_failed"
    | "manifest_parse_failed"
    | "database_failed";
  message: string;
};
```

A scan error should not stop the whole scan unless the database is unavailable.

## Project Detection Rules

RepoLens scans only enabled scan roots.

Default ignored directories:

```txt
.git
node_modules
dist
build
target
vendor
.venv
venv
__pycache__
.next
.nuxt
.turbo
.cache
.idea
.vscode
```

A directory is a project root if it contains at least one strict marker:

```txt
.git
package.json
pyproject.toml
requirements.txt
pom.xml
build.gradle
composer.json
deno.json
tsconfig.json
vite.config.ts
next.config.js
```

Do not include markers for every programming language in the first version. The implementation stack is Tauri + Node.js + React + TypeScript + Vite. Project detection rules are product behavior and should stay configurable, so extra ecosystems can be added later only when needed.

When a project root is detected, the scanner records that directory as one project and does not continue recursively into it for the first version. This avoids accidentally treating `src`, `examples`, or nested dependency folders as separate projects.

## Metadata Extraction

Automatic extraction should be conservative.

Project name:

1. Manifest name, such as `package.json.name`
2. Directory name

Detected project labels:

- `package.json`: Node.js or JavaScript/TypeScript project
- `vite.config.*`: Vite
- `next.config.*`: Next.js
- `pyproject.toml` or `requirements.txt`: Python
- `pom.xml` or `build.gradle`: Java
- `composer.json`: PHP

README summary:

- Read `README.md`, `README.MD`, or `readme.md`.
- Extract the first meaningful paragraphs.
- Truncate to a safe length.
- Store as `readme_summary`.

Commands:

- Node: use `scripts.dev`, then `scripts.start` for start command; use `scripts.test` for test command.
- Python: infer only when obvious, otherwise leave empty.
- Java/PHP: infer only when obvious, otherwise leave empty.

Entry files:

- `src/main.tsx`
- `src/main.ts`
- `src/index.tsx`
- `src/index.ts`
- `main.py`
- `app.py`

## User Field Preservation

Scans must not overwrite user-maintained fields.

Fields with source tracking:

- `description`
- `start_command`
- `test_command`

If a field source is `auto`, scans may update it. If a user edits the field, its source becomes `user`, and future scans must preserve it.

Manual projects use `source = "manual"`. They should remain in the database even if they do not match strict markers.

When an existing project path no longer exists, RepoLens should mark the project as `missing` or show a missing-path warning. It must not delete the record automatically.

## Search and Filters

Global search should cover:

- Project name
- Path
- Description
- README summary
- Tags
- Project label
- Start command

The first implementation can use SQLite `LIKE` queries. FTS5 can be added later if the project list becomes large.

Filters:

- Status
- Project label
- Tag
- Scan root
- Source
- Favorite only

The project list should default to dense table behavior because this is a management tool for many local projects.

## Quick Open Actions

Every project row should include action buttons:

- Folder
- Terminal
- iTerm2
- Code
- Cursor

Frontend call:

```ts
await openProject(projectId, "cursor");
```

Backend behavior:

- Look up project path by `projectId`.
- Verify the path exists.
- Resolve the open action.
- Execute the OS command.
- Return a typed error if the app is unavailable or the command fails.

macOS-first command behavior:

- Folder: `open <path>`
- Terminal: open Terminal and run `cd <path>`
- iTerm2: AppleScript opens iTerm2 and changes to the project path
- VS Code: `code <path>`
- Cursor: `cursor <path>`

`detect_open_actions` should detect whether these tools are available:

- Folder is always available on macOS if `open` exists.
- Terminal is available on macOS.
- iTerm2 is available if the app exists.
- VS Code is available if `code` exists in `PATH`.
- Cursor is available if `cursor` exists in `PATH`.

Unavailable actions should render as disabled in the frontend.

## Error Handling

Expected error cases:

- Scan root does not exist.
- Scan root permission denied.
- README cannot be read.
- Manifest JSON cannot be parsed.
- Project path has been deleted or moved.
- External app is not installed.
- External command is not available in `PATH`.
- External command exits with failure.
- SQLite operation fails.

Scanning should continue through recoverable errors and report them in `ScanSummary.errors`.

Opening a project should fail fast with a clear error. For example, a missing Cursor CLI should produce an error the UI can render as "Cursor command is not configured".

## Future AI Summary Enhancement

AI summarization should be optional and explicit.

Possible command:

```ts
generateProjectSummary(projectId: string): Promise<ProjectSummaryDraft>;
```

The AI feature should read only a safe white list by default:

- README
- Manifest files
- Directory tree
- Common entry files

It should not silently read every source file in the project. Generated text should first be saved as a draft. The user confirms before it replaces the project description.

Suggested draft type:

```ts
export type ProjectSummaryDraft = {
  projectId: string;
  summary: string;
  detectedPurpose: string | null;
  suggestedTags: string[];
  suggestedStartCommand: string | null;
  confidence: "low" | "medium" | "high";
};
```

## Acceptance Criteria

- User can add at least two scan roots.
- User can scan all enabled roots.
- Scanner detects projects by strict markers.
- Scanner ignores dependency and build directories.
- Manual project add works for folders without strict markers.
- Project list supports search by name, path, tag, detected project label, and description.
- Project details can be edited and saved.
- User-edited description and commands survive a rescan.
- Each project row exposes Folder, Terminal, iTerm2, Code, and Cursor actions.
- Unavailable open actions are detected and disabled.
- Missing project paths are shown as missing, not silently deleted.
- Scan errors are reported without stopping the whole scan.

## Suggested Implementation Order

1. Scaffold Tauri + React/Vite + TypeScript.
2. Add SQLite setup and migrations.
3. Implement scan root CRUD commands.
4. Implement strict scanner and metadata extraction.
5. Implement project list/search/update commands.
6. Implement manual project add.
7. Implement open action detection and launch commands.
8. Build React pages against typed Tauri wrappers.
9. Convert generated HTML design into React components.
10. Add focused tests for scanner rules and field preservation.
