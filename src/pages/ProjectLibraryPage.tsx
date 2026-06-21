import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Settings, Plus } from "lucide-react";
import { AddScanRootDialog } from "../components/AddScanRootDialog";
import { ProjectDetailPanel } from "../components/ProjectDetailPanel";
import { ProjectSearchBar, type FilterKey } from "../components/ProjectSearchBar";
import { ProjectTable } from "../components/ProjectTable";
import { ScanRootList } from "../components/ScanRootList";
import { SettingsPanel } from "../components/SettingsPanel";
import { api } from "../lib/tauri";
import type {
  OpenAction,
  OpenActionAvailability,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ScanRoot,
  ScanSummary
} from "../lib/types";

type NavTarget = "library" | "scan-roots" | "settings";

export function ProjectLibraryPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [scanRoots, setScanRoots] = useState<ScanRoot[]>([]);
  const [openActions, setOpenActions] = useState<OpenActionAvailability[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [toast, setToast] = useState("准备就绪");
  const [isBusy, setIsBusy] = useState(false);
  const [isAddRootOpen, setIsAddRootOpen] = useState(false);
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [activeNav, setActiveNav] = useState<NavTarget>("library");

  const filters = useMemo<ProjectFilters>(() => {
    if (filter === "favorite") {
      return { query, favoriteOnly: true };
    }
    if (filter === "all") {
      return { query };
    }
    return { query, statuses: [filter] };
  }, [filter, query]);

  const load = useCallback(async () => {
    const [projectList, roots, actions] = await Promise.all([
      api.listProjects(filters),
      api.listScanRoots(),
      api.detectOpenActions()
    ]);
    setProjects(projectList);
    setScanRoots(roots);
    setOpenActions(actions);
    if (projectList.length === 0) {
      setSelectedProject(null);
    } else if (!projectList.some((project) => project.id === selectedProject?.id)) {
      const nextProject = await api.getProject(projectList[0].id);
      setSelectedProject(nextProject);
    }
  }, [filters, selectedProject?.id]);

  useEffect(() => {
    void load().catch((error) => showToast(errorMessage(error)));
  }, [load]);

  useEffect(() => {
    const syncActiveNav = () => {
      const target = window.location.hash.replace("#", "");
      if (target === "library" || target === "scan-roots" || target === "settings") {
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
          onQueryChange={setQuery}
          onFilterChange={setFilter}
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
              onSave={(patch) => void saveSelected(patch)}
              onCopyPath={(path) => void copyPath(path)}
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
