import React from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("React Error Boundary caught:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
          <h1 className="text-2xl font-bold text-negative">Fehler in der Anwendung</h1>
          <p className="text-muted-foreground max-w-md text-center">
            Die Anwendung ist auf einen unerwarteten Fehler gestoßen.
          </p>
          <details className="max-w-md p-4 rounded border border-border bg-muted text-sm">
            <summary className="font-mono cursor-pointer">Fehlerdetail anzeigen</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
              {this.state.error?.toString()}
            </pre>
          </details>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              // Mit Basis-Pfad: Auf GitHub Pages liegt die App unter
              // `/Dividenden-Tracker/`, ein fester Pfad "/" fuehrte ins Leere.
              window.location.assign(import.meta.env.BASE_URL);
            }}
          >
            Seite neu laden
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface AreaProps {
  children: React.ReactNode;
  /** Wechselt er (neuer Pfad), wird ein angezeigter Fehler verworfen. */
  resetKey: string;
}

/**
 * Fehlergrenze um den Inhalt eines Bereichs. Ein Darstellungsfehler kostet so
 * nur diesen Bereich: Navigation und Huelle bleiben stehen, und ein Wechsel in
 * einen anderen Bereich zeigt wieder Inhalt. Die {@link ErrorBoundary} um die
 * ganze App bleibt fuer Fehler ausserhalb des Inhalts.
 *
 * Zurueckgesetzt wird ueber `resetKey` statt ueber einen `key`: Ein `key`
 * baute bei jedem Pfadwechsel alle Bereiche neu auf, auch ohne Fehler.
 */
export class AreaErrorBoundary extends React.Component<AreaProps, State> {
  constructor(props: AreaProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("React Error Boundary caught:", error, errorInfo);
  }

  override componentDidUpdate(previous: AreaProps) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <EmptyState
        icon={CircleAlert}
        title="Dieser Bereich konnte nicht angezeigt werden"
        description="Ein unerwarteter Fehler ist aufgetreten. Deine Daten sind davon nicht betroffen."
        action={
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            Neu laden
          </Button>
        }
      />
    );
  }
}
