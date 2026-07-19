import { supabase } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { CommitPayload } from "@/lib/import/buildCommitPayload";

export type Import = Database["public"]["Tables"]["imports"]["Row"];
export type ImportInsert = Database["public"]["Tables"]["imports"]["Insert"];

export interface SecurityAlias {
  aliasNormalized: string;
  securityId: string;
}

export async function fetchSecurityAliases(): Promise<SecurityAlias[]> {
  const { data, error } = await supabase
    .from("security_aliases")
    .select("alias_normalized, security_id");
  if (error) throw error;
  return data.map((row) => ({
    aliasNormalized: row.alias_normalized,
    securityId: row.security_id,
  }));
}

export async function fetchImports(): Promise<Import[]> {
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Stufe-1-Duplikatpruefung: findet einen frueheren, abgeschlossenen Import derselben Datei. */
export async function findCommittedImportByHash(
  fileHash: string,
): Promise<Import | null> {
  const { data, error } = await supabase
    .from("imports")
    .select("*")
    .eq("file_hash", fileHash)
    .eq("status", "committed")
    .order("committed_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

export async function createImport(input: ImportInsert): Promise<Import> {
  const { data, error } = await supabase.from("imports").insert(input).select().single();
  if (error) throw error;
  return data;
}

/** Ruft die serverseitige, transaktionale commit_import-RPC auf (IMPORT_SPEC.md §22). */
export async function commitImport(
  importId: string,
  payload: CommitPayload,
): Promise<Import> {
  const { data, error } = await supabase.rpc("commit_import", {
    p_import_id: importId,
    p_payload: payload as unknown as Json,
  });
  if (error) throw error;
  return data;
}

/** Ruft die serverseitige, transaktionale rollback_import-RPC auf (IMPORT_SPEC.md §10). */
export async function rollbackImport(importId: string): Promise<Import> {
  const { data, error } = await supabase.rpc("rollback_import", {
    p_import_id: importId,
  });
  if (error) throw error;
  return data;
}

/** Loescht einen noch nicht committeten Import-Entwurf (nur analyzing/pending_confirmation). */
export async function discardImport(importId: string): Promise<void> {
  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) throw error;
}
