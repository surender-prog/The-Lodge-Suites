import React from "react";
import {
  ArrowUpRight, Bus, Car, Coffee, Compass, Footprints, Globe2,
  MapPin, ShoppingBag, Sun, Utensils, Waves,
} from "lucide-react";
import { C } from "../data/tokens.js";
import { IMG } from "../data/images.js";
import { EditorialPage, PageSection } from "./EditorialPage.jsx";

// ---------------------------------------------------------------------------
// Juffair — neighbourhood guide page. Operator-friendly editorial about the
// district, its energy, what's at walking distance, where to eat, and how
// to get to the rest of the kingdom from here. Kept as data so the SiteContent
// CMS can graduate it later without changing the UI.
// ---------------------------------------------------------------------------

const FACTS = [
  { label: "Postcode",         value: "Block 340" },
  { label: "Coastline",        value: "Arabian Gulf · 5 min drive" },
  { label: "Manama City Centre", value: "8 km north" },
  { label: "Bahrain International Airport", value: "12 km · ~20 min drive" },
];

const NEARBY = [
  { id: "jw",         icon: ShoppingBag, title: "The Avenues Bahrain",       distance: "12 min drive",  note: "Waterfront retail and dining promenade — the quiet alternative to City Centre Mall." },
  { id: "alfateh",    icon: Compass,     title: "Al Fateh Grand Mosque",     distance: "10 min drive",  note: "Bahrain's largest place of worship, open to visitors with a daily English-language tour." },
  { id: "amwaj",      icon: Waves,       title: "Amwaj Islands beaches",     distance: "20 min drive",  note: "Reclaimed islands ringed by public beaches and family resorts." },
  { id: "souq",       icon: Coffee,      title: "Manama Souq",                distance: "12 min drive",  note: "Spice traders, gold dealers, and the kind of coffee that keeps the city awake." },
  { id: "circuit",    icon: Sun,         title: "Bahrain International Circuit", distance: "30 min drive", note: "Home of the F1 Grand Prix; karting and trackside dining year-round." },
  { id: "embassies",  icon: Globe2,      title: "Embassy quarter",            distance: "Walking distance", note: "US, UK and several European missions are within a few blocks of the property." },
];

const DINING = [
  { id: "shahen",   title: "Shahen Bahraini Kitchen",   tagline: "Modern Khaleeji",       distance: "5 min walk", reservation: "Walk-in friendly · busy after 8pm" },
  { id: "harbour",  title: "Harbour Restaurant",        tagline: "Mediterranean · seafood", distance: "10 min drive", reservation: "Reservation recommended on weekends" },
  { id: "saffron",  title: "Saffron",                   tagline: "Indian · classical",    distance: "8 min walk", reservation: "Walk-in" },
  { id: "olives",   title: "Olives",                    tagline: "Italian · trattoria",   distance: "12 min walk", reservation: "Walk-in · weekend brunch popular" },
  { id: "wokyo",    title: "Wokyo",                     tagline: "Pan-Asian noodle bar",  distance: "5 min walk", reservation: "Walk-in" },
  { id: "lacasa",   title: "La Casa Cafe",              tagline: "All-day dining",        distance: "Across the road", reservation: "Walk-in · breakfast 7am" },
];

const RHYTHMS = [
  { time: "Dawn",     note: "Front desk shifts overlap with the call to prayer from Al Fateh — a quietly cinematic moment if you're up." },
  { time: "Morning",  note: "Fast lane on Shabab Avenue empties out by 9am. Grab a coffee at La Casa or order to suite." },
  { time: "Midday",   note: "Pool deck is at its quietest before the school-pickup crowd settles in around 14:00." },
  { time: "Evening",  note: "The walking strip from the property to Shahen is at its best between 18:00 and 22:00." },
  { time: "Late",     note: "Most kitchens close by midnight; in-suite dining runs until 02:00 every night." },
];

export const JuffairModal = ({ open, onClose }) => {
  return (
    <EditorialPage
      open={open}
      onClose={onClose}
      eyebrow="The Neighbourhood"
      title="Juffair,"
      italic="quietly central."
      intro="A district at the south-east of Manama where embassies meet five-star high-rises and a working seafront. Quiet enough to live in, central enough to walk from."
      heroImage={IMG.cityView}
    >
      {/* Quick facts strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)", marginBottom: "4rem" }}>
        {FACTS.map((f) => (
          <div key={f.label} className="p-6" style={{ backgroundColor: C.cream }}>
            <div style={{ color: C.goldDeep, fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 700 }}>
              {f.label}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.55rem", color: C.bgDeep, fontWeight: 400, marginTop: 6, lineHeight: 1.15 }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {/* Editorial intro paragraphs */}
      <PageSection
        eyebrow="A district, profiled"
        title="The kind of"
        italic="quiet you choose."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "1.02rem", lineHeight: 1.85 }}>
            Juffair was once a stretch of shoreline known mostly to the navy that still anchors part of it. Today it is the kingdom's most internationally minded postcode — a tight grid of embassies, family-owned restaurants, weekend brunch spots, and apartment towers with a view of the Gulf on three sides.
          </p>
          <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "1.02rem", lineHeight: 1.85 }}>
            What it doesn't have is the noise of a corniche or the crowd of a souq. You'll hear the sea more often than the traffic, and you'll walk more than you'd expect from a city built around cars. The Lodge Suites sits on Shabab Avenue, three blocks from the seafront promenade.
          </p>
        </div>
      </PageSection>

      {/* At walking distance / nearby */}
      <PageSection
        eyebrow="Around us"
        title="At walking"
        italic="distance."
        intro="A short list of the places our concierge recommends, grouped by how far you'll need to go to get there."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {NEARBY.map((n) => (
            <div key={n.id} className="p-7" style={{ backgroundColor: C.cream }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <n.icon size={22} style={{ color: C.goldDeep }} />
                <span style={{
                  fontFamily: "'Manrope', sans-serif", fontSize: "0.6rem",
                  letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
                  color: C.goldDeep, padding: "2px 8px",
                  border: `1px solid ${C.goldDeep}`,
                }}>{n.distance}</span>
              </div>
              <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500, lineHeight: 1.15 }}>
                {n.title}
              </h4>
              <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.86rem", marginTop: 6, lineHeight: 1.6 }}>
                {n.note}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      {/* Dining */}
      <PageSection
        eyebrow="Dining around"
        title="Six tables we"
        italic="quietly recommend."
        intro="None of these are in the hotel. They're in the neighbourhood, and they're the ones our team eats at on their nights off."
      >
        <div className="overflow-x-auto" style={{ border: `1px solid rgba(0,0,0,0.08)` }}>
          <table className="w-full" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.92rem", color: C.bgDeep }}>
            <thead>
              <tr style={{ backgroundColor: C.cream }}>
                {["Restaurant", "Style", "From the property", "Reservations"].map((h) => (
                  <th key={h} className="text-start px-5 py-4" style={{
                    fontSize: "0.62rem", letterSpacing: "0.22em",
                    textTransform: "uppercase", fontWeight: 700, color: C.goldDeep,
                    borderBottom: `1px solid rgba(0,0,0,0.08)`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DINING.map((d) => (
                <tr key={d.id} style={{ borderTop: `1px solid rgba(0,0,0,0.05)`, backgroundColor: C.paper }}>
                  <td className="px-5 py-4">
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.15rem", color: C.bgDeep, fontWeight: 500 }}>
                      {d.title}
                    </div>
                  </td>
                  <td className="px-5 py-4" style={{ color: C.textDim }}>{d.tagline}</td>
                  <td className="px-5 py-4" style={{ color: C.bgDeep, fontWeight: 600 }}>{d.distance}</td>
                  <td className="px-5 py-4" style={{ color: C.textDim, fontSize: "0.86rem" }}>{d.reservation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      {/* Daily rhythm */}
      <PageSection
        eyebrow="The day, locally"
        title="Juffair, hour"
        italic="by hour."
        intro="The neighbourhood reads differently at different times. A short guide, the way our front desk would tell it."
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          {RHYTHMS.map((r, i) => (
            <div key={i} className="p-6" style={{ backgroundColor: C.cream }}>
              <div style={{ color: C.goldDeep, fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", fontStyle: "italic", fontWeight: 400, lineHeight: 1 }}>
                {r.time}
              </div>
              <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.84rem", marginTop: 10, lineHeight: 1.6 }}>
                {r.note}
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      {/* Getting around */}
      <PageSection
        eyebrow="Getting around"
        title="Arrive, then"
        italic="forget the car."
        intro="Most of what makes Juffair worth visiting is on foot. For the rest, the kingdom is small enough that a 25-minute drive crosses the country."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { icon: Footprints, title: "On foot", note: "From the property: the seafront in 6 minutes, Shahen Avenue's restaurants within 10, and the embassy quarter alongside it." },
            { icon: Car,        title: "Car-share & taxi", note: "Careem and Uber both cover Juffair reliably. Our front desk can call a vetted private driver for longer days." },
            { icon: Bus,        title: "Buses & ferries",  note: "Bus 42 connects Juffair with City Centre Mall and the Souq; the airport is a single 25-minute taxi away from arrivals." },
          ].map((g, i) => (
            <div key={i} className="p-6" style={{ backgroundColor: C.cream, borderTop: `2px solid ${C.gold}` }}>
              <g.icon size={24} style={{ color: C.goldDeep }} />
              <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", color: C.bgDeep, fontWeight: 500, marginTop: 14 }}>
                {g.title}
              </h4>
              <p style={{ fontFamily: "'Manrope', sans-serif", color: C.textDim, fontSize: "0.86rem", marginTop: 6, lineHeight: 1.65 }}>
                {g.note}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      {/* Find us */}
      <section style={{ marginBottom: "1rem" }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
          <div className="p-8" style={{ backgroundColor: C.bgDeep, color: C.cream }}>
            <div style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.66rem", letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>
              Find us
            </div>
            <h3 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem",
              fontWeight: 400, color: C.cream, lineHeight: 1.1, marginTop: 10,
            }}>
              Building 916, Road 4019<br />
              <span style={{ fontStyle: "italic", color: C.gold }}>Block 340 · Juffair</span>
            </h3>
            <p style={{ color: C.textOnDark, fontFamily: "'Manrope', sans-serif", fontSize: "0.9rem", lineHeight: 1.75, marginTop: 16, opacity: 0.85 }}>
              On Shabab Avenue, three blocks from the seafront and within walking distance of the embassy quarter. Front desk staffed 24 hours; valet parking available on arrival.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-5" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "0.84rem" }}>
              <div>
                <div style={{ color: C.gold, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Phone</div>
                <a href="tel:+97316168146" style={{ color: C.cream, direction: "ltr" }}>+973 1616 8146</a>
              </div>
              <div>
                <div style={{ color: C.gold, fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Email</div>
                <a href="mailto:frontoffice@thelodgesuites.com" style={{ color: C.cream }}>frontoffice@thelodgesuites.com</a>
              </div>
            </div>
            <a href="https://maps.google.com/?q=The+Lodge+Suites+Juffair+Bahrain"
              target="_blank" rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2"
              style={{ color: C.gold, fontFamily: "'Manrope', sans-serif", fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}
            >
              Open in Google Maps <ArrowUpRight size={13} />
            </a>
          </div>
          <div className="relative" style={{ minHeight: 380, backgroundColor: C.bgPanel }}>
            <img src={IMG.cityView} alt="Juffair from above" className="w-full h-full object-cover absolute inset-0" style={{ filter: "grayscale(0.2) brightness(0.8)" }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-6" style={{ backgroundColor: "rgba(21,22,26,0.92)", border: `1px solid ${C.gold}` }}>
                <MapPin size={26} style={{ color: C.gold, margin: "0 auto" }} />
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.3rem", color: C.cream, marginTop: 10 }}>The Lodge Suites</div>
                <div style={{ fontFamily: "'Manrope', sans-serif", color: C.textMuted, fontSize: "0.74rem", marginTop: 2 }}>26.221°N · 50.595°E</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </EditorialPage>
  );
};
