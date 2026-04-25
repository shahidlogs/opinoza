import { useState, useRef, useEffect } from "react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TYPE_ICON: Record<string, string> = {
  question_approved:        "✅",
  question_rejected:        "❌",
  question_answered:        "💬",
  creator_bonus:            "⭐",
  can_ask_question:         "🪙",
  withdrawal_submitted:     "📤",
  withdrawal_approved:      "✅",
  withdrawal_transferred:   "💸",
  withdrawal_rejected:      "❌",
  referral_signup:          "🎉",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleNotifClick(n: AppNotification) {
    if (!n.isRead) markRead(n.id);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(n.id)) {
        next.delete(n.id);
      } else {
        next.add(n.id);
      }
      return next;
    });
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        className="relative p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-all"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="fixed right-2 top-[4.25rem] w-[calc(100vw-1rem)] sm:absolute sm:right-0 sm:top-full sm:w-80 sm:mt-2 sm:inset-x-auto max-h-[65vh] sm:max-h-[420px] flex flex-col bg-white border border-border rounded-2xl shadow-xl z-[200] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="font-semibold text-sm text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                <div className="text-2xl mb-2">🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.map((n: AppNotification) => {
                const isExpanded = expanded.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-b-0 ${!n.isRead ? "bg-amber-50/60" : ""}`}
                  >
                    <span className="text-base shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${!n.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500 mt-1" />
                        )}
                      </div>
                      <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-line ${isExpanded ? "" : "line-clamp-2"}`}>
                        {n.message}
                      </p>
                      {!isExpanded && n.message.length > 80 && (
                        <span className="text-[11px] text-amber-600 mt-0.5 block">tap to read more</span>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
