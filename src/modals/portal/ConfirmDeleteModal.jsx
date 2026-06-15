import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { usePalette } from "./theme.jsx";

// Reusable irreversible-delete confirmation. The operator must type the exact
// name to enable the Delete button (GitHub-style guard for destructive ops).
// `lines` is an array of warning paragraphs.
export function ConfirmDeleteModal({ open, title, lines = [], confirmWord, confirmLabel = "Delete permanently", busy = false, onConfirm, onClose }) {
  const p = usePalette();
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  if (!open) return null;

  const matches = typed.trim().toLowerCase() === String(confirmWord || "").trim().toLowerCase();
  const canConfirm = matches && !busy;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
    >
      <div style={{ width: "100%", maxWidth: 460, backgroundColor: p.bgPanel, border: `1px solid ${p.danger}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="inline-flex items-center gap-2" style={{ color: p.danger }}>
            <AlertTriangle size={16} />
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
              {title}
            </span>
          </div>
          <button type="button" onClick={() => !busy && onClose?.()} style={{ color: p.textMuted, background: "transparent", border: "none", cursor: busy ? "default" : "pointer", padding: 4 }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4">
          {lines.map((l, i) => (
            <p key={i} style={{ color: i === 0 ? p.textPrimary : p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.86rem", lineHeight: 1.55, marginBottom: 8 }}>
              {l}
            </p>
          ))}

          <div className="mt-3" style={{ backgroundColor: `${p.danger}10`, border: `1px solid ${p.danger}33`, padding: "10px 12px" }}>
            <div style={{ color: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", fontWeight: 700, marginBottom: 2 }}>
              This cannot be undone.
            </div>
            <div style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem" }}>
              The data cannot be retrieved once deleted.
            </div>
          </div>

          <label style={{ display: "block", marginTop: 14, color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Type <span style={{ color: p.textPrimary }}>{confirmWord}</span> to confirm
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
            disabled={busy}
            className="w-full outline-none"
            style={{ backgroundColor: p.inputBg, color: p.textPrimary, border: `1px solid ${matches ? p.danger : p.border}`, padding: "0.6rem 0.7rem", fontFamily: "'Manrope', sans-serif", fontSize: "0.88rem" }}
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${p.border}` }}>
          <button
            type="button" onClick={() => !busy && onClose?.()}
            style={{ padding: "0.55rem 1.1rem", border: `1px solid ${p.border}`, color: p.textMuted, backgroundColor: "transparent", fontFamily: "'Manrope', sans-serif", fontSize: "0.64rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: busy ? "default" : "pointer" }}
          >Cancel</button>
          <button
            type="button" onClick={() => canConfirm && onConfirm?.()} disabled={!canConfirm}
            className="inline-flex items-center gap-1.5"
            style={{ padding: "0.55rem 1.1rem", border: `1px solid ${p.danger}`, color: "#FFFFFF", backgroundColor: p.danger, fontFamily: "'Manrope', sans-serif", fontSize: "0.64rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: canConfirm ? "pointer" : "not-allowed", opacity: canConfirm ? 1 : 0.5 }}
          >{busy ? "Deleting…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
