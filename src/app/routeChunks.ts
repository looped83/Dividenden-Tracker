/**
 * Die nachgeladenen Teile der Anwendung an einer Stelle.
 *
 * Zwei Seiten greifen darauf zu: die Routentabelle (`React.lazy`) und das
 * Vorausladen der Navigation (`prefetchRoute`). Genau deshalb stehen die
 * `import()`-Aufrufe hier und nicht dort — dieselbe Aufrufstelle bedeutet
 * dasselbe Modul in der Registry des Browsers. Waeren es zwei Aufrufstellen,
 * lieferte der Bundler zwei Teile aus und das Vorausladen brächte nichts.
 */
export const routeChunks = {
  payments: () => import("@/features/payments/PaymentsPage"),
  newPayment: () => import("@/features/payments/NewPaymentPage"),
  paymentDetail: () => import("@/features/payments/PaymentDetailPage"),
  dataQuality: () => import("@/features/payments/DataQualityPage"),
  calendar: () => import("@/features/calendar/CalendarPage"),
  securities: () => import("@/features/securities/SecuritiesPage"),
  statistics: () => import("@/features/statistics/StatisticsPage"),
  statisticsOverview: () => import("@/features/statistics/OverviewTab"),
  statisticsYears: () => import("@/features/statistics/YearsTab"),
  statisticsMonths: () => import("@/features/statistics/MonthsTab"),
  statisticsBreakdown: () => import("@/features/statistics/BreakdownTab"),
  statisticsComparison: () => import("@/features/statistics/ComparisonTab"),
  statisticsCompanies: () => import("@/features/statistics/CompaniesTab"),
  statisticsDepots: () => import("@/features/statistics/DepotsTab"),
  goals: () => import("@/features/goals/GoalsPage"),
  goalsTab: () => import("@/features/goals/GoalsTab"),
  goalDetail: () => import("@/features/goals/GoalDetailPage"),
  settings: () => import("@/features/settings/SettingsPage"),
  settingsGeneral: () => import("@/features/settings/GeneralSettingsTab"),
  settingsDepots: () => import("@/features/depots/DepotsPage"),
  settingsImports: () => import("@/features/imports/ImportsPage"),
  settingsBackup: () => import("@/features/backup/BackupPage"),
  more: () => import("@/app/MorePage"),
  register: () => import("@/features/auth/RegisterPage"),
  resetPasswordRequest: () => import("@/features/auth/ResetPasswordRequestPage"),
  resetPasswordConfirm: () => import("@/features/auth/ResetPasswordConfirmPage"),
} as const;

type ChunkName = keyof typeof routeChunks;

/**
 * Welche Teile ein Pfad braucht. Verschachtelte Bereiche brauchen zwei: die
 * Huelle mit der Reiternavigation und den Reiter, der beim Aufruf ohne
 * Unterpfad erscheint. Nur Pfade der Navigation stehen hier — Detailseiten
 * erreicht man ueber Listen, deren Eintraege niemand vorab abschaetzen kann.
 */
const CHUNKS_BY_PATH: Readonly<Record<string, readonly ChunkName[]>> = {
  "/eingaenge": ["payments"],
  "/eingaenge/neu": ["newPayment"],
  "/eingaenge/datenqualitaet": ["dataQuality"],
  "/kalender": ["calendar"],
  "/unternehmen": ["securities"],
  "/statistiken": ["statistics", "statisticsOverview"],
  "/statistiken/jahre": ["statistics", "statisticsYears"],
  "/statistiken/monate": ["statistics", "statisticsMonths"],
  "/statistiken/breakdown": ["statistics", "statisticsBreakdown"],
  "/statistiken/vergleich": ["statistics", "statisticsComparison"],
  "/statistiken/unternehmen": ["statistics", "statisticsCompanies"],
  "/statistiken/depots": ["statistics", "statisticsDepots"],
  "/ziele": ["goals", "goalsTab"],
  "/einstellungen": ["settings", "settingsGeneral"],
  "/einstellungen/depots": ["settings", "settingsDepots"],
  "/einstellungen/importe": ["settings", "settingsImports"],
  "/einstellungen/datensicherung": ["settings", "settingsBackup"],
  "/mehr": ["more"],
};

/**
 * Welche Teile ein Pfad braucht — ohne sie zu laden. Getrennt vom Laden, damit
 * ein Test die Tabelle pruefen kann, ohne die halbe Anwendung zu importieren.
 */
export function chunksFor(path: string): readonly ChunkName[] {
  return CHUNKS_BY_PATH[path] ?? [];
}

const angefordert = new Set<ChunkName>();

/** Datensparmodus des Geraets; `connection` fehlt in den Standardtypen. */
function sparsameVerbindung(): boolean {
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
  return connection?.saveData === true;
}

/**
 * Holt die Teile eines Ziels, bevor es angeklickt wird.
 *
 * Ausgeloest von Zeigen und Fokussieren: Zwischen der Absicht und dem Klick
 * liegen auf dem Desktop einige hundert Millisekunden, auf dem Touchgeraet
 * immerhin die Dauer der Beruehrung — genug, um den Teil im Hintergrund zu
 * laden, sodass beim Wechsel kein Ladezustand mehr noetig ist.
 *
 * Fehler bleiben still: Ein misslungenes Vorausladen ist kein Problem, der
 * Wechsel laedt den Teil dann eben regulaer (und zeigt dabei den Fehler).
 */
export function prefetchRoute(path: string): void {
  if (sparsameVerbindung()) return;
  for (const name of chunksFor(path)) {
    if (angefordert.has(name)) continue;
    angefordert.add(name);
    void routeChunks[name]().catch(() => {
      angefordert.delete(name);
    });
  }
}

/**
 * Ereignisse eines Navigationspunkts, die das Vorausladen ausloesen. Als
 * Eigenschaften statt als Komponente, weil die Navigationspunkte sich sonst
 * in nichts gleichen (Beschriftung, Symbol, aktive Darstellung).
 */
export function prefetchProps(path: string): {
  onPointerEnter: () => void;
  onFocus: () => void;
} {
  return {
    onPointerEnter: () => {
      prefetchRoute(path);
    },
    onFocus: () => {
      prefetchRoute(path);
    },
  };
}
