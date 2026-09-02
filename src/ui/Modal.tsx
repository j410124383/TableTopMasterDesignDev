import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
};

export function Modal({ children, onClose, closeOnBackdrop = false }: Props) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (!closeOnBackdrop) return;
        if (e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** 系统文件/文件夹窗口关闭后，浏览器会再派发一次点击，容易点穿对话框。 */
export function armPickerGhostClick(): void {
  const unlock = () => {
    document.body.style.pointerEvents = "";
    window.removeEventListener("pointerup", unlock, true);
    window.removeEventListener("click", unlock, true);
  };
  document.body.style.pointerEvents = "none";
  window.addEventListener("pointerup", unlock, true);
  window.addEventListener("click", unlock, true);
  window.setTimeout(unlock, 800);
}
