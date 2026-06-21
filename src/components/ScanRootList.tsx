import type { ScanRoot } from "../lib/types";

type Props = {
  roots: ScanRoot[];
  onToggle(id: string, enabled: boolean): void;
};

export function ScanRootList({ roots, onToggle }: Props) {
  const enabledCount = roots.filter((root) => root.enabled).length;
  return (
    <section className="panel" data-od-id="scan-roots">
      <div className="panel-head">
        <h2>扫描根</h2>
        <span className="status">{enabledCount} 个启用</span>
      </div>
      <div className="panel-body root-list">
        {roots.map((root) => (
          <article className="root-item" key={root.id}>
            <div>
              <strong>{root.path}</strong>
              <span>{root.enabled ? "启用中，会参与下一轮扫描" : "已停用，保留历史项目记录"}</span>
            </div>
            <button
              className={`switch ${root.enabled ? "" : "is-off"}`}
              type="button"
              aria-label={`${root.enabled ? "停用" : "启用"} ${root.path}`}
              onClick={() => onToggle(root.id, !root.enabled)}
            />
          </article>
        ))}
        {roots.length === 0 ? <p className="muted">还没有扫描根。</p> : null}
      </div>
    </section>
  );
}
