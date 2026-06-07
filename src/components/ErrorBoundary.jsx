import React from "react";

// ErrorBoundary — catches render/runtime errors in a subtree and shows a
// readable fallback instead of letting the crash unmount the whole app to a
// blank (black) screen. Especially important around full-screen portal editors
// (ContractEditor, drawers): a single data edge-case must never take down the
// operator portal.
//
// Usage:
//   <ErrorBoundary label="Contract editor" onClose={() => setEditing(null)}>
//     <ContractEditor ... />
//   </ErrorBoundary>
//
// `onClose` (optional) wires the fallback's "Close" button back to the parent
// so the operator can dismiss the broken view and keep working.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to the console for diagnosis; the visible fallback shows the
    // message to the operator so they can report it.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? " · " + this.props.label : ""}]`, error, info?.componentStack);
  }

  handleClose = () => {
    this.setState({ error: null });
    this.props.onClose?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return this.props.fallback(error, this.handleClose);
    }

    const msg = error?.message || String(error);
    return (
      <div
        role="alertdialog"
        aria-label="Something went wrong"
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(15,16,20,0.72)", padding: 24,
          fontFamily: "'Manrope', sans-serif",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) this.handleClose(); }}
      >
        <div style={{
          maxWidth: 520, width: "100%", background: "#FFFFFF",
          border: "1px solid #E2DACB", borderRadius: 4, padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", color: "#15161A", marginBottom: 8 }}>
            Something went wrong{this.props.label ? ` opening the ${this.props.label}` : ""}
          </div>
          <p style={{ color: "#5A5247", fontSize: "0.9rem", lineHeight: 1.55, margin: "0 0 14px" }}>
            The rest of the portal is unaffected — you can close this and keep working.
            If this keeps happening, share the detail below with support.
          </p>
          <pre style={{
            background: "#F5F1E8", border: "1px solid #E2DACB", borderRadius: 3,
            padding: "10px 12px", fontSize: "0.74rem", color: "#9A3A30",
            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "0 0 18px", maxHeight: 160, overflow: "auto",
          }}>{msg}</pre>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={this.handleClose}
              style={{
                padding: "0.7rem 1.4rem", background: "#15161A", color: "#FFFFFF",
                border: "none", borderRadius: 2, cursor: "pointer",
                fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              }}
            >Close</button>
          </div>
        </div>
      </div>
    );
  }
}
