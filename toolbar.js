"use strict";

document.addEventListener("DOMContentLoaded", function() {
    paper.setup(document.getElementById("notetaker_canvas"));

    /* The four types of “property buttons”: color, stroke width, opacity, and dash pattern */
    class PropertyButton extends HTMLButtonElement {
        constructor() {
            super();
            this.initialized = false;
        }

        get value() {
          return this.getAttribute("value");
        }

        connectedCallback() {
            if (!this.initialized) {
                this.innerHTML = this.buttonContents;
                this.initialized = true;
            }
        }

        select() {
            toolButtons.selected.tool.setProperty(this.property, this.value, true);
        }
    }

    window.customElements.define("notetaker-color-button", 
        class extends PropertyButton {
            constructor() {
                super();
                this.property = "color";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <rect x="1" y="1" width="8" height="8" rx="1" ry="1" style="fill: ${this.value}; stroke: none;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-width-button", 
        class extends PropertyButton {
            constructor() {
                super();
                this.property = "width";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <circle cx="5" cy="5" r="${this.value ** 0.75 / 2}" style="fill: black; stroke: none;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-opacity-button", 
        class extends PropertyButton {
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
        }, 
        {extends: "button"}
    );

    window.customElements.define("notetaker-dash-pattern-button", 
        class extends PropertyButton {
            constructor() {
                super();
                this.property = "dash";
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 20 20">
                      <path d="M10,0 V20" stroke="black"${this.value.trim() ? `stroke-dasharray="${this.value}"` : ""} />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );


    /* Now all the various “tool buttons” */
    // An abstract base class for the VIEW of a tool button
    class ToolButton extends HTMLButtonElement {
        constructor() {
            super();
            this.initialized = false;
        }

        connectedCallback() {
            if (!this.initialized) {
                this.innerHTML = this.buttonContents;
                this.initialized = true;
            }
        }

        select() {
            this.tool.select();
        }
    }

    // An abstract base class for the CONTROLLER of most tool buttons
    function NotetakerTool(button, properties) {
        paper.Tool.call(this);
        this.button = button;
        this.properties = properties;
        for (var property of properties) {
            this[property] = null;
            this[`_previous_${property}`] = null;
        }
    }
    NotetakerTool.prototype = Object.create(paper.Tool.prototype);
    NotetakerTool.prototype.constructor = NotetakerTool;

    NotetakerTool.prototype.select = function() {
        for (var property of this.properties) {
            this.setProperty(property, propertyButtons[property].value, false);
        }
        this.activate();
    };

    NotetakerTool.prototype.setProperty = function(property, value, update) {
        if (!this.properties.includes(property)) {
            return;
        }
        const rule = this.button.getAttribute(property);
        if (rule === null) {
            return;
        }
        const previous = `_previous_${property}`;
        const converter = `${property}Converter`;
        if (rule == "*") {
            // Use value exactly as given to us, so do nothing. 
        }
        else if (rule == "&") {
            // If update, then use value as is. Otherwise, use _last_ value. 
            if (update || this[previous] === null) {
                this[previous] = value;
            }
            else {
                value = this[previous];
            }
        }
        else if (rule.endsWith("*")) {
            // If update, use value as is. Otherwise use rule. 
            if (!update) {
                value = rule.slice(0, -1);
            }
        }
        else if (rule.endsWith("&")) {
            // If update, use value as is. Else if _last_ is set, use that. Else use rule. 
            if (update) {
                this[previous] = value;
            }
            else if (this[previous] === null) {
                this[previous] = value = rule.slice(0, -1);
            }
            else {
                value = this[previous];
            }
        }
        else {
            value = rule;
        }
        this[property] = converter in this ? this[converter](value) : value;
        //console.log(`Set property ${property} to ${this[property]} (${this[property].constructor.name})`); // DEBUG
    };
    NotetakerTool.prototype.widthConverter = Number;
    NotetakerTool.prototype.opacityConverter = Number;

    // An abstract parent class for the CONTROLLER of any drawing tool
    function DrawingTool(button) {
        NotetakerTool.call(this, button, ["color", "width", "opacity", "dash"]);
    }
    DrawingTool.prototype = Object.create(NotetakerTool.prototype);
    DrawingTool.prototype.constructor = DrawingTool;
    DrawingTool.prototype.dashConverter = dash => (
            dash.trim() ? dash.trim().split(" ").map(Number) : [] );
    Object.defineProperty(DrawingTool.prototype, "dash_scaled", 
            {get() { return this.dash.map(a => a * (this.width + 1)/2) }});


    // The pen tool button (VIEW)
    window.customElements.define("notetaker-pen-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = PenTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M0,10 S3,2 5,5 7,7 10,2" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The pen tool (CONTROLLER)
    function PenTool(button) {
        DrawingTool.call(this, button);
    }
    PenTool.prototype = Object.create(DrawingTool.prototype);
    PenTool.prototype.constructor = PenTool;

    PenTool.prototype.onMouseDown = function(event) {
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
    };

    PenTool.prototype.onMouseDrag = function(event) {
        this.currentPath.add(event.point);
    };

    PenTool.prototype.onMouseUp = function(event) {
        this.currentPath.simplify(2.5);
        history.add([this.currentPath.index, this.currentPath]);
    };


    // The line tool button (VIEW)
    window.customElements.define("notetaker-line-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = LineTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M0,8 L10,2" style="fill: none; stroke: darkblue; stroke-width: 1; stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The line tool (CONTROLLER)
    function LineTool(button) {
        DrawingTool.call(this, button);
        this.snapTolerance = 20; // Set to -1 to disable snap
        this.firstPoint = null;
    }
    LineTool.prototype = Object.create(DrawingTool.prototype);
    LineTool.prototype.constructor = LineTool;

    LineTool.prototype.onMouseDown = function(event) {
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
    };

    LineTool.prototype.onMouseDrag = function(event) {
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
    };

    LineTool.prototype.onMouseUp = function(event) {
        history.add([this.currentPath.index, this.currentPath]);
    };


    // The rectangle tool button (VIEW)
    window.customElements.define("notetaker-rectangle-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = RectangleTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M1.5,2.5 l7,0 0,5 -7,0 z" style="fill: none; stroke: darkblue; stroke-width: 1; stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The rectangle tool (CONTROLLER)
    function RectangleTool(button) {
        DrawingTool.call(this, button);
        this.snapTolerance = 20; // Set to -1 to disable snap
        this.firstPoint = null;
    }
    RectangleTool.prototype = Object.create(DrawingTool.prototype);
    RectangleTool.prototype.constructor = RectangleTool;

    RectangleTool.prototype.rectangle = function(p1, p2) {
        return [p1, new paper.Point(p1.x, p2.y), p2, new paper.Point(p2.x, p1.y)];
    }

    RectangleTool.prototype.onMouseDown = function(event) {
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
    };

    RectangleTool.prototype.onMouseDrag = function(event) {
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
    };

    RectangleTool.prototype.onMouseUp = function(event) {
        history.add([this.currentPath.index, this.currentPath]);
    };


    // The ellipse tool button (VIEW)
    window.customElements.define("notetaker-ellipse-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = EllipseTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <circle cx="5" cy="5" r="3" style="fill: none; stroke: darkblue; stroke-width: 1; stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The rectangle tool (CONTROLLER)
    function EllipseTool(button) {
        DrawingTool.call(this, button);
        this.snapTolerance = 20; // Set to -1 to disable snap
        this.center = null;
    }
    EllipseTool.prototype = Object.create(DrawingTool.prototype);
    EllipseTool.prototype.constructor = EllipseTool;

    EllipseTool.prototype.onMouseDown = function(event) {
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
    };

    EllipseTool.prototype.onMouseDrag = function(event) {
        var point = event.point;
        var xradius = Math.abs(point.x - this.center.x);
        var yradius = Math.abs(point.y - this.center.y);
        var snap = this.snapTolerance;
        if(snap > 0 && xradius * xradius + yradius * yradius >= 2*snap*snap && 
           Math.abs(xradius - yradius) < Math.sqrt(2)*snap) {
            xradius = yradius = (xradius + yradius) / 2;
        }
        var newPath = new paper.Path.Ellipse({center: this.center, radius: [xradius, yradius]});
        this.currentPath.segments = newPath.segments;
        newPath.remove();
    };

    EllipseTool.prototype.onMouseUp = function(event) {
        history.add([this.currentPath.index, this.currentPath]);
    };


    // The delete tool button (VIEW)
    window.customElements.define("notetaker-delete-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = DeleteTool;
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

    // The delete tool (CONTROLLER)
    function DeleteTool(button) {
        NotetakerTool.call(this, button, ["width"]);
        this.hitTestOptions = {fill: true, stroke: true, segments: true};
    }
    DeleteTool.prototype = Object.create(NotetakerTool.prototype);
    DeleteTool.prototype.constructor = DeleteTool;

    DeleteTool.prototype.onMouseDown = function(event) {
        history.noMoreRedos();
        this.hitTestOptions.tolerance = this.width;
        this.toBeRemoved = {};
        this.removeItemsAt(event.point);
    };

    DeleteTool.prototype.onMouseDrag = function(event) {
        this.removeItemsAt(event.point);
    };

    DeleteTool.prototype.removeItemsAt = function(point) {
        var results = paper.project.hitTestAll(point, this.hitTestOptions);
        for(var result of results) {
            var item = result.item;
            if(!item.ignore && !this.toBeRemoved[item.index]) {
                item.opacity *= 0.4;
                this.toBeRemoved[item.index] = item;
            }
        }
    };

    DeleteTool.prototype.onMouseUp = function(event) {
        var histItem = [];
        for(var item of Object.values(this.toBeRemoved)) {
            histItem.push(-item.index - 1, item)
            item.remove();
            item.opacity /= 0.4;
        }
        if(histItem.length > 0) {
            history.add(histItem);
        }
    };


    // The erase tool button (VIEW)
    window.customElements.define("notetaker-erase-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = EraseTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M1,2 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,5 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0 M1,8 q1,-2 2,0 1,2 2,0 1,-2 2,0 1,2 2,0" style="fill: none; stroke: black; stroke-width: 1; stroke-linecap: round;" />
                      <path d="M10,0 3,7" style="fill: none; stroke: white; stroke-width: 5; stroke-linecap: round; opacity: 0.9;" />
                      <circle cx="3" cy="7" r="2.5" style="fill: gray; stroke: none;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The erase tool (CONTROLLER)
    function EraseTool(button) {
        NotetakerTool.call(this, button, ["width"]);
    }
    EraseTool.prototype = Object.create(NotetakerTool.prototype);
    EraseTool.prototype.constructor = EraseTool;

    EraseTool.prototype.onMouseDown = function(event) {
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
    };

    EraseTool.prototype.onMouseDrag = function(event) {
        this.currentPath.add(event.point);
    };

    EraseTool.prototype.onMouseUp = function(event) {
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
    };


    // The laser-pointer tool button (VIEW)
    window.customElements.define("notetaker-laser-pointer-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = LaserPointerTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <circle cx="5" cy="5" r="2.5" style="fill: red; stroke: none;" />
                      <path d="M1.5,5 l-1.5,0 M8.5,5 l1.5,0 M6.75,8.031 l0.75,1.299 M3.25,8.031 l-0.75,1.299 M6.75,1.969 l0.75,-1.299 M3.25,1.969 l-0.75,-1.299" style="fill: none; stroke: red; stroke-width: 0.5; stroke-linecap: round;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The laser-pointer tool (CONTROLLER)
    function LaserPointerTool(button) {
        NotetakerTool.call(this, button, ["color", "width", "opacity", "fade"]);
        this.point = new paper.Path({
            segments: [], 
            strokeCap: "round", 
            strokeJoin: "round", 
        });
        this.point.ignore = true;
        this.point.addTo(pointerLayer);
        this.tween = null;
    }
    LaserPointerTool.prototype = Object.create(NotetakerTool.prototype);
    LaserPointerTool.prototype.constructor = LaserPointerTool;

    LaserPointerTool.prototype.onMouseDown = function(event) {
        if(this.tween) {
            this.tween.stop();
            this.tween = null;
        }
        this.point.strokeColor = this.color;
        this.point.strokeWidth = this.width;
        this.point.opacity = this.opacity;
        this.tweenOptions = this.fade || {duration: 500, easing: "easeInQuad"};
        this.point.segments = [event.point, event.point];
    };

    LaserPointerTool.prototype.onMouseDrag = function(event) {
        this.point.segments = [event.point, event.point];
    };

    LaserPointerTool.prototype.onMouseUp = function(event) {
        this.tween = this.point.tween({opacity: 0}, this.tweenOptions);
    };


    // The trailing-laser-pointer tool button (VIEW)
    window.customElements.define("notetaker-trailing-laser-tool", 
        class extends ToolButton {
            constructor() {
                super();
                this.tool = TrailingLaserTool;
            }

            get buttonContents() {
                return `
                    <svg viewBox="0 0 10 10">
                      <path d="M3,7 L7,3" style="fill: none; stroke: red; stroke-width: 5; stroke-linecap: round; opacity: 0.5;" />
                      <circle cx="7" cy="3" r="2.5" style="fill: red; stroke: none;" />
                    </svg>
                `;
            }
        }, 
        {extends: "button"}
    );

    // The trailing-laser-pointer tool (CONTROLLER)
    function TrailingLaserTool(button) {
        NotetakerTool.call(this, button, ["color", "width", "opacity", "fade"]);
        this.paths = new paper.CompoundPath({
            strokeCap: "round", 
            strokeJoin: "round", 
        });
        this.paths.addTo(pointerLayer);
        this.tween = null;
    }
    TrailingLaserTool.prototype = Object.create(NotetakerTool.prototype);
    TrailingLaserTool.prototype.constructor = TrailingLaserTool;

    TrailingLaserTool.prototype.onMouseDown = function(event) {
        if(this.tween) {
            this.tween.stop();
            this.tween = null;
        }
        this.paths.strokeColor = this.color;
        this.paths.strokeWidth = this.width;
        this.paths.opacity = this.opacity;
        this.tweenOptions = this.fade || {duration: 2000, easing: "easeInCubic"}; // We should have a better way to set a default, no? 
        this.paths.moveTo(event.point);
        this.paths.lastChild.ignore = true;
    };

    TrailingLaserTool.prototype.onMouseDrag = function(event) {
        this.paths.lastChild.add(event.point);
    };

    TrailingLaserTool.prototype.onMouseUp = function(event) {
        this.tween = this.paths.tween({opacity: 0}, this.tweenOptions);
        this.tween.then(this.finish.bind(this));
    };

    TrailingLaserTool.prototype.finish = function() {
        this.tween = null;
        this.paths.removeChildren();
    };


    /* The undo and redo buttons, and the History object */
    window.customElements.define("notetaker-undo-button", 
        class extends HTMLButtonElement {
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
        class extends HTMLButtonElement {
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


    /* A class for sets of mutually exclusive buttons */
    class ButtonGroup {
        constructor(buttons = []) {
            this.buttons = new Set(buttons);
            this._selected = null;
            this.lastSelected = null;
            for (let button of buttons) {
                button.addEventListener("click", () => this.select(button), false);
                if (button.classList.contains("selected")) {
                    if (this._selected) {
                        button.classList.remove("selected");
                    }
                    else {
                        this._selected = button;
                    }
                }
            }
        }

        add(button) {
            this.buttons.add(button);
            button.addEventListener("click", () => this.select(button), false);
        }

        get selected() {
            return this._selected;
        }

        select(button) {
            if (!this.buttons.has(button) || button === this._selected) {
                return;
            }
            if (this._selected) {
                this._selected.classList.remove("selected");
            }
            button.classList.add("selected");
            this._selected = button;
            button.select();
        }

        get value() {
            if (!this._selected) {
                return null;
            }
            return this._selected.value;
        }

        selectValue(value) {
            for (var button of this.buttons) {
                if (button.value === value) { // Problem: button.value is always string, but value is often converted
                    this.select(button);
                    break;
                }
            }
        }

        disable() {
            this.unselect();
            for (button of this.buttons) {
                button.disabled = true;
            }
        }

        enable() {
            for (button of this.buttons) {
                button.disabled = false;
            }
            this.reselect();
        }

        unselect() {
            if (!this._selected) {
                return;
            }
            this._selected.classList.remove("selected");
            this.lastSelected = this._selected;
            this._selected = null;
        }

        reselect() {
            if (this._selected || !this.lastSelected) {
                return;
            }
            this._selected = this.lastSelected;
            this._selected.classList.add("selected");
            this.lastSelected = null;
        }
    }


    const propertyButtons = new Proxy({}, {get: (object, property) => {
        if (!(property in object)) {
            object[property] = new ButtonGroup();
        }
        return object[property];
    }});
    propertyButtons.color = new ButtonGroup(document.querySelectorAll('button[is="notetaker-color-button"]'));
    propertyButtons.width = new ButtonGroup(document.querySelectorAll('button[is="notetaker-width-button"]'));
    propertyButtons.opacity = new ButtonGroup(document.querySelectorAll('button[is="notetaker-opacity-button"]'));
    propertyButtons.dash = new ButtonGroup(document.querySelectorAll('button[is="notetaker-dash-pattern-button"]'));
    const toolButtons = new ButtonGroup(document.querySelectorAll('button[is^="notetaker-"][is$="-tool"]'));

    const toolbar_start = document.getElementById("notetaker_toolbar_start");
    const toolbar_middle = document.getElementById("notetaker_toolbar_middle");
    const toolbar_end = document.getElementById("notetaker_toolbar_end");

    const colors = ["darkblue", "darkred", "darkgreen", "darkgray", "darkorange", "violet", "cornflowerblue"];
    var button;
    for (let color of colors) {
        button = document.createElement("button", {is: "notetaker-color-button"});
        button.setAttribute("value", color);
        propertyButtons.color.add(button);
        toolbar_start.appendChild(button);
    }

    const toolProperties = [["darkblue", "2", "1", ""], 
                            ["darkblue*", "2*", "1*", " *"], 
                            ["darkblue&", "2&", "1&", " &"], 
                            ["*", "*", "*", "*"], 
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
        if (!(toolType == "delete" || toolType == "erase")) {
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
    button.setAttribute("dash", "");
    toolButtons.add(button);
    toolbar_middle.appendChild(button);

    const history = new History();
    const activeLayer = new paper.Layer();
    const pointerLayer = new paper.Layer();
    activeLayer.activate();
    for (button of toolButtons.buttons) {
        button.tool = new button.tool(button);
    }
    toolButtons.selected.select();
    propertyButtons.color.select(propertyButtons.color.buttons.values().next().value);
    paper.view.draw();
});

