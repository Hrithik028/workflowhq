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

export function LoadingScreen({
  message,
  overlay = false,
  inline = false
}: {
  message: string;
  overlay?: boolean;
  inline?: boolean;
}) {
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

export function LoadingExperience({ disabled = false }: { disabled?: boolean }) {
  const location = useLocation();
  const isDisabled = disabled || location.pathname === "/";
  const pending = useSyncExternalStore(
    requestActivity.subscribe,
    requestActivity.getSnapshot,
    requestActivity.getSnapshot
  );
  const isPending = pending > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setVisible(!isDisabled && isPending),
      isPending ? 320 : 160
    );
    return () => window.clearTimeout(timer);
  }, [isDisabled, isPending]);

  if (!visible || isDisabled) return null;
  return <LoadingScreen message={messageFor(location.pathname)} overlay />;
}
