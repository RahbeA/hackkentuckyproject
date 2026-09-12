import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "../../api/client";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  event_type: string;
  payload: { trip_id?: string };
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => (await api.get("/notifications/", { params: { is_read: false, page_size: 1 } })).data,
    refetchInterval: 15000,
  });
  const { data: recent } = useQuery({
    queryKey: ["notifications", "recent"],
    enabled: open,
    queryFn: async () => (await api.get("/notifications/", { params: { page_size: 8 } })).data,
    refetchInterval: open ? 15000 : false,
  });

  const unreadCount = unread?.count ?? 0;
  const items: NotificationItem[] = recent?.results || [];

  const markRead = async (n: NotificationItem) => {
    if (!n.is_read) {
      await api.post(`/notifications/${n.id}/read/`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.payload?.trip_id) {
      setOpen(false);
      nav(`/app/trips/${n.payload.trip_id}`);
    }
  };

  const markAllRead = async () => {
    await api.post("/notifications/read-all/");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="relative p-2.5 rounded-lg border border-line text-slate hover:text-ink hover:bg-canvas transition-colors"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-bad text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-xl border border-navy/[0.08] shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy/[0.06]">
              <span className="font-bold text-sm text-ink">Notifications</span>
              <button
                className="text-xs font-semibold text-route hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="text-sm text-slate p-4">No notifications yet.</p>}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`w-full text-left px-4 py-3 border-b border-navy/[0.04] last:border-0 hover:bg-canvas transition-colors ${
                    n.is_read ? "" : "bg-accent-soft/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="h-2 w-2 rounded-full bg-route mt-1.5 shrink-0" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-sm text-ink truncate">{n.title}</span>
                        <span className="text-[11px] text-muted shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-xs text-slate mt-0.5 line-clamp-2">{n.body}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
