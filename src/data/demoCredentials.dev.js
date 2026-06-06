// demoCredentials.dev.js — quick-fill login tiles for LOCAL DEVELOPMENT ONLY.
//
// SECURITY: these are real account passwords. They must NEVER ship in a
// production bundle. This module is loaded exclusively via a dynamic
// import() that is statically guarded by `import.meta.env.DEV` (see
// GuestPortal LoginPanel), so Rollup tree-shakes the call in production and
// the strings below are never emitted into the prod chunk. Do not import this
// statically anywhere.
export const DEMO_CREDS = [
  { kind: "Corporate · BAPCO",        email: "sara.h@bapco.com.bh",     password: "LodgeStay-2026",  color: "#D97706", icon: "Building2" },
  { kind: "Corporate · GFH",          email: "y.mannai@gfh.com",        password: "LodgeStay-2026",  color: "#D97706", icon: "Building2" },
  { kind: "Travel Agent · Globepass", email: "reem@globepass.bh",       password: "AgentLogin-2026", color: "#7C3AED", icon: "Briefcase" },
  { kind: "Travel Agent · Cleartrip", email: "v.iyer@cleartrip.com",    password: "AgentLogin-2026", color: "#7C3AED", icon: "Briefcase" },
  { kind: "LS Privilege · Gold",      email: "l.alkhalifa@example.com", password: "Member-2026",     color: "#C9A961", icon: "Crown" },
  { kind: "LS Privilege · Platinum",  email: "s.holloway@example.com",  password: "Member-2026",     color: "#D4B97A", icon: "Sparkles" },
];
