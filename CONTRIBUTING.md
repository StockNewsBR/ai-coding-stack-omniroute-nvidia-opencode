# Contributing

Thanks for helping improve the **AI Coding Stack — OmniRoute + NVIDIA + OpenCode** guide.

This repository is intentionally practical: changes should make the documented stack easier to install, understand, reproduce, debug, or maintain.

## Before you start

Please read:

- [README.md](README.md) for the full architecture and validated setup.
- [QUICKSTART.md](QUICKSTART.md) for the shortest installation path.
- [SECURITY.md](SECURITY.md) before reporting anything involving credentials, command execution, exposed services, or vulnerabilities.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.

For normal bugs and documentation errors, use the GitHub Issue templates. For security vulnerabilities, **do not open a public Issue**.

## Good contributions

Useful contributions include:

- Fixing commands, paths, configuration examples, or broken documentation.
- Updating provider/model information when upstream behavior changes.
- Adding reproducible troubleshooting steps for real failures.
- Improving Windows/WSL/Linux instructions.
- Improving privacy, secret-handling, or safety guidance.
- Adding evidence-backed compatibility notes for OpenCode, OmniRoute, NVIDIA NIM, Graphify, Ponytail, Serena, Oh My OpenAgent, or related tools already in scope.
- Correcting translations while preserving the technical meaning of the English source.

## Contribution workflow

1. Fork or clone the repository.
2. Create a focused branch from the latest `main`.
3. Make the smallest change that fully solves the problem.
4. Test every command or configuration you changed whenever practical.
5. Remove secrets, private URLs, tokens, personal data, and machine-specific information from examples, logs, and screenshots.
6. Update related documentation when behavior changes.
7. Open a Pull Request and complete the PR template.

Example branch names:

```text
fix/cloudflare-account-id-docs
fix/opencode-session-isolation
feat/provider-validation-note
docs/update-omniroute-version
```

## Keep changes reproducible

For fixes or compatibility updates, include as much of the following as relevant:

- Operating system / WSL distribution.
- OpenCode version.
- OmniRoute version.
- Node.js version.
- Provider and model route.
- Exact command or configuration involved.
- Expected behavior.
- Actual behavior.
- Sanitized logs or screenshots.
- The verification you performed after the change.

A model appearing in a provider catalog is not enough evidence that inference works. When documenting a route as working, prefer a successful end-to-end completion request.

## Documentation style

- Prefer tested facts over marketing language.
- Clearly label historical screenshots or time-sensitive provider information.
- Separate **configured**, **discovered**, and **successfully tested** states.
- Avoid claiming that a provider or route is permanently free when pricing or quotas can change.
- Keep commands copy-pasteable.
- Explain destructive commands before asking users to run them.
- Prefer placeholders such as `<YOUR_API_KEY>` instead of realistic-looking secrets.

## Languages

The primary technical source is [README.md](README.md). Translations currently include:

- [README.pt-BR.md](README.pt-BR.md)
- [README.es.md](README.es.md)
- [README.ru.md](README.ru.md)

If a technical fact changes, update the English source first. Translation updates can be included in the same PR when you are confident they preserve the same meaning.

## Pull Request scope

Please keep Pull Requests focused. Avoid unrelated formatting churn, broad rewrites, generated noise, or changes that make review harder without improving the guide.

For large ideas, open an Issue first so scope can be agreed before a large amount of work is done.

## Secrets and privacy

Never commit real credentials or sensitive data, including:

```text
NVIDIA_API_KEY
OPENAI_API_KEY
GITHUB_TOKEN
provider access tokens
private keys
passwords
session cookies
private repository URLs
personal or customer data
```

If a credential is accidentally committed, revoke or rotate it immediately and follow [SECURITY.md](SECURITY.md).

## Licensing

By contributing, you agree that your contribution may be distributed under the repository's [MIT License](LICENSE).

Thank you for making the stack more reliable for the next developer. 🚀
