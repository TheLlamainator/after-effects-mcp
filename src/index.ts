import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';


const server = new McpServer({
  name: "AfterEffectsServer",
  version: "1.0.0"
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const SCRIPTS_DIR = path.join(__dirname, "scripts");
const TEMP_DIR = path.join(__dirname, "temp");



function getAETempDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, 'Documents', 'ae-mcp-bridge');
  
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}




function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    
    console.error(`Checking for results at: ${tempFilePath}`);
    
    if (fs.existsSync(tempFilePath)) {
      
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);
      
      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);
      
      
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({ 
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge Auto panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }
      
      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}


async function waitForBridgeResult(expectedCommand?: string, timeoutMs: number = 5000, pollMs: number = 250): Promise<string> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastSize = -1;

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0 && content.length !== lastSize) {
          lastSize = content.length;
          try {
            const parsed = JSON.parse(content);
            if (!expectedCommand || parsed._commandExecuted === expectedCommand) {
              return content;
            }
          } catch {
            
          }
        }
      } catch {
        
      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return JSON.stringify({ error: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}.` });
}


function writeCommandFile(command: string, args: Record<string, any> = {}): void {
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    const commandData = {
      command,
      args,
      timestamp: new Date().toISOString(),
      status: "pending"  
    };
    fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
    console.error(`Command "${command}" written to ${commandFile}`);
  } catch (error) {
    console.error("Error writing command file:", error);
  }
}


function clearResultsFile(): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

function uniqueExistingDirs(pathsToCheck: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const p of pathsToCheck) {
    if (!p) {
      continue;
    }
    const normalized = path.normalize(p);
    if (seen.has(normalized)) {
      continue;
    }
    if (fs.existsSync(normalized)) {
      try {
        if (fs.statSync(normalized).isDirectory()) {
          seen.add(normalized);
          result.push(normalized);
        }
      } catch {
        
      }
    }
  }

  return result;
}

function getDefaultPresetRoots(): string[] {
  const home = os.homedir();
  const appData = process.env.APPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";

  const roots = [
    path.join(home, "Documents", "Adobe"),
    path.join(home, "Documents", "Adobe", "After Effects"),
    path.join(home, "Documents", "Adobe", "After Effects User Presets"),
    path.join(appData, "Adobe", "After Effects"),
    path.join(programFiles, "Adobe", "Adobe After Effects 2026", "Support Files", "Presets"),
    path.join(programFiles, "Adobe", "Adobe After Effects 2025", "Support Files", "Presets"),
    path.join(programFiles, "Adobe", "Adobe After Effects 2024", "Support Files", "Presets"),
  ];

  return uniqueExistingDirs(roots);
}

function collectPresetFiles(
  roots: string[],
  recursive: boolean,
  query?: string,
  maxResults: number = 500,
  maxDepth: number = 10,
): Array<{ path: string; name: string; directory: string; size: number; modifiedAt: string }> {
  const results: Array<{ path: string; name: string; directory: string; size: number; modifiedAt: string }> = [];
  const loweredQuery = query ? query.toLowerCase() : "";

  function walk(currentDir: string, depth: number) {
    if (results.length >= maxResults) {
      return;
    }
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) {
        return;
      }

      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (recursive) {
          walk(entryPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.toLowerCase().endsWith(".ffx")) {
        continue;
      }

      if (loweredQuery && !entry.name.toLowerCase().includes(loweredQuery) && !entryPath.toLowerCase().includes(loweredQuery)) {
        continue;
      }

      try {
        const stat = fs.statSync(entryPath);
        results.push({
          path: entryPath,
          name: entry.name,
          directory: currentDir,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        
      }
    }
  }

  for (const root of roots) {
    if (results.length >= maxResults) {
      break;
    }
    walk(root, 0);
  }

  return results;
}


server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    
    clearResultsFile();
    writeCommandFile("listCompositions", {});
    const result = await waitForBridgeResult("listCompositions", 6000, 250);

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: result
      }]
    };
  }
);


server.tool(
  "run-script",
  "Run a read-only script in After Effects",
  {
    script: z.string().describe("Name of the predefined script to run"),
    parameters: z.record(z.any()).optional().describe("Optional parameters for the script")
  },
  async ({ script, parameters = {} }) => {
    
    const allowedScripts = [
      "listCompositions", 
      "getProjectInfo", 
      "getLayerInfo", 
      "createComposition",
      "createTextLayer",
      "createShapeLayer",
      "createSolidLayer",
      "createAdjustmentLayer",
      "centerLayers",
      "getLayerClipFrames",
      "setLayerProperties",
      "setLayerKeyframe",
      "setLayerExpression",
      "applyEffect",
      "applyEffectTemplate",
      "listLayerEffects",
      "listAvailableEffects",
      "setEffectProperty",
      "setEffectKeyframe",
      "applyLayerPreset",
      "removeLayerEffect",
      "addMarker",
      "setLayerAudioLevels",
      "getLayerAudioInfo",
      "addMarkersFromArray",
      "test-animation",
      "bridgeTestEffects"
    ];
    
    if (!allowedScripts.includes(script)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${allowedScripts.join(", ")}`
          }
        ],
        isError: true
      };
    }

    try {
      
      clearResultsFile();
      
      
      writeCommandFile(script, parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to run "${script}" has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "get-results",
  "Get results from the last script executed in After Effects",
  {},
  async () => {
    try {
      const result = readResultsFromTempFile();
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting results: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.prompt(
  "list-compositions",
  "List compositions in the current After Effects project",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    };
  }
);

server.prompt(
  "analyze-composition",
  {
    compositionName: z.string().describe("Name of the composition to analyze")
  },
  (args) => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    };
  }
);


server.prompt(
  "create-composition",
  "Create a new composition with specified settings",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    };
  }
);


server.tool(
  "get-help",
  "Get help on using the After Effects MCP integration",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects MCP Integration Help

To use this integration with After Effects, follow these steps:

 1. **Install the scripts in After Effects**
   - Run \`node install-bridge.js\` with administrator privileges
   - This copies the necessary scripts to your After Effects installation

2. **Open After Effects**
   - Launch Adobe After Effects 
   - Open a project that you want to work with

3. **Open the MCP Bridge Auto panel**
   - In After Effects, go to Window > mcp-bridge-auto.jsx
   - The panel will automatically check for commands every few seconds

4. **Run scripts through MCP**
   - Use the \`run-script\` tool to queue a command
   - The Auto panel will detect and run the command automatically
   - Results will be saved to a temp file

5. **Get results through MCP**
   - After a command is executed, use the \`get-results\` tool
   - This will retrieve the results from After Effects

Available scripts:
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- createSolidLayer: Create a new solid layer
- createAdjustmentLayer: Create a new adjustment layer
- centerLayers: Center one, selected, or all layers in a composition
- getLayerClipFrames: Get clip start/end frames and source frame range for a layer
- setLayerProperties: Set properties for a layer
- setLayerKeyframe: Set a keyframe for a layer property
- setLayerExpression: Set an expression for a layer property
- applyEffect: Apply an effect to a layer
- applyEffectTemplate: Apply a predefined effect template to a layer
- listLayerEffects: List effects on a layer (optionally with all properties)
- listAvailableEffects: List all effects available in this After Effects installation
- setEffectProperty: Edit any property on an effect by name/index/path
- setEffectKeyframe: Add/edit keyframes for effect properties with graph/easing controls
- applyLayerPreset: Apply an .ffx preset file to a layer
- removeLayerEffect: Remove one effect (or all effects) from a layer
- addMarker: Add a layer or composition marker at a specified time
- setLayerAudioLevels: Set audio levels (dB) on an audio/AV layer, optionally with keyframes
- getLayerAudioInfo: Get audio metadata, source file path, existing markers, and audio level keyframes for a layer
- addMarkersFromArray: Add multiple markers at once from an array of {timeInSeconds, comment, duration, label} objects

Effect Templates:
- gaussian-blur: Simple Gaussian blur effect
- directional-blur: Motion blur in a specific direction
- color-balance: Adjust hue, lightness, and saturation
- brightness-contrast: Basic brightness and contrast adjustment
- curves: Advanced color adjustment using curves
- glow: Add a glow effect to elements
- drop-shadow: Add a customizable drop shadow
- cinematic-look: Combination of effects for a cinematic appearance
- text-pop: Effects to make text stand out (glow and shadow)

Note: The auto-running panel can be left open in After Effects to continuously listen for commands from external applications.`
        }
      ]
    };
  }
);


server.tool(
  "create-composition",
  "Create a new composition in After Effects with specified parameters",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width of the composition in pixels"),
    height: z.number().int().positive().describe("Height of the composition in pixels"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
    frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background color of the composition (RGB values 0-255)")
  },
  async (params) => {
    try {
      
      writeCommandFile("createComposition", params);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to create composition "${params.name}" has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing composition creation: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "create-adjustment-layer",
  "Create an adjustment layer in the specified composition (or active comp).",
  {
    compName: z.string().optional().describe("Composition name. If omitted, active composition is used."),
    name: z.string().optional().describe("Layer name (default: Adjustment Layer)."),
    position: z.array(z.number()).optional().describe("Layer position [x,y] or [x,y,z]."),
    size: z.array(z.number()).optional().describe("Layer size [width,height]. Defaults to comp dimensions."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().positive().optional().describe("Layer duration in seconds."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("createAdjustmentLayer", parameters);
      const result = await waitForBridgeResult("createAdjustmentLayer", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating adjustment layer: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "center-layers",
  "Center one layer, selected layers, or all layers in a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index when centering a single layer."),
    layerName: z.string().optional().describe("Target layer name when centering a single layer."),
    selectedOnly: z.boolean().optional().describe("Center only selected layers in the composition."),
    allLayers: z.boolean().optional().describe("Center all layers in the composition."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("centerLayers", parameters);
      const result = await waitForBridgeResult("centerLayers", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error centering layers: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "get-layer-clip-frames",
  "Get a layer's clip start/end frames, source frame range, and duration in frames.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index."),
    layerName: z.string().optional().describe("Target layer name if not using layerIndex."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("getLayerClipFrames", parameters);
      const result = await waitForBridgeResult("getLayerClipFrames", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting layer clip frames: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);




const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};



const KeyframeValueSchema = z.any().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");


server.tool(
  "setLayerKeyframe", 
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerIdentifierSchema, 
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => {
    try {
      
      writeCommandFile("setLayerKeyframe", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to set keyframe for "${parameters.propertyName}" on layer ${parameters.layerIndex} in comp ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerKeyframe command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "setLayerExpression", 
  "Set or remove an expression for a specific layer property.",
  {
    ...LayerIdentifierSchema, 
    propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
  },
  async (parameters) => {
    try {
      
      writeCommandFile("setLayerExpression", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to set expression for "${parameters.propertyName}" on layer ${parameters.layerIndex} in comp ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerExpression command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);





server.tool(
  "test-animation",
  "Test animation functionality in After Effects",
  {
    operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
    compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
    layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
  },
  async (params) => {
    try {
      
      const timestamp = new Date().getTime();
      const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);
      
      
      let scriptContent = "";
      if (params.operation === "keyframe") {
        scriptContent = `
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity
            prop.setValueAtTime(time, value);
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      } else if (params.operation === "expression") {
        scriptContent = `
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";
            prop.expression = expression;
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      }
      
      
      fs.writeFileSync(tempFile, scriptContent);
      console.error(`Written test script to: ${tempFile}`);
      
      
      return {
        content: [
          {
            type: "text",
            text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the MCP Bridge Auto panel and will directly modify the specified layer.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating test script: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);





server.tool(
  "apply-effect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().optional().describe("Generic effect identifier. Can be either exact display name or matchName."),
    effectIdentifier: z.string().optional().describe("Alias for effect. Can be either exact display name or matchName."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      
      writeCommandFile("applyEffect", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to apply effect to layer ${parameters.layerIndex} in composition ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "add-any-effect",
  "Add any After Effects effect to a layer by matchName or display name.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().describe("Effect identifier. Prefer matchName for reliability (e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters to set immediately after adding the effect.")
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("applyEffect", {
        compIndex: parameters.compIndex,
        layerIndex: parameters.layerIndex,
        effect: parameters.effect,
        effectSettings: parameters.effectSettings || {}
      });
      const result = await waitForBridgeResult("applyEffect", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "apply-effect-template",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      
      writeCommandFile("applyEffectTemplate", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to apply effect template '${parameters.templateName}' to layer ${parameters.layerIndex} in composition ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect-template command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "list-layer-effects",
  "List effects on a layer, with optional recursive property details.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    includeProperties: z.boolean().optional().describe("Include effect property trees (default: false)."),
    includeValues: z.boolean().optional().describe("Include current values for non-group properties (default: false)."),
    maxDepth: z.number().int().positive().max(8).optional().describe("Maximum property recursion depth when includeProperties is true (default: 2).")
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("listLayerEffects", parameters);
      const result = await waitForBridgeResult("listLayerEffects", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing layer effects: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "list-available-effects",
  "List all effects available in this After Effects installation, with optional text filter.",
  {
    query: z.string().optional().describe("Optional text filter. Matches effect name, matchName, and category."),
    includeObsolete: z.boolean().optional().describe("Include obsolete effects (default: false)."),
    maxResults: z.number().int().positive().max(20000).optional().describe("Maximum results to return (default: 5000).")
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("listAvailableEffects", parameters);
      const result = await waitForBridgeResult("listAvailableEffects", 10000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing available effects: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "set-effect-property",
  "Set or keyframe any property on an existing layer effect using name/index/path.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect in the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to target."),
    effectMatchName: z.string().optional().describe("Internal matchName of the effect to target."),
    propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).optional().describe("Path from effect root to target property, e.g. ['Compositing Options', 'Effect Opacity'] or [3, 1]."),
    propertyName: z.string().optional().describe("Fallback target property name or matchName."),
    propertyIndex: z.number().int().positive().optional().describe("Fallback target property index under the effect root."),
    keyframeIndex: z.number().int().positive().optional().describe("Optional keyframe index to edit graph/value directly without resolving by time."),
    value: z.any().optional().describe("Value to assign to the target property."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time using value."),
    expressionString: z.string().optional().describe("Optional expression string to set on the target property."),
    keyframeOptions: z.object({
      easyEase: z.boolean().optional().describe("Apply Easy Ease to the keyframe."),
      easyEaseInfluence: z.number().min(0.1).max(100).optional().describe("Influence used when easyEase is true (default: 33.333)."),
      interpolationIn: z.enum(["linear", "bezier", "hold"]).optional().describe("Incoming interpolation type."),
      interpolationOut: z.enum(["linear", "bezier", "hold"]).optional().describe("Outgoing interpolation type."),
      temporalContinuous: z.boolean().optional().describe("Enable or disable temporal continuity."),
      temporalAutoBezier: z.boolean().optional().describe("Enable or disable temporal auto-bezier."),
      roving: z.boolean().optional().describe("Set roving keyframe when supported by the property."),
      easeIn: z.union([
        z.object({
          speed: z.number().optional().describe("Incoming temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Incoming temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension incoming speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension incoming influence (0.1-100).")
        })).min(1)
      ]).optional(),
      easeOut: z.union([
        z.object({
          speed: z.number().optional().describe("Outgoing temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Outgoing temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension outgoing speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension outgoing influence (0.1-100).")
        })).min(1)
      ]).optional(),
      spatialTangentsIn: z.array(z.number()).optional().describe("Incoming spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialTangentsOut: z.array(z.number()).optional().describe("Outgoing spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialContinuous: z.boolean().optional().describe("Enable or disable spatial continuity on spatial properties."),
      spatialAutoBezier: z.boolean().optional().describe("Enable or disable spatial auto-bezier on spatial properties.")
    }).optional().describe("Optional graph/easing controls applied to the keyframe at timeInSeconds.")
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("setEffectProperty", parameters);
      const result = await waitForBridgeResult("setEffectProperty", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting effect property: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "set-effect-keyframe",
  "Set an effect property keyframe with optional graph interpolation and easy-ease controls.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect in the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to target."),
    effectMatchName: z.string().optional().describe("Internal matchName of the effect to target."),
    propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).optional().describe("Path from effect root to target property, e.g. ['Compositing Options', 'Effect Opacity'] or [3, 1]."),
    propertyName: z.string().optional().describe("Fallback target property name or matchName."),
    propertyIndex: z.number().int().positive().optional().describe("Fallback target property index under the effect root."),
    keyframeIndex: z.number().int().positive().optional().describe("Optional keyframe index to edit graph/value directly without resolving by time."),
    value: z.any().describe("Value to set at the keyframe time."),
    timeInSeconds: z.number().optional().describe("Time of the keyframe in seconds."),
    keyframeOptions: z.object({
      easyEase: z.boolean().optional().describe("Apply Easy Ease to the keyframe."),
      easyEaseInfluence: z.number().min(0.1).max(100).optional().describe("Influence used when easyEase is true (default: 33.333)."),
      interpolationIn: z.enum(["linear", "bezier", "hold"]).optional().describe("Incoming interpolation type."),
      interpolationOut: z.enum(["linear", "bezier", "hold"]).optional().describe("Outgoing interpolation type."),
      temporalContinuous: z.boolean().optional().describe("Enable or disable temporal continuity."),
      temporalAutoBezier: z.boolean().optional().describe("Enable or disable temporal auto-bezier."),
      roving: z.boolean().optional().describe("Set roving keyframe when supported by the property."),
      easeIn: z.union([
        z.object({
          speed: z.number().optional().describe("Incoming temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Incoming temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension incoming speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension incoming influence (0.1-100).")
        })).min(1)
      ]).optional(),
      easeOut: z.union([
        z.object({
          speed: z.number().optional().describe("Outgoing temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Outgoing temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension outgoing speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension outgoing influence (0.1-100).")
        })).min(1)
      ]).optional(),
      spatialTangentsIn: z.array(z.number()).optional().describe("Incoming spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialTangentsOut: z.array(z.number()).optional().describe("Outgoing spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialContinuous: z.boolean().optional().describe("Enable or disable spatial continuity on spatial properties."),
      spatialAutoBezier: z.boolean().optional().describe("Enable or disable spatial auto-bezier on spatial properties.")
    }).optional().describe("Optional graph/easing controls for the created keyframe.")
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("setEffectKeyframe", parameters);
      const result = await waitForBridgeResult("setEffectKeyframe", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting effect keyframe: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "list-presets",
  "List available After Effects .ffx presets from common or provided folders.",
  {
    presetRoots: z.array(z.string()).optional().describe("Optional absolute directories to search for presets. Defaults to common Adobe preset locations."),
    recursive: z.boolean().optional().describe("Recursively search subdirectories (default: true)."),
    maxResults: z.number().int().positive().max(2000).optional().describe("Maximum number of preset files to return (default: 500)."),
    maxDepth: z.number().int().positive().max(25).optional().describe("Maximum directory depth when recursive is true (default: 10).")
  },
  async (parameters) => {
    try {
      const roots = uniqueExistingDirs(parameters.presetRoots && parameters.presetRoots.length > 0
        ? parameters.presetRoots
        : getDefaultPresetRoots());
      const recursive = parameters.recursive !== undefined ? parameters.recursive : true;
      const maxResults = parameters.maxResults || 500;
      const maxDepth = parameters.maxDepth || 10;

      const presets = collectPresetFiles(roots, recursive, undefined, maxResults, maxDepth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              searchedRoots: roots,
              recursive,
              maxResults,
              resultCount: presets.length,
              presets
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing presets: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "search-presets",
  "Search After Effects .ffx presets by name or path.",
  {
    query: z.string().describe("Search text to match in preset filename or full path."),
    presetRoots: z.array(z.string()).optional().describe("Optional absolute directories to search. Defaults to common Adobe preset locations."),
    recursive: z.boolean().optional().describe("Recursively search subdirectories (default: true)."),
    maxResults: z.number().int().positive().max(2000).optional().describe("Maximum number of preset files to return (default: 200)."),
    maxDepth: z.number().int().positive().max(25).optional().describe("Maximum directory depth when recursive is true (default: 10).")
  },
  async (parameters) => {
    try {
      const roots = uniqueExistingDirs(parameters.presetRoots && parameters.presetRoots.length > 0
        ? parameters.presetRoots
        : getDefaultPresetRoots());
      const recursive = parameters.recursive !== undefined ? parameters.recursive : true;
      const maxResults = parameters.maxResults || 200;
      const maxDepth = parameters.maxDepth || 10;

      const presets = collectPresetFiles(roots, recursive, parameters.query, maxResults, maxDepth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              query: parameters.query,
              searchedRoots: roots,
              recursive,
              maxResults,
              resultCount: presets.length,
              presets
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching presets: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "apply-preset",
  "Apply an After Effects .ffx preset file to a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    presetPath: z.string().describe("Absolute path to the .ffx preset file."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("applyLayerPreset", parameters);
      const result = await waitForBridgeResult("applyLayerPreset", 7000, 250);

      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying preset: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);




server.tool(
  "mcp_aftereffects_applyEffect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().optional().describe("Generic effect identifier. Can be either exact display name or matchName."),
    effectIdentifier: z.string().optional().describe("Alias for effect. Can be either exact display name or matchName."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      
      writeCommandFile("applyEffect", parameters);
      
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      
      const result = readResultsFromTempFile();
      
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "mcp_aftereffects_applyEffectTemplate",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      
      writeCommandFile("applyEffectTemplate", parameters);
      
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      
      const result = readResultsFromTempFile();
      
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying effect template: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.tool(
  "mcp_aftereffects_get_effects_help",
  "Get help on using After Effects effects",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
`
        }
      ]
    };
  }
);


server.tool(
  "run-bridge-test",
  "Run the bridge test effects script to verify communication and apply test effects",
  {},
  async () => {
    try {
      
      clearResultsFile();
      
      
      writeCommandFile("bridgeTestEffects", {});
      
      return {
        content: [
          {
            type: "text",
            text: `Bridge test effects command has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for the test results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing bridge test command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "remove-effect",
  "Remove one specific effect (or all effects) from a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().describe("1-based layer index."),
    effectIndex: z.number().int().positive().optional().describe("1-based effect index within the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to remove."),
    effectMatchName: z.string().optional().describe("Internal match name of the effect to remove."),
    removeAll: z.boolean().optional().describe("If true, remove all effects from the layer."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("removeLayerEffect", parameters);
      const result = await waitForBridgeResult("removeLayerEffect", 7000, 250);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error removing effect: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "add-marker",
  "Add a marker to a layer or composition at a specified time. Markers can include a comment, label color, chapter name, URL and duration.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    markerType: z.enum(["layer", "comp"]).optional().describe("'layer' (default) or 'comp' for a composition marker."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index (required for layer markers)."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
    timeInSeconds: z.number().optional().describe("Time in seconds where the marker is placed. Defaults to current time."),
    comment: z.string().optional().describe("Marker comment / label text."),
    duration: z.number().optional().describe("Marker duration in seconds (0 = point marker)."),
    chapter: z.string().optional().describe("Chapter name associated with the marker."),
    url: z.string().optional().describe("URL to open when the marker is reached (for web export)."),
    label: z.number().int().min(0).max(16).optional().describe("Label color index (0 = none, 1-16 map to AE label colors)."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("addMarker", parameters);
      const result = await waitForBridgeResult("addMarker", 7000, 250);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error adding marker: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "set-audio-levels",
  "Set the audio levels (in dB) for an audio or AV layer. Supports per-channel control and optional keyframing.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().describe("1-based layer index."),
    level: z.number().optional().describe("Level in dB applied to both left and right channels (e.g. 0 = unity, -6 = half volume, -96 = silence)."),
    leftLevel: z.number().optional().describe("Left channel level in dB (overrides level for left channel)."),
    rightLevel: z.number().optional().describe("Right channel level in dB (overrides level for right channel)."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time instead of a static value."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("setLayerAudioLevels", parameters);
      const result = await waitForBridgeResult("setLayerAudioLevels", 7000, 250);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error setting audio levels: ${String(error)}` }], isError: true };
    }
  }
);

function analyzeWavAmplitudes(filePath: string, numPoints: number = 200): {
  duration: number;
  sampleRate: number;
  channels: number;
  amplitudes: number[];
  peakTimes: number[];
  waveformPoints: Array<{ time: number; amplitude: number }>;
} | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.slice(0, 4).toString("ascii") !== "RIFF") return null;
    if (buf.slice(8, 12).toString("ascii") !== "WAVE") return null;

    let offset = 12;
    let fmtChannels = 0, fmtSampleRate = 0, fmtBitsPerSample = 0, fmtAudioFormat = 0;
    let dataOffset = -1, dataSize = 0;

    while (offset < buf.length - 8) {
      const chunkId = buf.slice(offset, offset + 4).toString("ascii");
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === "fmt ") {
        fmtAudioFormat  = buf.readUInt16LE(offset + 8);
        fmtChannels     = buf.readUInt16LE(offset + 10);
        fmtSampleRate   = buf.readUInt32LE(offset + 12);
        fmtBitsPerSample = buf.readUInt16LE(offset + 22);
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize   = chunkSize;
      }
      offset += 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
    }

    if (dataOffset < 0 || fmtAudioFormat !== 1 || fmtChannels === 0) return null;

    const bytesPerSample = fmtBitsPerSample / 8;
    const totalSamples   = Math.floor(dataSize / (bytesPerSample * fmtChannels));
    const duration       = totalSamples / fmtSampleRate;
    const samplesPerPoint = Math.max(1, Math.floor(totalSamples / numPoints));
    const maxVal = fmtBitsPerSample === 8 ? 128 : Math.pow(2, fmtBitsPerSample - 1);

    const amplitudes: number[] = [];
    const waveformPoints: Array<{ time: number; amplitude: number }> = [];

    for (let i = 0; i < numPoints; i++) {
      let maxAmp = 0;
      const startSample = i * samplesPerPoint;
      const endSample   = Math.min(startSample + samplesPerPoint, totalSamples);
      for (let s = startSample; s < endSample; s++) {
        for (let c = 0; c < fmtChannels; c++) {
          const bytePos = dataOffset + (s * fmtChannels + c) * bytesPerSample;
          if (bytePos + bytesPerSample > buf.length) continue;
          let sample = 0;
          if (fmtBitsPerSample === 16)       sample = Math.abs(buf.readInt16LE(bytePos));
          else if (fmtBitsPerSample === 8)   sample = Math.abs(buf.readUInt8(bytePos) - 128);
          else if (fmtBitsPerSample === 24) {
            const lo = buf.readUInt16LE(bytePos);
            const hi = buf.readInt8(bytePos + 2);
            sample = Math.abs((hi << 16) | lo);
          }
          else if (fmtBitsPerSample === 32)  sample = Math.abs(buf.readInt32LE(bytePos));
          if (sample > maxAmp) maxAmp = sample;
        }
      }
      const norm = maxAmp / maxVal;
      const t    = (i / numPoints) * duration;
      amplitudes.push(norm);
      waveformPoints.push({ time: parseFloat(t.toFixed(4)), amplitude: parseFloat(norm.toFixed(4)) });
    }

    const maxAmplitude = Math.max(...amplitudes);
    const threshold = maxAmplitude * 0.6;
    const minGapSamples = Math.floor(numPoints * 0.03);
    const peakTimes: number[] = [];
    let lastPeakIdx = -minGapSamples;

    for (let i = 1; i < amplitudes.length - 1; i++) {
      if (
        amplitudes[i] > threshold &&
        amplitudes[i] >= amplitudes[i - 1] &&
        amplitudes[i] >= amplitudes[i + 1] &&
        i - lastPeakIdx >= minGapSamples
      ) {
        peakTimes.push(parseFloat(waveformPoints[i].time.toFixed(3)));
        lastPeakIdx = i;
      }
    }

    return { duration, sampleRate: fmtSampleRate, channels: fmtChannels, amplitudes, peakTimes, waveformPoints };
  } catch {
    return null;
  }
}

server.tool(
  "get-audio-info",
  "Get audio metadata, source file path, existing markers, and audio level keyframes for a layer in After Effects.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("getLayerAudioInfo", parameters);
      const result = await waitForBridgeResult("getLayerAudioInfo", 7000, 250);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting audio info: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "analyze-audio-waveform",
  "Analyze a WAV audio file to extract waveform amplitude data and detect peaks/transients. First call get-audio-info to retrieve the sourceFilePath, then pass it here. Returns normalized amplitude values (0-1) at evenly spaced time intervals plus an array of peak times where transients are detected.",
  {
    filePath: z.string().describe("Absolute path to the WAV audio file (obtained from get-audio-info sourceFilePath)."),
    numPoints: z.number().int().positive().optional().describe("Number of amplitude samples to return (default: 200). Higher = more detail."),
  },
  async ({ filePath, numPoints = 200 }) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `File not found: ${filePath}` }) }], isError: true };
      }
      const result = analyzeWavAmplitudes(filePath, numPoints);
      if (!result) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Could not parse audio file. Only uncompressed PCM WAV files are supported. For other formats, convert to WAV first." }) }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({
          status: "success",
          filePath,
          duration: result.duration,
          sampleRate: result.sampleRate,
          channels: result.channels,
          numPoints: numPoints,
          peakCount: result.peakTimes.length,
          peakTimes: result.peakTimes,
          waveformPoints: result.waveformPoints
        }, null, 2) }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error analyzing waveform: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "add-markers-bulk",
  "Add multiple layer or composition markers at once. Use this after analyze-audio-waveform to place markers at detected peaks, or to add any set of markers in a single call.",
  {
    compIndex: z.number().int().positive().describe("1-based composition index."),
    markerType: z.enum(["layer", "comp"]).optional().describe("'layer' (default) or 'comp' for composition-level markers."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index (required for layer markers)."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
    markers: z.array(z.object({
      timeInSeconds: z.number().describe("Time in seconds for this marker."),
      comment: z.string().optional().describe("Marker comment text."),
      duration: z.number().optional().describe("Marker duration in seconds (0 = point marker)."),
      label: z.number().int().min(0).max(16).optional().describe("Label color index (0-16)."),
      chapter: z.string().optional().describe("Chapter name."),
      url: z.string().optional().describe("URL link."),
    })).describe("Array of markers to add."),
  },
  async (parameters) => {
    try {
      clearResultsFile();
      writeCommandFile("addMarkersFromArray", parameters);
      const result = await waitForBridgeResult("addMarkersFromArray", 10000, 250);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error adding bulk markers: ${String(error)}` }], isError: true };
    }
  }
);


async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Scripts directory: ${SCRIPTS_DIR}`);
  console.error(`Temp directory: ${TEMP_DIR}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});

