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

### Project authorization

- Save approved projects in the Electron user-data directory at `config/projects.json`. Use a versioned JSON document, canonical real paths, atomic replacement, a `0700` parent directory, and a `0600` file.
- A folder selected by the native directory picker receives a random authorization token that expires after ten minutes. The renderer can approve only this token, not submit an arbitrary filesystem path.
- Treat the user home directory, a filesystem root, and a mounted-volume root as high risk. The renderer must show a second confirmation before saving one of these locations.
- Restart Core automatically when approved roots change only if Core was already running. Removing the final project returns Core to the application-private empty workspace.
- Keep the DevSpace CLI configuration separate from Desktop. Desktop writes a private Core configuration under its own user-data directory, preserving allowed roots as a JSON array so valid paths containing commas remain supported.
- The current Core does not expose temporary per-request directory authorization. Do not show a non-functional “allow once” action in the first release; reconsider it when Core provides a supported permission event API.

### Tailscale Funnel

- Keep Tailscale behind the generic `TunnelProvider` interface. The renderer never executes Tailscale commands and does not depend on CLI output shapes.
- Run every command with `execFile` and a separate argument array. Start with `tailscale funnel --bg --yes <port>`, then read status again before reporting success.
- Stop only the Funnel configuration for the Core port with `tailscale funnel --bg --yes <port> off`. Never call `tailscale funnel reset`, because reset can remove unrelated Funnel settings owned by the user.
- Prefer JSON status output, but keep a conservative text parser for older supported clients. Reject ambiguous output instead of guessing a public address.
- Display Tailscale Funnel's Beta status persistently in the connection panel and explain that enabling it makes the MCP endpoint publicly reachable.
- Search the common Homebrew and Windows installation paths before falling back to `PATH`, because apps started from Finder often receive a limited shell path.
- Local read-only verification used Tailscale 1.98.5. The CLI was present while its background service was not running; the app correctly reported that exact state. Starting a real public Funnel was intentionally not attempted without a logged-in test Tailnet. Provider tests use injected command results for all start, stop, URL, login, offline, timeout, and malformed-output cases.
