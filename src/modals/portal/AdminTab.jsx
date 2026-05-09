import React from "react";
import { AdminLayout } from "./admin/AdminLayout.jsx";

// AdminTab is now a thin wrapper. The substance — Calendar, Rooms & Rates,
// Offers, LS Privilege, Operations, Stop-Sale & OTA — lives under
// src/modals/portal/admin/sections/. The optional `section` /
// `onSectionChange` props let PartnerPortal deep-link into a specific
// sub-section (e.g. when the Dashboard navigates here from a KPI tile).
export const AdminTab = ({ section, onSectionChange, params, clearParams, onNavigate }) => (
  <AdminLayout section={section} onSectionChange={onSectionChange} params={params} clearParams={clearParams} onNavigate={onNavigate} />
);
