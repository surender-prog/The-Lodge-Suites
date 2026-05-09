import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageCircle, Inbox, Building2, Briefcase, Sparkles, ShieldCheck } from "lucide-react";
import { useData } from "../data/store.jsx";

// ---------------------------------------------------------------------------
// MessageThread — reusable two-way chat surface used by:
//   • Guest Portal Messages tab        (per-account or per-booking thread)
//   • Booking workspace Messages panel (booking-specific thread)
//   • Partner Portal Messages section  (operator-side, every thread)
//
// Props:
//   threadKey   — required. "booking:LS-XXX" or "account:<kind>:<accountId>"
//   viewer      — { type: "staff"|"corporate"|"agent"|"member", id, name }
//                 the active sender. Used to mark inbound messages as read,
//                 align bubbles left/right, and stamp new messages.
//   palette     — usePalette() result for theme alignment
//   title       — optional thread label (e.g. "Booking LS-B3M1Q7")
//   subtitle    — optional one-line subtitle (e.g. guest name + dates)
//   placeholder — composer placeholder, defaults to a friendly default
// ---------------------------------------------------------------------------

const FROM_ICON = {
  staff:     ShieldCheck,
  corporate: Building2,
  agent:     Briefcase,
  member:    Sparkles,
};
const FROM_LABEL = {
  staff:     "Hotel team",
  corporate: "Corporate",
  agent:     "Travel agent",
  member:    "Member",
};

// Theme-aware bubble colour for each sender role. The viewer's own
// messages always use the brand gold; everyone else gets a tinted neutral
// or role-coloured bubble so it's easy to scan a thread.
function bubbleColors(fromType, isOwn, p) {
  if (isOwn) {
    return {
      bg: p.accent,
      ink: p.theme === "light" ? "#FFFFFF" : "#15161A",
      border: p.accent,
      muted: p.theme === "light" ? "rgba(255,255,255,0.7)" : "rgba(21,22,26,0.65)",
    };
  }
  if (fromType === "staff") {
    return { bg: p.bgPanelAlt, ink: p.textPrimary, border: p.border, muted: p.textMuted };
  }
  // Customer reading their own messages from the staff side gets a
  // softer neutral bubble.
  return { bg: p.bgPanel, ink: p.textPrimary, border: p.border, muted: p.textMuted };
}

const fmtThreadTs = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
};

export const MessageThread = ({
  threadKey, viewer, palette: p,
  title, subtitle, placeholder = "Write a message…",
}) => {
  const { messages, addMessage, markThreadRead } = useData();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  // Pull only messages for this thread, in chronological order.
  const thread = useMemo(() => {
    return (messages || [])
      .filter((m) => m.threadKey === threadKey)
      .sort((a, b) => new Date(a.ts) - new Date(b.ts));
  }, [messages, threadKey]);

  // Auto-scroll to the bottom whenever a new message lands. The flex-
  // direction of the scroll container is column with overflow-y, so
  // setting scrollTop to scrollHeight pins the latest at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.length, threadKey]);

  // Mark inbound messages as read whenever the viewer opens the thread
  // or new messages arrive. We pass the viewer's `type` to the store so
  // it knows which messages are "outgoing" vs. "incoming".
  useEffect(() => {
    if (!threadKey || !viewer?.type) return;
    markThreadRead(threadKey, viewer.type);
  }, [threadKey, thread.length, viewer?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    const body = draft.trim();
    if (!body || !viewer?.type) return;
    addMessage({
      threadKey,
      fromType: viewer.type,
      fromId:   viewer.id,
      fromName: viewer.name,
      body,
    });
    setDraft("");
  };

  // Submit on Enter; Shift+Enter inserts a newline. Standard chat UX.
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isStaffViewer = viewer?.type === "staff";

  return (
    <div className="flex flex-col" style={{
      backgroundColor: p.bgPanel,
      border: `1px solid ${p.border}`,
      minHeight: 360,
      maxHeight: "min(640px, 80vh)",
    }}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
          {title && (
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.4rem", color: p.textPrimary, lineHeight: 1.1 }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 px-5 py-4" style={{ overflowY: "auto", backgroundColor: p.bgPage || p.bgPanelAlt }}>
        {thread.length === 0 ? (
          <div className="text-center" style={{ padding: "3rem 1rem", color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
            <MessageCircle size={28} style={{ margin: "0 auto 10px", opacity: 0.55 }} />
            <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.15rem" }}>
              {isStaffViewer ? "No messages yet" : "Start the conversation"}
            </div>
            <div style={{ marginTop: 6, fontSize: "0.84rem", maxWidth: 320, marginInline: "auto", lineHeight: 1.55 }}>
              {isStaffViewer
                ? "When the customer writes, their message will appear here."
                : "Send a question, request or update to the hotel team. Replies typically arrive within an hour during business hours."}
            </div>
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {thread.map((m) => {
              const isOwn = m.fromType === viewer?.type;
              const c     = bubbleColors(m.fromType, isOwn, p);
              const Icon  = FROM_ICON[m.fromType] || MessageCircle;
              return (
                <li key={m.id} style={{
                  display: "flex", flexDirection: "column",
                  alignItems: isOwn ? "flex-end" : "flex-start",
                  gap: 4,
                }}>
                  {/* Sender row — small icon + name + timestamp */}
                  <div className="flex items-center gap-2" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", color: p.textMuted }}>
                    <Icon size={10} style={{ color: isOwn ? p.accent : p.textMuted }} />
                    <span style={{ fontWeight: 600, color: p.textPrimary }}>
                      {isOwn ? "You" : m.fromName || FROM_LABEL[m.fromType] || "Sender"}
                    </span>
                    <span>·</span>
                    <span>{fmtThreadTs(m.ts)}</span>
                  </div>
                  {/* Bubble */}
                  <div style={{
                    maxWidth: "min(85%, 480px)",
                    padding: "0.7rem 0.95rem",
                    backgroundColor: c.bg, color: c.ink,
                    border: `1px solid ${c.border}`,
                    fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem",
                    lineHeight: 1.55, whiteSpace: "pre-wrap",
                  }}>
                    {m.body}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="px-4 py-3" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={2}
            className="flex-1 outline-none"
            style={{
              backgroundColor: p.inputBg, color: p.textPrimary,
              border: `1px solid ${p.border}`,
              padding: "0.6rem 0.75rem",
              fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem",
              resize: "none", lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            title="Send (Enter)"
            aria-label="Send message"
            style={{
              padding: "0.65rem 1rem",
              backgroundColor: draft.trim() ? p.accent : `${p.accent}40`,
              color: draft.trim() ? (p.theme === "light" ? "#FFFFFF" : "#15161A") : p.textMuted,
              border: `1px solid ${draft.trim() ? p.accent : `${p.accent}40`}`,
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem",
              letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700,
              cursor: draft.trim() ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", gap: 6,
              alignSelf: "stretch", flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (draft.trim()) e.currentTarget.style.backgroundColor = p.accentBright || p.accent; }}
            onMouseLeave={(e) => { if (draft.trim()) e.currentTarget.style.backgroundColor = p.accent; }}
          >
            <Send size={12} /> Send
          </button>
        </div>
        <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", marginTop: 6 }}>
          Press <strong style={{ color: p.textPrimary }}>Enter</strong> to send · Shift+Enter for a new line
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MessageThreadList — operator-side index of every customer thread, with
// per-thread unread counts. Selecting a thread renders the MessageThread
// component for that key. Used in the Partner Portal Messages section.
// ---------------------------------------------------------------------------
export const MessageThreadList = ({ palette: p, viewer, onSelectThread }) => {
  const { messages, agreements, agencies, members, bookings } = useData();

  // Group messages by threadKey, computing per-thread metadata (last
  // message, unread count, parties involved) for the index card.
  const threads = useMemo(() => {
    const map = new Map();
    (messages || []).forEach((m) => {
      if (!map.has(m.threadKey)) map.set(m.threadKey, []);
      map.get(m.threadKey).push(m);
    });
    const out = [];
    map.forEach((msgs, key) => {
      msgs.sort((a, b) => new Date(a.ts) - new Date(b.ts));
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => !m.read && m.fromType !== viewer?.type).length;
      // Resolve the customer-side label for the thread.
      let label = key;
      let kind  = null;
      if (key.startsWith("booking:")) {
        const bookingId = key.slice("booking:".length);
        const booking = (bookings || []).find((b) => b.id === bookingId);
        kind = "booking";
        label = booking ? `${booking.guest} · ${booking.id}` : bookingId;
      } else if (key.startsWith("account:corporate:")) {
        const id = key.slice("account:corporate:".length);
        const a = (agreements || []).find((x) => x.id === id);
        kind = "corporate";
        label = a ? `${a.account} · ${a.id}` : id;
      } else if (key.startsWith("account:agent:")) {
        const id = key.slice("account:agent:".length);
        const a = (agencies || []).find((x) => x.id === id);
        kind = "agent";
        label = a ? `${a.name} · ${a.id}` : id;
      } else if (key.startsWith("account:member:")) {
        const id = key.slice("account:member:".length);
        const m = (members || []).find((x) => x.id === id);
        kind = "member";
        label = m ? `${m.name} · ${m.id}` : id;
      }
      out.push({ key, kind, label, last, unread, count: msgs.length });
    });
    out.sort((a, b) => new Date(b.last?.ts || 0) - new Date(a.last?.ts || 0));
    return out;
  }, [messages, agreements, agencies, members, bookings, viewer?.type]);

  if (threads.length === 0) {
    return (
      <div className="text-center" style={{ padding: "3.5rem 2rem", color: p.textMuted, fontFamily: "'Manrope', sans-serif" }}>
        <Inbox size={36} style={{ margin: "0 auto 12px", opacity: 0.55 }} />
        <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.25rem" }}>
          No conversations yet
        </div>
        <div style={{ marginTop: 6, fontSize: "0.86rem", maxWidth: 360, marginInline: "auto", lineHeight: 1.55 }}>
          When customers send a message — about a booking, an invoice, or a general enquiry — the thread will appear here.
        </div>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {threads.map((t) => {
        const Icon = t.kind === "booking" ? MessageCircle
          : t.kind === "corporate" ? Building2
          : t.kind === "agent" ? Briefcase
          : t.kind === "member" ? Sparkles
          : MessageCircle;
        const kindLabel = t.kind === "booking" ? "Booking"
          : t.kind === "corporate" ? "Corporate account"
          : t.kind === "agent" ? "Travel agent"
          : t.kind === "member" ? "LS Privilege"
          : "Thread";
        return (
          <li key={t.key}>
            <button
              onClick={() => onSelectThread?.(t.key)}
              className="w-full text-start"
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "1rem 1.2rem",
                backgroundColor: t.unread > 0 ? p.bgPanelAlt : "transparent",
                border: "none",
                borderBottom: `1px solid ${p.border}`,
                cursor: "pointer",
                fontFamily: "'Manrope', sans-serif",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.bgHover || `${p.accent}10`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = t.unread > 0 ? p.bgPanelAlt : "transparent"; }}
            >
              <span style={{
                flexShrink: 0, width: 36, height: 36,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                backgroundColor: `${p.accent}15`, border: `1px solid ${p.accent}50`, color: p.accent,
              }}>
                <Icon size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div style={{ color: p.textPrimary, fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.1rem", lineHeight: 1.2 }}>
                    {t.label}
                  </div>
                  <span style={{ color: p.textMuted, fontSize: "0.66rem", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {fmtThreadTs(t.last?.ts)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1" style={{ fontSize: "0.62rem" }}>
                  <span style={{
                    color: p.accent, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  }}>{kindLabel}</span>
                  <span style={{ color: p.textMuted }}>·</span>
                  <span style={{ color: p.textMuted, fontWeight: 500 }}>{t.count} {t.count === 1 ? "msg" : "msgs"}</span>
                  {t.unread > 0 && (
                    <span style={{
                      marginInlineStart: 6,
                      backgroundColor: "#DC2626", color: "#FFFFFF",
                      padding: "1px 7px",
                      fontSize: "0.6rem", fontWeight: 700,
                      letterSpacing: 0,
                    }}>{t.unread} new</span>
                  )}
                </div>
                {t.last?.body && (
                  <p style={{
                    margin: "6px 0 0",
                    color: p.textSecondary || p.textPrimary, fontSize: "0.82rem",
                    lineHeight: 1.5,
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    <strong style={{ color: p.textMuted, fontWeight: 600 }}>
                      {t.last.fromType === viewer?.type ? "You: " : `${t.last.fromName || ""}: `}
                    </strong>
                    {t.last.body}
                  </p>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
