import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { notificationApi, type WorkspaceNotification } from "../api/notifications";
import type { LayoutContext } from "../components/AppLayout";
import { formatRelativeTime } from "../utils/format";
import "./notifications.css";

function Notifications() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkspaceNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(!isDemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (onlyUnread: boolean) => {
    setLoading(true);
    try {
      const result = await notificationApi.list(onlyUnread);
      setItems(result.data);
      setUnreadCount(result.unreadCount);
      setHasMore(result.hasMore);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load notifications."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    void notificationApi
      .list(unreadOnly)
      .then((result) => {
        if (cancelled) return;
        setItems(result.data);
        setUnreadCount(result.unreadCount);
        setHasMore(result.hasMore);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError, "Unable to load notifications."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo, unreadOnly]);

  const openNotification = async (notification: WorkspaceNotification) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!notification.readAt) await notificationApi.markRead(notification.id);
      if (notification.taskId) navigate(`/tasks/${notification.taskId}`);
      else if (notification.projectId) navigate(`/workflow?project=${notification.projectId}`);
      else await load(unreadOnly);
    } catch (actionError) {
      setError(getErrorMessage(actionError, "Unable to open this notification."));
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    try {
      await notificationApi.markAllRead();
      await load(unreadOnly);
    } catch (actionError) {
      setError(getErrorMessage(actionError, "Unable to mark notifications as read."));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    setBusy(true);
    try {
      const result = await notificationApi.list(unreadOnly, items.length);
      setItems((current) => [...current, ...result.data]);
      setUnreadCount(result.unreadCount);
      setHasMore(result.hasMore);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load more notifications."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="workspace-page editorial-page notifications-page">
      <div className="notifications-heading">
        <div>
          <p className="overline">WORKSPACE / UPDATES</p>
          <h1>Notifications.</h1>
          <p>Assignments, project access, and comments that need your attention.</p>
        </div>
        <Bell size={35} strokeWidth={1.5} aria-hidden="true" />
      </div>

      {isDemo ? (
        <section className="notifications-empty">
          Sign in to a workspace to receive notifications.
        </section>
      ) : (
        <>
          <div className="notifications-toolbar">
            <span>{unreadCount} unread</span>
            <label>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => {
                  setLoading(true);
                  setUnreadOnly(event.target.checked);
                }}
              />
              Unread only
            </label>
            <button type="button" disabled={loading} onClick={() => void load(unreadOnly)}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              type="button"
              disabled={busy || unreadCount === 0}
              onClick={() => void markAllRead()}
            >
              <CheckCheck size={15} /> Mark all read
            </button>
          </div>
          {error && (
            <p className="notifications-error" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="notifications-empty">Loading notifications…</p>
          ) : items.length === 0 ? (
            <p className="notifications-empty">
              {unreadOnly ? "You’re all caught up." : "No notifications yet."}
            </p>
          ) : (
            <div className="notifications-list">
              {items.map((notification) => (
                <button
                  className={notification.readAt ? "notification-item" : "notification-item unread"}
                  type="button"
                  key={notification.id}
                  disabled={busy}
                  onClick={() => void openNotification(notification)}
                >
                  <span className="notification-marker" aria-hidden="true" />
                  <span className="notification-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                  </span>
                  <time dateTime={notification.createdAt}>
                    {formatRelativeTime(notification.createdAt)}
                  </time>
                </button>
              ))}
              {hasMore && (
                <button type="button" disabled={busy} onClick={() => void loadMore()}>
                  Load more notifications
                </button>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default Notifications;
