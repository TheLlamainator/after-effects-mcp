


function createShapeLayer(args) {
    try {
        
        var compName = args.compName || "";
        var shapeType = args.shapeType || "rectangle"; 
        var position = args.position || [960, 540]; 
        var size = args.size || [200, 200]; 
        var fillColor = args.fillColor || [1, 0, 0]; 
        var strokeColor = args.strokeColor || [0, 0, 0]; 
        var strokeWidth = args.strokeWidth || 0; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var name = args.name || "Shape Layer";
        var points = args.points || 5; 
        
        
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
        
        
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = name;
        
        
        var contents = shapeLayer.property("Contents"); 
        
        
        var shapeGroup = contents.addProperty("ADBE Vector Group");
        
        var groupContents = shapeGroup.property("Contents"); 
        
        
        var shapePathProperty;
        if (shapeType === "rectangle") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Rect");
            var rectSizeProp = shapePathProperty.property("Size");
            rectSizeProp.setValue(size);
        } else if (shapeType === "ellipse") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Ellipse");
            var ellipseSizeProp = shapePathProperty.property("Size");
            ellipseSizeProp.setValue(size);
        } else if (shapeType === "polygon" || shapeType === "star") { 
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Star");
            shapePathProperty.property("Type").setValue(shapeType === "polygon" ? 1 : 2); 
            shapePathProperty.property("Points").setValue(points);
            shapePathProperty.property("Outer Radius").setValue(size[0] / 2);
            
            if (shapeType === "star") {
                shapePathProperty.property("Inner Radius").setValue(size[0] / 3);
            }
        }
        
        
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue(fillColor);
        fill.property("Opacity").setValue(100);
        
        
        if (strokeWidth > 0) {
            var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("Color").setValue(strokeColor);
            stroke.property("Stroke Width").setValue(strokeWidth);
            stroke.property("Opacity").setValue(100);
        }
        
        
        var groupTransform = shapeGroup.property("Transform");
        
        
        
        

        
        shapeLayer.property("Position").setValue(position);
        
        
        shapeLayer.startTime = startTime;
        if (duration > 0) {
            shapeLayer.outPoint = startTime + duration;
        }
        
        
        return JSON.stringify({
            status: "success",
            message: "Shape layer created successfully",
            layer: {
                name: shapeLayer.name,
                index: shapeLayer.index,
                type: "shape",
                shapeType: shapeType,
                inPoint: shapeLayer.inPoint,
                outPoint: shapeLayer.outPoint,
                position: shapeLayer.property("Position").value
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


var result = createShapeLayer(args);


$.write(result);
