# openocr (TypeScript/JavaScript)

TypeScript/JavaScript SDK for the [OpenOCR API](https://open-ocr.com).

## Installation

```bash
npm install openocr
# or
yarn add openocr
```

## Quick Start

```typescript
import { OpenOCR } from "openocr";

const client = new OpenOCR({ apiKey: "sk-ocr-your-api-key" });

// From a URL
const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/document.pdf",
});
console.log(result.extractedText);
```

## Large PDFs (async)

PDFs with >20 pages are processed asynchronously. The client waits by default:

```typescript
// wait: true (default) — resolves when done
const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/annual-report.pdf",
});
console.log(result.extractedText);

// wait: false — returns job_id immediately
const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/annual-report.pdf",
  wait: false,
});
console.log(result.jobId); // poll manually
```
