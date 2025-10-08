import { useEffect } from "react";

/**
 * Hook to show a warning when the user tries to leave the page with unsaved changes
 *
 * @param hasUnsavedChanges - Boolean indicating if there are unsaved changes
 * @param message - Optional custom message to display (browser dependent)
 */
export function useBeforeUnload(
  hasUnsavedChanges: boolean,
  message = "You have unsaved changes. Are you sure you want to leave?",
) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      // Modern browsers don't actually show this message, but require you to set returnValue
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    if (hasUnsavedChanges) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message]);
}
