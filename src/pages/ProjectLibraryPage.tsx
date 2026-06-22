import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Settings, Plus, Tags } from "lucide-react";
import { AddScanRootDialog } from "../components/AddScanRootDialog";
import { ProjectDetailPanel } from "../components/ProjectDetailPanel";
import { ProjectSearchBar, type FilterKey } from "../components/ProjectSearchBar";
import { ProjectTable } from "../components/ProjectTable";
import { ScanRootList } from "../components/ScanRootList";
import { SettingsPanel } from "../components/SettingsPanel";
import { TagTreePanel } from "../components/TagTreePanel";
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
  TagNode,
  TagUpdatePatch
} from "../lib/types";

type NavTarget = "library" | "tags" | "scan-roots" | "settings";

export function ProjectLibraryPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [scanRoots, setScanRoots] = useState<ScanRoot[]>([]);
  const [openActions, setOpenActions] = useState<OpenActionAvailability[]>([]);
  const [aiStatus, setAiStatus] = useState<AiTaggingStatus | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [toast, setToast] = useState("准备就绪");
  const [isBusy, setIsBusy] = useState(false);
  const [isAddRootOpen, setIsAddRootOpen] = useState(false);
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [activeNav, setActiveNav] = useState<NavTarget>("library");

  const filters = useMemo<ProjectFilters>(() => {
    const tagIds = selectedTagIds.length ? selectedTagIds : undefined;
    if (filter === "favorite") {
      return { query, favoriteOnly: true, tagIds };
    }
    if (filter === "all") {
      return { query, tagIds };
    }
    return { query, statuses: [filter], tagIds };
  }, [filter, query, selectedTagIds]);

  const load = useCallback(async () => {
    const [projectList, roots, actions] = await Promise.all([
      api.listProjects(filters),
      api.listScanRoots(),
      api.detectOpenActions()
    ]);
    const [tagList, status] = await Promise.all([
      api.listTags().catch(() => []),
      api.getAiTaggingStatus().catch(() => ({
        available: false as const,
        provider: "none",
        model: null,
        reason: "not_configured" as const
      }))
    ]);
    setProjects(projectList);
    setTags(tagList);
    setSelectedTagIds((current) => current.filter((tagId) => tagList.some((tag) => tag.id === tagId)));
    setScanRoots(roots);
    setOpenActions(actions);
    setAiStatus(status);
    if (projectList.length === 0) {
      setSelectedProject(null);
    } else if (!projectList.some((project) => project.id === selectedProject?.id)) {
      const nextProject = await api.getProject(projectList[0].id);
      setSelectedProject(nextProject);
    } else if (selectedProject) {
      const nextProject = await api.getProject(selectedProject.id);
      setSelectedProject(nextProject);
    }
  }, [filters, selectedProject?.id]);

  useEffect(() => {
    void load().catch((error) => showToast(errorMessage(error)));
  }, [load]);

  useEffect(() => {
    const syncActiveNav = () => {
      const target = window.location.hash.replace("#", "");
      if (target === "library" || target === "tags" || target === "scan-roots" || target === "settings") {
        setActiveNav(target);
      }
    };

    syncActiveNav();
    window.addEventListener("hashchange", syncActiveNav);
    return () => window.removeEventListener("hashchange", syncActiveNav);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const selectedId = selectedProject?.id ?? projects[0]?.id ?? null;
  const enabledRoots = scanRoots.filter((root) => root.enabled).length;
  const availableOpenActions = openActions.filter((action) => action.available).length;
  const issueCount = projects.filter((project) => project.status === "missing").length + (scanSummary?.errors.length ?? 0);
  const taggedProjectCount = projects.filter((project) => project.tags.length > 0).length;

  async function selectProject(projectId: string) {
    setSelectedProject(await api.getProject(projectId));
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

  async function openProject(projectId: string, action: OpenAction) {
    try {
      await api.openProject(projectId, action);
      const project = projects.find((item) => item.id === projectId);
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
      setSelectedTagIds((current) => current.filter((tagId) => !deletedIds.includes(tagId)));
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
      showToast(enabled ? "扫描根已启用" : "扫描根已停用");
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
      setIsAddRootOpen(false);
      showToast("扫描根已添加");
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setIsAddingRoot(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" data-od-id="sidebar">
        <a className="brand" href="/" aria-label="RepoLens">
          <span className="mark">RL</span>
          <span>RepoLens</span>
        </a>
        <nav className="nav-list" aria-label="主导航">
          <a
            className="nav-item"
            aria-current={activeNav === "library" ? "page" : undefined}
            href="#library"
            onClick={() => setActiveNav("library")}
          >
            <span className="nav-ico"><Search size={14} /></span><span>代码库</span>
          </a>
          <a
            className="nav-item"
            aria-current={activeNav === "tags" ? "page" : undefined}
            href="#tags"
            onClick={() => setActiveNav("tags")}
          >
            <span className="nav-ico"><Tags size={14} /></span><span>标签</span>
          </a>
          <a
            className="nav-item"
            aria-current={activeNav === "scan-roots" ? "page" : undefined}
            href="#scan-roots"
            onClick={() => setActiveNav("scan-roots")}
          >
            <span className="nav-ico"><RefreshCw size={14} /></span><span>扫描源</span>
          </a>
          <a
            className="nav-item"
            aria-current={activeNav === "settings" ? "page" : undefined}
            href="#settings"
            onClick={() => setActiveNav("settings")}
          >
            <span className="nav-ico"><Settings size={14} /></span><span>设置</span>
          </a>
        </nav>
        <section className="scan-panel" data-od-id="sidebar-scan">
          <h2>{scanSummary ? "上次扫描完成" : "本地索引就绪"}</h2>
          <p>
            {scanSummary
              ? `扫描 ${scanSummary.scannedRoots} 个启用根目录，发现 ${scanSummary.discoveredProjects} 个项目，${scanSummary.errors.length} 条异常。`
              : `已配置 ${enabledRoots} 个启用根目录。`}
          </p>
          <button className="btn btn-primary" type="button" disabled={isBusy} onClick={runScan}>
            <RefreshCw size={16} /> 重新扫描
          </button>
        </section>
      </aside>

      <main className="workspace">
        <section className="topbar" data-od-id="topbar">
          <div className="title-block">
            <h1>本地代码库</h1>
            <p>搜索项目、维护备注，并从一行记录直接打开常用开发工具。</p>
          </div>
          <div className="top-actions">
            <button className="btn" type="button" onClick={() => setIsAddRootOpen(true)}>
              <Plus size={16} /> 添加扫描根
            </button>
            <button className="btn btn-primary" type="button" disabled={isBusy} onClick={runScan}>
              <RefreshCw size={16} /> 扫描全部
            </button>
          </div>
        </section>

        <ProjectSearchBar
          query={query}
          activeFilter={filter}
          tags={tags}
          selectedTagIds={selectedTagIds}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onTagFilterChange={setSelectedTagIds}
        />

        <div className="content-grid">
          <div className="main-stack" id="library">
            <section className="summary-grid" data-od-id="summary">
              <article className="summary-card">
                <span>当前项目</span>
                <strong>{projects.length}</strong>
              </article>
              <article className="summary-card">
                <span>启用扫描根</span>
                <strong>{enabledRoots}</strong>
              </article>
              <article className="summary-card">
                <span>待处理异常</span>
                <strong>{issueCount}</strong>
              </article>
              <article className="summary-card">
                <span>已打标签项目</span>
                <strong>{taggedProjectCount}</strong>
              </article>
            </section>

            <ProjectTable
              projects={projects}
              selectedProjectId={selectedId}
              openActions={openActions}
              onSelect={(projectId) => void selectProject(projectId)}
              onOpen={(projectId, action) => void openProject(projectId, action)}
            />
          </div>

          <aside className="side-stack">
            <ProjectDetailPanel
              project={selectedProject}
              tags={tags}
              aiStatus={aiStatus}
              onSave={(patch) => void saveSelected(patch)}
              onCopyPath={(path) => void copyPath(path)}
              onSuggestionApplied={(project) => void applySuggestedProject(project)}
              onError={showToast}
            />
            <TagTreePanel
              tags={tags}
              selectedTagIds={selectedTagIds}
              onFilterChange={setSelectedTagIds}
              onCreateTag={(input) => void createTag(input)}
              onUpdateTag={(id, patch) => void updateTag(id, patch)}
              onDeleteTag={(id) => void deleteTag(id)}
            />
            <ScanRootList roots={scanRoots} onToggle={(id, enabled) => void toggleRoot(id, enabled)} />
            <SettingsPanel
              enabledRootCount={enabledRoots}
              totalRootCount={scanRoots.length}
              openActionCount={availableOpenActions}
            />
          </aside>
        </div>
      </main>

      <AddScanRootDialog
        open={isAddRootOpen}
        saving={isAddingRoot}
        onClose={() => setIsAddRootOpen(false)}
        onSubmit={(path) => void addRoot(path)}
      />

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
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
