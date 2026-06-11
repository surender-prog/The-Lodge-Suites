// ReportEmail — moved to src/lib/reportEmail.js so the /api/run-reports
// cron runner can import the builders server-side. This shim keeps the old
// import path working for the admin UI.
export * from "../../../lib/reportEmail.js";
