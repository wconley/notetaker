// Encoding: UTF-8

document.addEventListener("DOMContentLoaded", function() {
    "use strict";
    //var properties, toolButtons, history, activeLayer, pointerLayer;

    // A function for logging error/warning messages, but turned off by default
    function log(message) {
        if (window.NOTETAKER_DEBUG) {
            console.log(message);
        }
    }

    // A simple utility for creating enums. Not a constructor! Don't do new Enum
    function Enum(items) {
        var myenum = {};
        for (var item of items) {
            myenum[item] = Symbol(item);
        }
        const handler = {
            get: function(object, property) {
                var value = Reflect.get(object, property);
                if (value) {
                    return value;
                }
                throw new ReferenceError(
                    `Enum ${object} does not contain an item named ${property}`);
            }
        }
        return Object.freeze(new Proxy(myenum, handler));
    }

    // Two simple helper functions for stringify-ing/parsing various attributes
    function attributeEncode(value) {
        return typeof value === "string" ? value : JSON.stringify(value) ;
    }
    function attributeDecode(value) {
        try {
            return JSON.parse(value);
        }
        catch (error) {
            return value;
        }
    }


    // A class for keeping track of history, for undo/redo (singleton, actually)
    class History {
        constructor(notetaker) {
            var button;
            this.history = [];
            this.position = 0;
            this.activeLayer = notetaker.activeLayer;
            this.undoButtons = notetaker.toolbar.querySelectorAll('button[data-type="undo"]');
            this.redoButtons = notetaker.toolbar.querySelectorAll('button[data-type="redo"]');
            this.undoDisabled = true;
            this.redoDisabled = true;
            for (button of this.undoButtons) {
                button.addEventListener("click", this.undo.bind(this), false);
            }
            for (button of this.redoButtons) {
                button.addEventListener("click", this.redo.bind(this), false);
            }
        }

        set undoDisabled(disabled) {
            for (var button of this.undoButtons) {
                button.disabled = disabled;
            }
        }

        set redoDisabled(disabled) {
            for (var button of this.redoButtons) {
                button.disabled = disabled;
            }
        }

        noMoreRedos() {
            this.history.length = this.position;
            this.redoDisabled = true;
        }

        add(histItem) {
            this.history.push(histItem);
            this.position++;
            this.undoDisabled = false;
        }

        undo() {
            var histItem, i;
            if (this.position === 0) {
                alert("Nothing to undo!") // This shouldn't ever happen
            }
            histItem = this.history[--this.position];
            // REVERSE the effects of the "Delta" in histItem
            for(i = histItem.length - 2; i >= 0; i -= 2) {
                if (histItem[i] >= 0) {
                    // Item histItem[i+1] was added at index histItem[i]. Remove it.
                    this.activeLayer.children[histItem[i]].remove();
                }
                else {
                    // Item histItem[i+1] was removed from index -histItem[i] - 1. Re-add it.
                    this.activeLayer.insertChild(-histItem[i] - 1, histItem[i+1]);
                }
            }
            if (this.position === 0) {
                this.undoDisabled = true;
            }
            this.redoDisabled = false;
        }

        redo() {
            var histItem, i;
            if (this.position >= this.history.length) {
                alert("Nothing to redo!") // This shouldn't ever happen
            }
            histItem = this.history[this.position++];
            // REAPPLY the effects of the "Delta" in histItem
            for(i = 0; i < histItem.length; i += 2) {
                if (histItem[i] >= 0) {
                    // Add object histItem[i+1] at index histItem[i]
                    this.activeLayer.insertChild(histItem[i], histItem[i+1]);
                }
                else {
                    // Remove object at index -histItem[i] - 1 (object should be the same as histItem[i+1])
                    this.activeLayer.children[-histItem[i] - 1].remove();
                }
            }
            this.undoDisabled = false;
            if (this.position === this.history.length) {
                this.redoDisabled = true;
            }
        }

        logDebugInfo() {
            console.log("Current paths on active layer:");
            console.log("    " + this.activeLayer.children.join(", "));
            console.log("Current history stack:");
            for (var i = 0; i <= this.history.length; i++) {
                if (i > 0) {
                    console.log(`    ${i-1}: ${this.history[i-1].join(", ")}`);
                }
                if (this.position === i) {
                    console.log("    <current top of history stack>    " + 
                                "(above can be undone, below can be redone)");
                }
            }
        }
    }


    // CONTROLLER CLASSES FOR ALL OF THE TOOLS
    // An Enum for the various rules about how/when to set tool property values
    const PROPERTYRULES = Enum([
        "FIXED",            // "value"  - Always use value. Property widgets completely disabled. 
        "DEFAULT",          // "value*" - Use value initially each time tool is selected, but allow it to be changed. 
        "VARIABLE",         // "*"      - Always just get property from widgets. 
        "REMEMBER_INIT",    // "value&" - Tool remembers its previous setting when selected. First time, it uses value. 
        "REMEMBER_NOINIT",  // "&"      - Tool remembers its previous setting when selected. First time, it uses widgets. 
    ]);

    // The pass-through tool: Disable all interaction with the notetaker canvas
    class PassthroughTool {
        constructor(button, notetaker) {
            this.notetaker = notetaker;
        }

        activate() {
            for (var propertyGroup of Object.values(this.notetaker.properties)) {
                propertyGroup.disabled = true;
            }
            this.notetaker.style.pointerEvents = "none";
        }

        deactivate() {
            this.notetaker.style.pointerEvents = "auto";
        }
    }

    // An abstract base class for the objects that control all other tools
    class NotetakerTool {
        constructor(button, notetaker, defaults) {
            this.button = button;
            this.notetaker = notetaker;
            this.paperTool = null;
            this.rules = {};
            for (var property in defaults) {
                var userRule = button.dataset[property] || "*";
                var rule = this.rules[property] = {};
                if (userRule === "*") {
                    rule.type = PROPERTYRULES.VARIABLE;
                    rule.value = null;
                }
                else if (userRule.endsWith("*")) {
                    rule.type = PROPERTYRULES.DEFAULT;
                    rule.value = attributeDecode(userRule.slice(0, -1));
                }
                else if (userRule === "&") {
                    rule.type = PROPERTYRULES.REMEMBER_NOINIT;
                    rule.value = null;
                }
                else if (userRule.endsWith("&")) {
                    rule.type = PROPERTYRULES.REMEMBER_INIT;
                    rule.value = attributeDecode(userRule.slice(0, -1));
                }
                else {
                    rule.type = PROPERTYRULES.FIXED;
                    rule.value = attributeDecode(userRule);
                }
                // If no property widgets for this property, set property FIXED. 
                // If also no value specified by userRule, use tool's default. 
                if (notetaker.properties[property].widgets.size === 0) {
                    rule.type = PROPERTYRULES.FIXED;
                    if (rule.value === null) {
                        rule.value = defaults[property];
                    }
                }
                // If userRule is not "*" or "&", set the button's appearance. 
                if (rule.value !== null) {
                    this.setButtonStyle(property, rule.value);
                }
                // Make property null. Will be set first time tool is activated. 
                this[property] = null;
            }
        }

        activate() {
            for (var property in this.notetaker.properties) {
                var propertyGroup = this.notetaker.properties[property];
                if (!(property in this.rules)) {
                    propertyGroup.disabled = true;
                    continue;
                }
                var rule = this.rules[property];
                switch (rule.type) {
                    case PROPERTYRULES.VARIABLE:
                        // Always get value from currently selected widget
                        propertyGroup.disabled = false;
                        this[property] = propertyGroup.value;
                        break;
                    case PROPERTYRULES.DEFAULT:
                        // Use the rule.value, but allow it to be changed. 
                        propertyGroup.disabled = false;
                        this[property] = rule.value;
                        propertyGroup.selectValue(this[property]);
                        break;
                    case PROPERTYRULES.REMEMBER_NOINIT:
                        // Keep value as it is... unless null (first activation)
                        propertyGroup.disabled = false;
                        if (this[property] === null) {
                            this[property] = propertyGroup.value;
                            this.setButtonStyle(property, this[property]);
                        }
                        else {
                            propertyGroup.selectValue(this[property]);
                        }
                        break;
                    case PROPERTYRULES.REMEMBER_INIT:
                        // Keep value as it is... unless null (first activation)
                        propertyGroup.disabled = false;
                        if (this[property] === null) {
                            this[property] = rule.value;
                        }
                        propertyGroup.selectValue(this[property]);
                        break;
                    case PROPERTYRULES.FIXED:
                        // Use the rule.value, and disable changes. 
                        this[property] = rule.value;
                        propertyGroup.disabled = true;
                        break;
                }
            }
            if (!this.paperTool) {
                this.paperTool = new paper.Tool();
                this.paperTool.onMouseDown = this.onMouseDown.bind(this);
                this.paperTool.onMouseDrag = this.onMouseDrag.bind(this);
                this.paperTool.onMouseUp   = this.onMouseUp.bind(this);
            }
            this.paperTool.activate();
        }

        setButtonStyle(property, value) {
            value = this.notetaker.properties[property].cssConverter(value);
            this.button.style.setProperty(`--${property}`, value);
        }

        setProperty(property, value) {
            if (this.rules[property].type !== PROPERTYRULES.VARIABLE) {
                this.setButtonStyle(property, value);
            }
            this[property] = value;
        }

        deactivate() {
            for (var [property, rule] of Object.entries(this.rules)) {
                if (rule.type === PROPERTYRULES.DEFAULT) {
                    this.setButtonStyle(property, rule.value);
                }
            }
        }
    }

    // A (slightly more specific, still abstract) subclass for the drawing tools
    class DrawingTool extends NotetakerTool {
        constructor(button, notetaker, defaults) {
            // NEED TO ADD ABILITY TO INCLUDE MORE DEFAULTS, LIKE SNAP
            super(button, notetaker, {color: "black", width: 1, opacity: 1, 
                    dash: []});
        }

        get dash_scaled() {
            return this.dash.map(a => a * (this.width + 1)/2);
        }
    }

    // The pen tool: Draw freehand lines/curves
    class PenTool extends DrawingTool {
        onMouseDown(event) {
            this.notetaker.history.noMoreRedos();
            this.currentPath = new paper.Path({
                segments: [event.point], 
                strokeColor: this.color, 
                strokeWidth: this.width, 
                strokeCap: "round", 
                strokeJoin: "round", 
                opacity: this.opacity, 
                dashArray: this.dash_scaled, 
            });
        }

        onMouseDrag(event) {
            this.currentPath.add(event.point);
        }

        onMouseUp(event) {
            this.currentPath.simplify(2.5);
            this.notetaker.history.add([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The line tool: draw straight lines, optionally snap to increments of pi/4
    class LineTool extends DrawingTool {
        constructor(button, notetaker) {
            super(button, notetaker);
            this.snapTolerance = 20; // Set to -1 to disable snap
            this.firstPoint = null;
        }

        onMouseDown(event) {
            this.notetaker.history.noMoreRedos();
            this.firstPoint = event.point;
            this.currentPath = new paper.Path({
                segments: [event.point, event.point], 
                strokeColor: this.color, 
                strokeWidth: this.width, 
                strokeCap: "round", 
                opacity: this.opacity, 
                dashArray: this.dash_scaled, 
            });
        }

        onMouseDrag(event) {
            var point = event.point;
            var deltaX = point.x - this.firstPoint.x;
            var deltaY = point.y - this.firstPoint.y;
            var snap = this.snapTolerance;
            var offset;
            if (snap > 0 && deltaX * deltaX + deltaY * deltaY >= 2*snap*snap) {
                if (Math.abs(deltaY) < snap) {
                    point.y = this.firstPoint.y;
                }
                else if (Math.abs(deltaX) < snap) {
                    point.x = this.firstPoint.x;
                }
                else if (Math.abs(deltaX - deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX + deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y + offset;
                }
                else if (Math.abs(deltaX + deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX - deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y - offset;
                }
            }
            this.currentPath.segments = [this.firstPoint, point];
        }

        onMouseUp(event) {
            this.notetaker.history.add([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The rectangle tool: draw rectangles, optionally snap to squares
    class RectangleTool extends DrawingTool {
        constructor(button, notetaker) {
            super(button, notetaker);
            this.snapTolerance = 20; // Set to -1 to disable snap
            this.firstPoint = null;
        }

        rectangle(p1, p2) {
            return [p1, new paper.Point(p1.x, p2.y), p2, new paper.Point(p2.x, p1.y)];
        }

        onMouseDown(event) {
            this.notetaker.history.noMoreRedos();
            this.firstPoint = event.point;
            this.currentPath = new paper.Path({
                segments: this.rectangle(event.point, event.point), 
                closed: true, 
                strokeColor: this.color, 
                strokeWidth: this.width, 
                strokeJoin: "miter", 
                opacity: this.opacity, 
                dashArray: this.dash_scaled, 
            });
        }

        onMouseDrag(event) {
            var point = event.point;
            var deltaX = point.x - this.firstPoint.x;
            var deltaY = point.y - this.firstPoint.y;
            var snap = this.snapTolerance;
            var offset;
            if (snap > 0 && deltaX * deltaX + deltaY * deltaY >= 2*snap*snap) {
                if (Math.abs(deltaX - deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX + deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y + offset;
                }
                else if (Math.abs(deltaX + deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX - deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y - offset;
                }
            }
            this.currentPath.segments = this.rectangle(this.firstPoint, point);
        }

        onMouseUp(event) {
            this.notetaker.history.add([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The ellipse tool: draw ellipses, from center, optionally snap to circles
    class EllipseTool extends DrawingTool {
        constructor(button, notetaker) {
            super(button, notetaker);
            this.snapTolerance = 20; // 0 disables snap, negative makes circles
            this.center = null;
        }

        onMouseDown(event) {
            this.notetaker.history.noMoreRedos();
            this.center = event.point;
            this.currentPath = new paper.Path({
                segments: [event.point], 
                closed: true, 
                strokeColor: this.color, 
                strokeWidth: this.width, 
                opacity: this.opacity, 
                dashArray: this.dash_scaled, 
            });
        }

        onMouseDrag(event) {
            const point = event.point;
            const snap = this.snapTolerance;
            var xradius = Math.abs(point.x - this.center.x);
            var yradius = Math.abs(point.y - this.center.y);
            const hypotenuseSquared = xradius * xradius + yradius * yradius;
            if (snap < 0) {
                xradius = yradius = Math.sqrt(hypotenuseSquared);
            }
            if (snap > 0 && hypotenuseSquared >= 2*snap*snap 
               && Math.abs(xradius - yradius) < Math.sqrt(2)*snap) {
                xradius = yradius = (xradius + yradius) / 2;
            }
            var newPath = new paper.Path.Ellipse({center: this.center, 
                                                  radius: [xradius, yradius]});
            this.currentPath.segments = newPath.segments;
            newPath.remove();
        }

        onMouseUp(event) {
            this.notetaker.history.add([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The delete tool: delete whole strokes (lines/curves/rectangles/etc)
    class DeleteTool extends NotetakerTool {
        constructor(button, notetaker) {
            super(button, notetaker, {width: 4});
            this.hitTestOptions = {fill: true, stroke: true, segments: true};
        }

        onMouseDown(event) {
            this.notetaker.history.noMoreRedos();
            this.hitTestOptions.tolerance = this.width;
            this.toBeRemoved = {};
            this.removeItemsAt(event.point);
        }

        onMouseDrag(event) {
            this.removeItemsAt(event.point);
        }

        removeItemsAt(point) {
            var results = paper.project.hitTestAll(point, this.hitTestOptions);
            for(var result of results) {
                var item = result.item;
                if (!item.ignore && !this.toBeRemoved[item.index]) {
                    item.opacity *= 0.4;
                    this.toBeRemoved[item.index] = item;
                }
            }
        }

        onMouseUp(event) {
            var histItem = [];
            for(var item of Object.values(this.toBeRemoved)) {
                histItem.push(-item.index - 1, item)
                item.remove();
                item.opacity /= 0.4;
            }
            if (histItem.length > 0) {
                this.notetaker.history.add(histItem);
            }
        }
    }

    // The erase tool: cover up previously drawn ink, and also divide paths
    class EraseTool extends NotetakerTool {
        constructor(button, notetaker) {
            super(button, notetaker, {width: 10});
        }

        onMouseDown(event) {
            this.notetaker.history.noMoreRedos();
            this.currentPath = new paper.Path({
                blendMode: "destination-out", 
                segments: [event.point], 
                strokeColor: "black", 
                strokeWidth: this.width, 
                strokeCap: "round", 
                strokeJoin: "round", 
                opacity: 1, 
            });
            this.currentPath.ignore = true;
        }

        onMouseDrag(event) {
            this.currentPath.add(event.point);
        }

        onMouseUp(event) {
            var histItem, i, path;
            this.currentPath.simplify(2.5);
            histItem = [this.currentPath.index, this.currentPath];
            for(i = 0; path = this.notetaker.activeLayer.children[i]; i++) {
                if (path.blendMode === "destination-out") {
                    continue;
                }
                let intersections = path.getIntersections(this.currentPath);
                if (intersections.length) {
                    let pathCopy = path.clone({insert: false, deep: false});
                    intersections = pathCopy.getIntersections(this.currentPath);
                    let newPaths = [];
                    for(let intersection of intersections.reverse()) {
                        let newPath = pathCopy.splitAt(intersection);
                        if (newPath && newPath !== pathCopy) {
                            newPaths.push(newPath);
                        }
                    }
                    if (newPaths.length || (path.closed && !pathCopy.closed)) {
                        let index = path.index;
                        histItem.push(-index - 1, path);
                        path.remove();
                        newPaths.push(pathCopy);
                        newPaths.forEach((newPath, j) => {
                            histItem.push(index + j, newPath);
                        });
                        this.notetaker.activeLayer.insertChildren(index, 
                                newPaths);
                        i = pathCopy.index;
                    }
                }
            }
            this.notetaker.history.add(histItem);
        }
    }

    // The laser-pointer tool: show a colored dot under the pointer
    class LaserPointerTool extends NotetakerTool {
        constructor(button, notetaker) {
            super(button, notetaker, {color: "red", width: 10, opacity: 0.6, 
                    fade: {duration: 500, easing: "easeInQuad"}});
            this.point = new paper.Path({
                segments: [], 
                strokeCap: "round", 
                strokeJoin: "round", 
            });
            this.point.ignore = true;
            this.point.addTo(this.notetaker.pointerLayer);
            this.tween = null;
        }

        onMouseDown(event) {
            if (this.tween) {
                this.tween.stop();
                this.tween = null;
            }
            this.point.strokeColor = this.color;
            this.point.strokeWidth = this.width;
            this.point.opacity = this.opacity;
            this.tweenOptions = this.fade;
            this.point.segments = [event.point, event.point];
        }

        onMouseDrag(event) {
            this.point.segments = [event.point, event.point];
        }

        onMouseUp(event) {
            this.tween = this.point.tween({opacity: 0}, this.tweenOptions);
        }
    }

    // The "trailing-laser" tool: laser pointer, but with "trails" that fade out
    class TrailingLaserTool extends NotetakerTool {
        constructor(button, notetaker) {
            super(button, notetaker, {color: "red", width: 10, opacity: 0.6, 
                    fade: {duration: 2000, easing: "easeInCubic"}});
            this.paths = new paper.CompoundPath({
                strokeCap: "round", 
                strokeJoin: "round", 
            });
            this.paths.addTo(this.notetaker.pointerLayer);
            this.tween = null;
        }

        onMouseDown(event) {
            if (this.tween) {
                this.tween.stop();
                this.tween = null;
            }
            this.paths.strokeColor = this.color;
            this.paths.strokeWidth = this.width;
            this.paths.opacity = this.opacity;
            this.tweenOptions = this.fade;
            this.paths.moveTo(event.point);
            this.paths.lastChild.ignore = true;
        }

        onMouseDrag(event) {
            this.paths.lastChild.add(event.point);
        }

        onMouseUp(event) {
            this.tween = this.paths.tween({opacity: 0}, this.tweenOptions);
            this.tween.then(this.finish.bind(this));
        }

        finish() {
            this.tween = null;
            this.paths.removeChildren();
        }
    }
    // END OF CONTROLLER CLASSES FOR ALL OF THE TOOLS


    // Abstract base class for a set of mutually exclusive widgets
    class WidgetGroup {
        constructor() {
            this.widgets = new Set();
            this._selected = null;
        }

        add(widget) {
            this.widgets.add(widget);
            widget.addEventListener("click", this.click.bind(this), false);
            if (this.widgets.size === 1 || widget.classList.contains("selected")) {
                this.select(widget);
            }
        }

        select(widget) {
            if (!this.widgets.has(widget) || widget === this._selected) {
                return;
            }
            if (this._selected) {
                this._selected.classList.remove("selected");
            }
            widget.classList.add("selected");
            this._selected = widget;
        }

        get selected() {
            return this._selected;
        }
    }

    // WidgetGroup for a set of widgets that control a certain tool property
    class PropertyWidgetGroup extends WidgetGroup {
        constructor(property, notetaker, cssConverter) {
            super();
            this.property = property;
            this.notetaker = notetaker;
            this.cssConverter = cssConverter ? cssConverter : (x => x);
        }

        select(widget) {
            super.select(widget);
            this.notetaker.toolbar.style.setProperty(`--${this.property}`, 
                    this.cssConverter(widget._value));
        }

        click(event) {
            var widget = event.currentTarget;
            this.select(widget);
            var current = this.notetaker.toolButtons.selected;
            if (current) {
                current._tool.setProperty(this.property, widget._value);
            }
        }

        get value() {
            if (!this._selected) {
                return null;
            }
            if (!this._selected.classList.contains("selected")) {
                this._selected.classList.add("selected")
            }
            return this._selected._value;
        }

        selectValue(value) {
            value = attributeEncode(value);
            for (var widget of this.widgets) {
                if (attributeEncode(widget._value) === value) {
                    this.select(widget);
                    return;
                }
            }
            this._selected.classList.remove("selected");
        }

        set disabled(disabled) {
            for (var widget of this.widgets) {
                widget.disabled = disabled;
            }
        }
    }


    // Initialize the toolbar config. In production, will be imported/fetched. 
    //const configuration = {
    //    "theme": "default", // NOT YET IMPLEMENTED
    //    "position": "top", // NOT YET IMPLEMENTED
    //    "start": [
    //        { "type": "width-button", "value": 1 }, 
    //        { "type": "width-button*", "value": 2 }, 
    //        { "type": "width-button", "value": 10 }, 
    //        { "type": "opacity-button*", "value": 1 }, 
    //        { "type": "opacity-button", "value": 0.7 }, 
    //        { "type": "opacity-button", "value": 0.4 }, 
    //        { "type": "dash-pattern-button*", "value": [] }, 
    //        { "type": "dash-pattern-button", "value": [7, 3] }, 
    //        { "type": "dash-pattern-button", "value": [7, 3, 1, 3] }, 
    //        { "type": "color-button", "value": "dodgerblue" }, 
    //        { "type": "color-button", "value": "darkred" }, 
    //        { "type": "color-button", "value": "darkgreen" }, 
    //        { "type": "color-button", "value": "darkgray" }, 
    //        { "type": "color-button", "value": "darkorange" }, 
    //        { "type": "color-button", "value": "purple" }, 
    //        { "type": "color-button", "value": "cornflowerblue" }, 
    //    ], 
    //    "middle": [
    //        { "type": "pen-tool", "color": "darkblue", "width": 3, "opacity": 1, "dash": [] }, 
    //        { "type": "pen-tool", "color": "darkblue*", "width": "3*", "opacity": "1*", "dash": "[]*" }, 
    //        { "type": "pen-tool", "color": "darkblue&", "width": "3&", "opacity": "1&", "dash": "[]&" }, 
    //        { "type": "pen-tool", "color": "&", "width": "&", "opacity": "&", "dash": "&" }, 
    //        { "type": "pen-tool", "color": "*", "width": "*", "opacity": "*", "dash": "*" }, 
    //        { "type": "line-tool", "color": "*", "width": "*", "opacity": "*", "dash": "*" }, 
    //        { "type": "rectangle-tool", "color": "*", "width": "*", "opacity": "*", "dash": "*" }, 
    //        { "type": "ellipse-tool", "color": "*", "width": "*", "opacity": "*", "dash": "*" }, 
    //        { "type": "delete-tool", "width": "*" }, 
    //        { "type": "erase-tool", "width": "*" }, 
    //        { "type": "pen-tool", "color": "lightgreen", "width": 16, "opacity": 0.4, "dash": [] }, 
    //    ], 
    //    "end": [
    //        { "type": "undo" }, 
    //        { "type": "redo" }, 
    //        { "type": "laser-pointer-tool", "color": "red", "width": 10, "opacity": 0.6 }, 
    //        { "type": "trailing-laser-tool*", "color": "red", "width": 10, "opacity": 0.6 }, 
    //    ]
    //};
    const configuration = {
        theme: "default", 
        position: "top", 
        start: [
            { type: "dash-pattern-button*", value: "[]"     }, 
            { type: "dash-pattern-button",  value: "[7, 3]" }, 
            { type: "color-button*", value: "darkblue"      }, 
            { type: "color-button",  value: "darkgreen"     }, 
            { type: "color-button",  value: "darkred"       }, 
            { type: "color-button",  value: "#404040"       }, 
            { type: "color-button",  value: "darkorange"    }, 
            { type: "color-button",  value: "blueviolet"    }, 
        ], 
        middle: [
            { type: "pen-tool",       color: "*", width: 2, opacity: 1, dash: "[]*" }, 
            { type: "line-tool",      color: "*", width: 2, opacity: 1, dash: "[]*" }, 
            { type: "rectangle-tool", color: "*", width: 2, opacity: 1, dash: "[]*" }, 
            { type: "ellipse-tool",   color: "*", width: 2, opacity: 1, dash: "[]*" }, 
            { type: "pen-tool",       color: "lightgreen*", width: 16, opacity: 0.4, dash: "[]" }, 
            { type: "delete-tool",    width: 3 }, 
            { type: "erase-tool",     width: 10 }, 
        ], 
        end: [
            { type: "undo" }, 
            { type: "redo" }, 
            { type: "trailing-laser-tool*", color: "red*", width: 10, opacity: 0.6 }, 
            { type: "pass-through-tool" }, 
        ], 
    };

    // Initialize the theme. In production, we'll do this via import or fetch. 
    const theme = {
        stylesheet: "\
            :host { \n\
                display: flex; \n\
                flex-direction: column; \n\
            } \n\
            :host > div { \n\
                pointer-events: auto; \n\
                flex: none; \n\
                height: 2em; \n\
                display: flex; \n\
                flex-direction: row; \n\
                justify-content: space-between; \n\
                background-color: dimgray; \n\
            } \n\
            :host > canvas { \n\
                flex: auto; \n\
            } \n\
            .toolbar-section { \n\
                flex: none; \n\
                height: 2em; \n\
            } \n\
            button { \n\
                font-size: 100%; \n\
                width: 2em; \n\
                height: 2em; \n\
                border: none; \n\
                margin: 0 0.1em; \n\
                padding: 0; \n\
            } \n\
            button:disabled { \n\
                filter: grayscale(100%); \n\
            } \n\
            button:disabled:hover { \n\
                background-color: inherit; \n\
            } \n\
            button:focus { \n\
                outline-offset: 0px; \n\
            } \n\
            button.selected { \n\
                border: 1px solid red; \n\
            } \n\
            button:disabled.selected { \n\
                border: none; \n\
            }", 
        "undo":                 '<svg viewBox="0 0 10 10"><path d="M4,8.5 A2.5,3.5 30 1,0 2.5,4.5 m-0.5,-1.5 l0.5,1.5 1.5,-0.5" fill="none" stroke="black" stroke-width="0.5" /></svg>', 
        "redo":                 '<svg viewBox="0 0 10 10"><path d="M6,8.5 A2.5,3.5 -30 1,1 7.5,4.5 m0.5,-1.5 l-0.5,1.5 -1.5,-0.5" fill="none" stroke="black" stroke-width="0.5" /></svg>', 
        "color-button":         '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" ry="1" style="fill: var(--value); stroke: none;" /></svg>', 
        "width-button":         '<svg viewBox="0 0 10 10"><path d="M5,5 5,5" style="fill: none; stroke: black; stroke-width: calc(var(--value) * 2px); stroke-linecap: round;" /></svg>', 
        "opacity-button":       '<svg viewBox="0 0 10 10"><path d="M0,0 H2.5 V10 H5 V0 H7.5 V10 H10 V7.5 H0 V5 H10 V2.5 H0 z" style="fill: gray; stroke: none; opacity: 0.25;" /><circle cx="5" cy="5" r="4" style="fill: black; stroke:none; opacity: var(--value);" /></svg>', 
        "dash-pattern-button":  '<svg viewBox="0 0 10 10"><path d="M5,0 V10" style="stroke: black; stroke-width: 0.5; stroke-dasharray: var(--value);" /></svg>', 
        "pen-tool":             '<svg viewBox="0 0 10 10"><path d="M0,0 H2.5 V10 H5 V0 H7.5 V10 H10 V7.5 H0 V5 H10 V2.5 H0 z" style="fill: gray; stroke: none; opacity: 0.25;" /><path d="M0,10 S3,2 5,5 7,7 12,0" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" /></svg>', 
        "line-tool":            '<svg viewBox="0 0 10 10"><path d="M0,0 H2.5 V10 H5 V0 H7.5 V10 H10 V7.5 H0 V5 H10 V2.5 H0 z" style="fill: gray; stroke: none; opacity: 0.25;" /><path d="M-3,10 L13,0" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" /></svg>', 
        "rectangle-tool":       '<svg viewBox="0 0 10 10"><path d="M0,0 H2.5 V10 H5 V0 H7.5 V10 H10 V7.5 H0 V5 H10 V2.5 H0 z" style="fill: gray; stroke: none; opacity: 0.25;" /><path d="M1.5,2.5 l7,0 0,5 -7,0 z" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" /></svg>', 
        "ellipse-tool":         '<svg viewBox="0 0 10 10"><path d="M0,0 H2.5 V10 H5 V0 H7.5 V10 H10 V7.5 H0 V5 H10 V2.5 H0 z" style="fill: gray; stroke: none; opacity: 0.25;" /><circle cx="5" cy="5" r="3" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" /></svg>', 
        "delete-tool":          '<svg viewBox="0 0 10 10"><path d="M1,2 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,8 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round;" /><path d="M1,5 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round; opacity: 0.3;" /><circle cx="8" cy="5.5" r="1.5" style="fill: gray; stroke: none;" /></svg>', 
        "erase-tool":           '<svg viewBox="0 0 10 10"><path d="M1,2 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,5 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,8 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round;" /><path d="M10,0 3,7" style="fill: none; stroke: white; stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: 0.9;" /><path d="M3,7 3,7" style="fill: none; stroke: gray; stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round;" /></svg>', 
        "laser-pointer-tool":   '<svg viewBox="0 0 10 10"><path d="M5,5 5,5" style="fill: none; stroke: var(--color); stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: var(--opacity);" /><path d="M1.5,5 l-1.5,0 M8.5,5 l1.5,0 M6.75,8.031 l0.75,1.299 M3.25,8.031 l-0.75,1.299 M6.75,1.969 l0.75,-1.299 M3.25,1.969 l-0.75,-1.299" style="fill: none; stroke: var(--color); stroke-width: 0.5; stroke-linecap: round;" /></svg>', 
        "trailing-laser-tool":  '<svg viewBox="0 0 10 10"><path d="M3,7 L7,3" style="fill: none; stroke: var(--color); stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: var(--opacity);" /><path d="M7,3 7,3"  style="fill: none; stroke: var(--color); stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: 1;" /></svg>', 
        "pointer-tool":         '<svg viewBox="0 0 10 10"><path d="M8.7,7.5 l-3,1.5 -2,-2 a0.35,0.35 0 0,1 0.7,-0.7 l0.8,0.8 -1.8,-3.6 a0.35,0.35 0 0,1 0.885,-0.443 l1.2,2.4 -0.5,-1 a0.35,0.35 0 0,1 0.885,-0.443 l0.6,1.2 -0.5,-1 a0.35,0.35 0 0,1 0.885,-0.443 l0.6,1.2 -0.5,-1 a0.35,0.35 0 0,1 0.885,-0.443 l0.4,0.8 s0.4,0.8 0.4,1.6 z" style="fill: none; stroke: black; stroke-width: 0.3; stroke-linejoin: round;" /><path d="M3.6,3 m-1.3,0 -1,0 M3.6,3 m0,-1.3 0,-1 M3.6,3 m-0.919,-0.919 -0.707,-0.707 M3.6,3 m-0.919,0.919 -0.707,0.707 M3.6,3 m0.919,-0.919 0.707,-0.707" style="fill: none; stroke: gray; stroke-width: 0.5; stroke-linecap: round;" /></svg>', 
        "pass-through-tool":    '<svg viewBox="0 0 10 10"><path d="M8.7,7.5 l-3,1.5 -2,-2 a0.35,0.35 0 0,1 0.7,-0.7 l0.8,0.8 -1.8,-3.6 a0.35,0.35 0 0,1 0.885,-0.443 l1.2,2.4 -0.5,-1 a0.35,0.35 0 0,1 0.885,-0.443 l0.6,1.2 -0.5,-1 a0.35,0.35 0 0,1 0.885,-0.443 l0.6,1.2 -0.5,-1 a0.35,0.35 0 0,1 0.885,-0.443 l0.4,0.8 s0.4,0.8 0.4,1.6 z" style="fill: none; stroke: black; stroke-width: 0.3; stroke-linejoin: round;" /><path d="M3.6,3 m-1.3,0 -1,0 M3.6,3 m0,-1.3 0,-1 M3.6,3 m-0.919,-0.919 -0.707,-0.707 M3.6,3 m-0.919,0.919 -0.707,0.707 M3.6,3 m0.919,-0.919 0.707,-0.707" style="fill: none; stroke: gray; stroke-width: 0.5; stroke-linecap: round;" /></svg>', 
    };

    // Our registry of all the various tools and other widgets. 
    const widgetTypes = {
        "undo":                 { element: "button", type: "undo" }, 
        "redo":                 { element: "button", type: "redo" }, 
        "color-button":         { element: "button", type: "property", property: "color"   }, 
        "width-button":         { element: "button", type: "property", property: "width"   }, 
        "opacity-button":       { element: "button", type: "property", property: "opacity" }, 
        "dash-pattern-button":  { element: "button", type: "property", property: "dash"    }, 
        "pen-tool":             { element: "button", type: "tool", controller: PenTool }, 
        "line-tool":            { element: "button", type: "tool", controller: LineTool }, 
        "rectangle-tool":       { element: "button", type: "tool", controller: RectangleTool }, 
        "ellipse-tool":         { element: "button", type: "tool", controller: EllipseTool }, 
        "delete-tool":          { element: "button", type: "tool", controller: DeleteTool }, 
        "erase-tool":           { element: "button", type: "tool", controller: EraseTool }, 
        "laser-pointer-tool":   { element: "button", type: "tool", controller: LaserPointerTool }, 
        "trailing-laser-tool":  { element: "button", type: "tool", controller: TrailingLaserTool }, 
        "pointer-tool":         { element: "button", type: "tool", controller: LaserPointerTool }, // To be implemented...
        "pass-through-tool":    { element: "button", type: "tool", controller: PassthroughTool }, 
    }

    class NotetakerButton extends HTMLButtonElement {
        constructor() {
            super();
        }

        connectedCallback() {
            if (this._initialized) {
                return;
            }
            this._initialized = true;
            if (!("type" in this.dataset)) {
                throw new TypeError("notetaker-button has no 'type' specified");
            }
            const type = this.dataset.type;
            if (!(type in widgetTypes)) {
                throw new TypeError(`notetaker-button has unknown type ${type}`);
            }
            if (widgetTypes[type].type === "property" && 
                !("value" in this.dataset)) {
                log(`WARNING: ${type} created with no value specified.`);
                return;
            }
            if (!(type in theme)) {
                log(`WARNING: ${type} is not in this theme.`);
                return;
            }
            this.innerHTML = theme[type];
        }
    }

    function createWidget(type, attributes, selected) {
        if (!(type in widgetTypes)) {
            log(`WARNING: Tried to create a widget of unknown type "${type}".`);
            return;
        }
        const widget = document.createElement(widgetTypes[type].element, 
                {is: `notetaker-${widgetTypes[type].element}`});
        widget.dataset.type = type;
        for (var [attribute, value] of Object.entries(attributes)) {
            widget.dataset[attribute] = attributeEncode(value);
        }
        if (selected) {
            widget.className = "selected";
        }
        return widget;
    }

    class Notetaker extends HTMLElement {
        constructor() {
            super();
            this.activeLayer = null;
            this.pointerLayer = null;
            this.properties = null;
            this.toolButtons = null;
            this.history = null;
        }

        connectedCallback() {
            if (this._initialized) {
                return;
            }
            this._initialized = true;
            var widget;
            // Fetch both the configuration and the theme JSON data
            //const configUrl = this.dataset["config-href"];
            //if (!configUrl) {
            //    throw new ReferenceError("note-taker: No config specified");
            //}
            //document.fetch(configUrl).then(this.gotConfig.bind(this));
            // Set up an inner style sheet, in the Shadow DOM
            //     Note: We may eventually allow for <link> stylesheets as well
            const style = document.createElement("style");
            style.textContent = theme.stylesheet;
            // Now create the toolbar, and populate it (using the configuration object)
            this.toolbar = document.createElement("div");
            for (const part of ["start", "middle", "end"]) {
                const toolbar_part = document.createElement("div");
                toolbar_part.className = "toolbar_section";
                if (part in configuration) {
                    for (widget of configuration[part]) {
                        let {type, ...attributes} = widget;
                        let selected = type.endsWith("*");
                        type = selected ? type.slice(0, -1) : type;
                        widget = createWidget(type, attributes, selected);
                        toolbar_part.appendChild(widget);
                    }
                }
                this.toolbar.appendChild(toolbar_part);
            }
            const canvas = document.createElement("canvas");
            this.attachShadow({mode: "open"});
            this.shadowRoot.append(style, this.toolbar, canvas);

            // Now that we've got our canvas, we can set up PaperJS
            paper.setup(canvas);                    // Note this must be done 
            this.activeLayer = new paper.Layer();   // before instantiating the 
            this.pointerLayer = new paper.Layer();  // tools, as some of them 
            this.activeLayer.activate();            // need the pointerLayer. 

            // Now set up the WidgetGroups for the property widgets... 
            const cssConverters = {
                width: x => (x ** 0.75 / 2), 
                dash: x => (x.length ? x.map(y => y / 3) : [100, 0]), 
            }
            this.properties = new Proxy({}, {
                get: (object, property) => {
                    if (!(property in object)) {
                        object[property] = new PropertyWidgetGroup(
                                property, this, cssConverters[property]);
                    }
                    return object[property];
                }
            });

            // ...and the tool buttons. 
            this.toolButtons = new WidgetGroup();
            this.toolButtons.click = function(event) {
                var button = event.currentTarget;
                if (this._selected !== button) {
                    this._selected._tool.deactivate();
                }
                this.select(button);
                button._tool.activate();
            };

            // Finally we set up/configure the controllers for all those widgets
            for (widget of this.toolbar.querySelectorAll("button, input")) {
                let widgetInfo = widgetTypes[widget.dataset.type];
                switch(widgetInfo.type) {
                    case "property":
                        let propertyGroup = this.properties[widgetInfo.property];
                        widget._value = attributeDecode(widget.dataset.value);
                        widget.style.setProperty("--value", 
                                propertyGroup.cssConverter(widget._value));
                        propertyGroup.add(widget);
                        break;
                    case "tool":
                        widget._tool = new widgetInfo.controller(widget, this);
                        this.toolButtons.add(widget);
                        break;
                }
            }

            // Set up the history, and activate our first tool! 
            this.history = new History(this);
            this.toolButtons.selected._tool.activate();
            paper.view.draw();
        }
    }

    // Define our two custom elements. 
    customElements.define("notetaker-button", NotetakerButton, {extends: "button"});
    customElements.define("note-taker", Notetaker);
});

