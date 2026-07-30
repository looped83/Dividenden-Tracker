/* eslint-disable react-refresh/only-export-components --
   Die Routentabelle exportiert `router` und definiert daneben die nachgeladenen
   Seiten. Fast Refresh greift fuer eine Routentabelle ohnehin nicht; dieselbe
   Ausnahme nutzen button.tsx und ThemeProvider.tsx. */
import * as React from "react";
import { createHashRouter, Navigate } from "react-router";
import { AppShell } from "@/app/AppShell";
import { NotFoundPage } from "@/app/NotFoundPage";
import { RequireAuth } from "@/app/auth/RequireAuth";
import { AuthPageSkeleton } from "@/components/layout/PageSkeleton";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { routeChunks } from "@/app/routeChunks";

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
 *
 * Die `import()`-Aufrufe stehen in `routeChunks.ts`, damit das Vorausladen der
 * Navigation dieselben Teile anfordert wie die Routentabelle.
 */
const PaymentsPage = React.lazy(async () => ({
  default: (await routeChunks.payments()).PaymentsPage,
}));
const NewPaymentPage = React.lazy(async () => ({
  default: (await routeChunks.newPayment()).NewPaymentPage,
}));
const PaymentDetailPage = React.lazy(async () => ({
  default: (await routeChunks.paymentDetail()).PaymentDetailPage,
}));
const DataQualityPage = React.lazy(async () => ({
  default: (await routeChunks.dataQuality()).DataQualityPage,
}));
const SecuritiesPage = React.lazy(async () => ({
  default: (await routeChunks.securities()).SecuritiesPage,
}));
const SecurityDetailPage = React.lazy(async () => ({
  default: (await import("@/features/securities/SecurityDetailPage")).SecurityDetailPage,
}));
const StatisticsPage = React.lazy(async () => ({
  default: (await routeChunks.statistics()).StatisticsPage,
}));
const OverviewTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsOverview()).OverviewTab,
}));
const YearsTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsYears()).YearsTab,
}));
const MonthsTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsMonths()).MonthsTab,
}));
const BreakdownTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsBreakdown()).BreakdownTab,
}));
const ComparisonTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsComparison()).ComparisonTab,
}));
const CompaniesTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsCompanies()).CompaniesTab,
}));
const DepotsTab = React.lazy(async () => ({
  default: (await routeChunks.statisticsDepots()).DepotsTab,
}));
const GoalsPage = React.lazy(async () => ({
  default: (await routeChunks.goals()).GoalsPage,
}));
const GoalDetailPage = React.lazy(async () => ({
  default: (await routeChunks.goalDetail()).GoalDetailPage,
}));
const SettingsPage = React.lazy(async () => ({
  default: (await routeChunks.settings()).SettingsPage,
}));
const GeneralSettingsTab = React.lazy(async () => ({
  default: (await routeChunks.settingsGeneral()).GeneralSettingsTab,
}));
const DepotsPage = React.lazy(async () => ({
  default: (await routeChunks.settingsDepots()).DepotsPage,
}));
const ImportsPage = React.lazy(async () => ({
  default: (await routeChunks.settingsImports()).ImportsPage,
}));
const BackupPage = React.lazy(async () => ({
  default: (await routeChunks.settingsBackup()).BackupPage,
}));
const MorePage = React.lazy(async () => ({
  default: (await routeChunks.more()).MorePage,
}));
const RegisterPage = React.lazy(async () => ({
  default: (await routeChunks.register()).RegisterPage,
}));
const ResetPasswordRequestPage = React.lazy(async () => ({
  default: (await routeChunks.resetPasswordRequest()).ResetPasswordRequestPage,
}));
const ResetPasswordConfirmPage = React.lazy(async () => ({
  default: (await routeChunks.resetPasswordConfirm()).ResetPasswordConfirmPage,
}));

function standalone(element: React.ReactNode): React.ReactElement {
  return <React.Suspense fallback={<AuthPageSkeleton />}>{element}</React.Suspense>;
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
      { path: "unternehmen/:id", element: <SecurityDetailPage /> },
      {
        path: "statistiken",
        element: <StatisticsPage />,
        children: [
          { index: true, element: <OverviewTab /> },
          { path: "jahre", element: <YearsTab /> },
          { path: "monate", element: <MonthsTab /> },
          { path: "breakdown", element: <BreakdownTab /> },
          { path: "vergleich", element: <ComparisonTab /> },
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
