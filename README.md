# After Effects MCP Server

Model Context Protocol (MCP) server for Adobe After Effects. It lets AI clients and other MCP-compatible tools control After Effects through a file-based bridge panel.

## What You Can Do

- Create and inspect compositions and layers.
- Create text, shape, solid, and adjustment layers.
- Set layer properties, keyframes, and expressions.
- Apply effects by display name or matchName.
- Inspect effect/property trees and edit effect properties.
- Control effect keyframe graphs (easy ease, interpolation, temporal/spatial options, tangents, roving).
- Apply `.ffx` presets.
- Search and list presets on disk.
- Remove individual effects or all effects from a layer.
- Center layers in a composition.
- Get clip start/end frame information for layers.
- Add composition or layer markers.
- Set audio levels per channel, with optional keyframes.
- Inspect layer audio metadata and marker state.
- Analyze WAV waveforms and bulk-add markers from detected peaks.
- List all installed effects available in the current After Effects installation.

## Requirements

- Adobe After Effects
- Node.js 18+
- npm

In After Effects, enable:

- Edit -> Preferences -> Scripting & Expressions -> Allow Scripts to Write Files and Access Network

## Installation

1. Clone and install dependencies:

```bash
git clone https://github.com/TheLlamainator/after-effects-mcp.git
cd after-effects-mcp
npm install
```

2. Build the server and bridge:

```bash
npm run build
```

3. Install the bridge script to After Effects script folders:

```bash
npm run install-bridge
```

4. Restart After Effects.

5. Open the bridge panel:

- Window -> mcp-bridge-auto.jsx
- Keep the panel open while running MCP commands.

## MCP Client Configuration

Example config:

```json
{
  "mcpServers": {
    "AfterEffectsMCP": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/build/index.js"]
    }
  }
}
```

Use an absolute path for `build/index.js` on your machine.

## Core Workflow

1. Start your MCP client (which starts this server).
2. Open the AE bridge panel.
3. Call tools.
4. If a tool reports queued execution, call `get-results` after 1-3 seconds.

Note: some operations complete just after timeout windows; `get-results` often contains the final result even when the first call timed out.

## Tool Catalog

General:

- `run-script`
- `get-results`
- `get-help`

Compositions/Layers:

- `create-composition`
- `create-adjustment-layer`
- `center-layers`
- `get-layer-clip-frames`

Effects and presets:

- `apply-effect`
- `add-any-effect`
- `mcp_aftereffects_applyEffect`
- `apply-effect-template`
- `list-layer-effects`
- `list-available-effects`
- `set-effect-property`
- `set-effect-keyframe`
- `remove-effect`
- `apply-preset`
- `list-presets`
- `search-presets`

Markers and audio:

- `add-marker`
- `add-markers-bulk`
- `set-audio-levels`
- `get-audio-info`
- `analyze-audio-waveform`

Testing/helpers:

- `test-animation`
- `run-bridge-test`
- `mcp_aftereffects_get_effects_help`

## Audio-to-Marker Workflow

1. Call `get-audio-info` for the target layer.
2. Copy `sourceFilePath` from the result.
3. Call `analyze-audio-waveform` with `filePath` and optional `numPoints`.
4. Build `markers[]` from returned `peakTimes`.
5. Call `add-markers-bulk`.

## Project Layout

- `src/index.ts` - MCP server and tool definitions
- `src/scripts/mcp-bridge-auto.jsx` - AE bridge panel script
- `install-bridge.js` - bridge installer

## Development

Build:

```bash
npm run build
```

Install bridge:

```bash
npm run install-bridge
```

Start server directly:

```bash
node build/index.js
```

## Troubleshooting

Server fails to start:

- Rebuild with `npm run build`.
- Check MCP client logs for duplicate tool registration errors.

Queued commands do not complete:

- Ensure AE bridge panel is open.
- Ensure scripting/network access is enabled in AE preferences.
- Call `get-results` after a short delay.

Results appear stale:

- Reopen bridge panel.
- Retry command and then call `get-results`.

Bridge install reports Program Files failure:

- This is expected without elevated permissions.
- User AppData script paths are typically enough for normal usage.

## License

MIT. See `LICENSE`.
