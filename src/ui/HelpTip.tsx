import { useState, type ReactNode } from "react";
import { IconBtn } from "./IconBtn";
import { IconHelp } from "./Icons";

export function HelpTip({ title = "说明", children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-tip">
      <IconBtn title={title} onClick={() => setOpen((v) => !v)}>
        <IconHelp />
      </IconBtn>
      {open ? (
        <div className="help-tip-pop" role="dialog">
          {children}
          <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
            关闭
          </button>
        </div>
      ) : null}
    </span>
  );
}
