import React, { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  isLegacyAuthReturn,
  isLegacyOperationalPath,
} from "@/lib/podcastRoutes";
import { isNativeApp } from "@/lib/platform";
import PodcastSite from "./pages/PodcastSite";

// The public podcast never mounts legacy booking/auth widgets. The packaged
// native application retains its existing routes and services.
const LegacyApp = lazy(() => import("./LegacyApp"));
export default function App() {
  const { pathname, search, hash } = useLocation();
  if (!isNativeApp() && isLegacyAuthReturn(pathname, search, hash)) {
    return <Navigate to={`/auth${search}${hash}`} replace />;
  }
  return isNativeApp() || isLegacyOperationalPath(pathname) ? (
    <Suspense fallback={<div role="status">Opening VANO…</div>}>
      <LegacyApp />
    </Suspense>
  ) : (
    <PodcastSite />
  );
}
