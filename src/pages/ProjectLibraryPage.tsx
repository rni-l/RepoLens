import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FolderPlus, RefreshCw, Search, Settings, Tags, X } from "lucide-react";
import { ProjectDetailPanel } from "../components/ProjectDetailPanel";
import { ProjectSearchBar, type FilterKey, type TagFilterMode } from "../components/ProjectSearchBar";
import { ProjectTable } from "../components/ProjectTable";
import { TagTreeSelector } from "../components/TagTreeSelector";
import { pruneSelectedTagIds } from "../lib/tagState";
import { api } from "../lib/tauri";
import type {
  AiTaggingStatus,
  OpenAction,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ScanRoot,
  ScanSummary,
  TagCreateInput,
  TagMoveDirection,
  TagNode,
  TagUpdatePatch
} from "../lib/types";

type RouteKey = "library" | "tags" | "scan-sources" | "settings";

const ROUTES: Array<{ key: RouteKey; path: string; label: string; icon: typeof Search }> = [
  { key: "library", path: "/library", label: "项目库", icon: Search },
  { key: "tags", path: "/tags", label: "标签", icon: Tags },
  { key: "scan-sources", path: "/scan-sources", label: "扫描源", icon: RefreshCw },
  { key: "settings", path: "/settings", label: "设置", icon: Settings }
];

const SIDEBAR_FOOT: Record<RouteKey, string> = {
  library: "紧凑导航保留核心入口，项目详情从列表按需打开。",
  tags: "标签树和项目列表独立搜索，便于批量打标前确认覆盖范围。",
  "scan-sources": "扫描源独立管理，支持添加、启停、单扫和移除确认。",
  settings: "本轮只增强状态可见性，不引入新的持久设置表单。"
};

export function ProjectLibraryPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectListItem[]>([]);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [scanRoots, setScanRoots] = useState<ScanRoot[]>([]);
  const [openActions, setOpenActions] = useState<OpenActionAvailability[]>([]);
  const [aiStatus, setAiStatus] = useState<AiTaggingStatus | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>("include");
  const [isBulkTagDrawerOpen, setIsBulkTagDrawerOpen] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [toast, setToast] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteKey>(() => routeFromLocation());
  const selectedProjectId = selectedProject?.id ?? null;

  const filters = useMemo<ProjectFilters>(() => {
    const tagIds = tagFilterMode === "include" && selectedTagIds.length ? selectedTagIds : undefined;
    const excludedTagIds = tagFilterMode === "exclude" && selectedTagIds.length ? selectedTagIds : undefined;
    if (filter === "favorite") {
      return { query, favoriteOnly: true, tagIds, excludedTagIds };
    }
    if (filter === "all") {
      return { query, tagIds, excludedTagIds };
    }
    return { query, statuses: [filter], tagIds, excludedTagIds };
  }, [filter, query, selectedTagIds, tagFilterMode]);

  const loadProjectList = useCallback(async () => {
    const projectList = await api.listProjects(filters);
    setProjects(projectList);
    setSelectedProjectIds((current) => current.filter((id) => projectList.some((project) => project.id === id)));

    if (selectedProjectId) {
      try {
        setSelectedProject(await api.getProject(selectedProjectId));
      } catch {
        setSelectedProject(null);
      }
    }
  }, [filters, selectedProjectId]);

  const loadWorkspaceState = useCallback(async () => {
    const [allProjectList, roots, actions, tagList, status] = await Promise.all([
      api.listProjects({}),
      api.listScanRoots(),
      api.detectOpenActions(),
      api.listTags().catch(() => []),
      api.getAiTaggingStatus().catch(() => ({
        available: false as const,
        provider: "none",
        model: null,
        reason: "not_configured" as const
      }))
    ]);

    setAllProjects(allProjectList);
    setTags(tagList);
    setSelectedTagIds((current) => pruneSelectedTagIds(current, tagList.map((tag) => tag.id)));
    setScanRoots(roots);
    setOpenActions(actions);
    setAiStatus(status);
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadProjectList(), loadWorkspaceState()]);
  }, [loadProjectList, loadWorkspaceState]);

  useEffect(() => {
    void loadWorkspaceState().catch((error) => showToast(errorMessage(error)));
  }, [loadWorkspaceState]);

  useEffect(() => {
    void loadProjectList().catch((error) => showToast(errorMessage(error)));
  }, [loadProjectList]);

  useEffect(() => {
    if (!selectedProjectIds.length) {
      setIsBulkTagDrawerOpen(false);
    }
  }, [selectedProjectIds.length]);

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", pathForRoute(routeFromLocation()));
    }

    const syncRoute = () => setActiveRoute(routeFromLocation());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const enabledRoots = scanRoots.filter((root) => root.enabled).length;
  const availableOpenActions = openActions.filter((action) => action.available).length;
  const issueCount = allProjects.filter((project) => project.status === "missing").length + (scanSummary?.errors.length ?? 0);
  const taggedProjectCount = allProjects.filter((project) => project.tags.length > 0).length;

  function navigate(route: RouteKey) {
    if (route === activeRoute) return;
    window.history.pushState(null, "", pathForRoute(route));
    setActiveRoute(route);
  }

  async function selectProject(projectId: string) {
    setSelectedProject(await api.getProject(projectId));
  }

  function toggleProjectSelection(projectId: string) {
    setSelectedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
    setSelectedProject(null);
    setIsBulkTagDrawerOpen(true);
  }

  function toggleAllVisibleProjects() {
    const visibleIds = projects.map((project) => project.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProjectIds.includes(id));
    setSelectedProjectIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
    setSelectedProject(null);
    setIsBulkTagDrawerOpen(!allVisibleSelected && visibleIds.length > 0);
  }

  async function applyBulkTags() {
    if (!selectedProjectIds.length) {
      showToast("请先选择项目");
      return;
    }
    if (!bulkTagIds.length) {
      showToast("请选择要追加的标签");
      return;
    }
    setIsBusy(true);
    try {
      const result = await api.bulkTagProjects({
        projectIds: selectedProjectIds,
        tagIds: bulkTagIds,
        mode: "append"
      });
      setSelectedProjectIds([]);
      setBulkTagIds([]);
      setIsBulkTagDrawerOpen(false);
      await load();
      showToast(`已为 ${result.updatedCount} 个项目追加标签`);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function runScan() {
    setIsBusy(true);
    showToast("扫描已开始");
    try {
      const summary = await api.scanAllRoots();
      setScanSummary(summary);
      await load();
      showToast(`扫描完成：新增 ${summary.addedProjects}，更新 ${summary.updatedProjects}`);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function scanRoot(rootId: string) {
    setIsBusy(true);
    try {
      const summary = await api.scanRoot(rootId);
      setScanSummary(summary);
      await load();
      showToast(`扫描完成：发现 ${summary.discoveredProjects} 个项目`);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function openProject(projectId: string, action: OpenAction) {
    try {
      await api.openProject(projectId, action);
      const project = allProjects.find((item) => item.id === projectId);
      showToast(`正在打开 ${project?.name ?? "项目"}`);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function saveSelected(patch: Parameters<typeof api.updateProject>[1]) {
    if (!selectedProject) return;
    try {
      const next = await api.updateProject(selectedProject.id, patch);
      setSelectedProject(next);
      await load();
      showToast("人工字段已保存，后续扫描不会覆盖");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function createTag(input: TagCreateInput) {
    try {
      await api.createTag(input);
      await load();
      showToast("标签已创建");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function updateTag(id: string, patch: TagUpdatePatch) {
    try {
      await api.updateTag(id, patch);
      await load();
      showToast("标签已更新");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function moveTag(id: string, direction: TagMoveDirection) {
    try {
      const tagList = await api.moveTag(id, direction);
      setTags(tagList);
      await load();
      showToast("标签排序已更新");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function deleteTag(id: string) {
    const tag = tags.find((item) => item.id === id);
    if (!tag) return;
    if (!window.confirm(`删除「${tag.path.replaceAll("/", " / ")}」及其子标签？项目链接也会移除。`)) {
      return;
    }
    const deletedIds = tags
      .filter((item) => item.id === id || item.path.startsWith(`${tag.path}/`))
      .map((item) => item.id);
    try {
      await api.deleteTag(id);
      const remainingTagIds = tags
        .filter((item) => !deletedIds.includes(item.id))
        .map((item) => item.id);
      setSelectedTagIds((current) => pruneSelectedTagIds(current, remainingTagIds));
      setBulkTagIds((current) => pruneSelectedTagIds(current, remainingTagIds));
      await load();
      showToast("标签已删除");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function applySuggestedProject(project: ProjectDetail) {
    setSelectedProject(project);
    await load();
    showToast("标签建议已应用");
  }

  async function toggleRoot(id: string, enabled: boolean) {
    try {
      await api.updateScanRoot(id, { enabled });
      await load();
      showToast(enabled ? "扫描源已启用" : "扫描源已停用");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function removeRoot(id: string) {
    try {
      await api.removeScanRoot(id);
      await load();
      showToast("扫描源已移除");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function copyPath(projectPath: string) {
    try {
      await navigator.clipboard.writeText(projectPath);
      showToast("路径已复制到剪贴板");
    } catch {
      showToast(projectPath);
    }
  }

  async function addRoot(path: string) {
    setIsAddingRoot(true);
    try {
      await api.addScanRoot(path);
      await load();
      showToast("扫描源已添加并启用");
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setIsAddingRoot(false);
    }
  }

  return (
    <AppShell activeRoute={activeRoute} onNavigate={navigate}>
      {activeRoute === "library" ? (
        <LibraryView
          projects={projects}
          tags={tags}
          selectedProject={selectedProject}
          selectedProjectIds={selectedProjectIds}
          bulkTagIds={bulkTagIds}
          tagFilterMode={tagFilterMode}
          isBulkTagDrawerOpen={isBulkTagDrawerOpen}
          query={query}
          filter={filter}
          selectedTagIds={selectedTagIds}
          enabledRoots={enabledRoots}
          issueCount={issueCount}
          taggedProjectCount={taggedProjectCount}
          openActions={openActions}
          isBusy={isBusy}
          onNavigate={navigate}
          onRunScan={() => void runScan()}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onTagFilterChange={setSelectedTagIds}
          onTagFilterModeChange={setTagFilterMode}
          onBulkTagChange={setBulkTagIds}
          onApplyBulkTags={() => void applyBulkTags()}
          onOpenBulkTagDrawer={() => setIsBulkTagDrawerOpen(true)}
          onCloseBulkTagDrawer={() => setIsBulkTagDrawerOpen(false)}
          onClearBulkSelection={() => {
            setSelectedProjectIds([]);
            setBulkTagIds([]);
            setIsBulkTagDrawerOpen(false);
          }}
          onSelectProject={(projectId) => void selectProject(projectId)}
          onToggleProject={toggleProjectSelection}
          onToggleAll={toggleAllVisibleProjects}
          onOpenProject={(projectId, action) => void openProject(projectId, action)}
          onCloseDrawer={() => setSelectedProject(null)}
          onSaveSelected={(patch) => void saveSelected(patch)}
          onCopyPath={(path) => void copyPath(path)}
          aiStatus={aiStatus}
          onSuggestionApplied={(project) => void applySuggestedProject(project)}
          onError={showToast}
        />
      ) : null}

      {activeRoute === "tags" ? (
        <TagsPage
          tags={tags}
          projects={allProjects}
          onCreateTag={(input) => void createTag(input)}
          onUpdateTag={(id, patch) => void updateTag(id, patch)}
          onMoveTag={(id, direction) => void moveTag(id, direction)}
          onDeleteTag={(id) => void deleteTag(id)}
          onBack={() => navigate("library")}
        />
      ) : null}

      {activeRoute === "scan-sources" ? (
        <ScanSourcesPage
          roots={scanRoots}
          projects={allProjects}
          issueCount={issueCount}
          isBusy={isBusy}
          isAddingRoot={isAddingRoot}
          scanSummary={scanSummary}
          onBack={() => navigate("library")}
          onAddRoot={(path) => void addRoot(path)}
          onToggleRoot={(id, enabled) => void toggleRoot(id, enabled)}
          onRemoveRoot={(id) => void removeRoot(id)}
          onRunScan={() => void runScan()}
          onScanRoot={(id) => void scanRoot(id)}
        />
      ) : null}

      {activeRoute === "settings" ? (
        <SettingsPage
          roots={scanRoots}
          projects={allProjects}
          openActions={openActions}
          aiStatus={aiStatus}
          scanSummary={scanSummary}
          onNavigate={navigate}
          onRefresh={() => void load().then(() => showToast("状态已刷新"))}
        />
      ) : null}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AppShell>
  );
}

type AppShellProps = {
  activeRoute: RouteKey;
  onNavigate(route: RouteKey): void;
  children: ReactNode;
};

function AppShell({ activeRoute, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" data-od-id="app-nav">
        <a
          className="brand"
          href="/library"
          aria-label="RepoLens 项目库工作台"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("library");
          }}
        >
          <span className="mark">RL</span>
          <span>RepoLens</span>
        </a>
        <nav className="nav-list" aria-label="主导航">
          {ROUTES.map(({ key, path, label, icon: Icon }) => (
            <a
              className="nav-item"
              aria-current={activeRoute === key ? "page" : undefined}
              href={path}
              key={key}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(key);
              }}
            >
              <span className="nav-ico"><Icon size={14} /></span><span>{label}</span>
            </a>
          ))}
        </nav>
        <p className="sidebar-foot">{SIDEBAR_FOOT[activeRoute]}</p>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  );
}

type LibraryViewProps = {
  projects: ProjectListItem[];
  tags: TagNode[];
  selectedProject: ProjectDetail | null;
  selectedProjectIds: string[];
  bulkTagIds: string[];
  tagFilterMode: TagFilterMode;
  isBulkTagDrawerOpen: boolean;
  query: string;
  filter: FilterKey;
  selectedTagIds: string[];
  enabledRoots: number;
  issueCount: number;
  taggedProjectCount: number;
  openActions: OpenActionAvailability[];
  isBusy: boolean;
  aiStatus: AiTaggingStatus | null;
  onNavigate(route: RouteKey): void;
  onRunScan(): void;
  onQueryChange(query: string): void;
  onFilterChange(filter: FilterKey): void;
  onTagFilterChange(tagIds: string[]): void;
  onTagFilterModeChange(mode: TagFilterMode): void;
  onBulkTagChange(tagIds: string[]): void;
  onApplyBulkTags(): void;
  onOpenBulkTagDrawer(): void;
  onCloseBulkTagDrawer(): void;
  onClearBulkSelection(): void;
  onSelectProject(projectId: string): void;
  onToggleProject(projectId: string): void;
  onToggleAll(): void;
  onOpenProject(projectId: string, action: OpenAction): void;
  onCloseDrawer(): void;
  onSaveSelected(patch: Parameters<typeof api.updateProject>[1]): void;
  onCopyPath(path: string): void;
  onSuggestionApplied(project: ProjectDetail): void;
  onError(message: string): void;
};

function LibraryView({
  projects,
  tags,
  selectedProject,
  selectedProjectIds,
  bulkTagIds,
  tagFilterMode,
  isBulkTagDrawerOpen,
  query,
  filter,
  selectedTagIds,
  enabledRoots,
  issueCount,
  taggedProjectCount,
  openActions,
  isBusy,
  aiStatus,
  onNavigate,
  onRunScan,
  onQueryChange,
  onFilterChange,
  onTagFilterChange,
  onTagFilterModeChange,
  onBulkTagChange,
  onApplyBulkTags,
  onOpenBulkTagDrawer,
  onCloseBulkTagDrawer,
  onClearBulkSelection,
  onSelectProject,
  onToggleProject,
  onToggleAll,
  onOpenProject,
  onCloseDrawer,
  onSaveSelected,
  onCopyPath,
  onSuggestionApplied,
  onError
}: LibraryViewProps) {
  return (
    <>
      <section className="topbar" data-od-id="library-topbar">
        <div className="title-block">
          <h1>项目库工作台</h1>
          <p>全宽浏览本地项目，按状态和层级标签筛选；多选项目后批量追加标签，单项目详情从右侧抽屉打开。</p>
        </div>
        <div className="top-actions">
          <button className="btn" type="button" onClick={() => onNavigate("scan-sources")}>
            <FolderPlus size={16} /> 管理扫描源
          </button>
          <button className="btn" type="button" onClick={() => onNavigate("tags")}>
            <Tags size={16} /> 维护标签树
          </button>
          <button className="btn btn-primary" type="button" disabled={isBusy} onClick={onRunScan}>
            <RefreshCw size={16} /> 扫描全部
          </button>
        </div>
      </section>

      <ProjectSearchBar
        query={query}
        activeFilter={filter}
        tags={tags}
        selectedTagIds={selectedTagIds}
        tagFilterMode={tagFilterMode}
        onQueryChange={onQueryChange}
        onFilterChange={onFilterChange}
        onTagFilterChange={onTagFilterChange}
        onTagFilterModeChange={onTagFilterModeChange}
      />

      <section className="summary-grid" data-od-id="summary">
        <article className="summary-card metric">
          <span>当前项目</span>
          <strong>{projects.length}</strong>
        </article>
        <article className="summary-card metric">
          <span>启用扫描源</span>
          <strong>{enabledRoots}</strong>
        </article>
        <article className="summary-card metric">
          <span>待处理异常</span>
          <strong>{issueCount}</strong>
        </article>
        <article className="summary-card metric">
          <span>已打标签项目</span>
          <strong>{taggedProjectCount}</strong>
        </article>
      </section>

      <BulkTagBar
        selectedCount={selectedProjectIds.length}
        selectedTagIds={bulkTagIds}
        disabled={isBusy}
        onOpen={onOpenBulkTagDrawer}
        onClear={onClearBulkSelection}
      />

      <ProjectTable
        projects={projects}
        activeProjectId={selectedProject?.id ?? null}
        selectedProjectIds={selectedProjectIds}
        openActions={openActions}
        onSelect={onSelectProject}
        onToggleProject={onToggleProject}
        onToggleAll={onToggleAll}
        onOpen={onOpenProject}
      />

      <ProjectDetailDrawer
        project={selectedProject}
        tags={tags}
        aiStatus={aiStatus}
        onClose={onCloseDrawer}
        onSave={onSaveSelected}
        onCopyPath={onCopyPath}
        onSuggestionApplied={onSuggestionApplied}
        onError={onError}
      />

      <BulkTagDrawer
        open={isBulkTagDrawerOpen && selectedProjectIds.length > 0}
        selectedCount={selectedProjectIds.length}
        tags={tags}
        selectedTagIds={bulkTagIds}
        disabled={isBusy}
        onTagChange={onBulkTagChange}
        onApply={onApplyBulkTags}
        onClearTags={() => onBulkTagChange([])}
        onClearProjects={onClearBulkSelection}
        onClose={onCloseBulkTagDrawer}
      />
    </>
  );
}

type BulkTagBarProps = {
  selectedCount: number;
  selectedTagIds: string[];
  disabled: boolean;
  onOpen(): void;
  onClear(): void;
};

function BulkTagBar({ selectedCount, selectedTagIds, disabled, onOpen, onClear }: BulkTagBarProps) {
  if (!selectedCount) {
    return null;
  }
  return (
    <section className="bulkbar show" data-od-id="bulk-tagging" aria-live="polite">
      <div className="bulk-copy">
        <strong>已选择 {selectedCount} 个项目</strong>
        <span>{selectedTagIds.length ? `已选择 ${selectedTagIds.length} 个待追加标签` : "从右侧抽屉选择要追加的层级标签。"}</span>
      </div>
      <div className="bulk-actions">
        <button className="btn btn-primary" type="button" disabled={disabled} onClick={onOpen}>
          批量打标
        </button>
        <button className="btn" type="button" disabled={disabled} onClick={onClear}>
          清除选择
        </button>
      </div>
    </section>
  );
}

type BulkTagDrawerProps = {
  open: boolean;
  selectedCount: number;
  tags: TagNode[];
  selectedTagIds: string[];
  disabled: boolean;
  onTagChange(tagIds: string[]): void;
  onApply(): void;
  onClearTags(): void;
  onClearProjects(): void;
  onClose(): void;
};

function BulkTagDrawer({
  open,
  selectedCount,
  tags,
  selectedTagIds,
  disabled,
  onTagChange,
  onApply,
  onClearTags,
  onClearProjects,
  onClose
}: BulkTagDrawerProps) {
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="drawer-layer open" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer bulk-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="批量追加标签"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h2>批量追加标签</h2>
            <p className="muted">已选择 {selectedCount} 个项目</p>
          </div>
          <button className="icon-btn" type="button" aria-label="关闭批量打标" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          <TagTreeSelector
            tags={tags}
            selectedTagIds={selectedTagIds}
            onChange={onTagChange}
            density="comfortable"
            disabled={disabled}
            searchPlaceholder="搜索要追加的标签"
            emptyText="先在标签面板创建标签。"
            ariaLabel="批量打标标签树"
          />
          <section className="selected-tag-preview" aria-label="已选择标签">
            <div className="tag-filter-head">
              <span>已选标签</span>
              <button className="text-btn" type="button" disabled={disabled || !selectedTagIds.length} onClick={onClearTags}>
                清除
              </button>
            </div>
            {selectedTags.length ? (
              <div className="tags tag-paths">
                {selectedTags.map((tag) => (
                  <button
                    className="tag tag-button"
                    type="button"
                    key={tag.id}
                    title={tag.path}
                    disabled={disabled}
                    onClick={() => onTagChange(selectedTagIds.filter((id) => id !== tag.id))}
                  >
                    {tag.path.replaceAll("/", " / ")}
                    <X size={12} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">未选择标签。</p>
            )}
          </section>
          <div className="drawer-actions">
            <button className="btn btn-primary" type="button" disabled={disabled || !selectedTagIds.length} onClick={onApply}>
              追加标签
            </button>
            <button className="btn" type="button" disabled={disabled} onClick={onClearProjects}>
              清除项目选择
            </button>
            <button className="btn" type="button" disabled={disabled} onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

type ProjectDetailDrawerProps = {
  project: ProjectDetail | null;
  tags: TagNode[];
  aiStatus: AiTaggingStatus | null;
  onClose(): void;
  onSave(patch: Parameters<typeof api.updateProject>[1]): void;
  onCopyPath(path: string): void;
  onSuggestionApplied(project: ProjectDetail): void;
  onError(message: string): void;
};

function ProjectDetailDrawer({
  project,
  tags,
  aiStatus,
  onClose,
  onSave,
  onCopyPath,
  onSuggestionApplied,
  onError
}: ProjectDetailDrawerProps) {
  useEffect(() => {
    if (!project) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, project]);

  if (!project) {
    return null;
  }

  return (
    <div className="drawer-layer open" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="项目详情"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h2>项目详情</h2>
            <p className="muted">保存后的人工字段不会被后续扫描覆盖。</p>
          </div>
          <button className="icon-btn" type="button" aria-label="关闭项目详情" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          <ProjectDetailPanel
            project={project}
            tags={tags}
            aiStatus={aiStatus}
            onSave={onSave}
            onCopyPath={onCopyPath}
            onSuggestionApplied={onSuggestionApplied}
            onError={onError}
          />
        </div>
      </aside>
    </div>
  );
}

type TagsPageProps = {
  tags: TagNode[];
  projects: ProjectListItem[];
  onCreateTag(input: TagCreateInput): void;
  onUpdateTag(id: string, patch: TagUpdatePatch): void;
  onMoveTag(id: string, direction: TagMoveDirection): void;
  onDeleteTag(id: string): void;
  onBack(): void;
};

function TagsPage({ tags, projects, onCreateTag, onUpdateTag, onMoveTag, onDeleteTag, onBack }: TagsPageProps) {
  const [tagQuery, setTagQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(tags[0]?.id ?? null);
  const [createName, setCreateName] = useState("");
  const [createParentId, setCreateParentId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [moveParentId, setMoveParentId] = useState("");

  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null;

  useEffect(() => {
    if (!selectedTag && tags.length) {
      setSelectedTagId(tags[0].id);
    }
  }, [selectedTag, tags]);

  useEffect(() => {
    setRenameValue(selectedTag?.name ?? "");
    setMoveParentId(selectedTag?.parentId ?? "");
  }, [selectedTag]);

  const visibleTags = tags.filter((tag) =>
    normalizeSearch(`${tag.name} ${tag.path}`).includes(normalizeSearch(tagQuery))
  );
  const blockedParentIds = selectedTag
    ? new Set(tags.filter((tag) => tag.id === selectedTag.id || tag.path.startsWith(`${selectedTag.path}/`)).map((tag) => tag.id))
    : new Set<string>();
  const associatedProjects = selectedTag
    ? projects
        .filter((project) =>
          project.tags.some((tag) => tag.path === selectedTag.path || tag.path.startsWith(`${selectedTag.path}/`))
        )
        .filter((project) => normalizeSearch(`${project.name} ${project.path} ${project.tags.map((tag) => tag.path).join(" ")}`).includes(normalizeSearch(projectQuery)))
    : [];

  return (
    <>
      <section className="topbar">
        <div className="title-block">
          <h1>层级标签管理</h1>
          <p>左侧维护标签树，右侧处理创建、重命名、移动和删除；项目列表独立搜索，避免标签筛选和项目筛选互相干扰。</p>
        </div>
        <div className="top-actions">
          <button className="btn" type="button" onClick={onBack}>返回项目库</button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setCreateParentId("");
              setCreateName("");
            }}
          >
            新建一级标签
          </button>
        </div>
      </section>

      <div className="management-layout">
        <section className="panel tag-tree-panel" data-od-id="tag-tree">
          <div className="panel-head">
            <h2>标签树</h2>
            <span className="count">{visibleTags.length}</span>
          </div>
          <div className="panel-body">
            <label className="search-box" aria-label="搜索标签树">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder="搜索标签名称或层级路径"
                autoComplete="off"
              />
            </label>
            <p className="state-line">
              <span>{tagQuery ? "显示匹配的标签节点" : "显示全部标签节点"}</span>
              <span>{selectedTag ? selectedTag.path.replaceAll("/", " / ") : "未选择标签"}</span>
            </p>
            <div className="tree-list" role="tree" aria-label="标签树">
              {visibleTags.length ? visibleTags.map((tag) => (
                <div
                  className={`tree-node ${tag.id === selectedTagId ? "is-active" : ""}`}
                  role="treeitem"
                  tabIndex={0}
                  aria-selected={tag.id === selectedTagId}
                  aria-level={tag.depth + 1}
                  style={{ "--tag-depth": tag.depth } as CSSProperties}
                  key={tag.id}
                  onClick={() => setSelectedTagId(tag.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTagId(tag.id);
                    }
                  }}
                >
                  <span className="node-mark" aria-hidden="true" />
                  <span className="node-main">
                    <strong>{tag.name}</strong>
                    <small>{tag.path.replaceAll("/", " / ")}</small>
                  </span>
                  <span className="count">{tag.projectCount}</span>
                  <span className="tag-order-controls" aria-label={`${tag.path} 排序`}>
                    <button
                      className="icon-btn"
                      type="button"
                      title="上移"
                      aria-label={`上移 ${tag.name}`}
                      disabled={!canMoveSibling(tag, tags, "up")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTagId(tag.id);
                        onMoveTag(tag.id, "up");
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title="下移"
                      aria-label={`下移 ${tag.name}`}
                      disabled={!canMoveSibling(tag, tags, "down")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTagId(tag.id);
                        onMoveTag(tag.id, "down");
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </span>
                </div>
              )) : (
                <div className="empty-state">
                  <strong>没有匹配的标签</strong>
                  <span>调整搜索词或创建一个新标签。</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="panel" data-od-id="tag-editor">
          <div className="panel-head">
            <h2>{selectedTag ? selectedTag.path.replaceAll("/", " / ") : "标签编辑"}</h2>
            <span className="count">{associatedProjects.length}</span>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                <span>新标签名称</span>
                <input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="例如：数据转换" />
              </label>
              <label className="field">
                <span>新标签父级</span>
                <select value={createParentId} onChange={(event) => setCreateParentId(event.target.value)}>
                  <option value="">无（一级标签）</option>
                  {tags.map((tag) => (
                    <option value={tag.id} key={tag.id}>{tag.path.replaceAll("/", " / ")}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!createName.trim()}
              onClick={() => {
                onCreateTag({ name: createName, parentId: createParentId || null });
                setCreateName("");
              }}
            >
              创建标签
            </button>

            <div className="tag-editor-section">
              <div className="form-grid">
                <label className="field">
                  <span>标签名称</span>
                  <input
                    value={renameValue}
                    disabled={!selectedTag}
                    onChange={(event) => setRenameValue(event.target.value)}
                    placeholder="选择左侧标签"
                  />
                </label>
                <label className="field">
                  <span>移动到父级</span>
                  <select
                    value={moveParentId}
                    disabled={!selectedTag}
                    onChange={(event) => setMoveParentId(event.target.value)}
                  >
                    <option value="">无（一级标签）</option>
                    {tags.filter((tag) => !blockedParentIds.has(tag.id)).map((tag) => (
                      <option value={tag.id} key={tag.id}>{tag.path.replaceAll("/", " / ")}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="state-line">
                <span>{selectedTag ? "当前标签可安全编辑" : "选择一个标签后编辑"}</span>
                <span>名称不能包含 /</span>
              </p>
              <div className="inline-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!selectedTag || !renameValue.trim()}
                  onClick={() => selectedTag && onUpdateTag(selectedTag.id, { name: renameValue, parentId: moveParentId || null })}
                >
                  保存标签
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!selectedTag}
                  onClick={() => selectedTag && setCreateParentId(selectedTag.id)}
                >
                  创建子标签
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={!selectedTag}
                  onClick={() => selectedTag && onDeleteTag(selectedTag.id)}
                >
                  删除标签
                </button>
              </div>
            </div>

            <label className="search-box" aria-label="搜索关联项目">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder="在关联项目中搜索名称、路径或标签"
                autoComplete="off"
              />
            </label>
            <p className="state-line">
              <span>{selectedTag ? `当前标签关联 ${associatedProjects.length} 个项目` : "未选择标签"}</span>
              <span>父级自动包含子孙标签</span>
            </p>
            <div className="project-list">
              {associatedProjects.length ? associatedProjects.map((project) => (
                <article className="project-card" key={project.id}>
                  <strong>{project.name}</strong>
                  <span className="path">{project.path}</span>
                  <span className="tags">
                    {project.tags.slice(0, 4).map((tag) => <span className="tag" key={tag.id}>{tag.name}</span>)}
                  </span>
                </article>
              )) : (
                <div className="empty-state">
                  <strong>没有关联项目</strong>
                  <span>给项目追加这个标签后会显示在这里。</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

type ScanSourcesPageProps = {
  roots: ScanRoot[];
  projects: ProjectListItem[];
  issueCount: number;
  isBusy: boolean;
  isAddingRoot: boolean;
  scanSummary: ScanSummary | null;
  onBack(): void;
  onAddRoot(path: string): void;
  onToggleRoot(id: string, enabled: boolean): void;
  onRemoveRoot(id: string): void;
  onRunScan(): void;
  onScanRoot(id: string): void;
};

function ScanSourcesPage({
  roots,
  projects,
  issueCount,
  isBusy,
  isAddingRoot,
  scanSummary,
  onBack,
  onAddRoot,
  onToggleRoot,
  onRemoveRoot,
  onRunScan,
  onScanRoot
}: ScanSourcesPageProps) {
  const [path, setPath] = useState("");
  const [pendingRemove, setPendingRemove] = useState<ScanRoot | null>(null);
  const enabledCount = roots.filter((root) => root.enabled).length;

  return (
    <>
      <section className="topbar">
        <div className="title-block">
          <h1>扫描源</h1>
          <p>管理本地代码扫描根目录，启用后参与扫描全部；单个目录可即时扫描，移除前需要二次确认。</p>
        </div>
        <div className="top-actions">
          <button className="btn" type="button" onClick={onBack}>返回项目库</button>
          <button className="btn btn-primary" type="button" disabled={isBusy} onClick={onRunScan}>
            <RefreshCw size={16} /> 扫描全部
          </button>
        </div>
      </section>

      <section className="summary-grid" aria-label="扫描源统计">
        <article className="metric"><span>扫描源</span><strong>{roots.length}</strong></article>
        <article className="metric"><span>启用</span><strong>{enabledCount}</strong></article>
        <article className="metric"><span>索引项目</span><strong>{projects.length}</strong></article>
        <article className="metric"><span>待处理异常</span><strong>{issueCount}</strong></article>
      </section>

      <section className="panel" data-od-id="scan-source-form">
        <div className="panel-head">
          <h2>添加扫描源</h2>
          <span className="status">内联表单</span>
        </div>
        <div className="panel-body">
          <form
            className="form-row"
            onSubmit={(event) => {
              event.preventDefault();
              const normalized = path.trim();
              if (!normalized || isAddingRoot) return;
              onAddRoot(normalized);
              setPath("");
            }}
          >
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/Users/ddd/Documents 或 /Users/ddd/D/feiyu"
              aria-label="扫描源路径"
            />
            <button className="btn btn-primary" type="submit" disabled={!path.trim() || isAddingRoot}>
              添加并启用
            </button>
          </form>
        </div>
      </section>

      <section className="panel" data-od-id="scan-source-list">
        <div className="panel-head">
          <h2>扫描源列表</h2>
          <span className="status">{isBusy ? "扫描中" : scanSummary ? "上次扫描完成" : "空闲"}</span>
        </div>
        <div className="panel-body source-list">
          {roots.length ? roots.map((root) => (
            <article className="source-row" key={root.id}>
              <div className="source-main">
                <strong>{root.path}</strong>
                <span className="meta">创建 {formatDateTime(root.createdAt)} · 更新 {formatDateTime(root.updatedAt)}</span>
                <span className={`status ${root.enabled ? "" : "off"}`}>{root.enabled ? "已启用" : "已停用"}</span>
              </div>
              <div className="row-actions">
                <button
                  className={`switch ${root.enabled ? "" : "is-off"}`}
                  type="button"
                  aria-label={`${root.enabled ? "停用" : "启用"} ${root.path}`}
                  onClick={() => onToggleRoot(root.id, !root.enabled)}
                />
                <button className="btn" type="button" disabled={isBusy} onClick={() => onScanRoot(root.id)}>扫描</button>
                <button className="btn btn-danger" type="button" onClick={() => setPendingRemove(root)}>移除</button>
              </div>
            </article>
          )) : (
            <div className="empty-state">
              <strong>还没有扫描源</strong>
              <span>添加一个本地目录后，RepoLens 才会发现项目。</span>
            </div>
          )}
        </div>
      </section>

      {pendingRemove ? (
        <div className="dialog-layer open" role="presentation" onMouseDown={() => setPendingRemove(null)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-root-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="remove-root-title">移除扫描源</h2>
            <p className="muted">移除后不会删除本地文件，只会停止后续扫描并保留已有项目记录。</p>
            <p className="path">{pendingRemove.path}</p>
            <div className="row-actions">
              <button className="btn" type="button" onClick={() => setPendingRemove(null)}>取消</button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  onRemoveRoot(pendingRemove.id);
                  setPendingRemove(null);
                }}
              >
                确认移除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

type SettingsPageProps = {
  roots: ScanRoot[];
  projects: ProjectListItem[];
  openActions: OpenActionAvailability[];
  aiStatus: AiTaggingStatus | null;
  scanSummary: ScanSummary | null;
  onNavigate(route: RouteKey): void;
  onRefresh(): void;
};

function SettingsPage({ roots, projects, openActions, aiStatus, scanSummary, onNavigate, onRefresh }: SettingsPageProps) {
  const enabledCount = roots.filter((root) => root.enabled).length;
  const openAvailable = openActions.filter((action) => action.available).length;
  const latestRootUpdate = roots.map((root) => root.updatedAt).sort().at(-1) ?? null;

  return (
    <>
      <section className="topbar">
        <div className="title-block">
          <h1>设置状态</h1>
          <p>集中展示扫描源健康度、打开方式可用性和 AI 打标状态；本次不新增持久设置，只把系统状态讲清楚。</p>
        </div>
        <div className="top-actions">
          <button className="btn" type="button" onClick={() => onNavigate("scan-sources")}>管理扫描源</button>
          <button className="btn btn-primary" type="button" onClick={onRefresh}>刷新状态</button>
        </div>
      </section>

      <section className="summary-grid" aria-label="系统状态概览">
        <article className="metric"><span>启用扫描源</span><strong>{enabledCount}</strong></article>
        <article className="metric"><span>打开方式可用</span><strong>{openAvailable}/{openActions.length}</strong></article>
        <article className="metric"><span>AI 标签服务</span><strong>{aiStatus?.available ? "可用" : "未配置"}</strong></article>
        <article className="metric"><span>最近扫描</span><strong>{scanSummary ? "刚刚" : formatShortDateTime(latestRootUpdate)}</strong></article>
      </section>

      <p className="notice">设置页当前是状态页增强：显示依赖能力和健康度，不提供会写入配置的新选项。</p>

      <section className="settings-grid-page">
        <article className="panel" data-od-id="scan-status">
          <div className="panel-head">
            <h2>扫描源状态</h2>
            <span className="badge">{enabledCount ? "正常" : "未启用"}</span>
          </div>
          <div className="panel-body">
            {roots.map((root) => (
              <div className="status-item" key={root.id}>
                <span><strong>{root.path}</strong><span className="meta">{projects.filter((project) => project.path.startsWith(root.path)).length} 个项目 · {formatDateTime(root.updatedAt)}</span></span>
                <span className={`badge ${root.enabled ? "" : "warn"}`}>{root.enabled ? "启用" : "停用"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel" data-od-id="openers-status">
          <div className="panel-head">
            <h2>打开方式</h2>
            <span className={`badge ${openAvailable === openActions.length ? "" : "warn"}`}>
              {openAvailable === openActions.length ? "正常" : "部分缺失"}
            </span>
          </div>
          <div className="panel-body">
            {openActions.map((action) => (
              <div className="status-item" key={action.action}>
                <span><strong>{action.label}</strong><span className="meta">{action.reason ?? "已检测到可用入口"}</span></span>
                <span className={`badge ${action.available ? "" : "danger"}`}>{action.available ? "可用" : "不可用"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel" data-od-id="ai-status">
          <div className="panel-head">
            <h2>AI 打标</h2>
            <span className={`badge ${aiStatus?.available ? "" : "warn"}`}>{aiStatus?.available ? "可用" : "未配置"}</span>
          </div>
          <div className="panel-body">
            <div className="status-item">
              <span><strong>标签建议</strong><span className="meta">{aiStatus?.provider ?? "none"} · {aiStatus?.model ?? "无模型"}</span></span>
              <span className={`badge ${aiStatus?.available ? "" : "warn"}`}>{aiStatus?.available ? "启用" : "关闭"}</span>
            </div>
            <div className="status-item">
              <span><strong>批量追加</strong><span className="meta">仅追加，不覆盖已有标签</span></span>
              <span className="badge">受控</span>
            </div>
            <div className="status-item">
              <span><strong>失败处理</strong><span className="meta">空选择、空标签、接口错误都有提示</span></span>
              <span className="badge">完整</span>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

function routeFromLocation(): RouteKey {
  const hash = window.location.hash.replace("#", "");
  if (hash === "tags") return "tags";
  if (hash === "scan-roots" || hash === "scan-sources") return "scan-sources";
  if (hash === "settings") return "settings";
  return routeFromPath(window.location.pathname);
}

function routeFromPath(pathname: string): RouteKey {
  if (pathname === "/tags") return "tags";
  if (pathname === "/scan-sources" || pathname === "/scan-roots") return "scan-sources";
  if (pathname === "/settings") return "settings";
  return "library";
}

function pathForRoute(route: RouteKey): string {
  return ROUTES.find((item) => item.key === route)?.path ?? "/library";
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s*\/\s*/g, "/");
}

function canMoveSibling(tag: TagNode, tags: TagNode[], direction: TagMoveDirection): boolean {
  const siblings = tags.filter((item) => item.parentId === tag.parentId);
  const index = siblings.findIndex((item) => item.id === tag.id);
  if (direction === "up") {
    return index > 0;
  }
  return index >= 0 && index < siblings.length - 1;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return "操作失败";
}
