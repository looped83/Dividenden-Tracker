import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/utils/errorMessage";

/** Die gemeinsame Form der Archiv-Mutationen (Portfolio, Depot, Unternehmen). */
interface ArchiveMutation {
  mutate: (
    variables: { id: string; archived: boolean },
    options?: { onSuccess?: () => void; onError?: (error: unknown) => void },
  ) => void;
}

/**
 * Archivieren bzw. Reaktivieren mit Rueckmeldung. Die Schaltflaechen dafuer
 * haben keinen Bestaetigungsdialog — ohne Hinweis bliebe offen, ob es
 * geklappt hat, und ein Fehler ginge voellig unter (zuvor sogar als
 * unbehandelte Promise-Ablehnung).
 *
 * `label` nennt den Datensatz im Satz: „Depot „Comdirect" archiviert."
 */
export function useArchiveToggle(mutation: ArchiveMutation) {
  const { notify } = useToast();

  return (entity: { id: string; archived_at: string | null }, label: string) => {
    const archived = entity.archived_at !== null;
    const done = archived ? "reaktiviert" : "archiviert";
    mutation.mutate(
      { id: entity.id, archived },
      {
        onSuccess: () => {
          notify(`${label} ${done}.`);
        },
        onError: (error) => {
          notify(
            getErrorMessage(error, `${label} konnte nicht ${done} werden.`),
            "negative",
          );
        },
      },
    );
  };
}
