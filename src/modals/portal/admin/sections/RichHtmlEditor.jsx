import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Heading, Pilcrow, List, ListOrdered,
  Link2, Eraser, Code2, Eye, Type,
} from "lucide-react";

// ---------------------------------------------------------------------------
// RichHtmlEditor — a bespoke (no third-party library) email-body editor with
// three modes, mirroring the reference design:
//
//   • Rich text — a WYSIWYG contentEditable surface + formatting toolbar
//     (bold / italic / underline / heading / lists / link / colour / clear).
//   • HTML      — the raw source, for precise control.
//   • Preview   — the rendered email with sample variables substituted.
//
// All three edit ONE piece of state (`value`, the HTML string). The parent owns
// it; this component reads/writes it and keeps the WYSIWFYG surface in sync
// without resetting the caret on every keystroke.
//
// Variable insertion ({{token}}) is exposed via a ref so the parent's variable
// picker can drop a placeholder at the cursor in whichever mode is active.
// ---------------------------------------------------------------------------

const SWATCHES = [
  { c: "#15161A", label: "Charcoal" },
  { c: "#C9A961", label: "Gold" },
  { c: "#7A7464", label: "Stone" },
  { c: "#B4453C", label: "Red" },
  { c: "#2E7D53", label: "Green" },
  { c: "#2563EB", label: "Blue" },
];

export const RichHtmlEditor = forwardRef(function RichHtmlEditor(
  { value, onChange, onFocusEditor, p, renderPreview }, ref
) {
  const [mode, setMode] = useState("rich"); // rich | html | preview
  const editRef = useRef(null);
  const htmlRef = useRef(null);
  // Tracks the HTML we last pushed to / read from the WYSIWYG surface, so the
  // sync effect can tell an EXTERNAL change (HTML-tab edit, reset, variable
  // insert) — which must refresh innerHTML — from the editor's OWN typing —
  // which must NOT, or the caret jumps to the top on every key.
  const lastEmitted = useRef(value);

  // Push external value into the WYSIWYG when entering rich mode or when the
  // value changed outside the editor.
  useEffect(() => {
    if (mode !== "rich") return;
    const el = editRef.current;
    if (!el) return;
    if (el.innerHTML !== (value || "")) el.innerHTML = value || "";
    lastEmitted.current = value;
  }, [mode, value]);

  const emitFromRich = () => {
    const el = editRef.current;
    if (!el) return;
    lastEmitted.current = el.innerHTML;
    onChange(el.innerHTML);
  };

  const exec = (cmd, arg) => {
    editRef.current?.focus();
    try { document.execCommand(cmd, false, arg); } catch (_) { /* no-op */ }
    emitFromRich();
  };

  useImperativeHandle(ref, () => ({
    getMode: () => mode,
    insertToken: (text) => {
      if (mode === "html") {
        const el = htmlRef.current;
        if (!el) { onChange(`${value || ""}${text}`); return; }
        const s = el.selectionStart ?? el.value.length;
        const e = el.selectionEnd ?? el.value.length;
        const next = el.value.slice(0, s) + text + el.value.slice(e);
        lastEmitted.current = next;
        onChange(next);
        setTimeout(() => { el.focus(); const pos = s + text.length; try { el.setSelectionRange(pos, pos); } catch (_) {} }, 0);
        return;
      }
      // rich (switch away from preview first)
      if (mode === "preview") setMode("rich");
      setTimeout(() => {
        editRef.current?.focus();
        try { document.execCommand("insertText", false, text); } catch (_) {}
        emitFromRich();
      }, 0);
    },
    focus: () => (mode === "html" ? htmlRef.current : editRef.current)?.focus(),
  }), [mode, value]);

  const tabBtn = (m, Icon, label) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "0.4rem 0.8rem",
        backgroundColor: mode === m ? p.bgPanel : "transparent",
        borderBottom: `2px solid ${mode === m ? p.accent : "transparent"}`,
        color: mode === m ? p.accent : p.textSecondary,
        fontFamily: "'Manrope', sans-serif", fontSize: "0.72rem",
        letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700,
        cursor: "pointer",
      }}
    >
      <Icon size={12} /> {label}
    </button>
  );

  const toolBtn = (onClick, Icon, title) => (
    <button
      type="button" title={title} onClick={onClick}
      className="inline-flex items-center justify-center"
      style={{ width: 30, height: 28, border: `1px solid ${p.border}`, backgroundColor: "transparent", color: p.textSecondary, cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = p.textSecondary; e.currentTarget.style.borderColor = p.border; }}
    >
      <Icon size={13} />
    </button>
  );

  return (
    <div style={{ border: `1px solid ${p.border}` }}>
      {/* Tab bar */}
      <div className="flex items-center gap-1" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanelAlt, paddingInline: 6 }}>
        {tabBtn("rich", Type, "Rich text")}
        {tabBtn("html", Code2, "HTML")}
        {tabBtn("preview", Eye, "Preview")}
      </div>

      {/* Rich-text toolbar */}
      {mode === "rich" && (
        <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: "8px 10px", borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
          {toolBtn(() => exec("bold"), Bold, "Bold")}
          {toolBtn(() => exec("italic"), Italic, "Italic")}
          {toolBtn(() => exec("underline"), Underline, "Underline")}
          <span style={{ width: 1, height: 20, backgroundColor: p.border, margin: "0 2px" }} />
          {toolBtn(() => exec("formatBlock", "H3"), Heading, "Heading")}
          {toolBtn(() => exec("formatBlock", "P"), Pilcrow, "Normal text")}
          {toolBtn(() => exec("insertUnorderedList"), List, "Bulleted list")}
          {toolBtn(() => exec("insertOrderedList"), ListOrdered, "Numbered list")}
          {toolBtn(() => { const url = window.prompt("Link URL (https://…)"); if (url) exec("createLink", url); }, Link2, "Insert link")}
          <span style={{ width: 1, height: 20, backgroundColor: p.border, margin: "0 2px" }} />
          {SWATCHES.map((s) => (
            <button
              key={s.c} type="button" title={`Text colour · ${s.label}`}
              onClick={() => exec("foreColor", s.c)}
              style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: s.c, border: `1px solid ${p.border}`, cursor: "pointer" }}
            />
          ))}
          <span style={{ width: 1, height: 20, backgroundColor: p.border, margin: "0 2px" }} />
          {toolBtn(() => exec("removeFormat"), Eraser, "Clear formatting")}
        </div>
      )}

      {/* Panels */}
      {mode === "rich" && (
        <div
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitFromRich}
          onFocus={onFocusEditor}
          className="w-full outline-none"
          style={{
            background: "#fff", color: "#15161A",
            padding: "18px 20px", minHeight: 340, maxHeight: 560, overflowY: "auto",
            fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: "14px", lineHeight: 1.55,
          }}
        />
      )}

      {mode === "html" && (
        <textarea
          ref={htmlRef}
          value={value}
          spellCheck={false}
          onFocus={onFocusEditor}
          onChange={(e) => { lastEmitted.current = e.target.value; onChange(e.target.value); }}
          rows={22}
          className="w-full outline-none"
          style={{
            backgroundColor: p.inputBg, color: p.textPrimary, border: "none",
            padding: "14px 16px",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: "0.8rem",
            lineHeight: 1.6, resize: "vertical", display: "block",
          }}
        />
      )}

      {mode === "preview" && (
        <div style={{ background: "#fff", padding: "18px 20px", minHeight: 340, maxHeight: 560, overflowY: "auto" }}
             dangerouslySetInnerHTML={{ __html: renderPreview(value) }} />
      )}
    </div>
  );
});
