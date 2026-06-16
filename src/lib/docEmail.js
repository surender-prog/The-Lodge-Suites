// docEmail.js — build a branded invoice / receipt PDF and email it to the
// customer as an attachment, via the existing /api/send-email pipeline.
// Pure (no React); called from store actions and from the manual "Email PDF"
// buttons. Fire-and-forget: a slow/unconfigured mailer never blocks the UI.
import { sendTransactionalEmail } from "../utils/email.js";
import { buildDocPdf } from "./docPdf.js";

// Internal copy-list so Accounts always has a record of what went to the guest.
export const DOC_BCC = "accounts@thelodgesuites.bh, fom@thelodgesuites.com";

const money = (n, cur) => `${cur || "BHD"} ${Number(n || 0).toFixed(3)}`;

// emailBookingDocPdf(kind, opts) → Promise<result|null>
//   kind: "invoice" | "receipt"
//   opts: { booking, invoice?, tax, rooms, hotel, currency,
//           to, cc?, bcc?, paymentMethod?, paidOn? }
// Returns null (skipped) when there's no recipient or the PDF couldn't build.
export function emailBookingDocPdf(kind, opts = {}) {
  const { booking, invoice, tax, rooms, hotel, currency = "BHD", to, cc, bcc, paymentMethod, paidOn } = opts;
  const recipient = (to || "").trim();
  if (!booking || !recipient) return Promise.resolve(null);

  let pdf;
  try {
    pdf = buildDocPdf(kind, { booking, invoice, tax, rooms, hotel, currency, paymentMethod, paidOn });
  } catch (_) {
    pdf = null;
  }
  if (!pdf || !pdf.base64) return Promise.resolve(null);

  const isReceipt = kind === "receipt";
  const amount = isReceipt ? (booking.total || 0) : (invoice?.amount ?? booking.total ?? 0);

  return sendTransactionalEmail({
    kind: isReceipt ? "receipt" : "invoice",
    to: recipient,
    cc: cc || undefined,
    bcc: bcc || DOC_BCC,
    name: booking.guest || invoice?.clientName || "Guest",
    docNo: (invoice && invoice.id) || booking.id,
    bookingId: booking.id,
    amountLabel: money(amount, currency),
    attachments: [{ filename: pdf.filename, contentBase64: pdf.base64, contentType: "application/pdf" }],
  });
}
