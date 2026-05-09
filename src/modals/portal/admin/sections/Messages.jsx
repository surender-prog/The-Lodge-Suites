import React, { useMemo, useState } from "react";
import { MessageCircle, Inbox } from "lucide-react";
import { usePalette } from "../../theme.jsx";
import { useData } from "../../../../data/store.jsx";
import { Card, PageHeader, Stat } from "../ui.jsx";
import { MessageThread, MessageThreadList } from "../../../../components/MessageThread.jsx";

// ---------------------------------------------------------------------------
// Messages — operator-side communications hub. Two-pane layout:
//   • Left:  every thread (booking-specific or account-general),
//            ordered by most recent message, with per-thread unread counts.
//   • Right: the active thread rendered through the shared MessageThread.
//
// Both panes read from the same `messages` slice in the store; sending a
// reply emits an "addMessage" action that the customer side picks up
// immediately (no manual refresh needed).
// ---------------------------------------------------------------------------
export const Messages = () => {
  const p = usePalette();
  const { messages, staffSession, agreements, agencies, members, bookings } = useData();

  // Operator viewer identity. Falls back to a generic "Operator" if the
  // staff session somehow isn't set (shouldn't happen in normal flow).
  const viewer = useMemo(() => ({
    type: "staff",
    id:   staffSession?.id   || "ADM-?",
    name: staffSession?.name ? `${staffSession.name} · ${staffSession.title || staffSession.role || "Operator"}` : "Operator",
  }), [staffSession]);

  // Snapshot stats for the KPI strip — quick at-a-glance.
  const stats = useMemo(() => {
    const totalThreads = new Set((messages || []).map((m) => m.threadKey)).size;
    const totalMsgs   = (messages || []).length;
    const unread      = (messages || []).filter((m) => !m.read && m.fromType !== "staff").length;
    const todayIso    = new Date().toISOString().slice(0, 10);
    const today       = (messages || []).filter((m) => (m.ts || "").startsWith(todayIso)).length;
    return { totalThreads, totalMsgs, unread, today };
  }, [messages]);

  const [activeKey, setActiveKey] = useState(null);

  // Resolve a friendly title + subtitle for the active thread header
  // (booking → guest + dates; account-level → company / agency / member).
  const activeMeta = useMemo(() => {
    if (!activeKey) return null;
    if (activeKey.startsWith("booking:")) {
      const id = activeKey.slice("booking:".length);
      const b = (bookings || []).find((x) => x.id === id);
      if (!b) return { title: id, subtitle: "Booking thread" };
      return {
        title: `${b.guest} · ${b.id}`,
        subtitle: `${b.checkIn} → ${b.checkOut} · ${b.nights || "?"}n · ${b.status} · ${b.source}`,
      };
    }
    if (activeKey.startsWith("account:corporate:")) {
      const id = activeKey.slice("account:corporate:".length);
      const a = (agreements || []).find((x) => x.id === id);
      return {
        title: a ? `${a.account} · ${a.id}` : id,
        subtitle: a ? `Corporate account · ${a.industry || "—"}` : "Corporate account",
      };
    }
    if (activeKey.startsWith("account:agent:")) {
      const id = activeKey.slice("account:agent:".length);
      const a = (agencies || []).find((x) => x.id === id);
      return {
        title: a ? `${a.name} · ${a.id}` : id,
        subtitle: a ? `Travel agent · ${a.commissionPct || 0}% commission` : "Travel agent",
      };
    }
    if (activeKey.startsWith("account:member:")) {
      const id = activeKey.slice("account:member:".length);
      const m = (members || []).find((x) => x.id === id);
      return {
        title: m ? `${m.name} · ${m.id}` : id,
        subtitle: m ? `LS Privilege · ${m.tier} member` : "LS Privilege member",
      };
    }
    return { title: activeKey, subtitle: "" };
  }, [activeKey, bookings, agreements, agencies, members]);

  return (
    <div>
      <PageHeader
        title="Messages"
        intro="Two-way conversations with corporate accounts, travel agents and LS Privilege members. Each booking has its own thread; account-level threads cover everything else."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Conversations" value={stats.totalThreads} hint={`${stats.totalMsgs} messages`} />
        <Stat label="Unread" value={stats.unread} hint={stats.unread === 0 ? "All caught up" : "Awaiting reply"} color={stats.unread > 0 ? p.danger : p.success} />
        <Stat label="Today" value={stats.today} hint="Messages exchanged" color={p.accent} />
        <Stat label="Channels" value={3} hint="Corporate · Agent · Member" />
      </div>

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px,1fr] gap-5">
        {/* Thread index (left) */}
        <Card padded={false} title={`All threads · ${stats.totalThreads}`}>
          <div style={{ maxHeight: "min(640px, 80vh)", overflowY: "auto" }}>
            <MessageThreadList
              palette={p}
              viewer={viewer}
              onSelectThread={(key) => setActiveKey(key)}
            />
          </div>
        </Card>

        {/* Active thread (right) */}
        <div>
          {activeKey && activeMeta ? (
            <MessageThread
              threadKey={activeKey}
              viewer={viewer}
              palette={p}
              title={activeMeta.title}
              subtitle={activeMeta.subtitle}
              placeholder="Reply to the customer…"
            />
          ) : (
            <Card>
              <div className="text-center" style={{ padding: "3.5rem 1.5rem", color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
                <Inbox size={36} style={{ margin: "0 auto 12px", opacity: 0.55 }} />
                <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.35rem" }}>
                  Pick a conversation
                </div>
                <div style={{ marginTop: 6, fontSize: "0.86rem", maxWidth: 380, marginInline: "auto", lineHeight: 1.55 }}>
                  Select a thread on the left to read the conversation history and reply. Unread threads bubble to the top.
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
