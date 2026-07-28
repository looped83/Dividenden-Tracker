/**
 * Backup Page
 *
 * Main container for backup, restore, and export functionality.
 * Provides tabbed interface with three sections:
 * 1. Backup Creation & Download
 * 2. Restore from Backup
 * 3. Export Data
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BackupSection from "./BackupSection";
import RestoreSection from "./RestoreSection";
import ExportSection from "./ExportSection";

type TabValue = "backup" | "restore" | "export";

export function BackupPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("backup");

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">Sicherung & Datenexport</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Erstellen Sie Sicherungen Ihrer Daten, stellen Sie frühere Versionen wieder her
          oder exportieren Sie Ihre Dividendendaten.
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as TabValue);
        }}
        className="w-full"
      >
        <TabsList className="mb-8 grid h-auto w-full grid-cols-3">
          <TabsTrigger
            value="backup"
            className="min-h-11 hyphens-auto whitespace-normal break-words px-2 text-center leading-tight"
          >
            <span className="hidden sm:inline">Sicherung erstellen</span>
            <span className="sm:hidden">Sicherung</span>
          </TabsTrigger>
          <TabsTrigger
            value="restore"
            className="min-h-11 hyphens-auto whitespace-normal break-words px-2 text-center leading-tight"
          >
            <span className="hidden sm:inline">Sicherung wiederherstellen</span>
            <span className="sm:hidden">Wiederherstellen</span>
          </TabsTrigger>
          <TabsTrigger
            value="export"
            className="min-h-11 hyphens-auto whitespace-normal break-words px-2 text-center leading-tight"
          >
            <span className="hidden sm:inline">Daten exportieren</span>
            <span className="sm:hidden">Exportieren</span>
          </TabsTrigger>
        </TabsList>

        {/* Backup Tab */}
        <TabsContent value="backup" className="space-y-4">
          <BackupSection />
        </TabsContent>

        {/* Restore Tab */}
        <TabsContent value="restore" className="space-y-4">
          <RestoreSection />
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
          <ExportSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
