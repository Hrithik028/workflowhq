import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

import { requestActivity } from "../api/requestActivity";
import BrandMark from "./BrandMark";
import PublicGlow from "./PublicGlow";
import "./loading-experience.css";

const messageFor = (pathname: string) => {
  if (pathname.startsWith("/workflow")) return "Opening your workflow";
  if (pathname.startsWith("/tasks")) return "Gathering your tasks";
  if (pathname.startsWith("/projects")) return "Loading project context";
  if (pathname.startsWith("/settings")) return "Preparing your settings";
  if (pathname === "/login") return "Signing you in";
  return "Preparing your workspace";
};

interface LoadingScreenProps {
  message: string;
  overlay?: boolean;
  inline?: boolean;
}

export function LoadingScreen({ message, overlay = false, inline = false }: LoadingScreenProps) {
  return (
    <div
      className={`work-loading-screen${overlay ? " work-loading-overlay" : inline ? " work-loading-inline" : ""}`}
      role="status"
      aria-live="polite"
    >
      {!overlay && !inline && <PublicGlow className="work-loading-ribbon" size={125} />}
      <div className="work-loading-card">
        <div className="work-loading-identity">
          <span className="work-loading-mark" aria-hidden="true">
            <BrandMark width={22} height={22} />
          </span>
          <span>WORKFLOWHQ</span>
        </div>
        <p>{message}</p>
        <div className="work-loading-track" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}

// Mount only while loading. Unmounting cancels the timer and immediately hides
// the indicator, so separate quick requests never accumulate toward the delay.
export function DelayedLoadingScreen(props: LoadingScreenProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <LoadingScreen {...props} /> : null;
}

export function LoadingExperience({ disabled = false }: { disabled?: boolean }) {
  const location = useLocation();
  const isDisabled = disabled || location.pathname === "/";
  const pending = useSyncExternalStore(
    requestActivity.subscribe,
    requestActivity.getSnapshot,
    requestActivity.getSnapshot
  );
  if (pending === 0 || isDisabled) return null;
  return (
    <DelayedLoadingScreen key={location.key} message={messageFor(location.pathname)} overlay />
  );
}
