import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/app/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { UpdatePrompt } from "@/components/layout/UpdatePrompt";
import { SessionProvider } from "@/app/auth/SessionProvider";
import { router } from "@/app/router";
import "@/styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root-Element #root wurde nicht gefunden.");
}

// Service Worker nur im gebauten Stand: In der Entwicklung wuerde er die
// Modulauslieferung von Vite ueberlagern. Er speichert ausschliesslich die
// App-Huelle, keine Daten (siehe public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}

// Nach einem Deploy fehlen die nachgeladenen Teile der alten Fassung auf dem
// Server. Eine App, die tagelang im Speicher bleibt (iPhone), lief beim
// naechsten Bereichswechsel sonst in die Fehlerseite. Neu laden holt die
// aktuelle Fassung — hoechstens einmal je Minute, damit ein Teil, der auch
// danach fehlt (offline, Serverfehler), nicht in eine Schleife fuehrt.
window.addEventListener("vite:preloadError", () => {
  const KEY = "dividend-tracker:chunk-reload";
  try {
    const last = Number.parseInt(sessionStorage.getItem(KEY) ?? "0", 10);
    if (!navigator.onLine || Date.now() - last < 60_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
});

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ToastProvider>
            <RouterProvider router={router} />
            {/* Ausserhalb des Routers: Der Hinweis auf eine neue Fassung gilt
                der ganzen Anwendung, auch auf der Anmeldeseite. */}
            <UpdatePrompt />
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
