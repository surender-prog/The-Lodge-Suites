import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, FileText, Upload, X } from "lucide-react";
import { usePalette } from "../theme.jsx";

// Lightweight pub-sub for action feedback toasts. Anywhere can call
// `pushToast({ message, kind })` and a single ToastHost mounted in AdminLayout
// will render the queue at the bottom-right.
let _toastSubs = [];
let _toastSeq = 0;
export function pushToast({ message, kind = "success", durationMs = 3500 }) {
  const id = ++_toastSeq;
  const evt = { id, message, kind };
  _toastSubs.forEach(fn => fn({ type: "add", toast: evt }));
  setTimeout(() => _toastSubs.forEach(fn => fn({ type: "remove", id })), durationMs);
}

export function ToastHost() {
  const p = usePalette();
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const sub = (e) => {
      if (e.type === "add") setToasts(ts => [...ts, e.toast]);
      else setToasts(ts => ts.filter(t => t.id !== e.id));
    };
    _toastSubs.push(sub);
    return () => { _toastSubs = _toastSubs.filter(f => f !== sub); };
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 end-4 z-[70] flex flex-col gap-2 items-end">
      {toasts.map(t => {
        const color = t.kind === "error" ? p.danger : t.kind === "warn" ? p.warn : p.success;
        return (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3" style={{
            backgroundColor: p.bgPanel, color: p.textPrimary,
            border: `1px solid ${color}`, borderInlineStart: `4px solid ${color}`,
            fontFamily: "'Manrope', sans-serif", fontSize: "0.85rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxWidth: 380,
          }}>
            <Check size={14} style={{ color, flexShrink: 0 }} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

// Shared admin UI primitives. They wrap the active palette so every component
// in the admin section reads consistently across light/dark themes.

export const Card = ({ title, action, children, padded = true, className = "" }) => {
  const p = usePalette();
  return (
    <div className={className} style={{ backgroundColor: p.bgPanel, border: `1px solid ${p.border}` }}>
      {(title || action) && (
        <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${p.border}` }}>
          {title && (
            <div style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              {title}
            </div>
          )}
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </div>
  );
};

export const Stat = ({ label, value, hint, color, onClick, ctaLabel }) => {
  const p = usePalette();
  const valColor = color || p.textPrimary;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="p-5 group transition-colors"
      style={{
        backgroundColor: p.bgPanel,
        border: `1px solid ${p.border}`,
        cursor: onClick ? "pointer" : "default",
        textAlign: "start",
        width: "100%",
        outline: "none",
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.backgroundColor = p.bgHover; } }}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.borderColor = p.border;  e.currentTarget.style.backgroundColor = p.bgPanel; } }}
    >
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.9rem", color: valColor, fontWeight: 500, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div className="flex items-center justify-between gap-2" style={{ marginTop: 6 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>{label}</div>
        {onClick && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: p.accent, fontFamily: "'Manrope', sans-serif", fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}
          >{ctaLabel || "Open"} →</div>
        )}
      </div>
      {hint && <div style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.7rem", marginTop: 4 }}>{hint}</div>}
    </Tag>
  );
};

export const Badge = ({ children, color, outline = false }) => {
  const p = usePalette();
  const c = color || p.accent;
  return (
    <span style={{
      fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
      padding: "3px 9px",
      color: outline ? c : p.bgPanel,
      backgroundColor: outline ? "transparent" : c,
      border: `1px solid ${c}`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
};

export const TableShell = ({ children, className = "" }) => {
  const p = usePalette();
  return (
    <div className={`overflow-x-auto ${className}`} style={{ border: `1px solid ${p.border}` }}>
      <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem", color: p.textSecondary, backgroundColor: p.bgPanel }}>
        {children}
      </table>
    </div>
  );
};

export const Th = ({ children, align = "start" }) => {
  const p = usePalette();
  return (
    <th className={`text-${align} px-3 py-3`} style={{
      fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase",
      color: p.textMuted, fontWeight: 700,
      backgroundColor: p.bgPanelAlt, borderBottom: `1px solid ${p.border}`,
    }}>{children}</th>
  );
};

export const Td = ({ children, align = "start", muted = false, className = "", style }) => {
  const p = usePalette();
  return (
    <td className={`text-${align} px-3 py-2.5 ${className}`} style={{
      color: muted ? p.textMuted : p.textSecondary,
      borderTop: `1px solid ${p.border}`,
      fontVariantNumeric: align === "end" ? "tabular-nums" : undefined,
      ...style,
    }}>{children}</td>
  );
};

export const PrimaryBtn = ({ children, onClick, type = "button", small = false, full = false }) => {
  const p = usePalette();
  return (
    <button
      type={type}
      onClick={onClick}
      className={full ? "w-full" : ""}
      style={{
        backgroundColor: p.accent,
        color: p.theme === "light" ? "#FFFFFF" : "#15161A",
        border: `1px solid ${p.accent}`,
        padding: small ? "0.45rem 0.95rem" : "0.7rem 1.4rem",
        fontFamily: "'Manrope', sans-serif",
        fontSize: small ? "0.66rem" : "0.74rem",
        fontWeight: 700,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = p.accentDeep; e.currentTarget.style.borderColor = p.accentDeep; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = p.accent; e.currentTarget.style.borderColor = p.accent; }}
    >
      {children}
    </button>
  );
};

export const GhostBtn = ({ children, onClick, type = "button", small = false, danger = false }) => {
  const p = usePalette();
  const c = danger ? p.danger : p.textMuted;
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        backgroundColor: "transparent",
        color: c,
        border: `1px solid ${p.border}`,
        padding: small ? "0.45rem 0.95rem" : "0.7rem 1.2rem",
        fontFamily: "'Manrope', sans-serif",
        fontSize: small ? "0.66rem" : "0.74rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = danger ? p.danger : p.accent; e.currentTarget.style.borderColor = danger ? p.danger : p.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = c; e.currentTarget.style.borderColor = p.border; }}
    >
      {children}
    </button>
  );
};

export const TextField = ({ value, onChange, type = "text", placeholder, suffix }) => {
  const p = usePalette();
  return (
    <div className="flex" style={{ border: `1px solid ${p.border}`, backgroundColor: p.inputBg }}>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 outline-none"
        style={{
          backgroundColor: "transparent",
          color: p.textPrimary,
          padding: "0.6rem 0.75rem",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "0.88rem",
          minWidth: 0,
          border: "none",
        }}
      />
      {suffix && (
        <span className="flex items-center px-3" style={{ color: p.textMuted, fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem", borderInlineStart: `1px solid ${p.border}` }}>{suffix}</span>
      )}
    </div>
  );
};

export const SelectField = ({ value, onChange, options }) => {
  const p = usePalette();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="outline-none cursor-pointer"
      style={{
        backgroundColor: p.inputBg,
        color: p.textPrimary,
        border: `1px solid ${p.border}`,
        padding: "0.6rem 0.75rem",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "0.88rem",
        width: "100%",
      }}
    >
      {options.map((o) => (
        <option
          key={o.value ?? o}
          value={o.value ?? o}
          disabled={!!o.disabled}
        >{o.label ?? o}</option>
      ))}
    </select>
  );
};

// FileUpload — reads a chosen file as a data URL so the preview can render
// without a backend. `variant="photo"` renders a square portrait dropzone;
// `variant="document"` renders a wide id-card style dropzone. `value` is the
// data URL; pass `null` to clear.
export const FileUpload = ({ value, onChange, variant = "photo", label, hint, accept }) => {
  const p = usePalette();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const isPhoto = variant === "photo";

  const handleFiles = (files) => {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ url: reader.result, name: f.name, size: f.size, type: f.type });
    reader.readAsDataURL(f);
  };

  const onPick = () => inputRef.current?.click();
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const clear = (e) => { e.stopPropagation(); onChange(null); };

  const accepts = accept || (isPhoto ? "image/*" : "image/*,application/pdf");
  const isImage = value?.type?.startsWith?.("image/") || (typeof value?.url === "string" && value.url.startsWith("data:image"));

  return (
    <div>
      {label && (
        <div style={{
          fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em",
          textTransform: "uppercase", color: p.textMuted, marginBottom: 6, fontWeight: 700,
        }}>{label}</div>
      )}
      <div
        onClick={onPick}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="cursor-pointer relative overflow-hidden flex items-center justify-center"
        style={{
          width: isPhoto ? 160 : "100%",
          aspectRatio: isPhoto ? "1 / 1" : "16 / 9",
          backgroundColor: value ? "transparent" : p.bgPanelAlt,
          border: `1.5px dashed ${dragOver ? p.accent : p.border}`,
          color: p.textMuted,
          fontFamily: "'Manrope', sans-serif", fontSize: "0.78rem",
          transition: "border-color 120ms",
        }}
      >
        <input ref={inputRef} type="file" accept={accepts} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        {value && isImage ? (
          <>
            <img src={value.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={clear} className="absolute top-2 end-2"
              style={{
                backgroundColor: "rgba(0,0,0,0.6)", color: "#fff",
                width: 24, height: 24, borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center",
              }} aria-label="Remove file">
              <X size={12} />
            </button>
          </>
        ) : value ? (
          <div className="flex items-center gap-3 px-4">
            <FileText size={20} style={{ color: p.accent }} />
            <div className="min-w-0 flex-1 text-start">
              <div style={{ color: p.textPrimary, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value.name}</div>
              <div style={{ color: p.textMuted, fontSize: "0.7rem" }}>{Math.round(value.size / 1024)} KB · {value.type}</div>
            </div>
            <button onClick={clear} aria-label="Remove file" style={{ color: p.textMuted }}><X size={14} /></button>
          </div>
        ) : (
          <div className="text-center px-4">
            {isPhoto ? <Camera size={22} style={{ color: p.accent, margin: "0 auto" }} /> : <Upload size={22} style={{ color: p.accent, margin: "0 auto" }} />}
            <div className="mt-2" style={{ color: p.textSecondary, fontWeight: 600 }}>{isPhoto ? "Upload photo" : "Upload document"}</div>
            <div style={{ color: p.textMuted, fontSize: "0.7rem", marginTop: 2 }}>{hint || "Click or drag a file"}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export const Label = ({ children }) => {
  const p = usePalette();
  return (
    <div style={{
      fontFamily: "'Manrope', sans-serif",
      fontSize: "0.6rem",
      letterSpacing: "0.28em",
      textTransform: "uppercase",
      color: p.textMuted,
      marginBottom: 6,
      fontWeight: 700,
    }}>{children}</div>
  );
};

export const FormGroup = ({ label, children, className = "" }) => (
  <div className={className}>
    <Label>{label}</Label>
    {children}
  </div>
);

export const PageHeader = ({ title, intro, action }) => {
  const p = usePalette();
  return (
    <div className="flex items-end justify-between flex-wrap gap-3 mb-7">
      <div>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.1rem", color: p.textPrimary, fontWeight: 500, lineHeight: 1.1 }}>
          {title}
        </h3>
        {intro && <p style={{ fontFamily: "'Manrope', sans-serif", color: p.textMuted, fontSize: "0.92rem", marginTop: 6, maxWidth: 640 }}>{intro}</p>}
      </div>
      {action}
    </div>
  );
};

// Drawer / modal — used by per-row edit flows.
//
// `fullPage = true` renders the editor as a full-viewport view (preferred for
// substantial forms); the default side-drawer is reserved for quick edits.
// `eyebrow` overrides the small uppercase label above the title (default
// "Edit"); pass "New" for create flows so the caption matches intent.
export const Drawer = ({ open, onClose, title, eyebrow = "Edit", footer, children, fullPage = false, contentMaxWidth = "max-w-3xl" }) => {
  const p = usePalette();
  if (!open) return null;

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: p.bgPage }}>
        <header className="flex items-center justify-between gap-3 px-6 md:px-10 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
          <div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
              {eyebrow}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1.1 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-2 flex-shrink-0"
            style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase",
              fontWeight: 700, color: p.textMuted, padding: "0.45rem 0.85rem", border: `1px solid ${p.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = p.textMuted; e.currentTarget.style.borderColor = p.border; }}
            aria-label="Close"
          >
            <X size={14} /> Close
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className={`${contentMaxWidth} mx-auto px-6 md:px-10 py-8`}>{children}</div>
        </main>
        {footer && (
          <footer className="px-6 md:px-10 py-4 flex items-center justify-end gap-3 flex-shrink-0" style={{ borderTop: `1px solid ${p.border}`, backgroundColor: p.bgPanel }}>
            {footer}
          </footer>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-end" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
      <div className="w-full max-w-lg flex flex-col" style={{ backgroundColor: p.bgPage, borderInlineStart: `1px solid ${p.border}` }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
              {eyebrow}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.45rem", fontStyle: "italic", color: p.textPrimary, lineHeight: 1 }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ color: p.textMuted, padding: 4 }} onMouseEnter={(e) => e.currentTarget.style.color = p.accent} onMouseLeave={(e) => e.currentTarget.style.color = p.textMuted}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: `1px solid ${p.border}` }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
