import { useEffect, useState } from "react";

export const usePointerInteractions = () => {
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [isPointerReleased, setIsPointerReleased] = useState(false);

  const handlePointerDown = () => {
    setIsPointerDown(true);
    setIsPointerReleased(false);
  };

  const handlePointerUp = () => {
    setIsPointerDown(false);
    setIsPointerReleased(true);
  };

  useEffect(() => {
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  return { isPointerDown, isPointerReleased };
};
