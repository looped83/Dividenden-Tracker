import * as React from "react";
import { CalendarDays, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/toast";
import { isoFromRef, refDateFromDate } from "@/lib/statistics";
import { shiftMonth } from "@/lib/calendar/month";
import { lastSyncLabel } from "@/lib/calendar/format";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/calendar/types";
import {
  useAutoCalendarSync,
  useCalendarEvents,
  useCalendarSyncStatus,
  useSyncCalendar,
} from "./hooks";
import { useCalendarViewMode } from "./viewMode";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthView } from "./MonthView";
import { AgendaView } from "./AgendaView";
import { EventDetailDialog } from "./EventDetailDialog";

const SYNC_FAILED_HINT =
  "Der Dividendenkalender konnte gerade nicht aktualisiert werden. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.";

function CalendarSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Kalender wird geladen …</span>
      <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-md bg-muted sm:h-24" />
        ))}
      </div>
    </div>
  );
}

/**
 * Dividendenkalender: angekuendigte Zahltage aus der Kalenderquelle
 * (docs/CALENDAR_INTEGRATION.md).
 *
 * Die Datenbank ist die Quelle der Ansicht, nicht der Feed: Faellt die Quelle
 * aus, bleiben die zuletzt erfolgreich gespeicherten Termine sichtbar, und der
 * Fehlschlag steht als dezenter Hinweis daneben (Auftrag §6/§13/§17).
 *
 * Getrennt von den erfassten Dividendeneingaengen (Auftrag §18): Hier stehen
 * ausschliesslich **angekuendigte** Termine. Es wird nichts als erhalten
 * markiert und kein Betrag geschaetzt.
 */
export function CalendarPage() {
  const { notify } = useToast();
  const today = React.useMemo(() => isoFromRef(refDateFromDate()), []);
  const [viewMode, setViewMode] = useCalendarViewMode();
  const [visibleMonth, setVisibleMonth] = React.useState(() => {
    const ref = refDateFromDate();
    return { year: ref.year, month: ref.month };
  });
  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);
  // Das Element, von dem aus die Detailansicht geoeffnet wurde. Es wird beim
  // Klick festgehalten — zu diesem Zeitpunkt liegt der Fokus noch darauf —,
  // damit er nach dem Schliessen genau dorthin zurueckkehrt (Auftrag §16).
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const selectEvent = React.useCallback((event: CalendarEvent) => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected(event);
  }, []);

  const eventsQuery = useCalendarEvents();
  const statusQuery = useCalendarSyncStatus();
  const syncMutation = useSyncCalendar();

  const events = React.useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const status = statusQuery.data ?? null;
  const isSyncing = syncMutation.isPending;

  const runSync = React.useCallback(
    (options: { announce: boolean }) => {
      syncMutation.mutate(undefined, {
        onSuccess: () => {
          if (options.announce) notify("Dividendenkalender aktualisiert.");
        },
      });
    },
    // `syncMutation` ist bei jedem Rendern ein neues Objekt; `mutate` selbst
    // ist stabil. Die Abhaengigkeit auf das Objekt loeste den Effekt der
    // automatischen Aktualisierung sonst endlos aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncMutation.mutate, notify],
  );

  const autoSync = React.useCallback(() => {
    runSync({ announce: false });
  }, [runSync]);

  useAutoCalendarSync({
    lastSuccessAt: status?.last_success_at,
    isStatusLoaded: statusQuery.isSuccess,
    isSyncing,
    sync: autoSync,
  });

  const isInitialLoading = eventsQuery.isLoading || statusQuery.isLoading;
  const lastSuccessAt = status?.last_success_at ?? null;
  const neverSynced = lastSuccessAt === null;
  const syncFailed = syncMutation.isError;
  const syncErrorMessage = syncFailed
    ? getErrorMessage(syncMutation.error, SYNC_FAILED_HINT)
    : status?.state === "error"
      ? (status.error_message ?? SYNC_FAILED_HINT)
      : null;

  const heading = (
    <>
      <PageHeader
        title="Dividendenkalender"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              runSync({ announce: true });
            }}
            disabled={isSyncing}
            aria-busy={isSyncing}
          >
            <RefreshCw className={cn(isSyncing && "animate-spin")} aria-hidden />
            {isSyncing ? "Wird aktualisiert …" : "Aktualisieren"}
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        Alle angekündigten Zahltage deiner Dividenden auf einen Blick.
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      {heading}

      {isInitialLoading ? (
        <CalendarSkeleton />
      ) : eventsQuery.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Der Kalender konnte nicht geladen werden"
          description={getErrorMessage(
            eventsQuery.error,
            "Beim Laden der Termine ist ein Fehler aufgetreten.",
          )}
          action={
            <Button onClick={() => void eventsQuery.refetch()}>Erneut versuchen</Button>
          }
        />
      ) : neverSynced && events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Der Dividendenkalender wurde noch nicht synchronisiert."
          description={
            syncErrorMessage ??
            "Beim ersten Abgleich werden alle angekündigten Zahltage der Kalenderquelle übernommen."
          }
          action={
            <Button
              onClick={() => {
                runSync({ announce: true });
              }}
              disabled={isSyncing}
              aria-busy={isSyncing}
            >
              <RefreshCw className={cn(isSyncing && "animate-spin")} aria-hidden />
              {isSyncing ? "Wird synchronisiert …" : "Kalender synchronisieren"}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <SyncStatusLine
            lastSuccessAt={lastSuccessAt}
            today={today}
            isSyncing={isSyncing}
          />

          {syncErrorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{syncErrorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Ohne einen einzigen Termin gibt es nichts zu blaettern und nichts
              umzuschalten; die Bedienleiste bliebe eine leere Geste. */}
          {events.length > 0 && (
            <CalendarToolbar
              mode={viewMode}
              onModeChange={setViewMode}
              year={visibleMonth.year}
              month={visibleMonth.month}
              onShiftMonth={(delta) => {
                setVisibleMonth((current) =>
                  shiftMonth(current.year, current.month, delta),
                );
              }}
              onToday={() => {
                const ref = refDateFromDate();
                setVisibleMonth({ year: ref.year, month: ref.month });
              }}
            />
          )}

          {events.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Keine bevorstehenden Zahltage gefunden."
              description="Neue angekündigte Dividendenzahlungen erscheinen automatisch hier."
            />
          ) : viewMode === "month" ? (
            <MonthView
              year={visibleMonth.year}
              month={visibleMonth.month}
              events={events}
              today={today}
              onSelect={selectEvent}
            />
          ) : (
            <AgendaViewWithEmptyState
              events={events}
              today={today}
              onSelect={selectEvent}
            />
          )}
        </div>
      )}

      <EventDetailDialog
        event={selected}
        returnFocusTo={triggerRef}
        onClose={() => {
          setSelected(null);
        }}
      />
    </div>
  );
}

/**
 * Die Liste zeigt nur, was kommt. Liegen alle gespeicherten Termine in der
 * Vergangenheit, bliebe sie sonst kommentarlos leer.
 */
function AgendaViewWithEmptyState({
  events,
  today,
  onSelect,
}: {
  events: readonly CalendarEvent[];
  today: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const hasUpcoming = events.some((event) => event.date >= today);
  if (!hasUpcoming) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Keine bevorstehenden Zahltage gefunden."
        description="Frühere Termine findest du in der Monatsansicht."
      />
    );
  }
  return <AgendaView events={events} today={today} onSelect={onSelect} />;
}

function SyncStatusLine({
  lastSuccessAt,
  today,
  isSyncing,
}: {
  lastSuccessAt: string | null;
  today: string;
  isSyncing: boolean;
}) {
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {isSyncing
        ? "Kalender wird aktualisiert …"
        : lastSuccessAt
          ? `Zuletzt aktualisiert: ${lastSyncLabel(lastSuccessAt, today)}`
          : "Noch nicht aktualisiert."}
    </p>
  );
}
