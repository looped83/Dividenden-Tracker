import * as React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buildEntityMap } from "@/features/dashboard/format";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import { useGoals, useYearEndForecast } from "@/features/goals/hooks";
import { useFixedCosts } from "@/features/progress/hooks";
import { computeGoalCourse, yearGoals } from "@/lib/goals";
import { coverFixedCosts, yearMilestones } from "@/lib/progress";
import { annualReview, reviewYears, type ReviewFacets } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { entityName } from "../format";
import { buildReviewSlides, type ReviewExtras } from "./reviewSlides";
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
 * Abfragen wie Uebersicht, Ziele und Fortschritt — kein eigener Abruf.
 */
export function AnnualReviewPage() {
  const { jahr } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { payments, paymentsQuery, securitiesQuery } = useEffectivePayments();
  const goalsQuery = useGoals();
  const fixedCostsQuery = useFixedCosts();

  const year = Number.parseInt(jahr ?? "", 10);
  const ref = useToday();
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

  const { rest } = useYearEndForecast(payments, ref);
  const goals = goalsQuery.data;
  const fixedCosts = fixedCostsQuery.data;
  const extras = React.useMemo((): ReviewExtras | null => {
    if (!review) return null;
    const ofYear = yearGoals(goals ?? [], payments, year, ref);
    // Fixkosten gibt es nur im heutigen Stand: Auf ein Jahr weiter zurück
    // angewandt, erzählte die Karte etwas, das damals nicht galt.
    const costs = year >= ref.year - 1 ? (fixedCosts ?? []) : [];
    return {
      goals: ofYear,
      course: ofYear?.annual ? computeGoalCourse(ofYear.annual, rest, ref) : null,
      milestones: yearMilestones(payments, year, ref),
      coverage: costs.length > 0 ? coverFixedCosts(costs, review.perMonth) : null,
    };
  }, [review, goals, fixedCosts, payments, year, ref, rest]);

  const slides = React.useMemo(() => {
    if (!review || !extras) return [];
    return buildReviewSlides(review, (id) => entityName(securities, id), extras);
  }, [review, extras, securities]);

  const close = React.useCallback(() => {
    // Zurueck dorthin, woher der Rueckblick kam (Statistik oder Startseite);
    // ohne Vorgeschichte (direkt geoeffnet) in die Statistik des Jahres.
    if (location.key === "default") void navigate(`/statistiken?year=${String(year)}`);
    else void navigate(-1);
  }, [navigate, location.key, year]);

  // Ziele und Fixkosten mit abwarten: Karten, die nachträglich erscheinen,
  // verschöben die laufende Story.
  if (
    paymentsQuery.isLoading ||
    securitiesQuery.isLoading ||
    goalsQuery.isLoading ||
    fixedCostsQuery.isLoading
  ) {
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
