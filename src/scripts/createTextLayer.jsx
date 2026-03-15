


function createTextLayer(args) {
    try {
        
        var compName = args.compName || "";
        var text = args.text || "Text Layer";
        var position = args.position || [960, 540]; 
        var fontSize = args.fontSize || 72;
        var color = args.color || [1, 1, 1]; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var fontFamily = args.fontFamily || "Arial";
        var alignment = args.alignment || "center"; 
        
        
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) {
                comp = item;
                break;
            }
        }
        
        
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) {
                comp = app.project.activeItem;
            } else {
                throw new Error("No composition found with name '" + compName + "' and no active composition");
            }
        }
        
        
        var textLayer = comp.layers.addText(text);
        
        
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        
        
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        
        
        if (alignment === "left") {
            textDocument.justification = ParagraphJustification.LEFT_JUSTIFY;
        } else if (alignment === "center") {
            textDocument.justification = ParagraphJustification.CENTER_JUSTIFY;
        } else if (alignment === "right") {
            textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY;
        }
        
        
        textProp.setValue(textDocument);
        
        
        textLayer.property("Position").setValue(position);
        
        
        textLayer.startTime = startTime;
        if (duration > 0) {
            textLayer.outPoint = startTime + duration;
        }
        
        
        return JSON.stringify({
            status: "success",
            message: "Text layer created successfully",
            layer: {
                name: textLayer.name,
                index: textLayer.index,
                type: "text",
                inPoint: textLayer.inPoint,
                outPoint: textLayer.outPoint,
                position: textLayer.property("Position").value
            }
        }, null, 2);
    } catch (error) {
        
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}


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
            
            $.write(JSON.stringify({
                status: "error",
                message: "Failed to parse arguments: " + e.toString()
            }, null, 2));
        }
    }
}


var result = createTextLayer(args);


$.write(result); 
