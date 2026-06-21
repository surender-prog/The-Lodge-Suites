import React, { useMemo, useState } from "react";
import { Mail, Paperclip, Send, X } from "lucide-react";
import { usePalette } from "./theme.jsx";
import { useData } from "../../data/store.jsx";
import { Drawer, FormGroup, GhostBtn, PrimaryBtn, TextField, pushToast } from "./admin/ui.jsx";
import { buildIntroEmail } from "../../lib/introEmailTemplate.js";
import { buildFactSheetPdf } from "../../lib/factSheetPdf.js";
import { sendTransactionalEmail } from "../../utils/email.js";

// ---------------------------------------------------------------------------
// IntroEmailModal — preview-and-edit composer for the sales introductory
// email triggered from any contact activity (call / email / visit / meeting).
//
// • Subject + body are pre-templated by activity kind (the opener varies; the
//   body and partner offer are constant) via `buildIntroEmail`.
// • A branded Fact Sheet PDF (built dynamically from live hotel + rooms data
//   so it's always current) attaches automatically.
// • Recipient defaults to the linked account's primary contact email; the
//   operator can edit any field before sending. Internal Accounts BCC'd.
// • On success: a new activity of kind "email" is appended to the same
//   account's profile so the operator's progress log records the send.
// ---------------------------------------------------------------------------

// Resolve the most useful recipient + name for a given activity's account.
// corporate / agent → first primary user with an email, else the POC.
function resolveContact(activity, agreements, agencies) {
  if (!activity) return { email: "", name: "" };
  const kind = activity.accountKind;
  const id = activity.accountId;
  let acct = null;
  if (kind === "corporate") acct = agreements.find((a) => a.id === id);
  else if (kind === "agent") acct = agencies.find((a) => a.id === id);
  if (!acct) return { email: "", name: activity.contactName || "" };
  const users = Array.isArray(acct.users) ? acct.users : [];
  const primary = users.find((u) => u.primary) || users.find((u) => (u.role || "") === "primary") || users[0];
  if (primary && primary.email) return { email: primary.email, name: activity.contactName || primary.name || "" };
  if (acct.pocEmail) return { email: acct.pocEmail, name: activity.contactName || acct.pocName || "" };
  return { email: "", name: activity.contactName || "" };
}

export function IntroEmailModal({ activity, onClose }) {
  const p = usePalette();
  const {
    agreements, agencies, rooms, hotelInfo, staffSession, adminUsers, addActivity,
  } = useData();

  const owner = useMemo(() => {
    if (staffSession?.id) return { name: staffSession.name, title: staffSession.role, email: staffSession.email };
    const a = (adminUsers || []).find((u) => u.id === activity?.ownerId);
    return a ? { name: a.name, title: a.title || a.role, email: a.email } : {};
  }, [staffSession, adminUsers, activity?.ownerId]);

  // Pre-fill from the templater + account; operator can edit anything below.
  const initial = useMemo(() => {
    const contact = resolveContact(activity, agreements, agencies);
    const act = { ...activity, contactName: contact.name || activity?.contactName };
    const built = buildIntroEmail({ activity: act, hotel: hotelInfo, owner });
    return {
      to: contact.email || "",
      cc: "",
      bcc: hotelInfo?.emailSales || "",
      subject: built.subject,
      text: built.bodyText,
      html: built.bodyHtml,
    };
  }, [activity, agreements, agencies, hotelInfo, owner]);

  const [draft, setDraft] = useState(initial);
  const [sending, setSending] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const account = useMemo(() => {
    if (!activity) return null;
    if (activity.accountKind === "corporate") return agreements.find((a) => a.id === activity.accountId) || null;
    if (activity.accountKind === "agent")     return agencies.find((a) => a.id === activity.accountId) || null;
    return null;
  }, [activity, agreements, agencies]);

  // Build the Fact Sheet once when the modal opens; rebuilds when rooms/hotel
  // change. ~10 KB output so we keep the base64 in component state.
  const factSheet = useMemo(() => {
    try { return buildFactSheetPdf({ hotel: hotelInfo, rooms, currency: "BHD" }); }
    catch (_) { return null; }
  }, [hotelInfo, rooms]);

  const valid = /.+@.+\..+/.test(draft.to.trim()) && draft.subject.trim() && draft.text.trim();

  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    const attachments = factSheet ? [{ filename: factSheet.filename, contentBase64: factSheet.base64, contentType: "application/pdf" }] : [];
    const result = await sendTransactionalEmail({
      kind: "intro",
      to: draft.to.trim(),
      cc: draft.cc.trim() || undefined,
      bcc: draft.bcc.trim() || undefined,
      subject: draft.subject.trim(),
      text: draft.text,
      html: draft.html,
      attachments,
    });
    setSending(false);
    const ok = !!(result && result.ok);
    if (!ok) {
      pushToast({ message: result?.reason || result?.error || "Could not send — check SMTP config.", kind: "warn" });
      return;
    }
    // Log the send under the account's profile so progress is tracked.
    addActivity({
      kind: "email",
      status: "completed",
      completedAt: new Date().toISOString(),
      scheduledAt: null,
      accountKind: activity.accountKind,
      accountId: activity.accountId,
      accountName: activity.accountName,
      contactName: activity.contactName,
      ownerId: staffSession?.id || activity.ownerId,
      ownerName: staffSession?.name || activity.ownerName,
      subject: `Intro email sent · ${draft.subject}`,
      summary: `Introductory email sent to ${draft.to.trim()}${factSheet ? " with Fact Sheet attached" : ""}.`,
      outcome: "positive",
      meta: { introEmail: true, refActivityId: activity.id, recipient: draft.to.trim() },
    });
    pushToast({ message: `Intro email sent to ${draft.to.trim()}` });
    onClose?.();
  };

  if (!activity) return null;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow="Send introduction"
      title={`Intro email · ${activity.accountName || ""}`}
      fullPage
      contentMaxWidth="max-w-3xl"
      footer={
        <>
          <GhostBtn onClick={onClose} small>Cancel</GhostBtn>
          <div className="flex-1" />
          <PrimaryBtn onClick={send} small disabled={!valid || sending}>
            <Send size={11} /> {sending ? "Sending…" : "Send email"}
          </PrimaryBtn>
        </>
      }
    >
      {/* Context banner — what we're sending and to whom */}
      <div className="p-4 mb-5" style={{
        backgroundColor: `${p.accent}10`, border: `1px solid ${p.accent}40`,
        borderInlineStart: `3px solid ${p.accent}`,
      }}>
        <div className="flex items-start gap-3">
          <Mail size={16} style={{ color: p.accent, marginTop: 2, flexShrink: 0 }} />
          <div style={{ color: p.textPrimary, fontSize: "0.86rem", lineHeight: 1.55 }}>
            Sending the standard <strong>introduction email</strong> to{" "}
            <strong>{activity.accountName}</strong>
            {activity.contactName ? ` (${activity.contactName})` : ""}, opener tailored for the{" "}
            <strong>{activity.kind}</strong> activity. The body includes our partner offer
            (1 complimentary stay, max 2 nights, weekdays only) and the Fact Sheet is attached.
            You can edit any field below before sending.
          </div>
        </div>
      </div>

      <FormGroup label="To">
        <TextField value={draft.to} onChange={(v) => set({ to: v })} placeholder="contact@company.com" />
      </FormGroup>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <FormGroup label="CC (optional)">
          <TextField value={draft.cc} onChange={(v) => set({ cc: v })} placeholder="another@company.com" />
        </FormGroup>
        <FormGroup label="BCC (internal copy)">
          <TextField value={draft.bcc} onChange={(v) => set({ bcc: v })} placeholder="sales@thelodgesuites.com" />
        </FormGroup>
      </div>
      <FormGroup label="Subject" className="mt-4">
        <TextField value={draft.subject} onChange={(v) => set({ subject: v })} />
      </FormGroup>

      <FormGroup label="Message" className="mt-4">
        <textarea
          value={draft.text}
          onChange={(e) => set({ text: e.target.value })}
          rows={18}
          className="w-full outline-none"
          style={{
            backgroundColor: p.inputBg, color: p.textPrimary,
            border: `1px solid ${p.border}`, padding: "0.7rem 0.85rem",
            fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.55,
            resize: "vertical", minHeight: 280,
          }}
        />
        <div style={{ fontSize: "0.72rem", color: p.textMuted, marginTop: 6 }}>
          Plain-text body — the email also carries a brand-styled HTML version generated from your edits' opener.
          For richer per-account customisation, edit this text and the HTML version will use the same opener.
        </div>
      </FormGroup>

      {/* Attachment chip */}
      <div className="mt-4 p-3 inline-flex items-center gap-2" style={{
        border: `1px solid ${p.border}`, backgroundColor: p.bgPanel,
        color: p.textPrimary, fontSize: "0.82rem",
      }}>
        <Paperclip size={13} style={{ color: p.accent }} />
        <span><strong>{factSheet?.filename || "Fact Sheet"}</strong> {factSheet ? "· auto-attached" : "· (failed to build)"}</span>
      </div>
      <div style={{ fontSize: "0.72rem", color: p.textMuted, marginTop: 6 }}>
        The Fact Sheet is built fresh from your live property info (suites, rates, amenities, contact) every time you open this modal.
      </div>

      {/* Tiny safety hint when no recipient could be resolved */}
      {!draft.to && (
        <div className="mt-4 p-3" style={{
          backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`, color: p.warn, fontSize: "0.78rem",
        }}>
          No primary contact email is on file for {account ? (account.account || account.name) : "this account"}.
          Type the recipient above, or add their email under the account's <strong>Users</strong> tab so it pre-fills next time.
        </div>
      )}
    </Drawer>
  );
}
