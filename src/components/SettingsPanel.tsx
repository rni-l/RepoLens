import { Settings } from "lucide-react";

type Props = {
  enabledRootCount: number;
  totalRootCount: number;
  openActionCount: number;
};

export function SettingsPanel({ enabledRootCount, totalRootCount, openActionCount }: Props) {
  return (
    <section className="panel" id="settings" data-od-id="settings" tabIndex={-1}>
      <div className="panel-head">
        <h2>设置</h2>
        <span className="status">本地配置</span>
      </div>
      <div className="panel-body settings-panel">
        <div className="settings-lead">
          <span className="settings-icon" aria-hidden="true">
            <Settings size={18} />
          </span>
          <div>
            <strong>RepoLens 工作区</strong>
            <p className="muted">这里汇总当前索引入口和可用打开方式。扫描根的启停仍在上方列表里直接调整。</p>
          </div>
        </div>
        <div className="settings-grid">
          <div>
            <span>扫描根</span>
            <strong>{enabledRootCount} / {totalRootCount}</strong>
          </div>
          <div>
            <span>可用打开方式</span>
            <strong>{openActionCount}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
