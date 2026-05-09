import { C } from "./tokens.js";

// Each benefit `key` references a translation in tiers.benefits.{key}.
// `on` is the boolean truth-value for that tier — translations are tier-agnostic.
export const TIERS = [
  {
    id: "silver",
    icon: "Award",
    color: "#A8A8A8",
    benefits: [
      { key: "memberRate5",        on: true },
      { key: "points1",            on: true },
      { key: "welcomeWater",       on: true },
      { key: "freeWifi",           on: true },
      { key: "complimentaryUpgrade", on: false },
      { key: "lateCheckoutSubject", on: false },
      { key: "freeNightCert",       on: false },
    ],
  },
  {
    id: "gold",
    icon: "Crown",
    color: C.gold,
    benefits: [
      { key: "memberRate10",     on: true },
      { key: "points15",         on: true },
      { key: "welcomeAmenity",   on: true },
      { key: "freeWifi",         on: true },
      { key: "upgradeWhen",      on: true },
      { key: "lateCheckout14",   on: true },
      { key: "freeNight20",      on: false },
    ],
    featured: true,
  },
  {
    id: "platinum",
    icon: "Gem",
    color: "#D4B97A",
    benefits: [
      { key: "memberRate15",        on: true },
      { key: "points2",             on: true },
      { key: "premiumWelcome",      on: true },
      { key: "freeWifi",            on: true },
      { key: "guaranteedUpgrade",   on: true },
      { key: "guaranteedLate16",    on: true },
      { key: "annualFreeNight",     on: true },
    ],
  },
];
