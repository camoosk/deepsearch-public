# Contributing

1. Create a focused branch for your change.
2. Keep provider integrations behind the `SearchProvider` interface.
3. Preserve evidence provenance and deterministic behavior where possible.
4. Do not add functionality that bypasses authentication, private access controls, or robots policies.
5. Add tests for new parsing, ranking, canonicalization, and API behavior.
6. Run `npm run lint`, `npm test`, and `npm run build` before opening a pull request.
