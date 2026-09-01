# Development Decisions

This document records implementation decisions made during autonomous development.

## 2026-09-02

### Repository and commits

- Use `main` as the initial branch.
- Commit each verified product stage separately.
- Write commit subjects and bodies in English as explicitly requested.

### Desktop architecture

- Use Electron, React, and TypeScript to match the product design and maximize reuse of the TypeScript-based DevSpace Core.
- Keep operating-system access in the Electron main process. The renderer receives a small, typed API through the preload script.
- Split lifecycle management, project authorization, tunnel management, settings, and diagnostics into focused modules rather than a single main-process file.

### Localization

- Ship Simplified Chinese and English in the first working version.
- Use stable semantic message keys and keep the two locale files structurally identical.
- Choose the initial language from the operating system and allow users to switch it in the interface.

### Product defaults

- Use a quiet, native-desktop visual direction focused on connection confidence and project safety.
- Treat the owner authorization as complete only after the local service reports an authenticated MCP request. A network request without authorization is shown as waiting for authorization.
- Avoid granting the user home directory or a disk root as an ordinary project. These selections require an explicit warning.

### Open integration question

- The standalone repository does not contain the existing DevSpace Core source. During implementation, verify the published package entry points and choose between bundling the package or launching its documented executable. Keep this behind a service adapter so the choice can change without affecting the interface.
