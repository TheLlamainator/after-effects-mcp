


function setLayerProperties(args) {
    try {
        
        var compName = args.compName || "";
        var layerName = args.layerName || "";
        var layerIndex = args.layerIndex; 
        var position = args.position; 
        var scale = args.scale; 
        var rotation = args.rotation; 
        var opacity = args.opacity; 
        var startTime = args.startTime; 
        var duration = args.duration; 
        
        
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
        
        
        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            
            if (layerIndex > 0 && layerIndex <= comp.numLayers) {
                layer = comp.layer(layerIndex);
            } else {
                throw new Error("Layer index out of bounds: " + layerIndex);
            }
        } else if (layerName) {
            
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) {
                    layer = comp.layer(j);
                    break;
                }
            }
        }
        
        if (!layer) {
            throw new Error("Layer not found: " + (layerName || "index " + layerIndex));
        }
        
        
        var changedProperties = [];
        
        
        if (position !== undefined && position !== null) {
            layer.property("Position").setValue(position);
            changedProperties.push("position");
        }
        
        
        if (scale !== undefined && scale !== null) {
            layer.property("Scale").setValue(scale);
            changedProperties.push("scale");
        }
        
        
        if (rotation !== undefined && rotation !== null) {
            
            if (layer.threeDLayer) {
                
                layer.property("Rotation").setValue([0, 0, rotation]);
            } else {
                
                layer.property("Rotation").setValue(rotation);
            }
            changedProperties.push("rotation");
        }
        
        
        if (opacity !== undefined && opacity !== null) {
            layer.property("Opacity").setValue(opacity);
            changedProperties.push("opacity");
        }
        
        
        var timingChanged = false;
        if (startTime !== undefined && startTime !== null) {
            layer.startTime = startTime;
            timingChanged = true;
            changedProperties.push("startTime");
        }
        
        if (duration !== undefined && duration !== null && duration > 0) {
            
            var actualStartTime = (startTime !== undefined && startTime !== null) ? startTime : layer.startTime;
            layer.outPoint = actualStartTime + duration;
            timingChanged = true;
            changedProperties.push("duration");
        }
        
        
        return JSON.stringify({
            status: "success",
            message: "Layer properties updated successfully",
            layer: {
                name: layer.name,
                index: layer.index,
                position: layer.property("Position").value,
                scale: layer.property("Scale").value,
                rotation: layer.threeDLayer 
                    ? layer.property("Rotation").value 
                    : layer.property("Rotation").value,
                opacity: layer.property("Opacity").value,
                inPoint: layer.inPoint,
                outPoint: layer.outPoint,
                changedProperties: changedProperties
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


var result = setLayerProperties(args);


$.write(result); 
