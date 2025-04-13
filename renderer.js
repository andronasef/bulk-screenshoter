const { ipcRenderer } = require("electron");

// DOM Elements
const urlTextarea = document.getElementById("urlTextarea");
const tabManual = document.getElementById("tabManual");
const tabFile = document.getElementById("tabFile");
const urlManualInput = document.getElementById("urlManualInput");
const urlFileInputContainer = document.getElementById("urlFileInput");
const urlFileInput = document.getElementById("urlFile");
const outputDirInput = document.getElementById("outputDir");
const selectUrlFileBtn = document.getElementById("selectUrlFile");
const selectOutputDirBtn = document.getElementById("selectOutputDirBtn");
const fileFormatSelect = document.getElementById("fileFormat");
const qualityInput = document.getElementById("quality");
const qualityGroup = document.getElementById("qualityGroup");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const delayInput = document.getElementById("delay");
const timeoutInput = document.getElementById("timeout");
const fullPageCheckbox = document.getElementById("fullPage");
const scrollPageCheckbox = document.getElementById("scrollPage");
const startButton = document.getElementById("startButton");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const logOutput = document.getElementById("logOutput");

// Tab switching logic
tabManual.addEventListener("click", () => {
  tabManual.classList.add("active");
  tabFile.classList.remove("active");
  urlManualInput.classList.add("active");
  urlFileInputContainer.classList.remove("active");
});

tabFile.addEventListener("click", () => {
  tabFile.classList.add("active");
  tabManual.classList.remove("active");
  urlFileInputContainer.classList.add("active");
  urlManualInput.classList.remove("active");
});

// Initialize quality input visibility
function updateQualityVisibility() {
  qualityGroup.style.visibility =
    fileFormatSelect.value === "jpeg" ? "visible" : "hidden";
}
updateQualityVisibility();
fileFormatSelect.addEventListener("change", updateQualityVisibility);

// File selection handlers
selectUrlFileBtn.addEventListener("click", async () => {
  const filePath = await ipcRenderer.invoke("select-urls-file");
  if (filePath) {
    urlFileInput.value = filePath;
  }
});

selectOutputDirBtn.addEventListener("click", async () => {
  const dirPath = await ipcRenderer.invoke("select-output-dir");
  if (dirPath) {
    outputDirInput.value = dirPath;
  }
});

// Logging function
function log(message, type = "info") {
  const element = document.createElement("div");
  element.textContent = message;
  element.classList.add(`log-${type}`);
  logOutput.appendChild(element);
  logOutput.scrollTop = logOutput.scrollHeight;
}

// Parse URLs from textarea
function getUrlsFromTextarea() {
  return urlTextarea.value
    .split("\n")
    .map((url) => url.trim())
    .filter(
      (url) => url && (url.startsWith("http://") || url.startsWith("https://"))
    );
}

// Start screenshots process
startButton.addEventListener("click", async () => {
  let urlFilePath = "";
  const isManualMode = urlManualInput.classList.contains("active");

  // Validate inputs based on active tab
  if (isManualMode) {
    const urls = getUrlsFromTextarea();
    if (urls.length === 0) {
      log(
        "Please enter at least one valid URL (must start with http:// or https://).",
        "error"
      );
      return;
    }

    // Save URLs to a temporary file
    try {
      urlFilePath = await ipcRenderer.invoke("save-urls-to-file", urls);
      if (urlFilePath.error) {
        log(`Error saving URLs: ${urlFilePath.error}`, "error");
        return;
      }
      log(`Saved ${urls.length} URLs to temporary file.`, "info");
    } catch (error) {
      log(`Error creating temporary URL file: ${error.message}`, "error");
      return;
    }
  } else {
    // File mode
    if (!urlFileInput.value) {
      log("Please select a URL list file.", "error");
      return;
    }
    urlFilePath = urlFileInput.value;
  }

  // Disable inputs during processing
  startButton.disabled = true;
  startButton.textContent = "Processing...";
  progressBar.style.width = "0%";
  progressText.textContent = "Starting...";

  // Clear previous logs
  logOutput.innerHTML = "";
  log("Starting screenshot process...");

  // Update progress
  progressBar.style.width = "10%";
  progressText.textContent = "Initializing...";

  // Prepare options
  const options = {
    urlFilePath: urlFilePath,
    screenshotOptions: {
      outputDir: outputDirInput.value || "", // We'll use the default path from main.js if empty
      fileFormat: fileFormatSelect.value,
      width: parseInt(widthInput.value, 10),
      height: parseInt(heightInput.value, 10),
      delay: parseInt(delayInput.value, 10),
      timeout: parseInt(timeoutInput.value, 10),
      fullPage: fullPageCheckbox.checked,
      scrollPage: scrollPageCheckbox.checked,
    },
  };

  // Add quality for JPEG only
  if (fileFormatSelect.value === "jpeg") {
    options.screenshotOptions.quality = parseInt(qualityInput.value, 10);
  }

  log("Configuration prepared. Starting process with these options:");
  log(`File format: ${options.screenshotOptions.fileFormat}`);
  log(
    `Viewport: ${options.screenshotOptions.width}x${options.screenshotOptions.height}`
  );
  log(`Full page: ${options.screenshotOptions.fullPage}`);

  try {
    // Update progress
    progressBar.style.width = "30%";
    progressText.textContent = "Processing screenshots...";

    const result = await ipcRenderer.invoke("start-screenshots", options);

    if (result.error) {
      log(`Error: ${result.error}`, "error");
      progressText.textContent = "Process failed!";
      progressBar.style.width = "0%";
    } else {
      progressBar.style.width = "100%";
      progressText.textContent = "Process completed!";

      log(`Screenshot process completed!`, "success");
      log(
        `Output directory: ${
          options.screenshotOptions.outputDir || "(predefined)"
        }`,
        "info"
      );
      log(`Successful: ${result.success}`, "success");
      log(`Failed: ${result.failed}`, "error");

      if (result.results) {
        log("Detailed results:");
        result.results.forEach((item) => {
          if (item.status === "success") {
            log(`✓ ${item.url} -> ${item.file}`, "success");
          } else {
            log(`✗ ${item.url} - ${item.error}`, "error");
          }
        });
      }
    }
  } catch (error) {
    progressText.textContent = "Process failed!";
    progressBar.style.width = "0%";
    log(`Unexpected error: ${error.message}`, "error");
  } finally {
    // Re-enable inputs
    startButton.disabled = false;
    startButton.textContent = "Start Screenshot Process";
  }
});

// Initial log
log("Ready to start capturing screenshots.");
log("You can enter URLs directly or load them from a file.");
