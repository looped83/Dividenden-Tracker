import { createHashRouter } from "react-router";
import { AppShell } from "@/app/AppShell";
import { MorePage } from "@/app/MorePage";
import { NotFoundPage } from "@/app/NotFoundPage";
import { RequireAuth } from "@/app/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordRequestPage } from "@/features/auth/ResetPasswordRequestPage";
import { ResetPasswordConfirmPage } from "@/features/auth/ResetPasswordConfirmPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { NewPaymentPage } from "@/features/payments/NewPaymentPage";
import { PaymentsPage } from "@/features/payments/PaymentsPage";
import { SecuritiesPage } from "@/features/securities/SecuritiesPage";
import { DepotsPage } from "@/features/depots/DepotsPage";
import { StatisticsPage } from "@/features/statistics/StatisticsPage";
import { ImportsPage } from "@/features/imports/ImportsPage";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { BackupPage } from "@/features/backup/BackupPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

/**
 * Routing (PRODUCT_SPEC.md §4): neun Hauptbereiche, kein Kalenderbereich.
 * React Router 8 im Library-Modus (kein SSR/Framework-Modus, ARCHITECTURE.md K-2).
 * Hash-Router statt Browser-Router: GitHub Pages unterstuetzt kein
 * server-seitiges SPA-Fallback fuer direkt aufgerufene/neu geladene Routen
 * (DECISIONS.md D-030). URLs haben dadurch die Form `/#/login` statt `/login`.
 */
export const router = createHashRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/registrieren", element: <RegisterPage /> },
  { path: "/passwort-vergessen", element: <ResetPasswordRequestPage /> },
  { path: "/passwort-zuruecksetzen", element: <ResetPasswordConfirmPage /> },
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
      { path: "unternehmen", element: <SecuritiesPage /> },
      { path: "depots", element: <DepotsPage /> },
      { path: "statistiken", element: <StatisticsPage /> },
      { path: "importe", element: <ImportsPage /> },
      { path: "ziele", element: <GoalsPage /> },
      { path: "datensicherung", element: <BackupPage /> },
      { path: "einstellungen", element: <SettingsPage /> },
      { path: "mehr", element: <MorePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
