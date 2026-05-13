// notifications.js — pure functions that turn booking / invoice / payment
// mutations into notification records. The store calls these from inside
// addBooking, updateBooking, addInvoice, updateInvoice, addPayment to fan
// out real-time notifications to the right audiences.
//
// Each notification record has a stable shape so the bell + drawer UIs
// can render them uniformly:
//
//   {
//     id,                  // generated
//     ts,                  // ISO timestamp
//     kind,                // "booking-new" | "booking-status" | …
//     severity,            // "info" | "success" | "warn" | "danger"
//     title,               // one-line summary, plain text
//     body,                // longer human description, plain text
//     recipientType,       // "staff" | "corporate" | "agent" | "member" | "guest"
//     recipientId,         // matching identity within recipientType
//     refType,             // "booking" | "invoice" | "payment"
//     refId,               // related record id (used to deep-link)
//     read,                // boolean
//   }
//
// `recipientType: "staff"` always reaches the operators side. The customer
// notifications are tagged with the right recipient identity (account id /
// member id / email) so the Guest Portal bell can filter to "mine".

const KINDS = {
  "booking-new":       { severity: "info",    label: "New booking" },
  "booking-confirmed": { severity: "success", label: "Booking confirmed" },
  "booking-checkin":   { severity: "success", label: "Guest checked in" },
  "booking-checkout":  { severity: "info",    label: "Guest checked out" },
  "booking-cancelled": { severity: "warn",    label: "Booking cancelled" },
  "booking-status":    { severity: "info",    label: "Booking status changed" },
  "invoice-issued":    { severity: "info",    label: "Invoice issued" },
  "invoice-paid":      { severity: "success", label: "Invoice settled" },
  "invoice-overdue":   { severity: "danger",  label: "Invoice overdue" },
  "invoice-cancelled": { severity: "warn",    label: "Invoice cancelled" },
  "payment-received":  { severity: "success", label: "Payment received" },
  "payment-refunded":  { severity: "warn",    label: "Payment refunded" },
};
export const NOTIFICATION_KINDS = KINDS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtBhd = (n) => `BHD ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtShortDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  catch { return iso; }
};

// Build a base record. Every emitted notification flows through this so we
// keep id + timestamp + severity in one place.
function makeNotification(kind, payload) {
  const meta = KINDS[kind] || { severity: "info" };
  return {
    id: `NOTE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    kind,
    severity: payload.severity || meta.severity,
    title:        payload.title || meta.label,
    body:         payload.body || "",
    recipientType: payload.recipientType,
    recipientId:   payload.recipientId || null,
    refType:       payload.refType || null,
    refId:         payload.refId   || null,
    read: false,
  };
}

// Resolve the right customer recipient for a booking based on the source.
// Returns { type, id, label } or null when the booking has no customer-side
// account (e.g. a walk-in direct booking where we don't have a member).
function resolveCustomerRecipient(booking, { agreements = [], agencies = [], members = [] } = {}) {
  if (!booking) return null;
  // Corporate — the agreement (account) gets a notification keyed by id.
  // Every named user attached to the agreement sees it via their account
  // workspace; the Guest Portal scopes by signed-in user's accountId.
  if (booking.source === "corporate" && booking.accountId) {
    const a = agreements.find((x) => x.id === booking.accountId);
    return { type: "corporate", id: booking.accountId, label: a?.account || booking.accountId };
  }
  // Agent — same shape against the agencies list.
  if (booking.source === "agent" && booking.agencyId) {
    const a = agencies.find((x) => x.id === booking.agencyId);
    return { type: "agent", id: booking.agencyId, label: a?.name || booking.agencyId };
  }
  // Member — match by guest email against the LS Privilege members list.
  // If a member matches, they get the notification on their portal.
  if (booking.email) {
    const m = members.find((x) => (x.email || "").toLowerCase() === booking.email.toLowerCase());
    if (m) return { type: "member", id: m.id, label: m.name };
  }
  return null;
}

// Public deps shape — every notify*() function expects this so we don't
// have to thread the same store slices through every call.
//   { agreements, agencies, members }
//
// Each notify*() returns an array of notification records ready to be
// added to the store. The store helper just calls `appendNotifications`.

// ---------------------------------------------------------------------------
// Booking lifecycle
// ---------------------------------------------------------------------------
export function notifyBookingCreated(booking, deps = {}) {
  if (!booking) return [];
  const out = [];
  const customer = resolveCustomerRecipient(booking, deps);
  const summary  = `${booking.guest || "Guest"} · ${fmtShortDate(booking.checkIn)} → ${fmtShortDate(booking.checkOut)} · ${booking.nights || "?"}n · ${fmtBhd(booking.total)}`;

  // Staff always get notified.
  out.push(makeNotification("booking-new", {
    title: `New booking · ${booking.id || "(pending id)"}`,
    body:  `${summary}${customer ? ` · ${customer.label}` : ""}${booking.source ? ` · ${booking.source}` : ""}.`,
    recipientType: "staff",
    refType: "booking", refId: booking.id || null,
  }));

  // The customer (if we can identify one) gets a parallel notification.
  if (customer) {
    out.push(makeNotification("booking-new", {
      title: `Booking confirmed · ${booking.id || ""}`,
      body:  `Your reservation has been logged. ${summary}.`,
      recipientType: customer.type,
      recipientId:   customer.id,
      refType: "booking", refId: booking.id || null,
    }));
  }
  return out;
}

// Status-change. Maps the lifecycle move to the most descriptive kind so
// the recipient sees a meaningful headline ("Guest checked in" beats
// "Status: in-house").
export function notifyBookingStatusChange(prev, next, deps = {}) {
  if (!prev || !next) return [];
  if ((prev.status || "") === (next.status || "")) return [];
  const out = [];
  const customer = resolveCustomerRecipient(next, deps);
  const summary  = `${next.guest || "Guest"} · ${fmtShortDate(next.checkIn)} → ${fmtShortDate(next.checkOut)}`;

  let kind = "booking-status";
  let staffTitle, staffBody, customerTitle, customerBody;
  switch (next.status) {
    case "confirmed":
      kind = "booking-confirmed";
      staffTitle = `Booking confirmed · ${next.id}`;
      staffBody  = `${summary}.`;
      customerTitle = `Your booking is confirmed`;
      customerBody  = `${next.id} · ${summary}. We look forward to welcoming you.`;
      break;
    case "in-house":
      kind = "booking-checkin";
      staffTitle = `Check-in · ${next.guest} · ${next.id}`;
      staffBody  = `Suite ${next.roomId} · ${summary}.`;
      customerTitle = `Welcome to The Lodge Suites`;
      customerBody  = `${next.guest}, you're checked in. Reception is available 24h on +973 1616 8146.`;
      break;
    case "checked-out":
      kind = "booking-checkout";
      staffTitle = `Check-out · ${next.guest} · ${next.id}`;
      staffBody  = `${summary} · folio total ${fmtBhd(next.total)}.`;
      customerTitle = `Thank you for staying with us`;
      customerBody  = `${next.id} closed. We hope to host you again soon.`;
      break;
    case "cancelled":
      kind = "booking-cancelled";
      staffTitle = `Cancelled · ${next.id}`;
      staffBody  = `${summary} · was ${prev.status || "open"}.`;
      customerTitle = `Booking cancelled`;
      customerBody  = `${next.id} has been cancelled. Cancellation policy and refunds, if any, are processed automatically.`;
      break;
    default:
      // Generic status change — use the booking-status fallback.
      staffTitle = `Booking status changed · ${next.id}`;
      staffBody  = `${prev.status || "open"} → ${next.status || "open"} · ${summary}.`;
      customerTitle = `Your booking has been updated`;
      customerBody  = `${next.id} · status is now ${next.status}.`;
  }

  out.push(makeNotification(kind, {
    title: staffTitle, body: staffBody,
    recipientType: "staff",
    refType: "booking", refId: next.id || null,
  }));
  if (customer) {
    out.push(makeNotification(kind, {
      title: customerTitle, body: customerBody,
      recipientType: customer.type, recipientId: customer.id,
      refType: "booking", refId: next.id || null,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Invoice lifecycle
// ---------------------------------------------------------------------------
function resolveInvoiceRecipient(invoice, deps = {}) {
  if (!invoice) return null;
  // Operator-side invoices store clientType + clientName; corporate / agent
  // accounts also carry accountId.
  if (invoice.accountId && invoice.clientType === "corporate") {
    const a = (deps.agreements || []).find((x) => x.id === invoice.accountId);
    return { type: "corporate", id: invoice.accountId, label: a?.account || invoice.clientName || invoice.accountId };
  }
  if (invoice.accountId && invoice.clientType === "agent") {
    const a = (deps.agencies || []).find((x) => x.id === invoice.accountId);
    return { type: "agent", id: invoice.accountId, label: a?.name || invoice.clientName || invoice.accountId };
  }
  // Members: match by linked booking → email → member.
  if (invoice.bookingId) {
    const b = (deps.bookings || []).find((x) => x.id === invoice.bookingId);
    if (b) return resolveCustomerRecipient(b, deps);
  }
  return null;
}

export function notifyInvoiceIssued(invoice, deps = {}) {
  if (!invoice) return [];
  const customer = resolveInvoiceRecipient(invoice, deps);
  const summary  = `${invoice.id || ""} · ${fmtBhd(invoice.amount)}${invoice.due ? ` · due ${fmtShortDate(invoice.due)}` : ""}`;
  // Commission invoices flip the rhetoric — the hotel is the one paying out,
  // and the agent's portal-side message says funds are on the way rather
  // than asking them to settle.
  const isCommission = (invoice.kind || "booking") === "commission";
  const staffTitle = isCommission ? `Commission invoice issued · ${invoice.id || ""}` : `Invoice issued · ${invoice.id || ""}`;
  const out = [makeNotification("invoice-issued", {
    title: staffTitle,
    body:  `${summary}${customer ? ` · ${customer.label}` : ""}.`,
    recipientType: "staff",
    refType: "invoice", refId: invoice.id || null,
  })];
  if (customer) {
    out.push(makeNotification("invoice-issued", {
      title: isCommission ? `Commission invoice · ${invoice.id || ""}` : `New invoice · ${invoice.id || ""}`,
      body:  isCommission
        ? `${summary}. Your commission is scheduled for settlement; track it in the Commission tab.`
        : `${summary}. Your finance team can settle it from the portal.`,
      recipientType: customer.type, recipientId: customer.id,
      refType: "invoice", refId: invoice.id || null,
    }));
  }
  return out;
}

// Status-change emits one of three kinds depending on where the invoice
// landed.
export function notifyInvoiceStatusChange(prev, next, deps = {}) {
  if (!prev || !next) return [];
  if ((prev.status || "") === (next.status || "")) return [];
  const customer = resolveInvoiceRecipient(next, deps);
  const out = [];
  const summary = `${next.id || ""} · ${fmtBhd(next.amount)}`;

  if (next.status === "paid") {
    out.push(makeNotification("invoice-paid", {
      title: `Invoice settled · ${next.id || ""}`,
      body:  `${summary} cleared in full${customer ? ` by ${customer.label}` : ""}.`,
      recipientType: "staff",
      refType: "invoice", refId: next.id || null,
    }));
    if (customer) {
      out.push(makeNotification("invoice-paid", {
        title: `Thank you — invoice settled`,
        body:  `${summary} has been receipted. A receipt is available in your portal.`,
        recipientType: customer.type, recipientId: customer.id,
        refType: "invoice", refId: next.id || null,
      }));
    }
  } else if (next.status === "overdue") {
    out.push(makeNotification("invoice-overdue", {
      title: `Invoice overdue · ${next.id || ""}`,
      body:  `${summary}${next.due ? ` was due ${fmtShortDate(next.due)}` : ""}${customer ? ` · ${customer.label}` : ""}. Follow up.`,
      recipientType: "staff",
      refType: "invoice", refId: next.id || null,
    }));
    if (customer) {
      out.push(makeNotification("invoice-overdue", {
        title: `Reminder — invoice past due`,
        body:  `${summary}${next.due ? ` was due on ${fmtShortDate(next.due)}` : ""}. Please settle from your portal or contact accounts@thelodgesuites.com.`,
        recipientType: customer.type, recipientId: customer.id,
        refType: "invoice", refId: next.id || null,
      }));
    }
  } else if (next.status === "cancelled") {
    out.push(makeNotification("invoice-cancelled", {
      title: `Invoice cancelled · ${next.id || ""}`,
      body:  `${summary}${customer ? ` · ${customer.label}` : ""}. Was ${prev.status || "issued"}.`,
      recipientType: "staff",
      refType: "invoice", refId: next.id || null,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export function notifyPaymentReceived(payment, deps = {}) {
  if (!payment) return [];
  const out = [];
  // Resolve customer through the linked booking if any.
  let customer = null;
  if (payment.bookingId) {
    const b = (deps.bookings || []).find((x) => x.id === payment.bookingId);
    if (b) customer = resolveCustomerRecipient(b, deps);
  }
  const summary = `${payment.id || ""} · ${fmtBhd(payment.amount)}${payment.method ? ` · ${payment.method}` : ""}`;
  out.push(makeNotification("payment-received", {
    title: `Payment received · ${fmtBhd(payment.amount)}`,
    body:  `${summary}${payment.bookingId ? ` against ${payment.bookingId}` : ""}${customer ? ` · ${customer.label}` : ""}.`,
    recipientType: "staff",
    refType: "payment", refId: payment.id || null,
  }));
  if (customer) {
    out.push(makeNotification("payment-received", {
      title: `Payment received`,
      body:  `${summary}. Receipt available in your portal.`,
      recipientType: customer.type, recipientId: customer.id,
      refType: "payment", refId: payment.id || null,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audience filtering for the bell. Given the active session (staff or
// guest), return only the notifications that should be visible.
// ---------------------------------------------------------------------------
export function filterForStaff(notifs) {
  return (notifs || []).filter((n) => n.recipientType === "staff");
}

export function filterForGuest(notifs, session) {
  if (!session) return [];
  return (notifs || []).filter((n) => {
    if (n.recipientType === "staff") return false;
    if (n.recipientType !== session.kind) return false;
    return n.recipientId === session.accountId || n.recipientId === session.userId;
  });
}

// Format a notification timestamp for the bell drawer ("3m ago", "2h ago",
// "yesterday", or full date for older items).
export function fmtRelative(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  catch { return ""; }
}
