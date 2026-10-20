import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buildEntityMap } from "@/features/dashboard/format";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import {
  annualReview,
  refDateFromDate,
  reviewYears,
  type ReviewFacets,
} from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { entityName } from "../format";
import { buildReviewSlides } from "./reviewSlides";
import { StoryViewer } from "./StoryViewer";

/** Rahmen fuer Laden, Fehler und unbekannte Jahre — im selben Vollbild wie die Story. */
function ReviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/**
 * Jahresrueckblick (`/statistiken/rueckblick/:jahr`). Steht neben der
 * Statistik-Huelle statt in ihr: Die Story fuellt den ganzen Bildschirm,
 * Reiter und Filter gehoeren nicht dazu. Die Daten kommen aus denselben
 * Abfragen wie Uebersicht und Statistik — kein zusaetzlicher Abruf.
 */
export function AnnualReviewPage() {
  const { jahr } = useParams();
  const navigate = useNavigate();
  const { payments, paymentsQuery, securitiesQuery } = useEffectivePayments();

  const year = Number.parseInt(jahr ?? "", 10);
  const ref = React.useMemo(() => refDateFromDate(), []);
  const years = React.useMemo(() => reviewYears(payments, ref), [payments, ref]);

  const securities = React.useMemo(
    () => buildEntityMap(securitiesQuery.data ?? []),
    [securitiesQuery.data],
  );
  const facets = React.useMemo(() => {
    const map = new Map<string, ReviewFacets>();
    for (const security of securitiesQuery.data ?? []) {
      map.set(security.id, { sector: security.sector, country: security.country });
    }
    return map;
  }, [securitiesQuery.data]);

  const review = React.useMemo(() => {
    if (!years.includes(year)) return null;
    return annualReview(payments, year, ref, facets, (id) => entityName(securities, id));
  }, [payments, year, years, ref, facets, securities]);

  const slides = React.useMemo(() => {
    if (!review) return [];
    return buildReviewSlides(
      review,
      (id) => entityName(securities, id),
      years.filter((other) => other !== year),
    );
  }, [review, securities, years, year]);

  const close = React.useCallback(() => {
    void navigate("/statistiken");
  }, [navigate]);

  if (paymentsQuery.isLoading || securitiesQuery.isLoading) {
    return (
      <ReviewFrame>
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <span className="sr-only">Rückblick wird geladen …</span>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-48" />
          <Skeleton className="h-5 w-full" />
        </div>
      </ReviewFrame>
    );
  }

  if (paymentsQuery.isError) {
    return (
      <ReviewFrame>
        <EmptyState
          icon={CalendarRange}
          title="Rückblick konnte nicht geladen werden"
          description={getErrorMessage(
            paymentsQuery.error,
            "Beim Laden der Dividendendaten ist ein Fehler aufgetreten.",
          )}
          action={
            <Button onClick={() => void paymentsQuery.refetch()}>Erneut versuchen</Button>
          }
        />
      </ReviewFrame>
    );
  }

  if (!review) {
    return (
      <ReviewFrame>
        <EmptyState
          icon={CalendarRange}
          title={`Für ${jahr ?? "dieses Jahr"} gibt es keinen Rückblick`}
          description="Rückblicke gibt es für abgeschlossene Jahre mit Dividenden, für das laufende Jahr ab Dezember."
          action={
            <Button asChild variant="outline">
              <Link to="/statistiken">Zur Statistik</Link>
            </Button>
          }
        />
      </ReviewFrame>
    );
  }

  return (
    <StoryViewer
      key={year}
      title={`Rückblick ${String(year)}`}
      slides={slides}
      onClose={close}
    />
  );
}
