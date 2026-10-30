import * as React from "react";
import { ExternalLink, Newspaper, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FilterBar,
  FilterField,
  FilterReset,
  FilterToggle,
  useFilterDisclosure,
} from "@/components/ui/filter-bar";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { LoadMore } from "@/components/ui/load-more";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSecurities } from "@/features/securities/hooks";
import { lastSyncLabel } from "@/lib/calendar/format";
import {
  DEFAULT_NEWS_FILTERS,
  buildNewsFeed,
  countActiveNewsFilters,
  type NewsEntry,
  type NewsFilters,
  type NewsPeriod,
  type NewsTopic,
} from "@/lib/news/feed";
import { isoFromRef } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { compareGerman } from "@/lib/utils/compareText";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useAutoNewsSync, useNewsItems, useNewsSyncStatus } from "./hooks";

const SYNC_FAILED_HINT =
  "Die News konnten gerade nicht aktualisiert werden. Die zuletzt gespeicherten Meldungen werden weiterhin angezeigt.";

/** Tage je Schritt — eine Woche, so viel wie der voreingestellte Zeitraum. */
const DAYS_PER_PAGE = 7;

const TIME = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function NewsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">News werden geladen …</span>
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Eine Meldung: Titel bis zwei Zeilen, darunter Assets, Quelle und Uhrzeit.
 * Die ganze Zeile ist der Link zur Quelle (neuer Tab). Keine Bilder: Sie
 * kosteten Datenvolumen, und die CSP erlaubt nur eigene (SECURITY_MODEL.md §7).
 *
 * Anders als die Datenlisten zwei Zeilen Titel: Eine Schlagzeile, die nach 30
 * Zeichen ausläuft, sagt nichts.
 */
function NewsRow({
  entry,
  names,
}: {
  entry: NewsEntry;
  names: ReadonlyMap<string, string>;
}) {
  const assets = entry.securityIds
    .map((id) => names.get(id))
    .filter((name) => name !== undefined);
  const time = TIME.format(new Date(entry.publishedAt));
  return (
    <ListRow asChild className="items-start">
      <a href={entry.url} target="_blank" rel="noopener noreferrer">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium">{entry.title}</span>
          {entry.snippet && (
            <span className="mt-0.5 hidden text-sm text-muted-foreground sm:line-clamp-1">
              {entry.snippet}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {assets.map((name) => (
              <Badge key={name} variant="primary">
                {name}
              </Badge>
            ))}
            {entry.dividend && <Badge variant="neutral">Dividende</Badge>}
            <span>{[entry.source, `${time} Uhr`].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
        <ExternalLink
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="sr-only"> (öffnet in neuem Tab)</span>
      </a>
    </ListRow>
  );
}

/**
 * News zu den Assets im Bestand (seit 2.59.0). Die Meldungen holt die Edge
 * Function `sync-news` aus Marketaux und GDELT; die Seite liest nur die
 * gespeicherten. Beim Öffnen wird höchstens alle 12 Stunden neu abgerufen.
 */
export function NewsPage() {
  const itemsQuery = useNewsItems();
  const statusQuery = useNewsSyncStatus();
  const securitiesQuery = useSecurities();
  const sync = useAutoNewsSync();
  const today = isoFromRef(useToday());
  const [filters, setFilters] = React.useState<NewsFilters>(DEFAULT_NEWS_FILTERS);
  const [pages, setPages] = React.useState(1);
  const activeCount = countActiveNewsFilters(filters);
  const disclosure = useFilterDisclosure(activeCount);

  const rows = itemsQuery.data;
  const names = React.useMemo(
    () =>
      new Map(
        (securitiesQuery.data ?? []).map((security) => [security.id, security.name]),
      ),
    [securitiesQuery.data],
  );
  // Nur Assets mit Meldungen: Ein Filter, der leer ausgeht, hilft niemandem.
  const assetOptions = React.useMemo(() => {
    const ids = new Set((rows ?? []).map((row) => row.security_id));
    return [...ids]
      .map((id) => ({ id, name: names.get(id) }))
      .filter(
        (option): option is { id: string; name: string } => option.name !== undefined,
      )
      .sort((a, b) => compareGerman(a.name, b.name));
  }, [rows, names]);
  const days = React.useMemo(
    // `today` als Abhängigkeit: Nach Mitternacht heißt „Heute“ wieder „Gestern“.
    () => buildNewsFeed(rows ?? [], filters, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, today],
  );

  const update = (patch: Partial<NewsFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPages(1);
  };

  const lastSuccessAt = statusQuery.data?.last_success_at ?? null;
  const syncError =
    sync.isError || (statusQuery.data?.error_message && !sync.isSyncing)
      ? (statusQuery.data?.error_message ?? SYNC_FAILED_HINT)
      : null;
  const shownDays = days.slice(0, pages * DAYS_PER_PAGE);
  const hasRows = (rows?.length ?? 0) > 0;
  const isInitialLoading =
    itemsQuery.isLoading || securitiesQuery.isLoading || (sync.isSyncing && !hasRows);

  return (
    <div className="space-y-6">
      <PageHeader
        title="News"
        actions={hasRows ? <FilterToggle disclosure={disclosure} /> : undefined}
      />

      {hasRows && (
        <FilterBar disclosure={disclosure}>
          <FilterField id="news-asset" label="Asset">
            <Select
              id="news-asset"
              value={filters.securityId}
              onChange={(event) => {
                update({ securityId: event.target.value });
              }}
            >
              <option value="">Alle Assets</option>
              {assetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField id="news-period" label="Zeitraum" half>
            <Select
              id="news-period"
              value={filters.period}
              onChange={(event) => {
                update({ period: event.target.value as NewsPeriod });
              }}
            >
              <option value="7">7 Tage</option>
              <option value="30">30 Tage</option>
            </Select>
          </FilterField>
          <FilterField id="news-topic" label="Thema" half>
            <Select
              id="news-topic"
              value={filters.topic}
              onChange={(event) => {
                update({ topic: event.target.value as NewsTopic });
              }}
            >
              <option value="all">Alle Themen</option>
              <option value="dividend">Dividende</option>
            </Select>
          </FilterField>
          {activeCount > 0 && (
            <FilterReset
              onClick={() => {
                update(DEFAULT_NEWS_FILTERS);
              }}
            />
          )}
        </FilterBar>
      )}

      {syncError && hasRows && (
        <Alert variant="destructive">
          <AlertDescription>{syncError}</AlertDescription>
        </Alert>
      )}

      {isInitialLoading ? (
        <NewsSkeleton />
      ) : itemsQuery.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Die News konnten nicht geladen werden"
          description={getErrorMessage(
            itemsQuery.error,
            "Beim Laden ist ein Fehler aufgetreten.",
          )}
          action={
            <Button onClick={() => void itemsQuery.refetch()}>Erneut versuchen</Button>
          }
        />
      ) : days.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={hasRows ? "Keine Meldungen zu diesen Filtern" : "Noch keine Meldungen"}
          description={
            hasRows
              ? "Ein längerer Zeitraum oder ein anderes Asset zeigt vielleicht mehr."
              : (syncError ??
                "Hier erscheinen Meldungen zu den Assets in deinem Bestand, sobald es welche gibt.")
          }
        />
      ) : (
        <div className="space-y-10">
          {shownDays.map((day) => (
            <ListSection key={day.key} title={day.label}>
              <ListGroup>
                {day.entries.map((entry) => (
                  <li key={entry.id}>
                    <NewsRow entry={entry} names={names} />
                  </li>
                ))}
              </ListGroup>
            </ListSection>
          ))}
          {shownDays.length < days.length && (
            <LoadMore
              shown={shownDays.length}
              onLoad={() => {
                setPages((value) => value + 1);
              }}
            >
              Ältere Meldungen anzeigen
            </LoadMore>
          )}
        </div>
      )}

      {/* Quellenangabe: Sie erklärt, woher die Meldungen kommen. Dazu der Stand wie beim Kalender. */}
      <p className="text-sm text-muted-foreground">
        Quellen: Marketaux und GDELT
        {lastSuccessAt && <> · Aktualisiert {lastSyncLabel(lastSuccessAt, today)}</>}
      </p>
    </div>
  );
}
