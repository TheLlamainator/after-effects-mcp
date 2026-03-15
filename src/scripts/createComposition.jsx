// createComposition.jsx
// Creates a new composition with the specified settings

function createComposition(args) {
    try {
        // Extract parameters from args
        var name = args.name || "New Composition";
        var width = parseInt(args.width) || 1920;
        var height = parseInt(args.height) || 1080;
        var pixelAspect = parseFloat(args.pixelAspect) || 1.0;
        var duration = parseFloat(args.duration) || 10.0;
        var frameRate = parseFloat(args.frameRate) || 30.0;
        var bgColor = args.backgroundColor ? [args.backgroundColor.r/255, args.backgroundColor.g/255, args.backgroundColor.b/255] : [0, 0, 0];
        
        // Create the composition
        var newComp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
        
        // Set background color if provided
        if (args.backgroundColor) {
            newComp.bgColor = bgColor;
        }
        
        // Return success with composition details
        return JSON.stringify({
            status: "success",
            message: "Composition created successfully",
            composition: {
                name: newComp.name,
                id: newComp.id,
                width: newComp.width,
                height: newComp.height,
                pixelAspect: newComp.pixelAspect,
                duration: newComp.duration,
                frameRate: newComp.frameRate,
                bgColor: newComp.bgColor
            }
        }, null, 2);
    } catch (error) {
        // Return error message
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// Read arguments from the file (passed by the Node.js script)
var argsFile = new File($.fileName.replace(/[^\\\/]*$/, '') + "../temp/args.json");
var args = {};
if (argsFile.exists) {
    argsFile.open("r");
    var content = argsFile.read();
    argsFile.close();
    if (content) {
        try {
            args = JSON.parse(content);
        } catch (e) {
            // Handle parsing error
            $.write(JSON.stringify({
                status: "error",
                message: "Failed to parse arguments: " + e.toString()
            }, null, 2));
        }
    }
}

// Run the function and write the result
var result = createComposition(args);

// Write the result so it can be captured by the Node.js process
$.write(result); 