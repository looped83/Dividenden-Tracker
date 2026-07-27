import React from "react";
import { Button } from "@/components/ui/button";

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
          <h1 className="text-2xl font-bold text-destructive">Fehler in der Anwendung</h1>
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
              window.location.href = "/";
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
