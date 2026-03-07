# openocr (Python)

Python SDK for the [OpenOCR API](https://open-ocr.com).

## Installation

```bash
pip install openocr
```

## Quick Start

```python
from openocr import OpenOCR

client = OpenOCR(api_key="sk-ocr-your-api-key")

# From a local file
result = client.ocr(engine="openocr/tesseract", file="document.pdf")
print(result.extracted_text)

# From a URL
result = client.ocr(engine="openocr/tesseract", url="https://example.com/doc.pdf")
print(result.extracted_text)
```

## Large PDFs (async)

PDFs with >20 pages are processed asynchronously. The client waits by default:

```python
# wait=True (default) — blocks until done
result = client.ocr(engine="openocr/tesseract", file="annual-report.pdf")
print(result.extracted_text)

# wait=False — returns job_id immediately
result = client.ocr(engine="openocr/tesseract", file="annual-report.pdf", wait=False)
print(result.job_id)  # poll manually
```

## Context Manager

```python
with OpenOCR(api_key="sk-ocr-your-api-key") as client:
    result = client.ocr(engine="openocr/tesseract", file="scan.png")
```
