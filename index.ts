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
 * Replaces slashes with hyphens and removes invalid characters.
 */
function sanitizePathForFilename(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "root"; // Use 'root' for the base path
  }
  // Remove leading/trailing slashes, replace internal slashes with '-', remove invalid chars
  const cleanedPath = pathname
    .replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
    .replace(/\//g, "-") // Replace internal slashes with hyphens
    .replace(/[^a-zA-Z0-9_\-]/g, "_"); // Replace non-alphanumeric (excluding _,-) with underscore
  // Prevent overly long filenames (optional, adjust length as needed)
  const maxLength = 100;
  return cleanedPath.length > maxLength
    ? cleanedPath.substring(0, maxLength)
    : cleanedPath;
}

/**
 * Takes screenshots or PDFs of multiple websites based on provided options.
 * Saves files into domain-specific subdirectories with meaningful names.
 * @param urls - Array of URLs to process.
 * @param options - Configuration options for screenshots.
 * @returns A promise resolving to a summary object with success/failure counts and detailed results.
 */
async function takeScreenshots(
  urls: string[],
  options: ScreenshotOptions = {}
): Promise<ScreenshotSummary> {
  // --- Default configuration merge remains the same ---
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
    outputDir: "./screenshots",
    fileFormat: "png",
    quality: 80,
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    delay: 1000,
    scrollPage: options.scrollPage !== undefined ? options.scrollPage : true,
    scrollDelay: options.scrollDelay ?? 300,
    timeout: 60000,
    waitUntil: "networkidle0",
    authUrls: options.authUrls ?? {},
    cookies: options.cookies ?? {},
    headless: options.headless ?? "new",
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    fullPage: options.fullPage !== undefined ? options.fullPage : true,
  };

  // --- Validation and initial outputDir creation remain the same ---
  if (!["png", "jpeg", "pdf"].includes(config.fileFormat)) {
    throw new Error(
      `Invalid fileFormat: "${config.fileFormat}". Must be 'png', 'jpeg', or 'pdf'.`
    );
  }
  try {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
      console.log(`Ensured base output directory exists: ${config.outputDir}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to create base output directory "${config.outputDir}": ${errorMessage}`
    );
    throw error;
  }

  console.log(`Starting screenshot process for ${urls.length} URLs...`);
  console.log(`Configuration:`, {
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
    // --- Browser launch remains the same ---
    const launchOptions: LaunchOptions = {
      headless: config.headless === "new" ? true : config.headless,
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

    // --- Auto-scroll function remains the same ---
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
            const scrollPositionNotChanging =
              currentScroll === window.pageYOffset;
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
        await page.setUserAgent(config.userAgent || DEFAULT_USER_AGENT);

        let urlObj: URL;
        let hostname: string;
        let pathname: string;
        try {
          urlObj = new URL(url);
          hostname = urlObj.hostname;
          pathname = urlObj.pathname; // Extract the path
        } catch (urlError) {
          throw new Error(`Invalid URL format: ${url}`);
        }
        const safeHostname = hostname.replace(/[^a-z0-9_\-\.]/gi, "_");

        // --- Authentication and Cookies remain the same ---
        const auth = config.authUrls?.[hostname];
        if (auth) {
          await page.authenticate(auth);
        }
        const pageCookies = config.cookies?.[hostname];
        if (pageCookies && pageCookies.length > 0) {
          await page.setCookie(...pageCookies);
        }

        // --- Navigation remains the same ---
        console.log(`${progress} Navigating...`);
        await page.goto(url, {
          waitUntil: config.waitUntil,
          timeout: config.timeout,
        });
        console.log(`${progress} Navigation complete.`);

        // --- Initial Delay remains the same ---
        if (config.delay > 0) {
          console.log(
            `${progress} Waiting for initial delay: ${config.delay}ms...`
          );
          await setTimeout(config.delay);
        }

        // --- Scrolling Logic remains the same ---
        if (config.scrollPage) {
          console.log(`${progress} Scrolling page...`);
          await autoScroll(page);
          console.log(`${progress} Scrolling complete. Waiting...`);
          await page.evaluate(() => window.scrollTo(0, 0));
          await setTimeout(500);
        } else {
          console.log(`${progress} Skipping page scroll.`);
        }

        // *** MODIFIED: Directory and Meaningful Filename Generation ***
        const domainOutputDir = path.join(config.outputDir, safeHostname);
        try {
          if (!fs.existsSync(domainOutputDir)) {
            fs.mkdirSync(domainOutputDir, { recursive: true });
            console.log(`${progress} Created subdirectory: ${domainOutputDir}`);
          }
        } catch (mkdirError: unknown) {
          const errorMessage =
            mkdirError instanceof Error
              ? mkdirError.message
              : String(mkdirError);
          console.error(
            `✗ ${progress} Failed to create subdirectory "${domainOutputDir}": ${errorMessage}`
          );
          throw new Error(
            `Failed to create subdirectory "${domainOutputDir}": ${errorMessage}`
          );
        }

        // Generate meaningful filename components
        const sanitizedPathPart = sanitizePathForFilename(pathname);
        const timestampPart = getFormattedTimestamp();

        // Combine components for the final filename (without extension)
        const filenameOnly = `${sanitizedPathPart}_${timestampPart}`;
        const baseFilePath = path.join(domainOutputDir, filenameOnly); // Path within the domain folder

        let outputFilePath: string;

        // --- Screenshot / PDF Generation (using the new meaningful path) ---
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
        // --- Error Handling within loop remains the same ---
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`✗ ${progress} Error processing ${url}: ${errorMessage}`);
        results.push({ url, status: "failed", error: errorMessage });
        errorCount++;
      } finally {
        // --- Page Closing remains the same ---
        if (page) {
          console.log(`${progress} Closing page.`);
          await page.close();
        }
      }
    } // --- End of URL loop ---
  } catch (error: unknown) {
    // --- Outer Error Handling remains the same ---
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`A critical error occurred: ${errorMessage}`);
    errorCount = urls.length - successCount;
    results.push(
      ...urls.slice(successCount + errorCount).map((url) => ({
        url,
        status: "failed" as const,
        error: `Browser-level error: ${errorMessage}`,
      }))
    );
  } finally {
    // --- Browser Closing remains the same ---
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed.");
    }
  }

  // --- Summary and Logging remain the same ---
  const summary: ScreenshotSummary = {
    success: successCount,
    failed: errorCount,
    results,
  };
  const resultsLogFile = path.join(
    config.outputDir,
    `screenshot_log_${getFormattedTimestamp()}.json`
  ); // Use formatted timestamp for log
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

// --- processUrlFile function remains the same ---
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

// --- Example Usage ---
const urlListFile = "./website_list.txt";

// Run the process
processUrlFile(urlListFile, screenshotOptions)
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
