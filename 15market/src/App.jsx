import React, { useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserApp from "./UserApp";
import VerifyTradePage from "./components/VerifyTradePage";
import { DocsPage } from "./components/DocsPage";
import { useAccount } from "wagmi";

// Wrapper component to access hooks
function AppContent() {
  const { address } = useAccount();
  // Use local storage for network preference, default to arc
  const network = useMemo(() => localStorage.getItem("15market_network") || "arc", []);

  return (
    <Routes>
      <Route path="/" element={<UserApp />} />
      <Route path="/docs" element={<DocsPage theme={localStorage.getItem("15market_theme") || "dark"} />} />
      {/* Landing page for the QR printed on every share card. Must stay outside
          every auth gate - a scanned card has to resolve for a logged-out
          visitor with no wallet. */}
      <Route path="/verify/:tradeId" element={<VerifyTradePage />} />
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
