# Security Policy

Thank you for helping keep the **AI Coding Stack — OmniRoute + NVIDIA + OpenCode** project secure.

## Supported Versions

This project evolves quickly. Security fixes are applied to the latest version of the repository.

| Version               | Supported |
| --------------------- | --------- |
| Latest `main` branch  | ✅ Yes     |
| Older commits / forks | ❌ No      |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues, Discussions, or Pull Requests.**

If you discover a security vulnerability, please report it privately whenever possible through GitHub's security reporting features:

**Security → Advisories → Report a vulnerability**

When reporting an issue, please include as much of the following information as possible:

* A clear description of the vulnerability
* Steps to reproduce the issue
* The affected file, script, configuration, or component
* The potential security impact
* Any suggested mitigation or fix
* Relevant logs or screenshots, with API keys, tokens, passwords, and personal information removed

## Security-Sensitive Areas

Please pay special attention to vulnerabilities involving:

* API keys, tokens, or credentials
* `.env` files and environment variables
* OmniRoute configuration
* OpenCode provider configuration
* NVIDIA API integrations
* Authentication or authorization
* Command execution or shell injection
* Installation and setup scripts
* Dependency vulnerabilities
* Accidental secret exposure
* Unsafe default configurations
* Network services or exposed local ports

## Secrets and Credentials

**Never include real API keys, access tokens, passwords, private keys, or other credentials in a vulnerability report, Issue, Pull Request, screenshot, or log.**

Use placeholders such as:

```text
NVIDIA_API_KEY=<REDACTED>
OPENAI_API_KEY=<REDACTED>
GITHUB_TOKEN=<REDACTED>
```

If you believe a real credential has already been exposed, revoke or rotate it immediately before submitting the report.

## Responsible Disclosure

We ask security researchers to:

* Avoid accessing or modifying data that does not belong to them
* Avoid disrupting services or systems
* Avoid publishing vulnerability details before a fix is available
* Give the project maintainers reasonable time to investigate and remediate the issue

We will make a reasonable effort to acknowledge valid reports and investigate confirmed security issues as quickly as possible.

## Scope

Security reports related directly to this repository, its scripts, configuration examples, installation process, and documented integrations are welcome.

Security vulnerabilities in third-party projects or services such as **OpenCode, NVIDIA, GitHub, OmniRoute providers, model providers, operating systems, or external dependencies** should normally also be reported to the maintainers of those projects.

## Disclaimer

This is a community project and is provided under the terms of its license.

Users are responsible for protecting their own credentials, reviewing configuration before use, and following the security requirements and terms of service of any third-party providers they connect to the stack.

Thank you for helping make the project safer. 🔐
