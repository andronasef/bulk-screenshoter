import { CookieParam, Credentials, PuppeteerLifeCycleEvent } from "puppeteer";

interface AuthCredentials extends Credentials {}
export interface ScreenshotOptions {
  outputDir?: string;
  fileFormat?: "png" | "jpeg" | "pdf";
  quality?: number;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  delay?: number;
  scrollPage?: boolean;
  scrollDelay?: number;
  timeout?: number;
  waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[];
  authUrls?: Record<string, AuthCredentials>;
  cookies?: Record<string, CookieParam[]>;
  headless?: boolean | "new" | "shell";
  userAgent?: string;
  fullPage?: boolean;
}

const screenshotOptions: ScreenshotOptions = {
  outputDir: "./screenshots_by_domain", // Example: Changed base dir name
  fileFormat: "png",
  width: 1920,
  height: 1080,
  delay: 2000,
  timeout: 60000,
  waitUntil: "networkidle0",
  fullPage: true,
  scrollPage: true,
  scrollDelay: 400,
  headless: "new",
};

export default screenshotOptions;
