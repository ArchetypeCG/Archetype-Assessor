import { checkInternet } from "./internet-check.mjs";
import { parentPort, workerData } from "node:worker_threads";
import { extractEvidenceText, compareText } from "./integrity-text.mjs";
try {
  const extracted = await extractEvidenceText(
    workerData.description,
    workerData.files,
  );
  const internet = await checkInternet(extracted.text, workerData.internet);
  parentPort.postMessage({
    text: extracted.text,
    report: {
      ...compareText(extracted.text, workerData.corpus),
      internet,
      unsupportedFiles: extracted.unsupported,
      truncated: extracted.truncated,
      checkedAt: new Date().toISOString(),
    },
  });
} catch {
  parentPort.postMessage({ error: true });
}
