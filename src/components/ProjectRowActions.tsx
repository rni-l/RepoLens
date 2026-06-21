import { Code2, Folder, MousePointer, SquareTerminal, Terminal, type LucideIcon } from "lucide-react";
import type { OpenAction, OpenActionAvailability } from "../lib/types";

const ACTIONS: Array<{ action: OpenAction; title: string; icon: LucideIcon }> = [
  { action: "folder", title: "文件夹", icon: Folder },
  { action: "terminal", title: "终端", icon: Terminal },
  { action: "iterm2", title: "iTerm2", icon: SquareTerminal },
  { action: "vscode", title: "VS Code", icon: Code2 },
  { action: "cursor", title: "Cursor", icon: MousePointer }
];

type Props = {
  availability: OpenActionAvailability[];
  disabled?: boolean;
  onOpen(action: OpenAction): void;
};

export function ProjectRowActions({ availability, disabled = false, onOpen }: Props) {
  return (
    <span className="actions" onClick={(event) => event.stopPropagation()}>
      {ACTIONS.map(({ action, title, icon: Icon }) => {
        const state = availability.find((item) => item.action === action);
        const unavailable = disabled || state?.available === false;
        return (
          <button
            className="tool"
            type="button"
            key={action}
            title={state?.reason ?? title}
            aria-label={title}
            disabled={unavailable}
            onClick={() => onOpen(action)}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </span>
  );
}
