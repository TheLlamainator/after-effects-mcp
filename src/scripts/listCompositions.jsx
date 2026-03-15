// listCompositions.jsx
// Lists all compositions in the current project

function listCompositions() {
    var project = app.project;
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        compositions: []
    };

    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem) {
            result.compositions.push({
                name: item.name,
                id: item.id,
                duration: item.duration,
                frameDuration: item.frameDuration,
                frameRate: item.frameRate,
                width: item.width,
                height: item.height,
                numLayers: item.numLayers
            });
        }
    }

    return JSON.stringify(result, null, 2);
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
        }
    }
}

// Run the function and write the result
var result = listCompositions();

// Write the result so it can be captured by the Node.js process
$.write(result);