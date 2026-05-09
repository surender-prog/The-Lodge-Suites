import React, { useEffect, useState } from "react";
import { C } from "./data/tokens.js";
import { useData } from "./data/store.jsx";
import { Header } from "./sections/Header.jsx";
import { Hero } from "./sections/Hero.jsx";
import { IntroStrip } from "./sections/IntroStrip.jsx";
import { RoomsSection } from "./sections/RoomsSection.jsx";
import { PackagesSection } from "./sections/PackagesSection.jsx";
import { RewardsSection } from "./sections/RewardsSection.jsx";
import { AmenitiesSection } from "./sections/AmenitiesSection.jsx";
import { GallerySection } from "./sections/GallerySection.jsx";
import { FAQSection } from "./sections/FAQSection.jsx";
import { ContactSection } from "./sections/ContactSection.jsx";
import { CorporateSection } from "./sections/CorporateSection.jsx";
import { Footer } from "./sections/Footer.jsx";
import { BookingModal } from "./modals/BookingModal.jsx";
import { PartnerPortal } from "./modals/PartnerPortal.jsx";
import { GuestPortal } from "./modals/GuestPortal.jsx";
import { JoinModal } from "./modals/JoinModal.jsx";
import { GiftVouchersModal } from "./modals/GiftVouchersModal.jsx";
import { JuffairModal } from "./modals/JuffairModal.jsx";
import { PressModal } from "./modals/PressModal.jsx";
import { RfpModal } from "./modals/RfpModal.jsx";

export default function App() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitial, setBookingInitial] = useState({});
  const [portalOpen, setPortalOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  // Editorial secondary pages. Per CLAUDE.md the site has no router, so each
  // of these is a full-screen modal triggered from the Footer columns.
  const [vouchersOpen, setVouchersOpen] = useState(false);
  const [juffairOpen,  setJuffairOpen]  = useState(false);
  const [pressOpen,    setPressOpen]    = useState(false);
  const [rfpOpen,      setRfpOpen]      = useState(false);

  // When the Owner triggers "Log in as user" inside the Partner Portal, the
  // store sets `impersonation`. We auto-open the Guest Portal and close the
  // Partner Portal so the operator can experience the chosen user's view.
  const { impersonation } = useData();
  useEffect(() => {
    if (impersonation) {
      setSignInOpen(true);
      setPortalOpen(false);
    }
  }, [impersonation]);

  const onNav = (id) => {
    if (id === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const openBooking = (initial = {}) => {
    setBookingInitial(initial);
    setBookingOpen(true);
  };

  return (
    <div style={{ backgroundColor: C.paper, minHeight: "100vh" }}>
      <Header
        onBook={() => openBooking()}
        onPortal={() => setPortalOpen(true)}
        onSignIn={() => setSignInOpen(true)}
        onNav={onNav}
      />

      <main>
        <section id="home"><Hero onSearch={(d) => openBooking({ ...d, step: 2 })} /></section>
        <IntroStrip />
        <RoomsSection onBookRoom={(room) => openBooking({ room, step: 3 })} />
        <PackagesSection onBookPackage={(p) => openBooking({ package: p, step: 1 })} />
        <RewardsSection onJoin={() => setJoinOpen(true)} />
        <AmenitiesSection />
        <CorporateSection onOpenRfp={() => setRfpOpen(true)} />
        <GallerySection />
        <FAQSection />
        <ContactSection />
      </main>

      <Footer
        onPortal={() => setPortalOpen(true)}
        onNav={onNav}
        onOpenVouchers={() => setVouchersOpen(true)}
        onOpenJuffair={() => setJuffairOpen(true)}
        onOpenPress={() => setPressOpen(true)}
        onOpenRfp={() => setRfpOpen(true)}
      />

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} initial={bookingInitial} />
      <PartnerPortal open={portalOpen} onClose={() => setPortalOpen(false)} />
      <GuestPortal open={signInOpen} onClose={() => setSignInOpen(false)} />
      <JoinModal open={joinOpen} onClose={() => setJoinOpen(false)} />

      {/* Editorial secondary pages, opened from the Footer */}
      <GiftVouchersModal
        open={vouchersOpen}
        onClose={() => setVouchersOpen(false)}
        onBook={() => openBooking()}
      />
      <JuffairModal
        open={juffairOpen}
        onClose={() => setJuffairOpen(false)}
      />
      <PressModal
        open={pressOpen}
        onClose={() => setPressOpen(false)}
      />
      <RfpModal
        open={rfpOpen}
        onClose={() => setRfpOpen(false)}
      />
    </div>
  );
}
