/* eslint-disable react-refresh/only-export-components --
   Die Routentabelle exportiert `router` und definiert daneben die nachgeladenen
   Seiten. Fast Refresh greift fuer eine Routentabelle ohnehin nicht; dieselbe
   Ausnahme nutzen button.tsx und ThemeProvider.tsx. */
import * as React from "react";
import { createHashRouter, Navigate } from "react-router";
import { AppShell } from "@/app/AppShell";
import { NotFoundPage } from "@/app/NotFoundPage";
import { RequireAuth } from "@/app/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";

/**
 * Routing (PRODUCT_SPEC.md §4): neun Hauptbereiche, kein Kalenderbereich.
 * React Router 8 im Library-Modus (kein SSR/Framework-Modus, ARCHITECTURE.md K-2).
 * Hash-Router statt Browser-Router: GitHub Pages unterstuetzt kein
 * server-seitiges SPA-Fallback fuer direkt aufgerufene/neu geladene Routen
 * (DECISIONS.md D-030). URLs haben dadurch die Form `/#/login` statt `/login`.
 *
 * Nachgeladen wird alles ausser dem Geruest, der Anmeldung und der Uebersicht:
 * Diese drei entscheiden den ersten Bildschirm, alles andere waere Ballast im
 * Startpaket. `React.lazy` statt der `lazy`-Route-Eigenschaft, weil der
 * Ladezustand so sichtbar bleibt (Suspense-Rahmen in der App-Huelle) statt die
 * Navigation stumm zu verzoegern.
 */
const PaymentsPage = React.lazy(async () => ({
  default: (await import("@/features/payments/PaymentsPage")).PaymentsPage,
}));
const NewPaymentPage = React.lazy(async () => ({
  default: (await import("@/features/payments/NewPaymentPage")).NewPaymentPage,
}));
const PaymentDetailPage = React.lazy(async () => ({
  default: (await import("@/features/payments/PaymentDetailPage")).PaymentDetailPage,
}));
const DataQualityPage = React.lazy(async () => ({
  default: (await import("@/features/payments/DataQualityPage")).DataQualityPage,
}));
const SecuritiesPage = React.lazy(async () => ({
  default: (await import("@/features/securities/SecuritiesPage")).SecuritiesPage,
}));
const StatisticsPage = React.lazy(async () => ({
  default: (await import("@/features/statistics/StatisticsPage")).StatisticsPage,
}));
const OverviewTab = React.lazy(async () => ({
  default: (await import("@/features/statistics/OverviewTab")).OverviewTab,
}));
const YearsTab = React.lazy(async () => ({
  default: (await import("@/features/statistics/YearsTab")).YearsTab,
}));
const MonthsTab = React.lazy(async () => ({
  default: (await import("@/features/statistics/MonthsTab")).MonthsTab,
}));
const CompaniesTab = React.lazy(async () => ({
  default: (await import("@/features/statistics/CompaniesTab")).CompaniesTab,
}));
const DepotsTab = React.lazy(async () => ({
  default: (await import("@/features/statistics/DepotsTab")).DepotsTab,
}));
const GoalsPage = React.lazy(async () => ({
  default: (await import("@/features/goals/GoalsPage")).GoalsPage,
}));
const GoalDetailPage = React.lazy(async () => ({
  default: (await import("@/features/goals/GoalDetailPage")).GoalDetailPage,
}));
const SettingsPage = React.lazy(async () => ({
  default: (await import("@/features/settings/SettingsPage")).SettingsPage,
}));
const GeneralSettingsTab = React.lazy(async () => ({
  default: (await import("@/features/settings/GeneralSettingsTab")).GeneralSettingsTab,
}));
const DepotsPage = React.lazy(async () => ({
  default: (await import("@/features/depots/DepotsPage")).DepotsPage,
}));
const ImportsPage = React.lazy(async () => ({
  default: (await import("@/features/imports/ImportsPage")).ImportsPage,
}));
const BackupPage = React.lazy(async () => ({
  default: (await import("@/features/backup/BackupPage")).BackupPage,
}));
const MorePage = React.lazy(async () => ({
  default: (await import("@/app/MorePage")).MorePage,
}));
const RegisterPage = React.lazy(async () => ({
  default: (await import("@/features/auth/RegisterPage")).RegisterPage,
}));
const ResetPasswordRequestPage = React.lazy(async () => ({
  default: (await import("@/features/auth/ResetPasswordRequestPage"))
    .ResetPasswordRequestPage,
}));
const ResetPasswordConfirmPage = React.lazy(async () => ({
  default: (await import("@/features/auth/ResetPasswordConfirmPage"))
    .ResetPasswordConfirmPage,
}));

/** Ladezustand fuer nachgeladene Seiten ausserhalb der App-Huelle. */
function PageFallback() {
  return (
    <p className="p-6 text-sm text-muted-foreground" aria-busy="true" aria-live="polite">
      Wird geladen …
    </p>
  );
}

function standalone(element: React.ReactNode): React.ReactElement {
  return <React.Suspense fallback={<PageFallback />}>{element}</React.Suspense>;
}

export const router = createHashRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/registrieren", element: standalone(<RegisterPage />) },
  { path: "/passwort-vergessen", element: standalone(<ResetPasswordRequestPage />) },
  { path: "/passwort-zuruecksetzen", element: standalone(<ResetPasswordConfirmPage />) },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "eingaenge", element: <PaymentsPage /> },
      { path: "eingaenge/neu", element: <NewPaymentPage /> },
      { path: "eingaenge/datenqualitaet", element: <DataQualityPage /> },
      { path: "eingaenge/:id", element: <PaymentDetailPage /> },
      { path: "eingaenge/:id/bearbeiten", element: <NewPaymentPage /> },
      { path: "unternehmen", element: <SecuritiesPage /> },
      {
        path: "statistiken",
        element: <StatisticsPage />,
        children: [
          { index: true, element: <OverviewTab /> },
          { path: "jahre", element: <YearsTab /> },
          { path: "monate", element: <MonthsTab /> },
          { path: "unternehmen", element: <CompaniesTab /> },
          { path: "depots", element: <DepotsTab /> },
        ],
      },
      { path: "ziele", element: <GoalsPage /> },
      { path: "ziele/:id", element: <GoalDetailPage /> },
      {
        path: "einstellungen",
        element: <SettingsPage />,
        children: [
          { index: true, element: <GeneralSettingsTab /> },
          { path: "depots", element: <DepotsPage /> },
          { path: "importe", element: <ImportsPage /> },
          { path: "datensicherung", element: <BackupPage /> },
        ],
      },
      // Die drei Bereiche sind in die Einstellungen verschoben. Die alten
      // Pfade bleiben als dauerhafte Weiterleitung bestehen, damit bestehende
      // Links, Lesezeichen und der Verlauf weiter funktionieren.
      { path: "depots", element: <Navigate to="/einstellungen/depots" replace /> },
      { path: "importe", element: <Navigate to="/einstellungen/importe" replace /> },
      {
        path: "datensicherung",
        element: <Navigate to="/einstellungen/datensicherung" replace />,
      },
      { path: "mehr", element: <MorePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
