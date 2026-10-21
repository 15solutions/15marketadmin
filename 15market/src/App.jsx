import React, { useMemo, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserApp from "./UserApp";
import VerifyTradePage from "./components/VerifyTradePage";
import HelpPage from "./components/HelpPage";
import { useAccount } from "wagmi";

// Admin portal (Supabase-Auth identity) — lazy so the user bundle never
// downloads the ops console.
const AdminPortal = lazy(() => import("./components/AdminPortal").then(m => ({ default: m.AdminPortal })));

// Wrapper component to access hooks
function AppContent() {
  const { address } = useAccount();
  // Use local storage for network preference, default to arc
  const network = useMemo(() => localStorage.getItem("15market_network") || "arc", []);

  return (
    <Routes>
      <Route path="/" element={<UserApp />} />
      <Route path="/help" element={<HelpPage theme={localStorage.getItem("15market_theme") || "dark"} />} />
      {/* Landing page for the QR printed on every share card. Must stay outside
          every auth gate - a scanned card has to resolve for a logged-out
          visitor with no wallet. */}
      <Route path="/verify/:tradeId" element={<VerifyTradePage />} />
      {/* Admin portal — email+password via Supabase Auth (migration 011) */}
      <Route
        path="/admin"
        element={
          <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
            <AdminPortal />
          </Suspense>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
