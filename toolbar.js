"use strict";

document.addEventListener("DOMContentLoaded", function() {
    const PROPERTYRULES = Enum([
        "FIXED",            // "value"  - Always use value. Property widgets completely disabled. 
        "DEFAULT",          // "value*" - Use value initially each time tool is selected, but allow it to be changed. 
        "VARIABLE",         // "*"      - Always just get property from widgets. 
        "REMEMBER_INIT",    // "value&" - Tool remembers its previous value when selected. First time, it uses value. 
        "REMEMBER_NOINIT",  // "&"      - Tool remembers its previous value when selected. First time, it uses widgets. 
    ]);

    paper.setup(document.getElementById("notetaker_canvas"));
    const activeLayer = new paper.Layer();
    const pointerLayer = new paper.Layer();
    activeLayer.activate();

    /* A simple utility for creating enums */
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
                throw new ReferenceError(`Enum ${object} does not contain an item named ${property}`);
            }
        }
        return Object.freeze(new Proxy(myenum, handler));
    }

    /* Abstract base class for a set of mutually exclusive widgets */
    class WidgetGroup {
        constructor(widgets = []) {
            this.widgets = new Set();
            this._selected = null;
            for (var widget of widgets) {
                WidgetGroup.prototype.add.call(this, widget); // No overrides!
            }
        }

        add(widget, selected = false) {
            this.widgets.add(widget);
            widget.addEventListener("click", this.click.bind(this), false);
            if (selected || this.widgets.size === 1 || 
                widget.classList.contains("selected")) {
                this.select(widget);
            }
        }

        click(event) {
            var widget = event.currentTarget;
            this.select(widget);
            widget.activate();
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
    }

    /* WidgetGroup that's specifically for ToolButtons */
    class ToolButtonGroup extends WidgetGroup {
        click(event) {
            var button = event.currentTarget;
            if (this._selected !== button) {
                this._selected.tool.deactivate();
            }
            this.select(button);
            button.activate();
        }

        get current() {
            return this._selected;
        }
    }

    /* WidgetGroup for a set of widgets that control a certain tool property */
    class PropertyWidgetGroup extends WidgetGroup {
        constructor(widgets = [], property, cssConverter) {
            super(widgets);
            this.property = property;
            this.cssConverter = cssConverter ? cssConverter : (x => x);
            if (this._selected) {
                this.select(this._selected);
            }
        }

        select(widget) {
            super.select(widget);
            toolbar.style.setProperty(`--${this.property}`, 
                    this.cssConverter(widget.value));
        }

        get value() {
            if (!this._selected) {
                return null;
            }
            return this._selected.value;
        }

        selectValue(value) { // Currently borked
            value = JSON.stringify(value);
            for (var widget of this.widgets) {
                if (JSON.stringify(widget.value) === value) {
                    this.select(widget);
                    break;
                }
            }
        }

        set disabled(disabled) {
            for (var widget of this.widgets) {
                widget.disabled = disabled;
            }
        }
    }

    const toolbar = document.getElementById("notetaker_toolbar");
    const toolbar_start = document.getElementById("notetaker_toolbar_start");
    const toolbar_middle = document.getElementById("notetaker_toolbar_middle");
    const toolbar_end = document.getElementById("notetaker_toolbar_end");

    const cssConverters = {
        width: x => (x ** 0.75 / 2), 
        dash: x => (x.length ? x.map(y => y / 3) : [100, 0]), 
    }
    const properties = new Proxy({}, {get: (object, property) => {
        if (!(property in object)) {
            object[property] = new PropertyWidgetGroup([], property, cssConverters[property]);
        }
        return object[property];
    }});


    /* The undo and redo buttons, and the History object */
    window.customElements.define("notetaker-undo-button", 
        class NotetakerUndoButton extends HTMLButtonElement {
            constructor() {
                super();
            }

            connectedCallback() {
                this.innerHTML = `
                    <svg viewBox="0 0 10 10">
                      <path d="M4,8.5 A2.5,3.5 30 1,0 2.5,4.5 m-0.5,-1.5 l0.5,1.5 1.5,-0.5" fill="none" stroke="black" stroke-width="0.5" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-redo-button", 
        class NotetakerRedoButton extends HTMLButtonElement {
            constructor() {
                super();
            }

            connectedCallback() {
                this.innerHTML = `
                    <svg viewBox="0 0 10 10">
                      <path d="M6,8.5 A2.5,3.5 -30 1,1 7.5,4.5 m0.5,-1.5 l-0.5,1.5 -1.5,-0.5" fill="none" stroke="black" stroke-width="0.5" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    class History {
        constructor() {
            var button;
            this.history = [];
            this.position = 0;
            this.undoButtons = document.querySelectorAll('button[is="notetaker-undo-button"]')
            this.redoButtons = document.querySelectorAll('button[is="notetaker-redo-button"]')
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

        noMoreRedos() { /* Do we really want this as a separate function? */
            /* Keeping it as a separate function requires that every tool call 
             * this in addition to calling add()
             * AFAICT, it should work in all cases to just roll this into add()
             * The only advantage of having this separate is that tools can (and 
             * currently do) call this onMouseDown, so that redos are disabled 
             * as soon as an action is started, whereas the new history item 
             * isn't added to the history until onMouseUp. Perhaps with keyboard 
             * shortcuts for redo, this could actually matter at some point. */
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
            if(this.position === 0) {
                alert("Nothing to undo!") // This shouldn't ever happen
            }
            histItem = this.history[--this.position];
            // REVERSE the effects of the "Delta" in histItem
            for(i = histItem.length - 2; i >= 0; i -= 2) {
                if(histItem[i] >= 0) {
                    // Item histItem[i+1] was added at index histItem[i]. Remove it.
                    activeLayer.children[histItem[i]].remove();
                }
                else {
                    // Item histItem[i+1] was removed from index -histItem[i] - 1. Re-add it.
                    activeLayer.insertChild(-histItem[i] - 1, histItem[i+1]);
                }
            }
            if(this.position === 0) {
                this.undoDisabled = true;
            }
            this.redoDisabled = false;
        }

        redo() {
            var histItem, i;
            if(this.position >= this.history.length) {
                alert("Nothing to redo!") // This shouldn't ever happen
            }
            histItem = this.history[this.position++];
            // REAPPLY the effects of the "Delta" in histItem
            for(i = 0; i < histItem.length; i += 2) {
                if(histItem[i] >= 0) {
                    // Add object histItem[i+1] at index histItem[i]
                    activeLayer.insertChild(histItem[i], histItem[i+1]);
                }
                else {
                    // Remove object at index -histItem[i] - 1 (object should be the same as histItem[i+1])
                    activeLayer.children[-histItem[i] - 1].remove();
                }
            }
            this.undoDisabled = false;
            if(this.position === this.history.length) {
                this.redoDisabled = true;
            }
        }
    }


    // A simple helper function for parsing the property rules
    function propertyParse(value) {
        try {
            return JSON.parse(value);
        }
        catch (error) {
            return value;
        }
    }


    /* The four types of “property buttons”: color, stroke width, opacity, and dash pattern */
    class PropertyButton extends HTMLButtonElement {
        constructor() {
            super();
            this.initialized = false;
            //this._value = null;
        }

        get value() {
            //if (this._value === null) {
                //this._value = propertyParse(this.getAttribute("value"));
            //}
            return this._value;
        }

        connectedCallback() {
            if (!this.initialized) {
                this._value = propertyParse(this.getAttribute("value"));
                this.style.setProperty("--value", 
                        properties[this.property].cssConverter(this._value));
                this.innerHTML = this.buttonContents;
                this.initialized = true;
            }
        }

        activate() {
            var current = toolButtons.current;
            if (current) {
                current.tool.setProperty(this.property, this.value);
            }
        }
    }

    window.customElements.define("notetaker-color-button", 
        class NotetakerColorButton extends PropertyButton {
            constructor() {
                super();
                this.property = "color";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <rect x="1" y="1" width="8" height="8" rx="1" ry="1" style="fill: var(--value); stroke: none;" />
                    </svg>
                `;
            }

            get CSSvalue() {
                return this.value;
            }
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-width-button", 
        class NotetakerWidthButton extends PropertyButton {
            constructor() {
                super();
                this.property = "width";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M5,5 5,5" style="fill: none; stroke: black; stroke-width: calc(var(--value) * 2px); stroke-linecap: round;" />
                    </svg>
                `;
            }

            get CSSvalue() {
                return (this.value ** 0.75 / 2).toString();
            }
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-opacity-button", 
        class NotetakerOpacityButton extends PropertyButton {
            constructor() {
                super();
                this.property = "opacity";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <rect x="0" y="0" width="10" height="10" fill="url(#transparent-background-pattern)" style="opacity: 0.4;" />
                      <circle cx="5" cy="5" r="4" style="fill: black; stroke:none; opacity: ${this.value};" />
                    </svg>
                `;
            }

            get CSSvalue() {
                return this.value.toString();
            }
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-dash-pattern-button", 
        class NotetakerDashPatternButton extends PropertyButton {
            constructor() {
                super();
                this.property = "dash";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M5,0 V10" stroke="black" stroke-width="0.5" stroke-dasharray="${this.value.map(x => x / 3)}" />
                    </svg>
                `;
            }

            get CSSvalue() {
                return this.value.map(x => x / 3).toString();
            }
        }, 
        {extends: "button"}
    );


    /* Now all the various “tool buttons” */
    // An abstract base class for the CONTROLLER of most tool buttons
    class NotetakerTool {
        constructor(button, defaults) {
            var property, rule, ruleType, ruleValue;
            this.button = button;
            this.paperTool = null;
            this.rules = {};
            for (property in defaults) {
                rule = button.getAttribute(property) || "*";
                if (rule === "*") {
                    ruleType = PROPERTYRULES.VARIABLE;
                    ruleValue = null;
                }
                else if (rule.endsWith("*")) {
                    ruleType = PROPERTYRULES.DEFAULT;
                    ruleValue = propertyParse(rule.slice(0, -1));
                }
                else if (rule === "&") {
                    ruleType = PROPERTYRULES.REMEMBER_NOINIT;
                    ruleValue = null;
                }
                else if (rule.endsWith("&")) {
                    ruleType = PROPERTYRULES.REMEMBER_INIT;
                    ruleValue = propertyParse(rule.slice(0, -1));
                }
                else {
                    ruleType = PROPERTYRULES.FIXED;
                    ruleValue = propertyParse(rule);
                }
                this.rules[property] = {
                    ruleType: ruleType, 
                    ruleValue: ruleValue, 
                    defaultValue: defaults[property]
                };
                this[property] = null;
                if(ruleValue !== null) {
                    button.style.setProperty(`--${property}`, 
                            properties[property].cssConverter(ruleValue));
                }
            }
        }

        activate() {
            for (var [property, rule] of Object.entries(this.rules)) {
                switch (rule.ruleType) {
                    case PROPERTYRULES.VARIABLE:
                        // Always get value from currently selected widget
                        properties[property].disabled = false;
                        this[property] = properties[property].value;
                        break;
                    case PROPERTYRULES.DEFAULT:
                        // Use the ruleValue, but allow it to be changed. 
                        properties[property].disabled = false;
                        this[property] = rule.ruleValue;
                        properties[property].selectValue(this[property]);
                        break;
                    case PROPERTYRULES.REMEMBER_NOINIT:
                        // Keep value as it is... unless null (first activation)
                        properties[property].disabled = false;
                        if (this[property] === null) {
                            this[property] = properties[property].value;
                        }
                        else {
                            properties[property].selectValue(this[property]);
                        }
                        break;
                    case PROPERTYRULES.REMEMBER_INIT:
                        // Keep value as it is... unless null (first activation)
                        properties[property].disabled = false;
                        if (this[property] === null) {
                            this[property] = rule.ruleValue;
                        }
                        properties[property].selectValue(this[property]);
                        break;
                    case PROPERTYRULES.FIXED:
                        // Use the ruleValue, and disable changes. 
                        this[property] = rule.ruleValue;
                        properties[property].disabled = true;
                        break;
                }
                if (this[property] === null) {
                    this[property] = rule.defaultValue;
                }
            }
            for (property in properties) {
                if (!(property in this.rules)) {
                    properties[property].disabled = true;
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

        deactivate() {
            for (var [property, rule] of Object.entries(this.rules)) {
                if (rule.ruleType === PROPERTYRULES.DEFAULT) {
                    this.button.style.setProperty(`--${property}`, 
                            properties[property].cssConverter(rule.ruleValue));
                }
            }
        }

        setProperty(property, value) {
            if (this.rules[property].ruleType !== PROPERTYRULES.VARIABLE) {
                this.button.style.setProperty(`--${property}`, 
                        properties[property].cssConverter(value));
            }
            this[property] = value;
        }
    }

    // An abstract parent class for the CONTROLLER of any drawing tool
    class DrawingTool extends NotetakerTool {
        constructor(button) {
            super(button, {color: "black", width: 1, opacity: 1, dash: []});
        }

        get dash_scaled() {
            return this.dash.map(a => a * (this.width + 1)/2);
        }
    }


    // The pen tool (CONTROLLER)
    class PenTool extends DrawingTool {
        onMouseDown(event) {
            history.noMoreRedos();
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
            history.add([this.currentPath.index, this.currentPath]);
        }
    }


    // The line tool (CONTROLLER)
    class LineTool extends DrawingTool {
        constructor(button) {
            super(button);
            this.snapTolerance = 20; // Set to -1 to disable snap
            this.firstPoint = null;
        }

        onMouseDown(event) {
            history.noMoreRedos();
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
            if(snap > 0 && deltaX * deltaX + deltaY * deltaY >= 2*snap*snap) {
                if(Math.abs(deltaY) < snap) {
                    point.y = this.firstPoint.y;
                }
                else if(Math.abs(deltaX) < snap) {
                    point.x = this.firstPoint.x;
                }
                else if(Math.abs(deltaX - deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX + deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y + offset;
                }
                else if(Math.abs(deltaX + deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX - deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y - offset;
                }
            }
            this.currentPath.segments = [this.firstPoint, point];
        }

        onMouseUp(event) {
            history.add([this.currentPath.index, this.currentPath]);
        }
    }


    // The rectangle tool (CONTROLLER)
    class RectangleTool extends DrawingTool {
        constructor(button) {
            super(button);
            this.snapTolerance = 20; // Set to -1 to disable snap
            this.firstPoint = null;
        }

        rectangle(p1, p2) {
            return [p1, new paper.Point(p1.x, p2.y), p2, new paper.Point(p2.x, p1.y)];
        }

        onMouseDown(event) {
            history.noMoreRedos();
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
            if(snap > 0 && deltaX * deltaX + deltaY * deltaY >= 2*snap*snap) {
                if(Math.abs(deltaX - deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX + deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y + offset;
                }
                else if(Math.abs(deltaX + deltaY) < Math.sqrt(2)*snap) {
                    offset = (deltaX - deltaY) / 2;
                    point.x = this.firstPoint.x + offset;
                    point.y = this.firstPoint.y - offset;
                }
            }
            this.currentPath.segments = this.rectangle(this.firstPoint, point);
        }

        onMouseUp(event) {
            history.add([this.currentPath.index, this.currentPath]);
        }
    }


    // The rectangle tool (CONTROLLER)
    class EllipseTool extends DrawingTool {
        constructor(button) {
            super(button);
            this.snapTolerance = 20; // Set to -1 to disable snap
            this.center = null;
        }

        onMouseDown(event) {
            history.noMoreRedos();
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
            var point = event.point;
            var xradius = Math.abs(point.x - this.center.x);
            var yradius = Math.abs(point.y - this.center.y);
            var snap = this.snapTolerance;
            if(snap > 0 && xradius * xradius + yradius * yradius >= 2*snap*snap 
               && Math.abs(xradius - yradius) < Math.sqrt(2)*snap) {
                xradius = yradius = (xradius + yradius) / 2;
            }
            var newPath = new paper.Path.Ellipse({center: this.center, 
                                                  radius: [xradius, yradius]});
            this.currentPath.segments = newPath.segments;
            newPath.remove();
        }

        onMouseUp(event) {
            history.add([this.currentPath.index, this.currentPath]);
        }
    }


    // The delete tool (CONTROLLER)
    class DeleteTool extends NotetakerTool {
        constructor(button) {
            super(button, {width: 4});
            this.hitTestOptions = {fill: true, stroke: true, segments: true};
        }

        onMouseDown(event) {
            history.noMoreRedos();
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
                if(!item.ignore && !this.toBeRemoved[item.index]) {
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
            if(histItem.length > 0) {
                history.add(histItem);
            }
        }
    }


    // The erase tool (CONTROLLER)
    class EraseTool extends NotetakerTool {
        constructor(button) {
            super(button, {width: 10});
        }

        onMouseDown(event) {
            history.noMoreRedos();
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
            for(i = 0; path = activeLayer.children[i]; i++) {
                if(path.blendMode === "destination-out") {
                    continue;
                }
                let intersections = path.getIntersections(this.currentPath);
                if(intersections.length) {
                    let pathCopy = path.clone({insert: false, deep: false});
                    intersections = pathCopy.getIntersections(this.currentPath);
                    let newPaths = [];
                    for(let intersection of intersections.reverse()) {
                        let newPath = pathCopy.splitAt(intersection);
                        if(newPath) {
                            newPaths.push(newPath);
                        }
                    }
                    if(newPaths.length) {
                        let index = path.index;
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
            }
            history.add(histItem);
        }
    }


    // The laser-pointer tool (CONTROLLER)
    class LaserPointerTool extends NotetakerTool {
        constructor(button) {
            super(button, {color: "red", width: 10, opacity: 0.6, 
                           fade: {duration: 500, easing: "easeInQuad"}});
            this.point = new paper.Path({
                segments: [], 
                strokeCap: "round", 
                strokeJoin: "round", 
            });
            this.point.ignore = true;
            this.point.addTo(pointerLayer);
            this.tween = null;
        }

        onMouseDown(event) {
            if(this.tween) {
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


    // The trailing-laser-pointer tool (CONTROLLER)
    class TrailingLaserTool extends NotetakerTool {
        constructor(button) {
            super(button, {color: "red", width: 10, opacity: 0.6, 
                           fade: {duration: 2000, easing: "easeInCubic"}});
            this.paths = new paper.CompoundPath({
                strokeCap: "round", 
                strokeJoin: "round", 
            });
            this.paths.addTo(pointerLayer);
            this.tween = null;
        }

        onMouseDown(event) {
            if(this.tween) {
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


    const toolClassMap = {
        NotetakerPenTool:           PenTool, 
        NotetakerLineTool:          LineTool, 
        NotetakerRectangleTool:     RectangleTool, 
        NotetakerEllipseTool:       EllipseTool, 
        NotetakerDeleteTool:        DeleteTool, 
        NotetakerEraseTool:         EraseTool, 
        NotetakerLaserPointerTool:  LaserPointerTool, 
        NotetakerTrailingLaserTool: TrailingLaserTool, 
    }

    // An abstract base class for the VIEW of a tool button
    class ToolButton extends HTMLButtonElement {
        constructor() {
            super();
            this.initialized = false;
        }

        connectedCallback() {
            if (!this.initialized) {
                this.innerHTML = this.buttonContents;
                this.tool = new toolClassMap[this.constructor.name](this);
                this.initialized = true;
            }
        }

        activate() {
            this.tool.activate();
        }
    }

    // The pen tool button (VIEW)
    window.customElements.define("notetaker-pen-tool", 
        class NotetakerPenTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M0,10 S3,2 5,5 7,7 12,0" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The line tool button (VIEW)
    window.customElements.define("notetaker-line-tool", 
        class NotetakerLineTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M-3,10 L13,0" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The rectangle tool button (VIEW)
    window.customElements.define("notetaker-rectangle-tool", 
        class NotetakerRectangleTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M1.5,2.5 l7,0 0,5 -7,0 z" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The ellipse tool button (VIEW)
    window.customElements.define("notetaker-ellipse-tool", 
        class NotetakerEllipseTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <circle cx="5" cy="5" r="3" style="fill: none; stroke: var(--color); stroke-width: var(--width); opacity: var(--opacity); stroke-dasharray: var(--dash); stroke-linecap: butt;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The delete tool button (VIEW)
    window.customElements.define("notetaker-delete-tool", 
        class NotetakerDeleteTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M1,2 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,8 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round;" />
                      <path d="M1,5 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round; opacity: 0.3;" />
                      <circle cx="8" cy="5.5" r="1.5" style="fill: gray; stroke: none;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The erase tool button (VIEW)
    window.customElements.define("notetaker-erase-tool", 
        class NotetakerEraseTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M1,2 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,5 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,8 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round;" />
                      <path d="M10,0 3,7" style="fill: none; stroke: white; stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: 0.9;" />
                      <path d="M3,7 3,7" style="fill: none; stroke: gray; stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The laser-pointer tool button (VIEW)
    window.customElements.define("notetaker-laser-pointer-tool", 
        class NotetakerLaserPointerTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M5,5 5,5" style="fill: none; stroke: var(--color); stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: var(--opacity);" />
                      <path d="M1.5,5 l-1.5,0 M8.5,5 l1.5,0 M6.75,8.031 l0.75,1.299 M3.25,8.031 l-0.75,1.299 M6.75,1.969 l0.75,-1.299 M3.25,1.969 l-0.75,-1.299" style="fill: none; stroke: var(--color); stroke-width: 0.5; stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The trailing-laser-pointer tool button (VIEW)
    window.customElements.define("notetaker-trailing-laser-tool", 
        class NotetakerTrailingLaserTool extends ToolButton {
            constructor() {
                super();
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M3,7 L7,3" style="fill: none; stroke: var(--color); stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: var(--opacity);" />
                      <path d="M7,3 7,3"  style="fill: none; stroke: var(--color); stroke-width: calc(var(--width) * 1.5px); stroke-linecap: round; opacity: 1;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );


    var button;
    for (let property of ["color", "width", "opacity", "dash-pattern"]) {
        for (button of document.querySelectorAll(`button[is="notetaker-${property}-button"]`)) {
            properties[button.property].add(button);
        }
    }
    const toolButtons = new ToolButtonGroup(document.querySelectorAll('button[is^="notetaker-"][is$="-tool"]'));

    const colors = ["darkblue", "darkred", "darkgreen", "darkgray", "darkorange", "purple", "cornflowerblue"];
    for (let color of colors) {
        button = document.createElement("button", {is: "notetaker-color-button"});
        button.setAttribute("value", color);
        toolbar_start.appendChild(button);
        properties.color.add(button);
    }

    const toolProperties = [["darkblue", "2", "1", "[]"], 
                            ["darkblue*", "2*", "1*", "[]*"], 
                            ["darkblue&", "2&", "1&", "[]&"], 
                            ["&", "&", "&", "&"]];
    for (let [color, width, opacity, dash] of toolProperties) {
        button = document.createElement("button", {is: "notetaker-pen-tool"});
        button.setAttribute("color", color);
        button.setAttribute("width", width);
        button.setAttribute("opacity", opacity);
        button.setAttribute("dash", dash);
        toolButtons.add(button);
        toolbar_middle.appendChild(button);
    }
    const otherTools = ["pen", "line", "rectangle", "ellipse", "delete", "erase"];
    for (let toolType of otherTools) {
        button = document.createElement("button", {is: `notetaker-${toolType}-tool`});
        button.setAttribute("width", "*");
        if (!(toolType === "delete" || toolType === "erase")) {
            button.setAttribute("color", "*");
            button.setAttribute("opacity", "*");
            button.setAttribute("dash", "*");
        }
        toolButtons.add(button);
        toolbar_middle.appendChild(button);
    }
    button = document.createElement("button", {is: "notetaker-pen-tool"});
    button.setAttribute("color", "lightgreen");
    button.setAttribute("width", "16");
    button.setAttribute("opacity", "0.4");
    button.setAttribute("dash", "[]");
    toolButtons.add(button);
    toolbar_middle.appendChild(button);

    const history = new History();
    toolButtons.current.activate();
    paper.view.draw();
});

