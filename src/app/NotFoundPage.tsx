import { FileQuestion } from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Seite nicht gefunden"
      description="Diese Adresse existiert nicht."
      action={
        <Button asChild>
          <NavLink to="/">Zur Übersicht</NavLink>
        </Button>
      }
    />
  );
}
