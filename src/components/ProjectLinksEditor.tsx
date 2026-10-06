import { useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/tauri";
import type { LinkEnv, ProjectDetail } from "../lib/types";

export const LINK_ENV_LABELS: Record<LinkEnv, string> = { local: "本地", test: "测试", prod: "正式", other: "其他" };

const SOURCE_TITLES = { auto: "扫描配置自动识别", agent: "AI 记录", user: "手动添加" } as const;

type Props = {
  project: ProjectDetail;
  onChanged(project: ProjectDetail, message: string): void;
  onError(message: string): void;
};

export function ProjectLinksEditor({ project, onChanged, onError }: Props) {
  const [env, setEnv] = useState<LinkEnv>("test");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function run(action: () => Promise<ProjectDetail>, message: string) {
    setIsSaving(true);
    try {
      onChanged(await action(), message);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function addLink() {
    if (!url.trim()) {
      onError("请填写链接地址");
      return;
    }
    await run(() => api.addProjectLink({ projectId: project.id, env, url, label }), "链接已添加");
    setUrl("");
    setLabel("");
  }

  async function openLink(target: string) {
    try {
      await api.openUrl(target);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="field">
      <span>访问链接</span>
      {project.links.length ? (
        <ul className="link-list">
          {project.links.map((link) => (
            <li className="link-row" key={link.id}>
              <span className={`env-badge env-${link.env}`}>{LINK_ENV_LABELS[link.env]}</span>
              <button className="link-url" type="button" title={`打开 ${link.url}`} onClick={() => void openLink(link.url)}>
                {link.url.replace(/^https?:\/\//, "")}
                <ExternalLink size={12} />
              </button>
              {link.label ? <span className="link-label">{link.label}</span> : null}
              {link.source !== "user" ? (
                <span className="link-source" title={SOURCE_TITLES[link.source]}>{link.source === "auto" ? "自动" : "AI"}</span>
              ) : null}
              <button
                className="link-remove"
                type="button"
                aria-label={`删除 ${link.url}`}
                disabled={isSaving}
                onClick={() => void run(() => api.deleteProjectLink(link.id), "链接已删除")}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted link-empty">还没有链接。启动 dev server 或部署后，AI 会通过 repolens 记录；也可以在这里手动添加。</p>
      )}
      <div className="link-add">
        <select value={env} aria-label="环境" onChange={(event) => setEnv(event.target.value as LinkEnv)}>
          {(Object.keys(LINK_ENV_LABELS) as LinkEnv[]).map((key) => (
            <option value={key} key={key}>{LINK_ENV_LABELS[key]}</option>
          ))}
        </select>
        <input
          className="link-add-label"
          value={label}
          placeholder="名称（可选）"
          aria-label="链接名称"
          onChange={(event) => setLabel(event.target.value)}
        />
        <input
          className="link-add-url"
          value={url}
          placeholder="https://… 或 localhost:3000"
          aria-label="链接地址"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addLink();
            }
          }}
        />
        <button className="tool" type="button" aria-label="添加链接" disabled={isSaving} onClick={() => void addLink()}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
