# Bulk Screenshots

A powerful TypeScript utility for generating bulk screenshots or PDFs of websites using Puppeteer. Perfect for capturing multiple web pages in a consistent format with customizable options.

## Features

- Takes screenshots or PDFs from a list of URLs in a text file
- Organizes output files by domain in separate directories
- Creates meaningful filenames based on URL path and timestamp
- Supports PNG, JPEG, and PDF output formats
- Configurable viewport sizes, delays, and timeouts
- Option to scroll through pages before capturing
- Handles authentication and cookies for protected sites
- Generates detailed logs of successes and failures

## Installation

1. Clone this repository or download the source code
2. Install dependencies:

```bash
# Using npm
npm install

# Using Yarn
yarn install

# Using Bun
bun install
```

## Usage

1. Create a text file with URLs (one URL per line)
2. Configure options in `config.ts` if needed
3. Run the script:

```bash
# Using TypeScript with ts-node
npx ts-node index.ts

# Using Bun
bun run index.ts
```

### URL List Format

Create a file `website_list.txt` with URLs, one per line:

```
https://example.com
https://another-site.org
# Lines starting with # are comments
domain-without-protocol.com  # Will automatically add https://
```

## Configuration

Edit `config.ts` to customize behavior. Available options:

```typescript
const screenshotOptions: ScreenshotOptions = {
  outputDir: "./screenshots_by_domain",
  fileFormat: "png", // "png", "jpeg", or "pdf"
  width: 1920,
  height: 1080,
  delay: 2000, // Delay after page load (ms)
  timeout: 60000, // Navigation timeout (ms)
  waitUntil: "networkidle0",
  fullPage: true,
  scrollPage: true, // Whether to scroll through page before screenshot
  scrollDelay: 400, // Milliseconds between scroll steps
  headless: "new", // Use the new headless mode
  // Add other options as needed
};
```

### All Configuration Options

| Option              | Type                        | Default         | Description                                   |
| ------------------- | --------------------------- | --------------- | --------------------------------------------- |
| `outputDir`         | string                      | "./screenshots" | Directory to save screenshots                 |
| `fileFormat`        | "png" \| "jpeg" \| "pdf"    | "png"           | Output file format                            |
| `quality`           | number                      | 80              | Image quality for JPEG format (1-100)         |
| `width`             | number                      | 1920            | Viewport width in pixels                      |
| `height`            | number                      | 1080            | Viewport height in pixels                     |
| `deviceScaleFactor` | number                      | 1               | Device scale factor (for high-DPI rendering)  |
| `delay`             | number                      | 1000            | Wait time after page load (ms)                |
| `scrollPage`        | boolean                     | true            | Whether to scroll through page before capture |
| `scrollDelay`       | number                      | 300             | Delay between scroll steps (ms)               |
| `timeout`           | number                      | 60000           | Navigation timeout (ms)                       |
| `waitUntil`         | string                      | "networkidle0"  | Page load event to wait for                   |
| `fullPage`          | boolean                     | true            | Capture full page or just viewport            |
| `headless`          | boolean \| "new" \| "shell" | "new"           | Headless browser mode                         |
| `userAgent`         | string                      | Chrome UA       | Browser user agent string                     |
| `authUrls`          | object                      | {}              | Domain-specific authentication credentials    |
| `cookies`           | object                      | {}              | Domain-specific cookies                       |

## Output Structure

Screenshots are organized by domain:

```
screenshots_by_domain/
├── example.com/
│   ├── page-path_2023-01-31_15-30-45.png
│   └── another-page_2023-01-31_15-31-22.png
├── another-site.org/
│   └── root_2023-01-31_15-32-10.png
└── screenshot_log_2023-01-31_15-33-00.json
```

The log file contains details of all successful and failed screenshots.

## Advanced Usage

### Authentication

For sites requiring authentication:

```typescript
// In config.ts
const screenshotOptions: ScreenshotOptions = {
  // ...other options...
  authUrls: {
    "secure-site.com": { username: "user", password: "pass" },
  },
};
```

### Cookies

To set cookies for specific domains:

```typescript
// In config.ts
const screenshotOptions: ScreenshotOptions = {
  // ...other options...
  cookies: {
    "cookie-site.com": [
      { name: "sessionId", value: "abc123", domain: "cookie-site.com" },
    ],
  },
};
```

## License

MIT
