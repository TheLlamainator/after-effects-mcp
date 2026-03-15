


function applyEffect(args) {
    try {
        
        var compIndex = args.compIndex || 1; 
        var layerIndex = args.layerIndex || 1; 
        var effectName = args.effectName; 
        var effectMatchName = args.effectMatchName; 
        var effectCategory = args.effectCategory || ""; 
        var presetPath = args.presetPath; 
        var effectSettings = args.effectSettings || {}; 
        
        if (!effectName && !effectMatchName && !presetPath) {
            throw new Error("You must specify either effectName, effectMatchName, or presetPath");
        }
        
        
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        var effectResult;
        
        
        if (presetPath) {
            var presetFile = new File(presetPath);
            if (!presetFile.exists) {
                throw new Error("Effect preset file not found: " + presetPath);
            }
            
            
            layer.applyPreset(presetFile);
            effectResult = {
                type: "preset",
                name: presetPath.split('/').pop().split('\\').pop(),
                applied: true
            };
        }
        
        else if (effectMatchName) {
            var effect = layer.Effects.addProperty(effectMatchName);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex
            };
            
            
            applyEffectSettings(effect, effectSettings);
        }
        
        else {
            
            var effect = layer.Effects.addProperty(effectName);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex
            };
            
            
            applyEffectSettings(effect, effectSettings);
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect applied successfully",
            effect: effectResult,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}


function applyEffectSettings(effect, settings) {
    
    var hasAnySetting = false;
    if (!settings) {
        return;
    }
    for (var key in settings) {
        if (settings.hasOwnProperty(key)) {
            hasAnySetting = true;
            break;
        }
    }
    if (!hasAnySetting) {
        return;
    }
    
    
    for (var propName in settings) {
        if (settings.hasOwnProperty(propName)) {
            try {
                
                var property = null;
                
                
                try {
                    property = effect.property(propName);
                } catch (e) {
                    
                    for (var i = 1; i <= effect.numProperties; i++) {
                        var prop = effect.property(i);
                        if (prop.name === propName) {
                            property = prop;
                            break;
                        }
                    }
                }
                
                
                if (property && property.setValue) {
                    property.setValue(settings[propName]);
                }
            } catch (e) {
                
                $.writeln("Error setting effect property '" + propName + "': " + e.toString());
            }
        }
    }
}


var argsFile = new File($.fileName.replace(/[^\\\/]*$/, '') + "../temp/args.json");
var args = {};
if (argsFile.exists) {
    argsFile.open("r");
    var _content = argsFile.read();
    argsFile.close();
    if (_content) {
        try { args = JSON.parse(_content); } catch (_e) { args = {}; }
    }
}


var result = applyEffect(args);


$.write(result); 
