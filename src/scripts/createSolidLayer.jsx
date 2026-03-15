


function createSolidLayer(args) {
    try {
        
        var compName = args.compName || "";
        var color = args.color || [1, 1, 1]; 
        var name = args.name || "Solid Layer";
        var position = args.position || [960, 540]; 
        var size = args.size; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var isAdjustment = args.isAdjustment || false; 
        
        
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
        
        
        if (!size) {
            size = [comp.width, comp.height];
        }
        
        
        var solidLayer;
        
        if (isAdjustment) {
            
            solidLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
            solidLayer.adjustmentLayer = true;
        } else {
            
            solidLayer = comp.layers.addSolid(
                color,
                name,
                size[0],
                size[1],
                1 
            );
        }
        
        
        solidLayer.property("Position").setValue(position);
        
        
        solidLayer.startTime = startTime;
        if (duration > 0) {
            solidLayer.outPoint = startTime + duration;
        }
        
        
        return JSON.stringify({
            status: "success",
            message: isAdjustment ? "Adjustment layer created successfully" : "Solid layer created successfully",
            layer: {
                name: solidLayer.name,
                index: solidLayer.index,
                type: isAdjustment ? "adjustment" : "solid",
                inPoint: solidLayer.inPoint,
                outPoint: solidLayer.outPoint,
                position: solidLayer.property("Position").value,
                isAdjustment: solidLayer.adjustmentLayer
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


var result = createSolidLayer(args);


$.write(result); 
