import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ThemeProvider } from "@/app/theme/ThemeProvider";
import { SessionProvider } from "@/app/auth/SessionProvider";
import { router } from "@/app/router";
import "@/styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root-Element #root wurde nicht gefunden.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);
