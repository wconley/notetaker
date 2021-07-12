// Encoding: UTF-8

document.addEventListener("DOMContentLoaded", function() {
    "use strict";
    //var theme = null, configuration = null;
    const toolbarControllers = new Proxy(new Map(), {
        get: (map, id) => {
            if (!map.has(id)) {
                map.set(id, new ToolbarController(id));
            }
            return map.get(id);
        }
    });

    // A simple way to creating enums. Not a constructor! Don't do new Enum. 
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

    // Two simple helper functions for stringify-ing/parsing various attributes. 
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

    // An Enum for the various rules about how/when to set tool property values. 
    const PROPERTYRULES = Enum([
        "FIXED",            // "value"  - Always use value. Property widgets completely disabled. 
        "DEFAULT",          // "value*" - Use value initially each time tool is selected, but allow it to be changed. 
        "VARIABLE",         // "*"      - Always just get property from widgets. 
        "REMEMBER_INIT",    // "value&" - Tool remembers its previous setting when selected. First time, it uses value. 
        "REMEMBER_NOINIT",  // "&"      - Tool remembers its previous setting when selected. First time, it uses widgets. 
    ]);


    // CONTROLLER CLASSES FOR ALL OF THE TOOLS
    // The pass-through tool: Disable all interaction with the notetaker canvas
    class PassThroughTool {
        constructor(button, toolbar) {
            this.toolbar = toolbar;
        }

        activate() {
            for (var propertyGroup of Object.values(this.toolbar.properties)) {
                propertyGroup.disabled = true;
            }
            for (var notetaker of this.toolbar.notetakers.values()) {
                notetaker.style.pointerEvents = "none";
            }
        }

        deactivate() {
            for (var notetaker of this.toolbar.notetakers.values()) {
                notetaker.style.pointerEvents = "auto";
            }
        }
    }

    // An abstract base class for the objects that control all other tools
    class NotetakerTool {
        constructor(button, toolbar, defaults) {
            this.button = button;
            this.toolbar = toolbar;
            this.paperTool = new paper.Tool();
            this.paperTool.onMouseDown = this.onMouseDown.bind(this);
            this.paperTool.onMouseDrag = this.onMouseDrag.bind(this);
            this.paperTool.onMouseUp   = this.onMouseUp.bind(this);
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
                if (toolbar.properties[property].widgets.size === 0) {
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
            for (var property in this.toolbar.properties) {
                var propertyGroup = this.toolbar.properties[property];
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
            this.paperTool.activate();
        }

        setButtonStyle(property, value) {
            value = this.toolbar.properties[property].cssConverter(value);
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
        constructor(button, toolbar, defaults) {
            defaults = {color: "black", width: 1, opacity: 1, dash: [], 
                        ...defaults};
            super(button, toolbar, defaults);
        }

        get dash_scaled() {
            return this.dash.map(a => a * (this.width + 1)/2);
        }
    }

    // The pen tool: Draw freehand lines/curves
    class PenTool extends DrawingTool {
        constructor(button, toolbar) {
            super(button, toolbar, {simplify: 2.5});
        }

        onMouseDown(event) {
            this.toolbar.canvasMouseDown(event.event.target, true);
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
            if (this.simplify >= 0) {
                this.currentPath.simplify(this.simplify);
            }
            this.toolbar.activeNotetaker.addHistory([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The line tool: draw straight lines, optionally snap to increments of pi/4
    class LineTool extends DrawingTool {
        constructor(button, toolbar) {
            super(button, toolbar, {snap: 20});
        }

        onMouseDown(event) {
            this.toolbar.canvasMouseDown(event.event.target, true);
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
            var offset;
            const point = event.point;
            const deltaX = point.x - this.firstPoint.x;
            const deltaY = point.y - this.firstPoint.y;
            const hypotenuse = Math.hypot(deltaX, deltaY);
            const PI4 = Math.PI / 4;
            const root2snap = Math.SQRT2 * this.snap;
            if (root2snap < 0) {
                const theta = Math.round(Math.atan2(deltaY, deltaX) / PI4)*PI4;
                point.x = this.firstPoint.x + hypotenuse * Math.cos(theta);
                point.y = this.firstPoint.y + hypotenuse * Math.sin(theta);
            }
            else if (root2snap > 0 && hypotenuse >= root2snap) {
                if (Math.abs(deltaY) < this.snap) {
                    point.y = this.firstPoint.y;
                }
                else if (Math.abs(deltaX) < this.snap) {
                    point.x = this.firstPoint.x;
                }
                else if (Math.abs(deltaX - deltaY) < root2snap) {
                    offset = (deltaX + deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y + offset;
                }
                else if (Math.abs(deltaX + deltaY) < root2snap) {
                    offset = (deltaX - deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y - offset;
                }
            }
            this.currentPath.segments = [this.firstPoint, point];
        }

        onMouseUp(event) {
            this.toolbar.activeNotetaker.addHistory([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The rectangle tool: draw rectangles, optionally snap to squares
    class RectangleTool extends DrawingTool {
        constructor(button, toolbar) {
            super(button, toolbar, {snap: 20});
        }

        rectangle(p1, p2) {
            return [p1, new paper.Point(p1.x, p2.y), 
                    p2, new paper.Point(p2.x, p1.y)];
        }

        onMouseDown(event) {
            this.toolbar.canvasMouseDown(event.event.target, true);
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
            var offset;
            const point = event.point;
            const deltaX = point.x - this.firstPoint.x;
            const deltaY = point.y - this.firstPoint.y;
            const hypotenuse = Math.hypot(deltaX, deltaY);
            const root2snap = Math.SQRT2 * this.snap;
            if (root2snap < 0) {
                if (Math.abs(deltaY) < Math.abs(deltaX)) {
                    point.y = this.firstPoint.y + 
                            (deltaY > 0 ? 1 : -1) * Math.abs(deltaX);
                }
                else {
                    point.x = this.firstPoint.x + 
                            (deltaX >= 0 ? 1 : -1) * Math.abs(deltaY);
                }
            }
            else if (root2snap > 0 && hypotenuse >= root2snap) {
                if (Math.abs(deltaX - deltaY) < root2snap) {
                    offset = (deltaX + deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y + offset;
                }
                else if (Math.abs(deltaX + deltaY) < root2snap) {
                    offset = (deltaX - deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y - offset;
                }
            }
            this.currentPath.segments = this.rectangle(this.firstPoint, point);
        }

        onMouseUp(event) {
            this.toolbar.activeNotetaker.addHistory([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The ellipse tool: draw ellipses, from center, optionally snap to circles
    class EllipseTool extends DrawingTool {
        constructor(button, toolbar) {
            super(button, toolbar, {snap: 20});
        }

        onMouseDown(event) {
            this.toolbar.canvasMouseDown(event.event.target, true);
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
            var xradius = Math.abs(point.x - this.center.x);
            var yradius = Math.abs(point.y - this.center.y);
            const hypotenuse = Math.hypot(xradius, yradius);
            const root2snap = Math.SQRT2 * this.snap;
            if (root2snap < 0) {
                xradius = yradius = hypotenuse;
            }
            else if (root2snap > 0 && hypotenuse >= root2snap && 
                    Math.abs(xradius - yradius) < root2snap) {
                xradius = yradius = (xradius + yradius) / 2;
            }
            var newPath = new paper.Path.Ellipse({center: this.center, 
                                                  radius: [xradius, yradius]});
            this.currentPath.segments = newPath.segments;
            newPath.remove();
        }

        onMouseUp(event) {
            this.toolbar.activeNotetaker.addHistory([this.currentPath.index, 
                    this.currentPath]);
        }
    }

    // The delete tool: delete whole strokes (lines/curves/rectangles/etc)
    class DeleteTool extends NotetakerTool {
        constructor(button, toolbar) {
            super(button, toolbar, {width: 4});
            this.hitTestOptions = {fill: true, stroke: true, segments: true};
        }

        onMouseDown(event) {
            this.toolbar.canvasMouseDown(event.event.target, true);
            this.hitTestOptions.tolerance = this.width;
            this.toBeRemoved = {};
            this.removeItemsAt(event.point);
        }

        onMouseDrag(event) {
            this.removeItemsAt(event.point);
        }

        removeItemsAt(point) {
            const results = this.toolbar.activeNotetaker.project.hitTestAll(
                    point, this.hitTestOptions);
            for(const {item} of results) {
                if (!item.data.ignore && !this.toBeRemoved[item.index]) {
                    item.data.originalOpacity = item.opacity;
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
                item.opacity = item.data.originalOpacity;
            }
            if (histItem.length > 0) {
                this.toolbar.activeNotetaker.addHistory(histItem);
            }
        }
    }

    // The erase tool: cover up previously drawn ink, and also divide paths
    class EraseTool extends NotetakerTool {
        constructor(button, toolbar) {
            super(button, toolbar, {width: 10, simplify: 2.5});
        }

        onMouseDown(event) {
            this.toolbar.canvasMouseDown(event.event.target, true);
            this.currentPath = new paper.Path({
                blendMode: "destination-out", 
                segments: [event.point], 
                strokeColor: "black", 
                strokeWidth: this.width, 
                strokeCap: "round", 
                strokeJoin: "round", 
                opacity: 1, 
            });
            this.currentPath.data.ignore = true;
        }

        onMouseDrag(event) {
            this.currentPath.add(event.point);
        }

        onMouseUp(event) {
            var i, path, intersections;
            if (this.simplify >= 0) {
                this.currentPath.simplify(this.simplify);
            }
            const histItem = [this.currentPath.index, this.currentPath];
            // Now split every other path that this erase-path intersects
            const activeLayer = this.toolbar.activeNotetaker.project.activeLayer;
            for(i = 0; path = activeLayer.children[i]; i++) {
                // Ignore other erase-paths
                if (path.blendMode === "destination-out") {
                    continue;
                }
                // Ignore paths that this erase-path doesn't intersect
                intersections = path.getIntersections(this.currentPath);
                if (intersections.length === 0) {
                    continue;
                }
                const pathCopy = path.clone({insert: false, deep: false});
                intersections = pathCopy.getIntersections(this.currentPath);
                const newPaths = [];
                for(const intersection of intersections.reverse()) {
                    const newPath = pathCopy.splitAt(intersection);
                    if (newPath && newPath !== pathCopy) {
                        newPaths.push(newPath);
                    }
                }
                if (newPaths.length || (path.closed && !pathCopy.closed)) {
                    const index = path.index;
                    histItem.push(-index - 1, path);
                    path.remove();
                    newPaths.push(pathCopy);
                    newPaths.forEach((newPath, j) => {
                        histItem.push(index + j, newPath);
                    });
                    activeLayer.insertChildren(index, newPaths);
                    i = pathCopy.index;
                }
            }
            this.toolbar.activeNotetaker.addHistory(histItem);
        }
    }

    // The laser-pointer tool: show a colored dot under the pointer
    class LaserPointerTool extends NotetakerTool {
        constructor(button, toolbar) {
            super(button, toolbar, {color: "red", width: 10, opacity: 0.6, 
                    fade: {duration: 500, easing: "easeInQuad"}});
            this.pointMap = new WeakMap()
            this.point = null;
        }

        onMouseDown(event) {
            const canvas = event.event.target;
            this.toolbar.canvasMouseDown(canvas, false);
            this.point = this.pointMap.get(canvas);
            if (!this.point) {
                this.point = new paper.Path({
                    strokeCap: "round", 
                    strokeJoin: "round", 
                });
                this.point.addTo(this.toolbar.activeNotetaker.pointerLayer);
                this.pointMap.set(canvas, this.point);
            }
            else if (this.point.data.tween) {
                this.point.data.tween.stop();
                this.point.data.tween = null;
            }
            this.point.segments = [event.point, event.point];
            this.point.strokeColor = this.color;
            this.point.strokeWidth = this.width;
            this.point.opacity = this.opacity;
        }

        onMouseDrag(event) {
            this.point.segments = [event.point, event.point];
        }

        onMouseUp(event) {
            this.point.data.tween = this.point.tween({opacity: 0}, this.fade);
            this.point = null;
        }
    }

    // The "trailing-laser" tool: laser pointer, but with "trails" that fade out
    class TrailingLaserTool extends NotetakerTool {
        constructor(button, notetaker) {
            super(button, notetaker, {color: "red", width: 10, opacity: 0.6, 
                    fade: {duration: 2000, easing: "easeInCubic"}});
            this.pathsMap = new WeakMap();
            this.paths = null;
        }

        onMouseDown(event) {
            const canvas = event.event.target;
            this.toolbar.canvasMouseDown(canvas, false);
            this.paths = this.pathsMap.get(canvas);
            if (!this.paths) {
                this.paths = new paper.CompoundPath({
                    strokeCap: "round", 
                    strokeJoin: "round", 
                });
                this.paths.addTo(this.toolbar.activeNotetaker.pointerLayer);
                this.pathsMap.set(canvas, this.paths);
            }
            else if (this.paths.data.tween) {
                this.paths.data.tween.stop();
                this.paths.data.tween = null;
            }
            this.paths.strokeColor = this.color;
            this.paths.strokeWidth = this.width;
            this.paths.opacity = this.opacity;
            this.paths.moveTo(event.point);
            this.paths.lastChild.add(event.point);
        }

        onMouseDrag(event) {
            this.paths.lastChild.add(event.point);
        }

        onMouseUp(event) {
            this.paths.data.tween = this.paths.tween({opacity: 0}, this.fade);
            this.paths.data.tween.then(this.finish.bind(this));
        }

        finish() {
            this.paths.data.tween = null;
            this.paths.removeChildren();
        }
    }
    // END OF CONTROLLER CLASSES FOR ALL OF THE TOOLS


    // Abstract base class for a set of mutually exclusive widgets
    class WidgetGroup {
        constructor() {
            this.widgets = new Map();
            this._selected = null;
        }

        add(widget, data) {
            this.widgets.set(widget, data);
            widget.addEventListener("click", this.click.bind(this), false);
            if (this.widgets.size === 1 || widget.classList.contains("selected")) {
                this.select(widget);
            }
        }

        select(widget) {
            widget.classList.add("selected");
            if (!this.widgets.has(widget) || widget === this._selected) {
                return;
            }
            if (this._selected) {
                this._selected.classList.remove("selected");
            }
            this._selected = widget;
        }

        get selected() {
            return this._selected;
        }
    }

    // click function for a toolButtonGroup. (Worth creating a whole subclass?) 
    class ToolButtonGroup extends WidgetGroup {
        click(event) {
            var button = event.currentTarget;
            if (this._selected !== button) {
                this.widgets.get(this._selected).tool.deactivate();
            }
            this.select(button);
            this.widgets.get(button).tool.activate();
        }

        get currentTool() {
            return this._selected ? this.widgets.get(this._selected).tool : null;
        }
    }

    // WidgetGroup for a set of widgets that control a certain tool property
    class PropertyWidgetGroup extends WidgetGroup {
        constructor(property, toolbarController, cssConverter) {
            super();
            this.property = property;
            this.toolbarController = toolbarController;
            this.cssConverter = cssConverter ? cssConverter : (x => x);
        }

        add(widget) {
            const value = attributeDecode(widget.dataset.value);
            widget.style.setProperty("--value", this.cssConverter(value));
            super.add(widget, {value});
        }

        select(widget) {
            super.select(widget);
            const value = this.cssConverter(this.widgets.get(widget).value);
            this.toolbarController.toolbar.style.setProperty(
                    `--${this.property}`, value);
        }

        click(event) {
            const widget = event.currentTarget;
            this.select(widget);
            const tool = this.toolbarController.toolButtons.currentTool;
            if (tool) {
                tool.setProperty(this.property, this.widgets.get(widget).value);
            }
        }

        get value() {
            if (!this._selected) {
                return null;
            }
            if (!this._selected.classList.contains("selected")) {
                this._selected.classList.add("selected")
            }
            return this.widgets.get(this._selected).value;
        }

        selectValue(value) {
            value = attributeEncode(value);
            for (const [widget, data] of this.widgets) {
                if (attributeEncode(data.value) === value) {
                    this.select(widget);
                    return;
                }
            }
            this._selected.classList.remove("selected");
        }

        set disabled(disabled) {
            for (var widget of this.widgets.keys()) {
                widget.disabled = disabled;
            }
        }
    }


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
        "pass-through-tool":    { element: "button", type: "tool", controller: PassThroughTool }, 
    };

    async function applyTheme(rootElement) {
        const themeUrl = rootElement.dataset.notetakerThemeUrl;
        if (!themeUrl) {
            console.warn(`Notetaker warning: Custom toolbar (id ${rootElement.id}) has no theme specified. The widgets in this toolbar may appear blank.`);
            return;
        }
        const response = await window.fetch(themeUrl);
        const theme = await response.json();
        const selector = "button[data-notetaker-type], input[data-notetaker-type]";
        for (const widget of rootElement.querySelectorAll(selector)) {
            styleWidget(widget, theme);
        }
    }

    function createWidget(type, attributes, selected, theme) {
        if (!(type in widgetTypes)) {
            console.warn(`Notetaker warning: unknown widget type "${type}"`);
            return;
        }
        const widget = document.createElement(widgetTypes[type].element);
        widget.dataset.notetakerType = type;
        for (var [attribute, value] of Object.entries(attributes)) {
            widget.dataset[attribute] = attributeEncode(value);
        }
        if (selected) {
            widget.className = "selected";
        }
        styleWidget(widget, theme);
        return widget;
    }

    function styleWidget(widget, theme) {
        const type = widget.dataset.notetakerType;
        if (!(type in widgetTypes)) {
            console.warn(`Notetaker warning: unknown widget type "${type}"`);
            return;
        }
        if (widgetTypes[type].type === "property" && 
                !("value" in widget.dataset)) {
            console.warn(`Notetaker warning: ${type} created with no value`);
        }
        if (!(type in theme)) {
            console.warn(`Notetaker warning: ${type} is not in this theme`);
            return;
        }
        widget.innerHTML = theme[type];
    }

    // The controller class for toolbars
    const cssConverters = {
        width: x => (x ** 0.75 / 2), 
        dash: x => (x.length ? x.map(y => y / 3) : [100, 0]), 
    }
    class ToolbarController {
        constructor(id) {
            // Construct a PaperScope for this toolbar. Activated automatically. 
            this.paperScope = new paper.PaperScope();
            this.notetakers = new Map();
            this.activeNotetaker = null;
            this.toolbar = null; // The actual DOM element, for setting styles. 
            this.toolButtons = new ToolButtonGroup();
            this.undoButtons = [];
            this.redoButtons = [];
            // The PropertyWidgetGroups are created automatically as needed. 
            this.properties = new Proxy({}, {
                get: (object, property) => {
                    if (!(property in object)) {
                        object[property] = new PropertyWidgetGroup(
                                property, this, cssConverters[property]);
                    }
                    return object[property];
                }
            });
            // Check whether or not to call setup() now, or wait: 
            if (!id) { // A <note-taker> element with an attached toolbar. Wait. 
                return;
            }
            let rootElement = document.getElementById(id);
            if (!rootElement || (rootElement instanceof NotetakerToolbar)) {
                // The NotetakerToolbar will have to call our .setup() later. 
                return;
            }
            // The toolbar is an existent HTML element. Call .setup() now. 
            applyTheme(rootElement).catch(error => { console.error(error); });
            this.setup(rootElement);
        }

        // The following method should be called *after* the toolbar's DOM is 
        // fully populated. You pass it a root DOM node that contains all the 
        // toolbar widgets. It queries the DOM to find and set up those widgets. 
        setup(rootElement) {
            this.toolbar = rootElement;
            const selector = "button[data-notetaker-type], input[data-notetaker-type]";
            for (const widget of rootElement.querySelectorAll(selector)) {
                const widgetInfo = widgetTypes[widget.dataset.notetakerType];
                switch(widgetInfo.type) {
                    case "property":
                        let propertyGroup = this.properties[widgetInfo.property];
                        propertyGroup.add(widget);
                        break;
                    case "tool":
                        this.toolButtons.add(widget, {});
                        break;
                    case "undo":
                        this.undoButtons.push(widget);
                        widget.disabled = true;
                        widget.addEventListener("click", () => {
                            this.activeNotetaker.undo();
                        }, false);
                        break;
                    case "redo":
                        this.redoButtons.push(widget);
                        widget.disabled = true;
                        widget.addEventListener("click", () => {
                            this.activeNotetaker.redo();
                        }, false);
                        break;
                }
            }
            // Now create all the NotetakerTools for the tool buttons. 
            // Note: This must be done *after* creating the property widgets, 
            // because the tool constructor checks to see how many property 
            // widgets there are for each property, and acts accordingly. 
            this.paperScope.activate(); // <-- IMPORTANT! To create paper.Tools
            for (const [button, data] of this.toolButtons.widgets) {
                const widgetInfo = widgetTypes[button.dataset.notetakerType];
                data.tool = new widgetInfo.controller(button, this);
            }
            this.toolButtons.currentTool.activate();
        }

        // This is called by the <note-taker> to add itself (and its canvas) to 
        // our this.notetakers map. It also creates the paper.Project for that 
        // <note-taker> and returns it. And it (re-)activates the selected tool, 
        // if any, which is important in case that tool is the PassThroughTool. 
        addNotetaker(canvas, notetaker) {
            this.notetakers.set(canvas, notetaker);
            this.paperScope.activate();
            const project = new paper.Project(canvas);
            const tool = this.toolButtons.currentTool;
            if (tool instanceof PassThroughTool) {
                tool.activate();
            }
            return project;
        }

        activate(notetaker) {
            this.activeNotetaker = notetaker;
            notetaker.project.activate();
            this.updateUndoRedo(notetaker);
        }

        canvasMouseDown(canvas, noMoreRedos) {
            const notetaker = this.notetakers.get(canvas);
            if (noMoreRedos) {
                notetaker.noMoreRedos();
            }
            this.activate(notetaker);
        }

        updateUndoRedo(notetaker) {
            if (notetaker !== this.activeNotetaker) {
                return;
            }
            const undoDisabled = notetaker.undoDisabled;
            const redoDisabled = notetaker.redoDisabled;
            for (const button of this.undoButtons) {
                button.disabled = undoDisabled;
            }
            for (const button of this.redoButtons) {
                button.disabled = redoDisabled;
            }
        }
    }

    class NotetakerToolbar extends HTMLElement {
        constructor() {
            super();
            this.controller = null;
        }

        connectedCallback() {
            if (this._connected) {
                return;
            }
            this._connected = true;
            if (!this.controller) {
                const id = this.getAttribute("id");
                if (!id) {
                    throw new ReferenceError(
                            "<notetaker-toolbar>: id not specified");
                }
                this.controller = toolbarControllers[id];
            }
            this.setup().catch(error => { console.error(error); });
        }

        // Fetch the config and the theme (JSON data), and populate the DOM. 
        async setup() {
            var response;
            const configUrl = this.getAttribute("config-url");
            var themeUrl = this.getAttribute("theme-url");
            if (!configUrl) {
                throw new ReferenceError(
                        "<notetaker-toolbar>: config-url not specified");
            }
            // Fetch the config and the theme. 
            response = await window.fetch(configUrl);
            const config = await response.json();
            if (!themeUrl) {
                themeUrl = config.theme;
            }
            response = await window.fetch(themeUrl);
            const theme = await response.json();
            // Adjust attributes for position/orientation of toolbar
            const positions = new Map([["top", "horizontal"], ["bottom", 
                    "horizontal"], ["left", "vertical"], ["right", "vertical"]]);
            if (this.parentNode instanceof ShadowRoot && 
                    this.parentNode.host instanceof Notetaker) {
                // This is an attached toolbar, so we must set the position
                let position = this.parentNode.host.getAttribute("toolbar");
                if (!positions.has(position)) {
                    position = config.position;
                    if (!positions.has(position)) {
                        position = "top";
                    }
                    this.parentNode.host.setAttribute("toolbar", position);
                }
                this.setAttribute("orientation", positions.get(position));
            }
            else {
                // This is a detached toolbar, so we just set the orientation
                const orientations = new Set(positions.values());
                let orientation = this.getAttribute("orientation");
                if (!orientations.has(orientation)) {
                    orientation = config.orientation;
                    if (!orientations.has(orientation)) {
                        orientation = positions.get(config.position) || 
                                "horizontal";
                    }
                    this.setAttribute("orientation", orientation);
                }
            }
            // Set up an inner style sheet, in the Shadow DOM
            //     Note: We may eventually allow for <link> stylesheets as well
            const style = document.createElement("style");
            style.textContent = theme.stylesheet;
            // Now create the toolbar, and populate it
            const toolbar = document.createElement("div");
            for (const part of ["start", "middle", "end"]) {
                const toolbar_part = document.createElement("div");
                if (part in config) {
                    for (let widget of config[part]) {
                        let {type, ...attributes} = widget;
                        let selected = type.endsWith("*");
                        type = selected ? type.slice(0, -1) : type;
                        widget = createWidget(type, attributes, selected, theme);
                        toolbar_part.appendChild(widget);
                    }
                }
                toolbar.appendChild(toolbar_part);
            }
            this.attachShadow({mode: "open"});
            this.shadowRoot.append(style, toolbar);
            this.controller.setup(toolbar);
        }
    }

    const NOTETAKER_STYLESHEET = `
    :host {
        direction: ltr;
        writing-mode: horizontal-tb;
        display: flex;
    }
    :host([toolbar=top]) {
        flex-direction: column;
    }
    :host([toolbar=bottom]) {
        flex-direction: column-reverse;
    }
    :host([toolbar=left]) {
        flex-direction: row;
    }
    :host([toolbar=right]) {
        flex-direction: row-reverse;
    }
    :host > notetaker-toolbar {
        pointer-events: auto;
        flex: none;
    }
    :host > canvas {
        flex: auto;
    }
    :host.hidden > canvas {
        visibility: hidden;
    }
    `;
    class Notetaker extends HTMLElement {
        constructor() {
            super();
            this.project = null;
            this.pointerLayer = null;
            this.history = [];
            this.historyPosition = 0;
            this.toolbarController = null;
        }

        connectedCallback() {
            if (this._connected) {
                return;
            }
            this._connected = true;
            const configUrl = this.getAttribute("config-url");
            const toolbarId = this.getAttribute("toolbar-id");
            if (!configUrl && !toolbarId) {
                throw new ReferenceError("<note-taker>: neither config-url " + 
                        "nor toolbar-id specified");
            }
            this.attachShadow({mode: "open"});
            const style = document.createElement("style");
            style.textContent = NOTETAKER_STYLESHEET;
            const canvas = document.createElement("canvas");
            // If config-url is given, create an attached <notetaker-toolbar>. 
            if (configUrl) {
                this.toolbarController = new ToolbarController();
                const toolbar = document.createElement("notetaker-toolbar");
                toolbar.setAttribute("config-url", configUrl);
                const themeUrl = this.getAttribute("theme-url");
                if (themeUrl) {
                    toolbar.setAttribute("theme-url", themeUrl);
                }
                toolbar.controller = this.toolbarController;
                this.shadowRoot.append(style, toolbar, canvas);
            }
            // If toolbar-id is given, we just use that ToolbarController. 
            else {
                this.toolbarController = toolbarControllers[toolbarId];
                this.shadowRoot.append(style, canvas);
            }
            // Now that we've got our canvas, we can set up PaperJS
            this.project = this.toolbarController.addNotetaker(canvas, this);
            const mainLayer = new paper.Layer();
            this.pointerLayer = new paper.Layer();
            mainLayer.activate();
        }

        noMoreRedos() {
            this.history.length = this.historyPosition;
        }

        addHistory(histItem) {
            this.history.push(histItem);
            this.historyPosition++;
            this.toolbarController.updateUndoRedo(this);
        }

        get undoDisabled() {
            return this.historyPosition === 0;
        }

        get redoDisabled() {
            return this.historyPosition === this.history.length;
        }

        undo() {
            if (this.historyPosition === 0) {
                alert("Nothing to undo!") // This shouldn't ever happen
            }
            const histItem = this.history[--this.historyPosition];
            const activeLayer = this.project.activeLayer;
            // REVERSE the effects of the "Delta" in histItem
            for(let i = histItem.length - 2; i >= 0; i -= 2) {
                if (histItem[i] >= 0) {
                    // Item histItem[i+1] was added at index histItem[i]. 
                    // Remove it. 
                    activeLayer.children[histItem[i]].remove();
                }
                else {
                    // Item histItem[i+1] was removed from index 
                    // -histItem[i] - 1. Re-add it. 
                    activeLayer.insertChild(-histItem[i] - 1, histItem[i + 1]);
                }
            }
            this.toolbarController.updateUndoRedo(this);
        }

        redo() {
            if (this.historyPosition >= this.history.length) {
                alert("Nothing to redo!") // This shouldn't ever happen
            }
            const histItem = this.history[this.historyPosition++];
            const activeLayer = this.project.activeLayer;
            // REAPPLY the effects of the "Delta" in histItem
            for(let i = 0; i < histItem.length; i += 2) {
                if (histItem[i] >= 0) {
                    // Add object histItem[i + 1] at index histItem[i]. 
                    activeLayer.insertChild(histItem[i], histItem[i + 1]);
                }
                else {
                    // Remove object at index -histItem[i] - 1. (Object should 
                    // be the same as histItem[i + 1].) 
                    activeLayer.children[-histItem[i] - 1].remove();
                }
            }
            this.toolbarController.updateUndoRedo(this);
        }

        logHistoryDebugInfo() {
            console.debug("Current paths on active layer:");
            console.debug("    " + this.project.activeLayer.children.join(", "));
            console.debug("Current history stack:");
            for (var i = 0; i <= this.history.length; i++) {
                if (i > 0) {
                    console.debug(`    ${i-1}: ${this.history[i-1].join(", ")}`);
                }
                if (this.historyPosition === i) {
                    console.debug("    <current top of history stack>    " + 
                                  "(above can be undone, below can be redone)");
                }
            }
        }
    }

    // Define our custom element! 
    customElements.define("notetaker-toolbar", NotetakerToolbar);
    customElements.define("note-taker", Notetaker);
});

