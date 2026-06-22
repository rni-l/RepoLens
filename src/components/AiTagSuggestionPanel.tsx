import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type {
  AiTaggingStatus,
  AiTagSuggestion,
  GenerateTagSuggestionsResult,
  ProjectDetail
} from "../lib/types";

type Props = {
  project: ProjectDetail | null;
  status: AiTaggingStatus | null;
  onApplied(project: ProjectDetail): void;
  onError(message: string): void;
};

export function AiTagSuggestionPanel({ project, status, onApplied, onError }: Props) {
  const [result, setResult] = useState<GenerateTagSuggestionsResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setResult(null);
    setSelectedIds(new Set());
  }, [project?.id]);

  const suggestions = result?.suggestions ?? [];
  const disabled = !project || loading || status?.available === false;

  async function generate() {
    if (!project) return;
    setLoading(true);
    try {
      const next = await api.generateTagSuggestions({ projectId: project.id, maxSuggestions: 5, allowNewTags: true });
      setResult(next);
      setSelectedIds(new Set(next.suggestions.filter((suggestion) => suggestion.confidence >= 0.8).map((suggestion) => suggestion.id)));
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (!project || !result) return;
    const picked = result.suggestions.filter((suggestion) => selectedIds.has(suggestion.id));
    if (!picked.length) return;
    setApplying(true);
    try {
      const updated = await api.applyTagSuggestions({
        projectId: project.id,
        mode: "append",
        suggestions: picked.map((suggestion) => ({
          tagId: suggestion.tagId,
          segments: suggestion.segments
        }))
      });
      onApplied(updated);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setApplying(false);
    }
  }

  function toggle(suggestion: AiTagSuggestion) {
    const next = new Set(selectedIds);
    if (next.has(suggestion.id)) {
      next.delete(suggestion.id);
    } else {
      next.add(suggestion.id);
    }
    setSelectedIds(next);
  }

  return (
    <section className="ai-tags">
      <div className="subhead">
        <div>
          <strong>AI 标签建议</strong>
          <span>{status?.available ? `${status.provider} · ${status.model}` : "未配置"}</span>
        </div>
        <button className="btn" type="button" disabled={disabled} onClick={() => void generate()}>
          <Sparkles size={15} /> {loading ? "正在生成标签建议" : "AI 建议标签"}
        </button>
      </div>

      {status?.available === false ? (
        <p className="muted">AI 未配置，手动标签功能不受影响。</p>
      ) : null}

      {result && suggestions.length === 0 ? <p className="muted">没有找到合适的新标签建议。</p> : null}

      {suggestions.length ? (
        <div className="suggestion-list">
          {suggestions.map((suggestion) => (
            <label className="suggestion-item" key={suggestion.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(suggestion.id)}
                onChange={() => toggle(suggestion)}
              />
              <span>
                <strong>{suggestion.path.replaceAll("/", " / ")}</strong>
                <small>
                  {Math.round(suggestion.confidence * 100)}% · {suggestion.kind === "existing_tag" ? "复用现有标签" : "将创建新路径"}
                </small>
                <em>{suggestion.rationale}</em>
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {result ? (
        <>
          <details className="prompt-preview">
            <summary>查看发送给 AI 的摘要</summary>
            <pre>{result.promptPreview}</pre>
          </details>
          <button className="btn btn-primary" type="button" disabled={!selectedIds.size || applying} onClick={() => void applySelected()}>
            应用所选标签
          </button>
        </>
      ) : null}
    </section>
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
