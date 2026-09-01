# DevSpace Desktop

DevSpace Desktop turns the existing DevSpace local MCP server into a desktop application for non-technical users. It manages project access, the local service, a Tailscale Funnel connection, and the ChatGPT setup flow.

The first release targets macOS and Windows and includes Simplified Chinese and English from the beginning.

## Development

Use Node.js 22.19 or newer for release work.

```bash
npm install
npm run dev
npm test
npm run build
npm run pack
```

`npm run pack` creates an unpacked application for the current operating system. `npm run dist` creates the configured macOS DMG/ZIP or Windows NSIS installer. macOS release builds require a Developer ID certificate and notarization credentials; Windows release builds require a code-signing certificate. The application includes Electron and DevSpace Core, so end users do not install Node.js.

See the Chinese [product design document](./DevSpace_Desktop_%E4%BA%A7%E5%93%81%E8%AE%BE%E8%AE%A1%E6%96%87%E6%A1%A3.md) for the planned scope and [development decisions](./docs/DEVELOPMENT_DECISIONS.md) for implementation choices.
