# Security and Privacy Before Publishing

A public AI-tooling repository has an unusually high secret-leak risk because setup files naturally contain provider keys, local paths, screenshots and shell history.

## Never commit

- `.env` or provider-specific env files
- API keys or bearer tokens
- cookies/session IDs
- OAuth refresh tokens
- SSH/private keys
- SQLite runtime databases
- raw OmniRoute/FCC storage
- shell transcripts containing secrets
- private SonarQube tokens

## Prefer indirection

Use environment variables or private files:

```json
{
  "apiKey": "{env:OMNIROUTE_API_KEY}"
}
```

or, when the client supports it, reference a secret file outside the repository.

## Screenshot checklist

Before committing a screenshot, inspect the entire frame for:

- bookmarks;
- browser profile/account icons;
- email addresses;
- usernames;
- `/home/<user>` or `C:\Users\<user>` paths;
- API keys rendered in forms;
- account IDs;
- internal project names you do not want public;
- terminal scrollback above/below the interesting region.

Cropping is preferable to blurring when the sensitive area is not needed. If you must blur, verify the final exported image rather than trusting the editor preview.

## Agent/plugin supply-chain hygiene

Agent skills and plugins execute with broad trust. Before installing an unfamiliar one:

1. read its source;
2. inspect install hooks/scripts;
3. check requested filesystem/network access;
4. pin or record the version used;
5. scan the package if possible.

NVIDIA SkillSpector is one tool designed specifically to scan AI-agent skills before installation:

https://github.com/NVIDIA/skillspector

## SonarQube token rule

The SonarQube MCP project explicitly recommends environment variables and warns against hard-coding tokens in command-line history or committed config:

https://github.com/SonarSource/sonarqube-mcp-server

## Pre-push scan

Run a search for obvious secret patterns and personal paths before every public release. This repository includes [`PUBLISH_CHECKLIST.md`](../PUBLISH_CHECKLIST.md), but no scanner can prove the absence of every credential. Human review is still required.
