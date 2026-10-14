import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/utils/errorMessage";

/** Die gemeinsame Form der Archiv-Mutationen (Portfolio, Depot, Unternehmen). */
interface ArchiveMutation {
  mutateAsync: (variables: { id: string; archived: boolean }) => Promise<unknown>;
}

/**
 * Archivieren bzw. Reaktivieren mit Rueckmeldung. Die Schaltflaechen dafuer
 * haben keinen Bestaetigungsdialog — ohne Hinweis bliebe offen, ob es
 * geklappt hat, und ein Fehler ginge voellig unter (zuvor sogar als
 * unbehandelte Promise-Ablehnung).
 *
 * Bewusst ueber das Promise von `mutateAsync`, nicht ueber Rueckrufe an
 * `mutate`: Eine Liste teilt sich **eine** Mutation fuer alle Zeilen, und
 * Rueckrufe an `mutate` feuern nur fuer den letzten Aufruf. Wer zwei Zeilen
 * kurz nacheinander archivierte, haette fuer die erste weder Bestaetigung
 * noch Fehlermeldung bekommen.
 *
 * `label` nennt den Datensatz in der Meldung, etwa `Depot „Comdirect"`.
 */
export function useArchiveToggle(mutation: ArchiveMutation) {
  const { notify } = useToast();

  return (entity: { id: string; archived_at: string | null }, label: string) => {
    const archived = entity.archived_at !== null;
    const done = archived ? "reaktiviert" : "archiviert";
    mutation.mutateAsync({ id: entity.id, archived }).then(
      () => {
        notify(`${label} ${done}.`);
      },
      (error: unknown) => {
        notify(
          getErrorMessage(error, `${label} konnte nicht ${done} werden.`),
          "negative",
        );
      },
    );
  };
}
