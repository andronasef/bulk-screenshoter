import * as fs from "fs";
import * as path from "path";
import * as puppeteer from "puppeteer";
import {
  Browser,
  Page,
  ScreenshotOptions as PuppeteerScreenshotOptions,
} from "puppeteer";

interface ScreenshotOptions {
  outputDir: string;
  fileFormat: "png" | "jpeg" | "pdf";
  quality?: number;
  width: number;
  height: number;
  delay: number;
  timeout: number;
  fullPage: boolean;
  scrollPage: boolean;
}

interface ScreenshotResult {
  url: string;
  status: "success" | "failure";
  file?: string;
  error?: string;
}

// Read URLs from a text file
export async function readUrlsFromFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url && url.startsWith("http"));
  } catch (error) {
    console.error(
      `Error reading URL file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

// Take a screenshot of a single URL
export async function takeScreenshot(
  url: string,
  browser: Browser,
  options: ScreenshotOptions
): Promise<ScreenshotResult> {
  const page = await browser.newPage();

  try {
    // Set viewport size
    await page.setViewport({ width: options.width, height: options.height });

    // Navigate to the page with timeout
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: options.timeout,
    });

    // Wait for the specified delay
    if (options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    }

    // Scroll through the page if requested
    if (options.scrollPage) {
      await autoScroll(page);
    }

    // Parse the URL
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname =
      urlObj.pathname === "/"
        ? ""
        : urlObj.pathname.substring(1).replace(/\//g, "-");

    // Create timestamp format (YYYY-MM-DD_HH-MM-SS)
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/T/, "_")
      .replace(/\..+/, "")
      .replace(/:/g, "-");

    // Ensure output directory exists
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    // Create a filename that includes site and path: site_path_timestamp.ext
    const filename = `${hostname}${
      pathname ? "_" + pathname : ""
    }_${timestamp}.${options.fileFormat}`;
    const fullPath = path.join(options.outputDir, filename);

    // Take the screenshot
    if (options.fileFormat === "pdf") {
      await page.pdf({
        path: fullPath,
        format: "A4",
        printBackground: true,
      });
    } else {
      const screenshotOptions: PuppeteerScreenshotOptions = {
        path: fullPath,
        fullPage: options.fullPage,
        type: options.fileFormat,
      };

      if (options.fileFormat === "jpeg" && options.quality) {
        screenshotOptions.quality = options.quality;
      }

      await page.screenshot(screenshotOptions);
    }

    return {
      url,
      status: "success",
      file: fullPath,
    };
  } catch (error) {
    return {
      url,
      status: "failure",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
  }
}

// Helper function to scroll through the page
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

// Process multiple screenshots from URLs in a file
export async function takeScreenshots(
  urls: string[],
  options: ScreenshotOptions
): Promise<{
  results: ScreenshotResult[];
  success: number;
  failed: number;
}> {
  // Launch browser
  const browser = await puppeteer.launch();
  const results: ScreenshotResult[] = [];
  let success = 0;
  let failed = 0;

  try {
    for (const url of urls) {
      console.log(`Processing: ${url}`);
      const result = await takeScreenshot(url, browser, options);

      if (result.status === "success") {
        console.log(`✓ Screenshot saved: ${result.file}`);
        success++;
      } else {
        console.error(`✗ Failed to take screenshot of ${url}: ${result.error}`);
        failed++;
      }

      results.push(result);
    }
  } finally {
    await browser.close();
  }

  return {
    results,
    success,
    failed,
  };
}

// Process a URL file and take screenshots
export async function processUrlFile(
  urlFilePath: string,
  options: ScreenshotOptions
): Promise<{
  results: ScreenshotResult[];
  success: number;
  failed: number;
}> {
  try {
    const urls = await readUrlsFromFile(urlFilePath);
    console.log(`Found ${urls.length} URLs to process`);
    return await takeScreenshots(urls, options);
  } catch (error) {
    console.error(
      `Error processing URL file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
