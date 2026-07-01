import React, { useEffect, useMemo, useState } from "react";
import { Mail, Paperclip, Send, X } from "lucide-react";
import { usePalette } from "./theme.jsx";
import { useData } from "../../data/store.jsx";
import { Drawer, FormGroup, GhostBtn, PrimaryBtn, TextField, pushToast } from "./admin/ui.jsx";
import { CheckSquare, Square } from "lucide-react";
import { DEFAULT_GALLERY_ITEMS } from "../../data/gallery.js";
import {
  buildIntroEmail,
  substituteTemplateVars, templatizeFromValues,
  openerForKind, resolveGreetingName,
} from "../../lib/introEmailTemplate.js";
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
    upsertAgreement, upsertAgency,
    packages, tiers, loyalty, giftCardTiers, siteContent,
    introEmailTemplate, setIntroEmailTemplate, resetIntroEmailTemplate,
  } = useData();

  const owner = useMemo(() => {
    if (staffSession?.id) return { name: staffSession.name, title: staffSession.role, email: staffSession.email };
    const a = (adminUsers || []).find((u) => u.id === activity?.ownerId);
    return a ? { name: a.name, title: a.title || a.role, email: a.email } : {};
  }, [staffSession, adminUsers, activity?.ownerId]);

  // Pre-fill from the templater + account; operator can edit anything below.
  // The activity's OWN contactEmail / contactName win when the operator
  // captured them on the touch — that's literally the person they just spoke
  // to, more accurate than the account's generic primary contact.
  // Resolved variable bag for placeholder substitution + signing off. Kept
  // in a memo so save/send/reset can re-use the same values.
  const vars = useMemo(() => {
    const fallback = resolveContact(activity, agreements, agencies);
    const name = (activity?.contactName || "").trim() || fallback.name;
    const greetingName = resolveGreetingName(name) || "Sir/Madam";
    return {
      name: greetingName,
      account: activity?.accountName || "",
      hotel: hotelInfo?.name || "The Lodge Suites",
      opener: openerForKind(activity?.kind),
      owner: owner?.name || activity?.ownerName || "",
    };
  }, [activity, agreements, agencies, hotelInfo, owner]);

  const initial = useMemo(() => {
    const fallback = resolveContact(activity, agreements, agencies);
    const name = (activity?.contactName || "").trim() || fallback.name;
    const email = (activity?.contactEmail || "").trim() || fallback.email;

    // Always build the brand HTML from buildIntroEmail() so the gold
    // callout box, bullet list, and formatted signature block are present
    // in every send — even when a saved template customises the text body.
    const built = buildIntroEmail({
      activity: { ...activity, contactName: name },
      hotel: hotelInfo,
      owner,
    });

    const saved = introEmailTemplate && (introEmailTemplate.bodyText || introEmailTemplate.subject)
      ? introEmailTemplate : null;

    let subject, text;
    if (saved && saved.bodyText) {
      subject = substituteTemplateVars(saved.subject || built.subject, vars);
      text = substituteTemplateVars(saved.bodyText, vars);
    } else {
      subject = built.subject;
      text = built.bodyText;
    }
    return {
      to: email || "",
      cc: "",
      bcc: hotelInfo?.emailSales || "",
      subject,
      text,
      html: built.bodyHtml,
    };
  }, [activity, agreements, agencies, hotelInfo, owner, introEmailTemplate, vars]);

  const [draft, setDraft] = useState(initial);
  const [sending, setSending] = useState(false);
  // Default ON when the resolver had no email — sending will then save the
  // operator's typed recipient back to the account so the very next intro
  // pre-fills automatically (the literal "auto-pickup from contact field"
  // ask). Off when an email was already on the account so we don't quietly
  // overwrite an existing primary contact.
  const [saveBack, setSaveBack] = useState(!initial.to);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const account = useMemo(() => {
    if (!activity) return null;
    if (activity.accountKind === "corporate") return agreements.find((a) => a.id === activity.accountId) || null;
    if (activity.accountKind === "agent")     return agencies.find((a) => a.id === activity.accountId) || null;
    return null;
  }, [activity, agreements, agencies]);

  // Build the Fact Sheet when the modal opens. The builder is async — it fetches
  // hero + 4 gallery photos from /images/ and inlines them — so we own the state
  // via useState + useEffect (vs the old sync useMemo). While building, send is
  // disabled so a click can't race the attachment in. Bare images fail-soft;
  // the textual sections of the PDF still render if a photo doesn't fetch.
  const [factSheet, setFactSheet] = useState(null);
  const [factSheetBuilding, setFactSheetBuilding] = useState(true);
  const galleryItems = (siteContent && siteContent.galleryItems) || DEFAULT_GALLERY_ITEMS;
  useEffect(() => {
    let cancelled = false;
    setFactSheetBuilding(true);
    buildFactSheetPdf({
      hotel: hotelInfo, rooms, packages, tiers, loyalty,
      giftCardTiers, gallery: galleryItems, currency: "BHD",
    })
      .then((res) => { if (!cancelled) { setFactSheet(res); setFactSheetBuilding(false); } })
      .catch(() => { if (!cancelled) { setFactSheet(null); setFactSheetBuilding(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelInfo, rooms, packages, tiers, loyalty, giftCardTiers, galleryItems]);

  const valid = /.+@.+\..+/.test(draft.to.trim()) && draft.subject.trim() && draft.text.trim();
  // The send button waits for the Fact Sheet to finish building so the
  // attachment is always included — better UX than letting the operator hit
  // Send and silently sending without the Fact Sheet.
  const canSend = valid && !sending && !factSheetBuilding;

  // Save / reset the operator-edited template so future intro sends start
  // from this version. Reverse-substitute resolved values back to
  // placeholders so the saved template stays usable for the next account.
  const saveTemplate = () => {
    const payload = {
      subject: templatizeFromValues(draft.subject.trim(), vars),
      bodyText: templatizeFromValues(draft.text, vars),
      savedAt: new Date().toISOString(),
      savedBy: staffSession?.name || staffSession?.id || null,
    };
    setIntroEmailTemplate(payload);
    pushToast({ message: "Saved as your default intro-email template." });
  };
  const resetTemplate = () => {
    if (!window.confirm("Reset the intro-email template back to the built-in version? Your custom edits will be discarded.")) return;
    resetIntroEmailTemplate();
    pushToast({ message: "Template reset to the built-in version. Reopen the modal to see it." });
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const finalSubject = substituteTemplateVars(draft.subject.trim(), vars);
    const finalText    = substituteTemplateVars(draft.text, vars);
    // Rebuild brand HTML fresh so the email always carries the gold callout,
    // bullet list, and properly formatted sender signature — regardless of
    // saved-template customisations (which affect the plain-text fallback).
    const _fb = resolveContact(activity, agreements, agencies);
    const _cn = (activity?.contactName || "").trim() || _fb.name;
    const { bodyHtml: finalHtml } = buildIntroEmail({
      activity: { ...activity, contactName: _cn },
      hotel: hotelInfo,
      owner,
    });
    const attachments = factSheet ? [{ filename: factSheet.filename, contentBase64: factSheet.base64, contentType: "application/pdf" }] : [];
    const result = await sendTransactionalEmail({
      kind: "intro",
      to: draft.to.trim(),
      cc: draft.cc.trim() || undefined,
      bcc: draft.bcc.trim() || undefined,
      subject: finalSubject,
      text: finalText,
      html: finalHtml,
      attachments,
    });
    setSending(false);
    const ok = !!(result && result.ok);
    if (!ok) {
      // Distinguish the failure modes so the message is actionable: a null
      // result means the network/endpoint never returned JSON (e.g. running
      // against a local dev server with no /api routes); `skipped` means the
      // server short-circuited on config; `error` means the SMTP server itself
      // rejected the message.
      let message;
      if (result === null)            message = "Couldn't reach the email service. Intro emails only send from the live deploy — your local preview can't reach the mail server.";
      else if (result.skipped)        message = `Email not sent · ${result.reason || "outbound disabled"}.`;
      else if (result.error)          message = `Send failed · ${result.error}`;
      else                            message = "Couldn't send — check SMTP config in admin.";
      pushToast({ message, kind: "warn" });
      return;
    }
    // Optionally persist the typed recipient back to the account record so the
    // next intro for the same account pre-fills automatically. We only fill
    // pocEmail/pocName when they're empty — never overwrite an existing
    // primary contact silently — and only when the operator left the toggle on.
    const typedEmail = draft.to.trim();
    if (saveBack && account && typedEmail) {
      const sameEmail = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
      const patch = {};
      if (!account.pocEmail) patch.pocEmail = typedEmail;
      if (!account.pocName && (activity.contactName || "").trim()) patch.pocName = activity.contactName.trim();
      if (!account.pocPhone && (activity.contactPhone || "").trim()) patch.pocPhone = activity.contactPhone.trim();
      if (Object.keys(patch).length > 0 && !sameEmail(account.pocEmail, typedEmail)) {
        const next = { ...account, ...patch };
        if (activity.accountKind === "corporate") upsertAgreement(next);
        else if (activity.accountKind === "agent") upsertAgency(next);
      }
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
          <GhostBtn onClick={saveTemplate} small>💾 Save as template</GhostBtn>
          {introEmailTemplate && (introEmailTemplate.subject || introEmailTemplate.bodyText) && (
            <GhostBtn onClick={resetTemplate} small>Reset to built-in</GhostBtn>
          )}
          <div className="flex-1" />
          <PrimaryBtn onClick={send} small disabled={!canSend}>
            <Send size={11} /> {sending ? "Sending…" : factSheetBuilding ? "Preparing Fact Sheet…" : "Send email"}
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
      {/* Save-back checkbox — when the typed To isn't on the account yet, offer
          to write it back so the next intro pre-fills automatically. The whole
          row only renders for partner accounts (corporate / agent). */}
      {account && draft.to.trim() && !(/.+@.+\..+/.test(account.pocEmail || "") && account.pocEmail.toLowerCase() === draft.to.trim().toLowerCase()) && (
        <button
          type="button"
          onClick={() => setSaveBack((v) => !v)}
          className="inline-flex items-center gap-2 mt-2"
          style={{
            color: saveBack ? p.accent : p.textMuted,
            fontSize: "0.78rem", fontFamily: "'Manrope', sans-serif",
            background: "transparent", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          {saveBack ? <CheckSquare size={14} /> : <Square size={14} />}
          Also save this email as the primary contact for <strong style={{ color: p.textPrimary, marginInlineStart: 4 }}>{account.account || account.name}</strong>
        </button>
      )}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <FormGroup label="CC (comma-separate to add multiple)">
          <TextField value={draft.cc} onChange={(v) => set({ cc: v })} placeholder="e.g. booker@company.com, manager@company.com" />
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
          Plain-text fallback — the email is always sent with a <strong>brand-styled HTML version</strong> (gold callout, formatted signature with your name, title &amp; contact) auto-generated from the activity data.
          <br />
          <strong>Tip:</strong> Use placeholders <code>{`{{name}}`}</code> · <code>{`{{account}}`}</code> · <code>{`{{hotel}}`}</code> · <code>{`{{opener}}`}</code> · <code>{`{{owner}}`}</code> to keep the template reusable.
          They're filled in automatically when sending.
          {introEmailTemplate && (introEmailTemplate.subject || introEmailTemplate.bodyText) && (
            <span style={{ color: p.accent, marginInlineStart: 6 }}>
              · Using your saved template{introEmailTemplate.savedBy ? ` by ${introEmailTemplate.savedBy}` : ""}.
            </span>
          )}
        </div>
      </FormGroup>

      {/* Attachment chip */}
      <div className="mt-4 p-3 inline-flex items-center gap-2" style={{
        border: `1px solid ${p.border}`, backgroundColor: p.bgPanel,
        color: p.textPrimary, fontSize: "0.82rem",
      }}>
        <Paperclip size={13} style={{ color: p.accent }} />
        <span>
          <strong>{factSheet?.filename || "Fact Sheet"}</strong>{" "}
          {factSheetBuilding ? "· preparing…" : factSheet ? "· auto-attached" : "· (failed to build)"}
        </span>
      </div>
      <div style={{ fontSize: "0.72rem", color: p.textMuted, marginTop: 6 }}>
        The Fact Sheet is a 3-page deck rebuilt fresh from your live data every time — suites &amp; rates,
        property photos, meeting room, stay offers, LS Privilege tiers and gift cards.
      </div>

      {/* Empty-state hint when no recipient could be auto-resolved. */}
      {!draft.to && (
        <div className="mt-4 p-3" style={{
          backgroundColor: `${p.warn}10`, border: `1px solid ${p.warn}40`, color: p.warn, fontSize: "0.78rem",
        }}>
          No primary contact email is on file for{" "}
          <strong style={{ color: p.textPrimary }}>
            {account ? (account.account || account.name) : "this account"}
          </strong>.
          Type the recipient above — the toggle below will save it back to the account so this field pre-fills automatically on every future intro to{" "}
          {account ? (account.account || account.name) : "them"}.
        </div>
      )}
    </Drawer>
  );
}
