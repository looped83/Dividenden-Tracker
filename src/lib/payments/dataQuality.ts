import { MoneyDecimal, type DecimalInstance } from "@/lib/money";

/**
 * Reine, wiederverwendbare Datenqualitätslogik für Dividendeneingänge
 * (Phase 6 §15–§18). Bewusst ohne Seiteneffekte und ohne automatische
 * Aktionen: Dubletten werden nur *erkannt*, niemals automatisch storniert,
 * gelöscht oder zusammengeführt. Eine mögliche Dublette ist nicht automatisch
 * eine echte Dublette (§15).
 */

/** Auf die für die Prüfungen nötigen Felder reduzierter Zahlungsdatensatz. */
export interface PaymentLike {
  id: string;
  security_id: string;
  depot_id: string;
  pay_date: string;
  net_amount: string;
  original_currency: string;
  source: string;
  import_id: string | null;
  payment_type: string;
  archived_at: string | null;
  created_at: string;
}

export type DuplicateCategory = "high" | "possible";

export interface DuplicatePair<T extends PaymentLike = PaymentLike> {
  a: T;
  b: T;
  category: DuplicateCategory;
  /** Stabiler, reihenfolgeunabhängiger Schlüssel des Paares (für Dismissals). */
  key: string;
}

/** Stabiler, lexikografisch sortierter Paarschlüssel (identisch zum Repository). */
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

function amountsEqual(a: string, b: string): boolean {
  return new MoneyDecimal(a).equals(new MoneyDecimal(b));
}

/**
 * Findet mögliche Dubletten paarweise. Gruppiert nach identischem Nutzer
 * (implizit — alle Zeilen gehören dem angemeldeten Nutzer, RLS), identischem
 * Unternehmen, identischem Depot und identischem tatsächlichen Zahlungsdatum.
 * Innerhalb einer Gruppe:
 *
 * - **hohe Wahrscheinlichkeit** (`high`): zusätzlich identischer Betrag (und,
 *   sofern vorhanden, identische Währung) — der Datensatz ist mehrfach
 *   vorhanden.
 * - **mögliche Dublette** (`possible`): abweichender Betrag — legitime
 *   Mehrfachzahlungen (Tranchen) sind ausdrücklich möglich (§15, D-007), daher
 *   nie als sichere Dublette.
 *
 * Stornierte Zahlungen werden nicht berücksichtigt: das Stornieren einer von
 * zwei identischen Zahlungen löst die Warnung auf (Szenario 9). Bereits als
 * „keine Dublette" markierte Paare (`dismissedKeys`) entfallen ebenfalls.
 */
export function findDuplicatePairs<T extends PaymentLike>(
  payments: readonly T[],
  dismissedKeys: ReadonlySet<string> = new Set(),
): DuplicatePair<T>[] {
  const buckets = new Map<string, T[]>();
  for (const payment of payments) {
    if (payment.archived_at) continue;
    const bucketKey = `${payment.security_id}${payment.depot_id}${payment.pay_date}`;
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(payment);
    else buckets.set(bucketKey, [payment]);
  }

  const pairs: DuplicatePair<T>[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        const key = pairKey(a.id, b.id);
        if (dismissedKeys.has(key)) continue;
        const sameAmount = amountsEqual(a.net_amount, b.net_amount);
        const sameCurrency = a.original_currency === b.original_currency;
        const category: DuplicateCategory =
          sameAmount && sameCurrency ? "high" : "possible";
        pairs.push({ a, b, category, key });
      }
    }
  }

  // Hohe Wahrscheinlichkeit zuerst, dann stabil nach Datum absteigend.
  pairs.sort((x, y) => {
    if (x.category !== y.category) return x.category === "high" ? -1 : 1;
    if (x.a.pay_date !== y.a.pay_date) return x.a.pay_date < y.a.pay_date ? 1 : -1;
    return x.key < y.key ? -1 : x.key > y.key ? 1 : 0;
  });
  return pairs;
}

export type AnomalyCode =
  | "zero_amount"
  | "negative_amount"
  | "future_date"
  | "missing_security"
  | "missing_depot"
  | "import_without_reference"
  | "unusually_high";

export interface Anomaly<T extends PaymentLike = PaymentLike> {
  payment: T;
  code: AnomalyCode;
  message: string;
  /** Stabiler Schlüssel aus Eingang und Art (für „geprüft"-Markierungen). */
  key: string;
}

/** Schlüssel einer Auffälligkeit — identisch in Erkennung und Repository. */
export function anomalyKey(paymentId: string, code: string): string {
  return `${paymentId}:${code}`;
}

/**
 * Schwellenwert für „ungewöhnlich hoher Betrag" (§18): das Vielfache des
 * Medians der **benachbarten** aktiven Zahlungen desselben Assets — bis zu
 * drei davor und drei danach. Relativ statt absolut, damit keine starre
 * Finanzbewertung entsteht; nur eine sachliche Auffälligkeit.
 *
 * Nachbarn statt der ganzen Historie: Gemessen wurde zuvor am Median **aller**
 * Zahlungen. Wer eine Position per Sparplan aufbaut, zahlt heute ein
 * Vielfaches von vor zwei Jahren — jede neue Zahlung galt damit als auffällig
 * (im echten Bestand 29 Hinweise, fast alle solche). Mit den Nachbarn fällt
 * nur noch auf, was aus seiner Umgebung herausragt: ein Tippfehler, eine
 * Sonderausschüttung. Ein dauerhafter Sprung (Aufstockung) verschwindet von
 * selbst, sobald die folgenden Zahlungen ihn bestätigen.
 */
const UNUSUALLY_HIGH_FACTOR = 5;
const NEIGHBOURS_EACH_SIDE = 3;
const MIN_COMPARISON_COUNT = 3;

function median(values: DecimalInstance[]): DecimalInstance {
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return sorted[mid - 1].plus(sorted[mid]).dividedBy(2);
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Vergleichsbeträge je Eingang: die benachbarten aktiven Zahlungen desselben
 * Assets in zeitlicher Folge (bei gleichem Datum nach ID, damit das Ergebnis
 * nicht von der Reihenfolge der Eingabe abhängt).
 */
function neighbourAmounts(
  payments: readonly PaymentLike[],
): Map<string, DecimalInstance[]> {
  const bySecurity = new Map<
    string,
    { id: string; date: string; amount: DecimalInstance }[]
  >();
  for (const payment of payments) {
    if (payment.archived_at) continue;
    const entry = {
      id: payment.id,
      date: payment.pay_date,
      amount: new MoneyDecimal(payment.net_amount),
    };
    const list = bySecurity.get(payment.security_id);
    if (list) list.push(entry);
    else bySecurity.set(payment.security_id, [entry]);
  }

  const result = new Map<string, DecimalInstance[]>();
  for (const list of bySecurity.values()) {
    list.sort((a, b) => compareKeys(a.date, b.date) || compareKeys(a.id, b.id));
    list.forEach((entry, index) => {
      result.set(
        entry.id,
        [
          ...list.slice(Math.max(0, index - NEIGHBOURS_EACH_SIDE), index),
          ...list.slice(index + 1, index + 1 + NEIGHBOURS_EACH_SIDE),
        ].map((neighbour) => neighbour.amount),
      );
    });
  }
  return result;
}

/**
 * Regelbasierte Hinweise auf potenzielle Datenfehler (§18). Keine automatische
 * Korrektur oder Löschung; ausschließlich sachliche Auffälligkeiten.
 * `today` erlaubt deterministische Tests.
 */
export function detectAnomalies<T extends PaymentLike>(
  payments: readonly T[],
  today: string,
): Anomaly<T>[] {
  const anomalies: Anomaly<T>[] = [];
  const add = (payment: T, code: AnomalyCode, message: string) => {
    anomalies.push({ payment, code, message, key: anomalyKey(payment.id, code) });
  };
  const neighbours = neighbourAmounts(payments);

  for (const payment of payments) {
    if (payment.archived_at) continue;
    const amount = new MoneyDecimal(payment.net_amount);

    if (amount.isZero()) {
      add(payment, "zero_amount", "Der Nettobetrag ist 0. Bitte prüfen.");
    } else if (amount.isNegative()) {
      add(payment, "negative_amount", "Der Nettobetrag ist negativ. Bitte prüfen.");
    }

    if (payment.pay_date > today) {
      add(
        payment,
        "future_date",
        "Das Zahlungsdatum liegt in der Zukunft. Bitte prüfen.",
      );
    }

    if (!payment.security_id) {
      add(payment, "missing_security", "Der Dividende ist kein Asset zugeordnet.");
    }
    if (!payment.depot_id) {
      add(payment, "missing_depot", "Der Dividende ist kein Depot zugeordnet.");
    }

    if (
      (payment.source === "csv_import" || payment.source === "excel_import") &&
      !payment.import_id
    ) {
      add(
        payment,
        "import_without_reference",
        "Importierte Dividende ohne Importreferenz.",
      );
    }

    // Ungewöhnlich hoher Betrag: relativ zu den benachbarten Zahlungen des
    // Assets, nur bei ausreichend Vergleichsdaten. Eine als Sonderdividende
    // erfasste Zahlung ist ihrer Art nach eine Ausnahme und kein Befund.
    if (amount.greaterThan(0) && payment.payment_type !== "special") {
      const others = neighbours.get(payment.id) ?? [];
      if (others.length >= MIN_COMPARISON_COUNT) {
        const med = median(others);
        if (med.greaterThan(0) && amount.greaterThan(med.times(UNUSUALLY_HIGH_FACTOR))) {
          add(
            payment,
            "unusually_high",
            "Der Betrag liegt deutlich über den benachbarten Dividenden dieses Assets. Bitte prüfen.",
          );
        }
      }
    }
  }

  return anomalies;
}
