import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "@/components/ui/sonner";

/**
 * Listens for a waiting service worker (new deploy) and shows a bottom toast with Refresh.
 * Uses `registerType: "prompt"` in vite.config so we only skipWaiting after the user confirms.
 */
export function PwaUpdateToast() {
  const toastIdRef = useRef<string | number | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    if (!needRefresh) {
      toastIdRef.current = null;
      return;
    }

    if (toastIdRef.current != null) return;

    const id = toast("New version available — click to update", {
      description: "Get the latest VANO fixes and features.",
      duration: Infinity,
      position: "bottom-center",
      action: {
        label: "Update",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      onDismiss: () => {
        setNeedRefresh(false);
        toastIdRef.current = null;
      },
    });
    toastIdRef.current = id;

    return () => {
      if (toastIdRef.current === id) {
        toast.dismiss(id);
        toastIdRef.current = null;
      }
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
