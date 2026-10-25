import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { NotificationsContext } from "./notifications-context";
import { getNotifications, markNotificationsRead, subscribeToNotifications } from "../lib/api";
import { browserAlertsSupported, describeNotification } from "../lib/notifications";

export function NotificationsProvider({ children }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [permission, setPermission] = useState(() =>
    browserAlertsSupported() ? Notification.permission : "unsupported",
  );
  const userId = profile ? user?.id : null;

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    getNotifications()
      .then((list) => !cancelled && setItems(list))
      .catch(() => {});

    const unsubscribe = subscribeToNotifications(userId, (notification) => {
      setItems((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)]);
      // Browser alert while Katha is open in a background tab.
      if (browserAlertsSupported() && Notification.permission === "granted" && document.visibilityState === "hidden") {
        const { text, href } = describeNotification(notification);
        const alert = new Notification("Katha", { body: text, tag: notification.id, icon: "/katha.svg" });
        alert.onclick = () => {
          window.focus();
          navigate(href);
          alert.close();
        };
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId, navigate]);

  const markRead = useCallback(async (ids) => {
    const unread = ids.filter((id) => items.find((n) => n.id === id && !n.read_at));
    if (!unread.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (unread.includes(n.id) ? { ...n, read_at: now } : n)));
    await markNotificationsRead(unread).catch(() => {});
  }, [items]);

  const requestBrowserAlerts = useCallback(async () => {
    if (!browserAlertsSupported()) return;
    setPermission(await Notification.requestPermission());
  }, []);

  const value = useMemo(
    () => ({
      items,
      unreadCount: items.filter((n) => !n.read_at).length,
      markRead,
      permission,
      requestBrowserAlerts,
    }),
    [items, markRead, permission, requestBrowserAlerts],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
