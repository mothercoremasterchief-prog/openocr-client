# openocr-client

Official Python and TypeScript SDKs for the [OpenOCR API](https://open-ocr.com).

## Packages

| Language | Package | Install |
|---|---|---|
| Python | `openocr` | `pip install openocr` |
| TypeScript / JS | `openocr` | `npm install openocr` |

## Quick Start

### Python

```python
from openocr import OpenOCR

client = OpenOCR(api_key="sk-ocr-your-api-key")

result = client.ocr(
    engine="openocr/tesseract",
    file="document.pdf",
)
print(result.extracted_text)
```

### TypeScript

```typescript
import { OpenOCR } from "openocr";

const client = new OpenOCR({ apiKey: "sk-ocr-your-api-key" });

const result = await client.ocr({
  engine: "openocr/tesseract",
  file: "document.pdf",
});
console.log(result.extractedText);
```

## Documentation

- [API Reference](https://open-ocr.com/docs/endpoints)
- [PDF Smart Routing](https://open-ocr.com/docs/pdf-routing)
- [Authentication](https://open-ocr.com/docs/authentication)
- [Error Codes](https://open-ocr.com/docs/errors)

## Repository Structure

```
openocr-client/
├── python/          # Python SDK (PyPI: openocr)
│   ├── openocr/
│   ├── tests/
│   ├── pyproject.toml
│   └── README.md
├── typescript/      # TypeScript/JS SDK (npm: openocr)
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── README.md
├── .github/
│   └── workflows/   # CI: lint, test, publish
└── CONTRIBUTING.md
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).
