import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tenantsApi, type TenantWorkspace } from "../api/tenants";
import { getErrorMessage } from "../api/client";
import "./workspace-management.css";

export default function WorkspaceSwitcher({ isDemo }: { isDemo: boolean }) {
  const [workspaces, setWorkspaces] = useState<TenantWorkspace[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    tenantsApi
      .list()
      .then((result) => {
        if (!cancelled && result.meta.enabled) {
          setWorkspaces(result.data);
          setActive(result.meta.activeWorkspaceId);
        }
      })
      .catch(() => {
        /* Existing deployments can keep workspace management disabled. */
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo]);
  if (!workspaces.length) return null;
  const switchTo = async (id: number) => {
    setBusy(true);
    setError("");
    try {
      await tenantsApi.switchTo(id);
      window.location.assign("/app");
    } catch (failure) {
      setError(getErrorMessage(failure, "Could not switch workspaces."));
      setBusy(false);
    }
  };
  return (
    <div className="workspace-switcher">
      <label htmlFor="active-workspace">Workspace</label>
      <select
        id="active-workspace"
        value={active ?? ""}
        disabled={busy}
        onChange={(event) => void switchTo(Number(event.target.value))}
      >
        {!workspaces.some((item) => Number(item.id) === Number(active)) && (
          <option value="">Select a workspace</option>
        )}
        {workspaces.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <Link to="/workspaces">Manage workspaces</Link>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
