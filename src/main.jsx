import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App.jsx";

// Katha used to ship as a PWA; drop the old offline worker (/sw.js) an earlier visit installed.
navigator.serviceWorker?.getRegistrations().then((registrations) =>
  registrations
    .filter((r) => r.active?.scriptURL.endsWith("/sw.js"))
    .forEach((r) => r.unregister()),
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
