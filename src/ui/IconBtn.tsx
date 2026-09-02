import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
};

export function IconBtn({ title, active, danger, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`icon-btn ${active ? "active" : ""} ${danger ? "danger" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
