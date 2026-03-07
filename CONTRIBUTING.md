# Contributing to openocr-client

Thank you for your interest in contributing!

## Development Setup

### Python SDK

```bash
cd python
pip install -e ".[dev]"
pytest
```

### TypeScript SDK

```bash
cd typescript
npm install
npm test
```

## Pull Requests

1. Fork the repo and create a feature branch.
2. Add tests for any new functionality.
3. Run the full test suite before opening a PR.
4. Open a PR against `main` with a clear description.

## Code Style

- **Python**: `ruff` for linting, `black` for formatting.
- **TypeScript**: `eslint` + `prettier`.

Both are enforced in CI.

## Reporting Issues

Open a GitHub issue with:
- SDK version
- Language / runtime version
- Minimal reproduction case
- Expected vs actual behaviour
