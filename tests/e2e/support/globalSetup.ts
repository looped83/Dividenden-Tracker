import { startBridge, type Bridge } from "./bridge";
import { BRIDGE_PORT } from "./ports";

/**
 * Startet die Testbrücke (`bridge.ts`) vor dem Lauf und beendet sie danach.
 * Playwright hält den Prozess dafür am Leben und ruft die zurückgegebene
 * Abbaufunktion am Ende auf.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  let bridge: Bridge;
  try {
    bridge = await startBridge({ port: BRIDGE_PORT });
  } catch (error) {
    throw new Error(
      "Die Testbrücke konnte nicht starten. Läuft PostgreSQL und ist die " +
        "Testdatenbank aufgebaut (npm run db:test:reset)?",
      { cause: error },
    );
  }

  return async () => {
    await bridge.close();
  };
}
