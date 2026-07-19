/**
 * Handgepflegter Platzhalter fuer die von `supabase gen types typescript`
 * generierten Datenbanktypen (ARCHITECTURE.md §3, IMPLEMENTATION_PLAN.md Phase 2).
 *
 * `supabase gen types typescript` startet auch mit `--db-url` intern einen
 * Docker-Container zur Introspektion; Docker steht in der aktuellen
 * Implementierungsumgebung nicht zur Verfuegung (siehe DECISIONS.md D-026/D-027).
 * Diese Datei wurde deshalb von Hand erstellt und Feld fuer Feld gegen das
 * tatsaechlich angewendete Schema (supabase/migrations, geprueft via `\d+`
 * auf einer lokalen PostgreSQL-Instanz) abgeglichen.
 *
 * WICHTIG: Sobald Docker bzw. ein verlinktes Supabase-Projekt verfuegbar ist,
 * MUSS diese Datei durch `npm run gen:types` ersetzt werden. Bis dahin ist
 * bei jeder Schemamigration eine manuelle Nachfuehrung dieser Datei noetig.
 *
 * numeric-Spalten sind als `string` typisiert: PostgREST/supabase-js liefert
 * `numeric` als JSON-Zahl, aber unsere Typebene erzwingt den Umweg ueber
 * lib/money (Decimal), nie ueber JavaScript-`number` (Grundsatz 9, DECISIONS.md
 * D-017). Insert-Typen fuer numeric-Spalten akzeptieren `string`.
 */

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PaymentType =
  "regular" | "special" | "correction" | "cancellation" | "refund" | "other";
export type PaymentSource = "manual" | "csv_import" | "excel_import" | "restore";
export type ImportStatus =
  "analyzing" | "pending_confirmation" | "committed" | "rolled_back" | "discarded";
export type DataQuality = "ok" | "incomplete" | "needs_review";
export type GoalType =
  "net_year" | "gross_year" | "rolling_12m" | "avg_month_net" | "long_term";
export type AuditAction =
  | "insert"
  | "update"
  | "archive"
  | "unarchive"
  | "delete"
  | "import_commit"
  | "import_rollback"
  | "restore";
export type AuditOrigin = "ui" | "import" | "rollback" | "restore" | "migration";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          base_currency: string;
          locale: string;
          theme: "light" | "dark" | "system";
          backup_reminder_days: number;
          last_backup_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // Profile entstehen ausschliesslich per Trigger (0004_profiles.sql)
        Update: Partial<{
          base_currency: string;
          locale: string;
          theme: "light" | "dark" | "system";
          backup_reminder_days: number;
          last_backup_at: string | null;
        }>;
        Relationships: [];
      };
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          note: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          note?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<{
          name: string;
          note: string | null;
          archived_at: string | null;
        }>;
        Relationships: [];
      };
      depots: {
        Row: {
          id: string;
          user_id: string;
          portfolio_id: string | null;
          name: string;
          broker: string | null;
          base_currency: string;
          note: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          portfolio_id?: string | null;
          name: string;
          broker?: string | null;
          base_currency?: string;
          note?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<{
          portfolio_id: string | null;
          name: string;
          broker: string | null;
          base_currency: string;
          note: string | null;
          archived_at: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "depots_portfolio_id_fkey";
            columns: ["portfolio_id"];
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
        ];
      };
      securities: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          ticker: string | null;
          isin: string | null;
          wkn: string | null;
          country: string | null;
          sector: string | null;
          currency: string | null;
          note: string | null;
          data_quality: DataQuality;
          default_depot_id: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          ticker?: string | null;
          isin?: string | null;
          wkn?: string | null;
          country?: string | null;
          sector?: string | null;
          currency?: string | null;
          note?: string | null;
          data_quality?: DataQuality;
          default_depot_id?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<{
          name: string;
          ticker: string | null;
          isin: string | null;
          wkn: string | null;
          country: string | null;
          sector: string | null;
          currency: string | null;
          note: string | null;
          data_quality: DataQuality;
          default_depot_id: string | null;
          archived_at: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "securities_default_depot_id_fkey";
            columns: ["default_depot_id"];
            referencedRelation: "depots";
            referencedColumns: ["id"];
          },
        ];
      };
      imports: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          file_hash: string;
          file_size_bytes: number;
          file_type: "csv" | "xlsx" | "xls";
          sheet_name: string | null;
          status: ImportStatus;
          column_mapping: Json | null;
          detected_formats: Json | null;
          row_balance: Json | null;
          row_report: Json | null;
          checksums: Json | null;
          created_at: string;
          committed_at: string | null;
          rolled_back_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          file_name: string;
          file_hash: string;
          file_size_bytes: number;
          file_type: "csv" | "xlsx" | "xls";
          sheet_name?: string | null;
          status?: ImportStatus;
          column_mapping?: Json | null;
          detected_formats?: Json | null;
          row_balance?: Json | null;
          row_report?: Json | null;
          checksums?: Json | null;
          committed_at?: string | null;
          rolled_back_at?: string | null;
        };
        Update: Partial<{
          sheet_name: string | null;
          status: ImportStatus;
          column_mapping: Json | null;
          detected_formats: Json | null;
          row_balance: Json | null;
          row_report: Json | null;
          checksums: Json | null;
          committed_at: string | null;
          rolled_back_at: string | null;
        }>;
        Relationships: [];
      };
      dividend_payments: {
        Row: {
          id: string;
          user_id: string;
          security_id: string;
          depot_id: string;
          pay_date: string;
          gross_amount: string;
          net_amount: string;
          withholding_tax: string;
          domestic_tax: string;
          solidarity_surcharge: string | null;
          church_tax: string | null;
          fees: string | null;
          original_currency: string;
          original_gross: string | null;
          original_net: string | null;
          fx_rate: string | null;
          quantity: string | null;
          amount_per_share: string | null;
          payment_type: PaymentType;
          source: PaymentSource;
          import_id: string | null;
          source_file_name: string | null;
          source_row_number: number | null;
          row_fingerprint: string | null;
          business_fingerprint: string;
          note: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          archive_reason: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          security_id: string;
          depot_id: string;
          pay_date: string;
          gross_amount: string;
          net_amount: string;
          withholding_tax?: string;
          domestic_tax?: string;
          solidarity_surcharge?: string | null;
          church_tax?: string | null;
          fees?: string | null;
          original_currency: string;
          original_gross?: string | null;
          original_net?: string | null;
          fx_rate?: string | null;
          quantity?: string | null;
          amount_per_share?: string | null;
          payment_type?: PaymentType;
          source: PaymentSource;
          import_id?: string | null;
          source_file_name?: string | null;
          source_row_number?: number | null;
          row_fingerprint?: string | null;
          note?: string | null;
          archived_at?: string | null;
          archive_reason?: string | null;
        };
        // Unveraenderliche Felder (id, user_id, source, import_id,
        // source_row_number, row_fingerprint, created_at) fehlen bewusst im
        // Update-Typ (DATA_MODEL.md §4 protect_payment_immutables).
        Update: Partial<{
          security_id: string;
          depot_id: string;
          pay_date: string;
          gross_amount: string;
          net_amount: string;
          withholding_tax: string;
          domestic_tax: string;
          solidarity_surcharge: string | null;
          church_tax: string | null;
          fees: string | null;
          original_currency: string;
          original_gross: string | null;
          original_net: string | null;
          fx_rate: string | null;
          quantity: string | null;
          amount_per_share: string | null;
          payment_type: PaymentType;
          note: string | null;
          archived_at: string | null;
          archive_reason: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: "dividend_payments_security_id_fkey";
            columns: ["security_id"];
            referencedRelation: "securities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dividend_payments_depot_id_fkey";
            columns: ["depot_id"];
            referencedRelation: "depots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dividend_payments_import_id_fkey";
            columns: ["import_id"];
            referencedRelation: "imports";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          goal_type: GoalType;
          year: number | null;
          target_year: number | null;
          target_amount: string;
          currency: string;
          note: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_type: GoalType;
          year?: number | null;
          target_year?: number | null;
          target_amount: string;
          currency?: string;
          note?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<{
          target_amount: string;
          note: string | null;
          archived_at: string | null;
        }>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          user_id: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          old_values: Json | null;
          new_values: Json | null;
          origin: AuditOrigin;
          created_at: string;
        };
        Insert: never; // insert-only per security-definer-Trigger, nicht ueber die API
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      archive_payment: {
        Args: { p_id: string; p_reason?: string | null };
        Returns: Database["public"]["Tables"]["dividend_payments"]["Row"];
      };
    };
    Enums: {
      payment_type: PaymentType;
      payment_source: PaymentSource;
      import_status: ImportStatus;
      data_quality: DataQuality;
      goal_type: GoalType;
      audit_action: AuditAction;
      audit_origin: AuditOrigin;
    };
  };
}
