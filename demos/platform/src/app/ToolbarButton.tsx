import { ReactNode } from "react";

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  ariaLabel: string;
  children: ReactNode;
}

export default function ToolbarButton({ onClick, title, ariaLabel, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      style={{
        padding: "8px",
        backgroundColor: "#007acc",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "36px",
        height: "36px",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = "#005a9e";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = "#007acc";
      }}
      onFocus={(e) => {
        e.currentTarget.style.backgroundColor = "#005a9e";
      }}
      onBlur={(e) => {
        e.currentTarget.style.backgroundColor = "#007acc";
      }}
    >
      {children}
    </button>
  );
}
