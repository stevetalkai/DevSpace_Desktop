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
- Use npm with a committed lockfile. Use Electron Vite for separate main, preload, and renderer builds, and electron-builder for macOS and Windows packages.
- Pin DevSpace Core to `@waishnav/devspace` version `1.0.8`. Launch its documented `dist/cli.js serve` entry with Electron's bundled Node.js runtime so end users do not install Node.js.

### Localization

- Ship Simplified Chinese and English in the first working version.
- Use stable semantic message keys and keep the two locale files structurally identical.
- Choose the initial language from the operating system and allow users to switch it in the interface.

### Product defaults

- Use a quiet, native-desktop visual direction focused on connection confidence and project safety.
- Treat the owner authorization as complete only after the local service reports an authenticated MCP request. A network request without authorization is shown as waiting for authorization.
- Avoid granting the user home directory or a disk root as an ordinary project. These selections require an explicit warning.
- Before the user approves a project, start Core with an application-private empty directory as its only allowed root. This prevents the default Core behavior from granting access to the current working directory.
- Bind Core explicitly to `127.0.0.1` and use port `7676` initially. Stage 5 will add controlled fallback when that port is occupied.
- Consider Core ready when its local TCP port accepts a connection within 15 seconds. MCP requests are not used as health checks, so a health probe cannot be mistaken for ChatGPT activity.

### Resolved Core integration question

- The standalone repository does not contain the existing DevSpace Core source. The desktop app therefore pins the published package and launches its CLI through a dedicated service adapter. The adapter passes `HOST`, `PORT`, `DEVSPACE_ALLOWED_ROOTS`, and an owner token directly as child-process environment values. The package can later be replaced by a workspace package without changing renderer code.

### Known dependency constraint

- The development machine currently uses Node.js 20.19.4, while package metadata for Electron 44 and DevSpace 1.0.8 asks for Node.js 22.19 or newer. Builds and tests currently pass, and the shipped app runs Core with Electron's embedded runtime. Development documentation should move to Node.js 22.19 before release.
- A production-only `npm audit` reports five inherited findings from DevSpace's `@earendil-works/pi-coding-agent` dependency. The remaining affected `undici` version has no compatible fix in the current DevSpace release. Do not silently override this deep dependency; retest and upgrade when DevSpace publishes a compatible version.
