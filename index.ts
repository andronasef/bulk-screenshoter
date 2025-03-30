import fs from "fs";
import path from "path";
import puppeteer, {
  Browser,
  LaunchOptions,
  Page,
  PDFOptions,
  ScreenshotOptions as PuppeteerScreenshotOptions,
} from "puppeteer";
import readline from "readline";
import { setTimeout } from "timers/promises";
import screenshotOptions, { ScreenshotOptions } from "./config"; // Import the configuration options

// --- Interfaces remain the same ---
interface ScreenshotResult {
  url: string;
  status: "success" | "failed";
  file?: string;
  error?: string;
}
interface ScreenshotSummary {
  success: number;
  failed: number;
  results: ScreenshotResult[];
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

// --- readUrlsFromFile function remains the same ---
async function readUrlsFromFile(filePath: string): Promise<string[]> {
  const urls: string[] = [];
  console.log(`Attempting to read URLs from: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`URL list file not found: ${filePath}`);
    }
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        try {
          let urlObj = new URL(trimmedLine);
          let url = urlObj.toString();
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            try {
              urlObj = new URL("https://" + trimmedLine);
              url = urlObj.toString();
              console.warn(
                `URL "${trimmedLine}" missing scheme, prepended https://`
              );
            } catch (schemeError) {
              console.error(
                `Invalid URL format even after adding scheme: ${trimmedLine}`
              );
              continue;
            }
          }
          urls.push(url);
        } catch (urlError) {
          if (
            urlError instanceof TypeError &&
            urlError.message.includes("Invalid URL")
          ) {
            try {
              const urlWithScheme = "https://" + trimmedLine;
              new URL(urlWithScheme);
              console.log(`Assuming https:// for "${trimmedLine}"`);
              urls.push(urlWithScheme);
            } catch (e) {
              console.error(
                `Skipping invalid URL: "${trimmedLine}" - ${
                  (e as Error).message
                }`
              );
            }
          } else {
            console.error(
              `Skipping invalid URL: "${trimmedLine}" - ${
                (urlError as Error).message
              }`
            );
          }
        }
      }
    }
    console.log(`Successfully loaded ${urls.length} URLs from ${filePath}`);
    return urls;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error reading URL file "${filePath}": ${errorMessage}`);
    throw error;
  }
}

/**
 * Helper function to format date as YYYY-MM-DD_HH-MM-SS
 */
function getFormattedTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0"); // Months are 0-indexed
  const day = now.getDate().toString().padStart(2, "0");
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Helper function to sanitize a URL path segment for use in filenames.
 */
function sanitizePathForFilename(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "root";
  }
  const cleanedPath = pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9_\-]/g, "_");
  const maxLength = 100;
  return cleanedPath.length > maxLength
    ? cleanedPath.substring(0, maxLength)
    : cleanedPath;
}

/**
 * Takes screenshots or PDFs of multiple websites based on provided options.
 * Saves files into {baseDir}/{domain}/{run_timestamp}/{path}.ext structure.
 * @param urls - Array of URLs to process.
 * @param options - Configuration options for screenshots.
 * @returns A promise resolving to a summary object with success/failure counts and detailed results.
 */
async function takeScreenshots(
  urls: string[],
  options: ScreenshotOptions = {}
): Promise<ScreenshotSummary> {
  // --- Merge options with defaults ---
  const finalOptions = { ...screenshotOptions, ...options };
  const config: Required<
    Omit<
      ScreenshotOptions,
      "quality" | "authUrls" | "cookies" | "userAgent" | "headless"
    >
  > &
    Pick<
      ScreenshotOptions,
      "quality" | "authUrls" | "cookies" | "userAgent" | "headless"
    > = {
    outputDir: finalOptions.outputDir ?? "./screenshots",
    fileFormat: finalOptions.fileFormat ?? "png",
    quality: finalOptions.quality ?? 80,
    width: finalOptions.width ?? 1920,
    height: finalOptions.height ?? 1080,
    deviceScaleFactor: finalOptions.deviceScaleFactor ?? 1,
    delay: finalOptions.delay ?? 1000,
    scrollPage:
      finalOptions.scrollPage !== undefined ? finalOptions.scrollPage : true,
    scrollDelay: finalOptions.scrollDelay ?? 300,
    timeout: finalOptions.timeout ?? 60000,
    waitUntil: finalOptions.waitUntil ?? "networkidle0",
    authUrls: finalOptions.authUrls ?? {},
    cookies: finalOptions.cookies ?? {},
    headless: finalOptions.headless ?? "new",
    userAgent: finalOptions.userAgent ?? DEFAULT_USER_AGENT,
    fullPage:
      finalOptions.fullPage !== undefined ? finalOptions.fullPage : true,
  };

  // --- Validation ---
  if (!["png", "jpeg", "pdf"].includes(config.fileFormat)) {
    throw new Error(`Invalid fileFormat: "${config.fileFormat}".`);
  }

  // *** Generate Timestamp for the ENTIRE RUN ***
  const runTimestamp = getFormattedTimestamp(); // Single timestamp for the whole execution

  // --- Base directory check (optional, as recursive mkdir handles it) ---
  // It's good practice to ensure the very base exists or log it.
  try {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
      console.log(`Ensured base output directory exists: ${config.outputDir}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to ensure base output directory "${config.outputDir}": ${errorMessage}`
    );
    // Decide if this is fatal. If base can't be created, likely nothing will work.
    throw error;
  }

  console.log(`Starting screenshot process for ${urls.length} URLs...`);
  console.log(`Run Timestamp: ${runTimestamp}`);
  console.log(`Using effective configuration:`, {
    ...config,
    authUrls:
      config.authUrls && Object.keys(config.authUrls).length > 0
        ? Object.keys(config.authUrls)
        : "None",
    cookies:
      config.cookies && Object.keys(config.cookies).length > 0
        ? Object.keys(config.cookies)
        : "None",
  });

  let browser: Browser | null = null;
  const results: ScreenshotResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  try {
    // --- Browser launch ---
    const launchOptions: LaunchOptions = {
      headless:
        config.headless === "new"
          ? "new"
          : (config.headless as boolean | "shell" | undefined),
      defaultViewport: {
        width: config.width,
        height: config.height,
        deviceScaleFactor: config.deviceScaleFactor,
      },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    };
    browser = await puppeteer.launch(launchOptions);
    console.log(`Browser launched successfully (Headless: ${config.headless})`);

    // --- Auto-scroll function ---
    const autoScroll = async (page: Page): Promise<void> => {
      await page.evaluate(async (scrollDelay) => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = window.innerHeight;
          let scrolls = 0;
          const maxScrolls = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            const currentScroll = window.pageYOffset;
            window.scrollBy(0, distance);
            totalHeight += distance;
            scrolls++;
            const atBottom =
              window.pageYOffset + window.innerHeight >= scrollHeight;
            const scrollPositionAfterScroll = window.pageYOffset;
            const scrollPositionNotChanging =
              currentScroll === scrollPositionAfterScroll;
            if (
              (scrollPositionNotChanging && currentScroll > 0) ||
              atBottom ||
              scrolls >= maxScrolls
            ) {
              clearInterval(timer);
              resolve();
            }
          }, scrollDelay);
        });
      }, config.scrollDelay);
    };

    // --- Process each URL loop ---
    for (const [index, url] of urls.entries()) {
      let page: Page | null = null;
      const progress = `[${index + 1}/${urls.length}]`;
      console.log(`${progress} Processing: ${url}`);

      try {
        page = await browser.newPage();
        await page.setViewport({
          width: config.width,
          height: config.height,
          deviceScaleFactor: config.deviceScaleFactor,
        });
        await page.setUserAgent(config.userAgent);

        let urlObj: URL;
        let hostname: string;
        let pathname: string;
        try {
          urlObj = new URL(url);
          hostname = urlObj.hostname;
          pathname = urlObj.pathname;
        } catch (urlError) {
          throw new Error(`Invalid URL format: ${url}`);
        }
        const safeHostname = hostname.replace(/[^a-z0-9_\-\.]/gi, "_");
        const sanitizedPathPart = sanitizePathForFilename(pathname);

        // --- Authentication and Cookies ---
        const auth = config.authUrls?.[hostname];
        if (auth) {
          await page.authenticate(auth);
        }
        const pageCookies = config.cookies?.[hostname];
        if (pageCookies && pageCookies.length > 0) {
          await page.setCookie(...pageCookies);
        }

        // --- Navigation ---
        console.log(`${progress} Navigating...`);
        await page.goto(url, {
          waitUntil: config.waitUntil,
          timeout: config.timeout,
        });
        console.log(`${progress} Navigation complete.`);

        // --- Initial Delay ---
        if (config.delay > 0) {
          console.log(
            `${progress} Waiting for initial delay: ${config.delay}ms...`
          );
          await setTimeout(config.delay);
        }

        // --- Scrolling Logic ---
        if (config.scrollPage) {
          console.log(`${progress} Scrolling page...`);
          await autoScroll(page);
          console.log(`${progress} Scrolling complete. Waiting...`);
          await page.evaluate(() => window.scrollTo(0, 0));
          await setTimeout(500);
        } else {
          console.log(`${progress} Skipping page scroll.`);
        }

        // *** MODIFIED: Directory Structure {domain}/{run_timestamp} ***

        // Define the target directory for this specific file
        // Structure: {baseOutputDir}/{domain}/{runTimestamp}
        const targetDir = path.join(
          config.outputDir,
          safeHostname,
          runTimestamp
        ); // <-- The key change is here

        // Ensure the full nested directory exists for this domain and run
        try {
          // No need to check separately, recursive handles creating intermediate dirs
          fs.mkdirSync(targetDir, { recursive: true });
          // Log creation only if it potentially happened (less verbose)
          // console.log(`${progress} Ensured subdirectory exists: ${targetDir}`);
        } catch (mkdirError: unknown) {
          const errorMessage =
            mkdirError instanceof Error
              ? mkdirError.message
              : String(mkdirError);
          console.error(
            `✗ ${progress} Failed to create subdirectory "${targetDir}": ${errorMessage}`
          );
          // Decide how to handle: skip this URL or fail the run? Skipping for now.
          throw new Error(
            `Failed to create subdirectory "${targetDir}": ${errorMessage}`
          );
        }

        // Define the final filename using the sanitized path part
        const filenameOnly = sanitizedPathPart;

        // Define the full path to the file (within the domain/timestamp directory)
        const baseFilePath = path.join(targetDir, filenameOnly); // <-- Use the calculated targetDir

        let outputFilePath: string;

        // --- Screenshot / PDF Generation ---
        if (config.fileFormat === "pdf") {
          outputFilePath = `${baseFilePath}.pdf`;
          console.log(`${progress} Generating PDF: ${outputFilePath}`);
          const pdfOptions: PDFOptions = {
            path: outputFilePath,
            format: "A4",
            printBackground: true,
            margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
          };
          await page.pdf(pdfOptions);
        } else {
          outputFilePath = `${baseFilePath}.${config.fileFormat}`;
          console.log(
            `${progress} Taking ${config.fileFormat.toUpperCase()} screenshot: ${outputFilePath}`
          );
          const screenshotOptions: PuppeteerScreenshotOptions = {
            path: outputFilePath,
            fullPage: config.fullPage,
            type: config.fileFormat,
            ...(config.fileFormat === "jpeg" && config.quality !== undefined
              ? { quality: config.quality }
              : {}),
            captureBeyondViewport: config.fullPage,
          };
          await page.screenshot(screenshotOptions);
        }

        console.log(`✓ ${progress} Saved: ${outputFilePath}`);
        results.push({ url, status: "success", file: outputFilePath });
        successCount++;
      } catch (error: unknown) {
        // --- Error Handling within loop ---
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`✗ ${progress} Error processing ${url}: ${errorMessage}`);
        results.push({ url, status: "failed", error: errorMessage });
        errorCount++;
      } finally {
        // --- Page Closing ---
        if (page) {
          await page.close();
        }
      }
    } // --- End of URL loop ---
  } catch (error: unknown) {
    // --- Outer Error Handling ---
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`A critical error occurred: ${errorMessage}`);
    errorCount = urls.length - results.length;
    results.push(
      ...urls
        .slice(results.length)
        .map((url) => ({
          url,
          status: "failed" as const,
          error: `Browser-level error: ${errorMessage}`,
        }))
    );
  } finally {
    // --- Browser Closing ---
    if (browser) {
      await browser.close();
      console.log("Browser closed.");
    }
  }

  // --- Summary and Logging ---
  const summary: ScreenshotSummary = {
    success: successCount,
    failed: errorCount,
    results,
  };
  // Log file in the base output directory, named with the run timestamp
  const resultsLogFile = path.join(
    config.outputDir,
    `_log_${runTimestamp}.json`
  );
  try {
    fs.writeFileSync(resultsLogFile, JSON.stringify(summary, null, 2));
    console.log(
      `\nProcess completed. Summary: ${successCount} successful, ${errorCount} failed.`
    );
    console.log(`Results log saved to: ${resultsLogFile}`);
  } catch (logError: unknown) {
    const errorMessage =
      logError instanceof Error ? logError.message : String(logError);
    console.error(
      `Failed to write results log file "${resultsLogFile}": ${errorMessage}`
    );
  }

  return summary;
}

// --- processUrlFile function ---
async function processUrlFile(
  urlFilePath: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotSummary | void> {
  try {
    const urls = await readUrlsFromFile(urlFilePath);
    if (urls.length === 0) {
      console.warn("No valid URLs found. Exiting.");
      return;
    }
    return await takeScreenshots(urls, options);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to process URL file "${urlFilePath}": ${errorMessage}`
    );
  }
}

// --- Main Execution ---
const urlListFile = "./website_list.txt";

processUrlFile(urlListFile)
  .then((summary) => {
    if (summary) {
      console.log("\n--- Final Summary ---");
      console.log(`Success: ${summary.success}`);
      console.log(`Failed: ${summary.failed}`);
    } else {
      console.log("Process finished without generating a summary.");
    }
  })
  .catch((error) => {
    console.error("\n--- Unhandled Error in Main Execution ---");
    console.error(error);
    process.exit(1);
  });
