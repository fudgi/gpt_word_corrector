import { sendBg } from "./helpers.js";
import { getSelectionInfo, applyCorrectedText } from "./textInsertion.js";
import { showLoadingIndicator, showNotification } from "./ui.js";
import {
  modeText,
  successMessageOptions,
  fallbackMessageOptions,
} from "./constants.js";

export const directCorrectText = async (text, mode) => {
  if (!text?.trim()) return;

  const selectionInfo = getSelectionInfo();

  showLoadingIndicator(modeText[mode]);

  try {
    const resp = await sendBg({
      type: "RUN_GPT",
      mode,
      text,
      style: "formal",
    });

    if (!resp?.ok) {
      console.error("Correction failed:", resp?.error);
      showNotification(
        `❌ Correction failed: ${resp?.error || "Unknown error"}`,
        "error"
      );
      return;
    }

    const correctedText = resp.output || "";
    if (!correctedText) {
      showNotification("❌ No correction result received", "error");
      return;
    }

    // Apply the correction
    const success = applyCorrectedText(selectionInfo, correctedText);

    if (success) {
      const successMessage = successMessageOptions[mode];
      showNotification(successMessage, "success");
    } else {
      const fallbackMessage = fallbackMessageOptions[mode];
      showNotification(fallbackMessage, "info");
    }
  } catch (e) {
    console.error("Direct correction error:", e);
    showNotification(`❌ Connection error: ${e.message}`, "error");
  }
};
