import * as React from "react";
import { useSearchParams } from "react-router";
import { CalendarDays, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section, SectionButton } from "@/components/ui/section";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { isoFromRef, refDateFromDate } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { shiftMonth } from "@/lib/calendar/month";
import { buildCalendarSummary } from "@/lib/calendar/summary";
import { EVENT_KIND_TEXT, lastSyncLabel } from "@/lib/calendar/format";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent, CalendarEventType } from "@/lib/calendar/types";
import { useAutoCalendarSync, useCalendarSyncStatus, useSyncCalendar } from "./hooks";
import { useResolvedCalendarEvents } from "./resolvedEvents";
import { useCalendarViewMode, type CalendarViewMode } from "./viewMode";
import { CalendarSummaryTiles } from "./CalendarSummary";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthView } from "./MonthView";
import { AgendaView } from "./AgendaView";
import { EventDetailDialog } from "./EventDetailDialog";

/**
 * Die Liste steht links: Sie ist die Voreinstellung und die Ansicht, mit der
 * die meisten Wege beginnen — das Monatsraster ist der Nebenweg.
 */
const VIEW_OPTIONS: readonly SegmentOption<CalendarViewMode>[] = [
  { value: "agenda", label: "Liste" },
  { value: "month", label: "Monat" },
];

/**
 * Zahltage und Ex-Tage sind zwei Kalender mit derselben Bedienung. Die Wahl
 * steht in der Adresse (`?art=ex`), damit Zurueck und Neuladen sie behalten;
 * ohne Angabe gelten die Zahltage.
 */
const TYPE_OPTIONS: readonly SegmentOption<CalendarEventType>[] = [
  { value: "payment", label: EVENT_KIND_TEXT.payment.heading },
  { value: "ex_date", label: EVENT_KIND_TEXT.ex_date.heading },
];

const SYNC_FAILED_HINT =
  "Der Dividendenkalender konnte gerade nicht aktualisiert werden. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.";

function CalendarSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Kalender wird geladen …</span>
      <Skeleton className="h-11 w-full rounded-md" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-md sm:h-24" />
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
  const today = isoFromRef(useToday());
  const [viewMode, setViewMode] = useCalendarViewMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const type: CalendarEventType =
    searchParams.get("art") === "ex" ? "ex_date" : "payment";
  const setType = (next: CalendarEventType) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "ex_date") params.set("art", "ex");
        else params.delete("art");
        return params;
      },
      { replace: true },
    );
  };
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

  const { eventsQuery, events: allEvents } = useResolvedCalendarEvents();
  const events = React.useMemo(
    () => allEvents.filter((event) => event.eventType === type),
    [allEvents, type],
  );
  const text = EVENT_KIND_TEXT[type];
  const statusQuery = useCalendarSyncStatus();
  const syncMutation = useSyncCalendar();

  const summary = React.useMemo(
    () => buildCalendarSummary(events, today, type),
    [events, today, type],
  );
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

  // Ohne Unterzeile: „Alle angekündigten Zahltage deiner Dividenden auf einen
  // Blick" sagte dasselbe wie der Titel darüber. Was der Bereich zeigt und was
  // er **nicht** zeigt (erhaltene Zahlungen), steht dort, wo die Frage
  // entsteht — im Detaildialog eines Termins.
  //
  // „Kalender" wie in der Navigation. Rechts im Kopf die Wahl des Kalenders
  // (Dividenden oder Ex-Tage) — dort, wo auf der Übersicht die Jahresauswahl
  // steht; sie gilt für die ganze Seite samt Kennzahlen. Die Darstellung
  // (Liste/Monat) betrifft nur die Termine und steht deshalb über ihnen. Das
  // Aktualisieren gehört zur Angabe, wann zuletzt abgeglichen wurde, und steht
  // in deren Zeile am Seitenende.
  const heading = (
    <PageHeader
      title="Kalender"
      actions={
        allEvents.length > 0 && !eventsQuery.isError ? (
          <SegmentedControl
            variant="pill"
            label="Kalender"
            options={TYPE_OPTIONS}
            value={type}
            onChange={setType}
          />
        ) : undefined
      }
    />
  );

  return (
    <div className="space-y-6">
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
      ) : neverSynced && allEvents.length === 0 ? (
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
        <div className="space-y-10">
          {syncErrorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{syncErrorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Die Kennzahlen stehen wie in jedem anderen Bereich direkt unter
              der Kopfzeile — nicht hinter Statuszeile und Hinweis. */}
          {events.length > 0 && (
            <CalendarSummaryTiles summary={summary} type={type} today={today} />
          )}

          {/* Ohne einen einzigen Termin gibt es nichts zu blaettern und nichts
              umzuschalten; die Bedienleiste bliebe eine leere Geste. Links
              steht, welcher Kalender gerade zu sehen ist, rechts die
              Darstellung — dieselbe Kopfzeile wie jeder Abschnitt
              (`Section`). */}
          <Section
            title={text.heading}
            action={
              events.length > 0 ? (
                <SegmentedControl
                  variant="pill"
                  label="Darstellung"
                  options={VIEW_OPTIONS}
                  value={viewMode}
                  onChange={setViewMode}
                />
              ) : undefined
            }
          >
            <div className="space-y-4 pt-2">
              {events.length > 0 && viewMode === "month" && (
                <CalendarToolbar
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
                  title={`Keine bevorstehenden ${text.many} gefunden.`}
                  description={`Neu angekündigte ${text.many} erscheinen automatisch hier.`}
                />
              ) : viewMode === "month" ? (
                <MonthView
                  year={visibleMonth.year}
                  month={visibleMonth.month}
                  events={events}
                  type={type}
                  today={today}
                  onSelect={selectEvent}
                />
              ) : (
                <AgendaViewWithEmptyState
                  events={events}
                  type={type}
                  today={today}
                  onSelect={selectEvent}
                />
              )}
            </div>
          </Section>
        </div>
      )}

      {/* Wann zuletzt abgeglichen wurde, ist eine Fussnote zur Herkunft der
          Daten, keine Auskunft ueber Dividenden: Sie steht deshalb am Ende der
          Seite und nicht ueber den Terminen. */}
      {!isInitialLoading && !eventsQuery.isError && (
        <SyncStatusLine
          lastSuccessAt={lastSuccessAt}
          today={today}
          isSyncing={isSyncing}
          onSync={
            neverSynced && allEvents.length === 0
              ? undefined
              : () => {
                  runSync({ announce: true });
                }
          }
        />
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
  type,
  today,
  onSelect,
}: {
  events: readonly CalendarEvent[];
  type: CalendarEventType;
  today: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const hasUpcoming = events.some((event) => event.date >= today);
  if (!hasUpcoming) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={`Keine bevorstehenden ${EVENT_KIND_TEXT[type].many} gefunden.`}
        description="Frühere Termine findest du in der Monatsansicht."
      />
    );
  }
  return <AgendaView events={events} type={type} today={today} onSelect={onSelect} />;
}

function SyncStatusLine({
  lastSuccessAt,
  today,
  isSyncing,
  onSync,
}: {
  lastSuccessAt: string | null;
  today: string;
  isSyncing: boolean;
  /** Fehlt, solange der leere Zustand selbst zum Abgleich auffordert. */
  onSync?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-[0.8125rem] text-muted-foreground">
      <p aria-live="polite">
        {isSyncing
          ? "Kalender wird aktualisiert …"
          : lastSuccessAt
            ? `Zuletzt aktualisiert: ${lastSyncLabel(lastSuccessAt, today)}`
            : "Noch nicht aktualisiert."}
      </p>
      {onSync && (
        <SectionButton
          icon={RefreshCw}
          onClick={onSync}
          disabled={isSyncing}
          aria-busy={isSyncing}
          className="text-[0.8125rem]"
        >
          {isSyncing ? "Wird aktualisiert …" : "Aktualisieren"}
        </SectionButton>
      )}
    </div>
  );
}
