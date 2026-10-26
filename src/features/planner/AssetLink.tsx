import { Link } from "react-router";
import { useBackState } from "@/lib/hooks/useBackState";

/**
 * Name eines Assets in den Planer-Tabellen (seit 2.32.0), als Link zur
 * Asset-Seite — wie in Bestand › Assets.
 */
export function AssetLink({ id, name }: { id: string; name: string }) {
  const backState = useBackState();
  return (
    <Link
      to={`/depot/${id}`}
      state={backState}
      className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {name}
    </Link>
  );
}
