/**
 * Bietet eine Datei zum Herunterladen an — eine Stelle fuer Sicherung und
 * Export.
 *
 * `URL.revokeObjectURL` folgt bewusst erst im naechsten Makrotask: Safari auf
 * iOS und iPadOS bricht den Download ab, wenn die Objekt-URL noch im selben
 * Durchlauf wie der Klick freigegeben wird. Der Export tat genau das, waehrend
 * die Sicherung bereits wartete — auf iPhone und iPad, den Geraeten dieser
 * App, kam die Exportdatei deshalb nicht an.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
