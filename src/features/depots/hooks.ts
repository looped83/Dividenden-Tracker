import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archivePortfolio,
  createPortfolio,
  fetchPortfolios,
  unarchivePortfolio,
  updatePortfolio,
  type PortfolioInsert,
  type PortfolioUpdate,
} from "@/lib/supabase/repositories/portfolios";
import {
  archiveDepot,
  createDepot,
  fetchDepots,
  unarchiveDepot,
  updateDepot,
  type DepotInsert,
  type DepotUpdate,
} from "@/lib/supabase/repositories/depots";

const PORTFOLIOS_KEY = ["portfolios"] as const;
const DEPOTS_KEY = ["depots"] as const;

export function usePortfolios() {
  return useQuery({ queryKey: PORTFOLIOS_KEY, queryFn: fetchPortfolios });
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PortfolioInsert) => createPortfolio(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY }),
  });
}

export function useUpdatePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PortfolioUpdate }) =>
      updatePortfolio(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY }),
  });
}

export function useArchivePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? unarchivePortfolio(id) : archivePortfolio(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY }),
  });
}

export function useDepots() {
  return useQuery({ queryKey: DEPOTS_KEY, queryFn: fetchDepots });
}

export function useCreateDepot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DepotInsert) => createDepot(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DEPOTS_KEY }),
  });
}

export function useUpdateDepot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DepotUpdate }) =>
      updateDepot(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DEPOTS_KEY }),
  });
}

export function useArchiveDepot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? unarchiveDepot(id) : archiveDepot(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DEPOTS_KEY }),
  });
}
