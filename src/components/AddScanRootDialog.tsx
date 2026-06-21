import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";

type Props = {
  open: boolean;
  saving?: boolean;
  onClose(): void;
  onSubmit(path: string): void;
};

export function AddScanRootDialog({ open, saving = false, onClose, onSubmit }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");

  useEffect(() => {
    if (!open) {
      setPath("");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, saving]);

  if (!open) {
    return null;
  }

  const normalizedPath = path.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedPath || saving) {
      return;
    }
    onSubmit(normalizedPath);
  }

  return (
    <div className="modal-layer" role="presentation" onMouseDown={() => !saving && onClose()}>
      <form
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-icon" aria-hidden="true">
            <FolderPlus size={18} />
          </span>
          <div>
            <h2 id={titleId}>添加扫描根</h2>
            <p id={descriptionId}>把一个本地目录加入 RepoLens，后续扫描会从这里发现项目。</p>
          </div>
          <button className="icon-btn" type="button" aria-label="关闭弹窗" disabled={saving} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field" htmlFor={inputId}>
          <span>扫描根路径</span>
          <input
            ref={inputRef}
            id={inputId}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/Users/you/Projects"
            autoComplete="off"
          />
        </label>

        <div className="modal-actions">
          <button className="btn" type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" type="submit" disabled={!normalizedPath || saving}>
            {saving ? "添加中" : "添加"}
          </button>
        </div>
      </form>
    </div>
  );
}
