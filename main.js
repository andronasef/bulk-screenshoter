const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Hot reload setup for development
const isDev = process.argv.includes("--dev");
if (isDev) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(__dirname, "node_modules", ".bin", "electron"),
      hardResetMethod: "exit",
      ignored: /node_modules|[\/\\]\.|dist/,
    });
    console.log("Hot reload enabled");
  } catch (err) {
    console.error("Failed to set up hot reload:", err);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, "app-icon.png"),
  });

  mainWindow.loadFile("index.html");

  // Enable developer tools for debugging
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// Handle URL list selection
ipcMain.handle("select-urls-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Text Files", extensions: ["txt"] }],
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});

// Handle output directory selection
ipcMain.handle("select-output-dir", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});

// Handle saving URLs to a temporary file
ipcMain.handle("save-urls-to-file", async (event, urls) => {
  try {
    // Create a temporary file with the URLs
    const tempDir = path.join(app.getPath("temp"), "bulk-screenshots");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `urls_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, urls.join("\n"), "utf8");
    return tempFilePath;
  } catch (error) {
    console.error("Error saving URLs to file:", error);
    return { error: error.message };
  }
});

// Handle screenshot taking process
ipcMain.handle("start-screenshots", async (event, options) => {
  try {
    console.log(
      "Starting screenshot process with options:",
      JSON.stringify(options, null, 2)
    );

    // Get default screenshots directory if not specified
    if (!options.screenshotOptions.outputDir) {
      options.screenshotOptions.outputDir = path.join(
        app.getPath("pictures"),
        "bulk-screenshots"
      );
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(options.screenshotOptions.outputDir)) {
      fs.mkdirSync(options.screenshotOptions.outputDir, { recursive: true });
    }

    console.log(
      "Looking for processUrlFile in:",
      path.resolve("./dist/index.js")
    );

    // Process the URLs
    try {
      const { processUrlFile } = require("./dist/index.js");
      console.log("Successfully imported processUrlFile function");

      if (typeof processUrlFile !== "function") {
        throw new Error(
          `processUrlFile is not a function: ${typeof processUrlFile}`
        );
      }

      return await processUrlFile(
        options.urlFilePath,
        options.screenshotOptions
      );
    } catch (importError) {
      console.error(
        "Error importing or executing processUrlFile:",
        importError
      );
      return { error: `Module error: ${importError.message}` };
    }
  } catch (error) {
    console.error("Error during screenshot process:", error);
    return { error: error.message };
  }
});
