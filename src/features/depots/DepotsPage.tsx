import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Landmark, Pencil, Plus, RotateCcw, Archive as ArchiveIcon } from "lucide-react";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useArchiveDepot,
  useArchivePortfolio,
  useCreateDepot,
  useCreatePortfolio,
  useDepots,
  usePortfolios,
  useUpdateDepot,
  useUpdatePortfolio,
} from "@/features/depots/hooks";
import {
  depotFormSchema,
  portfolioFormSchema,
  type DepotFormValues,
  type PortfolioFormValues,
} from "@/features/depots/schemas";
import type { Depot } from "@/lib/supabase/repositories/depots";
import type { Portfolio } from "@/lib/supabase/repositories/portfolios";

function PortfolioFormDialog({
  portfolio,
  open,
  onOpenChange,
}: {
  portfolio: Portfolio | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createPortfolio = useCreatePortfolio();
  const updatePortfolio = useUpdatePortfolio();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioFormValues>({
    resolver: zodResolver(portfolioFormSchema),
    values: { name: portfolio?.name ?? "", note: portfolio?.note ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const input = { name: values.name, note: emptyToNull(values.note) };
    try {
      if (portfolio) {
        await updatePortfolio.mutateAsync({ id: portfolio.id, input });
      } else {
        await createPortfolio.mutateAsync(input);
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {portfolio ? "Portfolio bearbeiten" : "Neues Portfolio"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="portfolio-name">Name</Label>
            <Input id="portfolio-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portfolio-note">Notiz</Label>
            <Textarea id="portfolio-note" {...register("note")} />
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-negative">
              {submitError}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {portfolio ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DepotFormDialog({
  depot,
  portfolios,
  open,
  onOpenChange,
}: {
  depot: Depot | null;
  portfolios: Portfolio[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createDepot = useCreateDepot();
  const updateDepot = useUpdateDepot();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DepotFormValues>({
    resolver: zodResolver(depotFormSchema),
    values: {
      name: depot?.name ?? "",
      portfolioId: depot?.portfolio_id ?? "",
      broker: depot?.broker ?? "",
      baseCurrency: depot?.base_currency ?? "EUR",
      note: depot?.note ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const input = {
      name: values.name,
      portfolio_id: emptyToNull(values.portfolioId),
      broker: emptyToNull(values.broker),
      base_currency: values.baseCurrency,
      note: emptyToNull(values.note),
    };
    try {
      if (depot) {
        // Basiswaehrung ist nach Anlage nur aenderbar ohne vorhandene Zahlungen
        // (guard_base_currency_change-Trigger, DECISIONS.md D-002).
        await updateDepot.mutateAsync({ id: depot.id, input });
      } else {
        await createDepot.mutateAsync(input);
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{depot ? "Depot bearbeiten" : "Neues Depot"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="depot-name">Name</Label>
            <Input id="depot-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depot-portfolio">Portfolio (optional)</Label>
            <Select id="depot-portfolio" {...register("portfolioId")}>
              <option value="">Kein Portfolio</option>
              {portfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="depot-broker">Broker</Label>
              <Input id="depot-broker" {...register("broker")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="depot-currency">Basiswährung</Label>
              <Input id="depot-currency" maxLength={3} {...register("baseCurrency")} />
              {errors.baseCurrency && (
                <p className="text-sm text-negative">{errors.baseCurrency.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depot-note">Notiz</Label>
            <Textarea id="depot-note" {...register("note")} />
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-negative">
              {submitError}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {depot ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DepotsPage() {
  const { data: portfolios = [] } = usePortfolios();
  const { data: depots = [], isLoading } = useDepots();
  const archiveDepot = useArchiveDepot();
  const archivePortfolio = useArchivePortfolio();

  const [showArchived, setShowArchived] = React.useState(false);
  const [depotDialog, setDepotDialog] = React.useState<{
    open: boolean;
    depot: Depot | null;
  }>({
    open: false,
    depot: null,
  });
  const [portfolioDialog, setPortfolioDialog] = React.useState<{
    open: boolean;
    portfolio: Portfolio | null;
  }>({ open: false, portfolio: null });

  const visibleDepots = depots.filter((depot) => showArchived || !depot.archived_at);
  const visiblePortfolios = portfolios.filter((p) => showArchived || !p.archived_at);
  const portfolioNameById = new Map(portfolios.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Depots</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                setShowArchived(event.target.checked);
              }}
              className="size-4"
            />
            Archivierte anzeigen
          </label>
          <Button
            onClick={() => {
              setDepotDialog({ open: true, depot: null });
            }}
          >
            <Plus /> Neues Depot
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Portfolios</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPortfolioDialog({ open: true, portfolio: null });
            }}
          >
            <Plus /> Neues Portfolio
          </Button>
        </div>
        {visiblePortfolios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Portfolios angelegt. Portfolios sind optional und gruppieren
            mehrere Depots.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {visiblePortfolios.map((portfolio) => (
              <li key={portfolio.id}>
                <Badge
                  variant={portfolio.archived_at ? "neutral" : "primary"}
                  className="gap-1.5 py-1 pl-2.5 pr-1.5"
                >
                  {portfolio.name}
                  <button
                    type="button"
                    aria-label={`Portfolio ${portfolio.name} bearbeiten`}
                    onClick={() => {
                      setPortfolioDialog({ open: true, portfolio });
                    }}
                    className="rounded p-0.5 hover:bg-black/10"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      portfolio.archived_at
                        ? `Portfolio ${portfolio.name} reaktivieren`
                        : `Portfolio ${portfolio.name} archivieren`
                    }
                    onClick={() =>
                      void archivePortfolio.mutateAsync({
                        id: portfolio.id,
                        archived: Boolean(portfolio.archived_at),
                      })
                    }
                    className="rounded p-0.5 hover:bg-black/10"
                  >
                    {portfolio.archived_at ? (
                      <RotateCcw className="size-3" />
                    ) : (
                      <ArchiveIcon className="size-3" />
                    )}
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Depots</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : visibleDepots.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Noch kein Depot angelegt"
            description="Lege dein erstes Depot an, um Dividendeneingänge zu erfassen."
            action={
              <Button
                onClick={() => {
                  setDepotDialog({ open: true, depot: null });
                }}
              >
                Erstes Depot anlegen
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Portfolio</TableHead>
                <TableHead>Broker</TableHead>
                <TableHead>Basiswährung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDepots.map((depot) => (
                <TableRow key={depot.id}>
                  <TableCell className="font-medium">{depot.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {depot.portfolio_id
                      ? (portfolioNameById.get(depot.portfolio_id) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {depot.broker ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{depot.base_currency}</TableCell>
                  <TableCell>
                    {depot.archived_at ? (
                      <Badge variant="neutral">Archiviert</Badge>
                    ) : (
                      <Badge variant="positive">Aktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Depot ${depot.name} bearbeiten`}
                        onClick={() => {
                          setDepotDialog({ open: true, depot });
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          depot.archived_at
                            ? `Depot ${depot.name} reaktivieren`
                            : `Depot ${depot.name} archivieren`
                        }
                        onClick={() =>
                          void archiveDepot.mutateAsync({
                            id: depot.id,
                            archived: Boolean(depot.archived_at),
                          })
                        }
                      >
                        {depot.archived_at ? <RotateCcw /> : <ArchiveIcon />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <DepotFormDialog
        depot={depotDialog.depot}
        portfolios={portfolios.filter((p) => !p.archived_at)}
        open={depotDialog.open}
        onOpenChange={(open) => {
          setDepotDialog((current) => ({ ...current, open }));
        }}
      />
      <PortfolioFormDialog
        portfolio={portfolioDialog.portfolio}
        open={portfolioDialog.open}
        onOpenChange={(open) => {
          setPortfolioDialog((current) => ({ ...current, open }));
        }}
      />
    </div>
  );
}
