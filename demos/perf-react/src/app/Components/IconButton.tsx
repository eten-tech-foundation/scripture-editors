import { JSX } from "react";

export function IconButton({
  icon,
  active,
  onClick,
}: { icon: string; active: boolean } & JSX.IntrinsicElements["button"]) {
  return (
    <button style={{ backgroundColor: active ? "blue" : "gray" }} onClick={onClick}>
      <i>{icon}</i>
    </button>
  );
}

export default IconButton;
