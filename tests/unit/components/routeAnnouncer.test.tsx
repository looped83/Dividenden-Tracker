import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { RouteAnnouncer } from "@/components/layout/RouteAnnouncer";
import { areaNameFor } from "@/components/layout/areaNames";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <RouteAnnouncer contentId="inhalt" />
      <Link to="/eingaenge">Zu den Dividenden</Link>
      <main id="inhalt" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<p>Übersicht</p>} />
          <Route path="/eingaenge" element={<p>Liste</p>} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

describe("areaNameFor", () => {
  it("benennt die Hauptbereiche", () => {
    expect(areaNameFor("/")).toBe("Übersicht");
    expect(areaNameFor("/eingaenge")).toBe("Dividenden");
    expect(areaNameFor("/eingaenge/neu")).toBe("Neue Dividende");
    expect(areaNameFor("/statistiken/monate")).toBe("Statistik, Monate");
    expect(areaNameFor("/einstellungen/depots")).toBe("Einstellungen, Depots");
  });

  it("verwechselt die Uebersicht nicht mit jedem Pfad", () => {
    // "/" ist exakt gemeint; sonst hiesse jeder Pfad „Übersicht".
    expect(areaNameFor("/ziele")).toBe("Ziele");
  });

  it("schweigt bei unbekannten Pfaden", () => {
    expect(areaNameFor("/gibt-es-nicht")).toBeNull();
  });
});

describe("RouteAnnouncer", () => {
  it("sagt beim ersten Rendern nichts an", () => {
    renderApp();
    // Beim Laden liest der Screenreader das Dokument ohnehin vor.
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("sagt den Bereich nach dem Wechsel an und holt den Fokus in den Inhalt", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("link", { name: "Zu den Dividenden" }));

    expect(screen.getByRole("status")).toHaveTextContent("Dividenden");
    expect(document.activeElement).toBe(document.getElementById("inhalt"));
  });
});
