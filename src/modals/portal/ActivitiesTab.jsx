import React from "react";
import { ActivitiesDashboard } from "./ActivityHub.jsx";

// ActivitiesTab — thin wrapper that surfaces the sales-activity dashboard
// at the top level of the partner portal. The substance lives in
// ActivityHub.jsx (`ActivitiesDashboard`) which is also used inside the
// Reports section and per-account workspaces.
export const ActivitiesTab = () => <ActivitiesDashboard />;
