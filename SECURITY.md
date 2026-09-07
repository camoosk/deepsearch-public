# Security Policy

## Scope

DeepSearch Public is intended to retrieve and analyze information that is already publicly accessible on the web.

The project must not be used to bypass authentication, access private accounts, exploit vulnerabilities, obtain credentials, or circumvent technical access controls.

## Reporting a vulnerability

If you find a security issue in the code, please report it privately to the repository maintainer rather than publishing exploit details in an issue.

## Design principles

- Never commit API keys or secrets.
- Keep provider credentials in environment variables.
- Respect `robots.txt` for page inspection.
- Bound request time and response size.
- Treat external content as untrusted input.
- Keep evidence provenance attached to search results.
