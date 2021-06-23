"use strict";

$( function() {
    paper.setup(document.getElementById("notetaker_canvas"));
    var undoButton = document.getElementById("undo_button");
    var redoButton = document.getElementById("redo_button");
    var history = [];
    var historyPosition = 0;
    var activeLayer = new paper.Layer();
    var pointerLayer = new paper.Layer();
    activeLayer.activate();

    // Stuff for undo/redo functionality
    function noMoreRedos() {
        history.length = historyPosition;
        redoButton.disabled = true;
    }

    function addHistory(histItem) {
        history.push(histItem);
        historyPosition++;
        undoButton.disabled = false;
    }

    undoButton.onclick = function (event) {
        var histItem, i;
        if(historyPosition === 0) {
            alert("Nothing to undo!") // This shouldn't ever happen
        }
        historyPosition--;
        histItem = history[historyPosition];
        // REVERSE the effects of the "Delta" in histItem
        for(var i = histItem.length - 2; i >= 0; i -= 2) {
            if(histItem[i] >= 0) {
                // Item histItem[i+1] was added at index histItem[i]. Remove it.
                activeLayer.children[histItem[i]].remove();
            }
            else {
                // Item histItem[i+1] was removed from index -histItem[i] - 1. Re-add it.
                activeLayer.insertChild(-histItem[i] - 1, histItem[i+1]);
            }
        }
        redoButton.disabled = false;
        if(historyPosition === 0) {
            undoButton.disabled = true;
        }
    };

    redoButton.onclick = function (event) {
        var histItem, i;
        if(historyPosition >= history.length) {
            alert("Nothing to redo!") // This shouldn't ever happen
        }
        histItem = history[historyPosition];
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
        historyPosition++;
        if(historyPosition === history.length) {
            redoButton.disabled = true;
        }
        undoButton.disabled = false;
    };


    // The PenTool class, a subclass of paper.Tool
    function PenTool(color, thickness, opacity, dash) {
        paper.Tool.call(this);
        this.strokeColor = color || "black";
        this.strokeWidth = thickness || 2;
        this.opacity = opacity || 1;
        this.dashArray = dash || [];
    }
    PenTool.prototype = Object.create(paper.Tool.prototype);
    PenTool.prototype.constructor = PenTool;

    PenTool.prototype.onMouseDown = function (event) {
        noMoreRedos();
        this.currentPath = new paper.Path({
            segments: [event.point], 
            strokeColor: this.strokeColor, 
            strokeWidth: this.strokeWidth, 
            strokeCap: "round", 
            strokeJoin: "round", 
            opacity: this.opacity, 
            dashArray: this.dashArray, 
        });
    };

    PenTool.prototype.onMouseDrag = function (event) {
        this.currentPath.add(event.point);
    };

    PenTool.prototype.onMouseUp = function (event) {
        this.currentPath.simplify(2.5);
        addHistory([this.currentPath.index, this.currentPath]);
    };


    // The LineTool class, a subclass of paper.Tool
    function LineTool(color, thickness, opacity, dash, snapTolerance) {
        paper.Tool.call(this);
        this.strokeColor = color || "black";
        this.strokeWidth = thickness || 2;
        this.opacity = opacity || 1;
        this.dashArray = dash || [];
        this.snapTolerance = snapTolerance || 20; // Set to -1 to disable snap
        this.firstPoint = null;
    }
    LineTool.prototype = Object.create(paper.Tool.prototype);
    LineTool.prototype.constructor = LineTool;

    LineTool.prototype.onMouseDown = function (event) {
        noMoreRedos();
        this.firstPoint = event.point;
        this.currentPath = new paper.Path({
            segments: [event.point, event.point], 
            strokeColor: this.strokeColor, 
            strokeWidth: this.strokeWidth, 
            strokeCap: "butt", 
            opacity: this.opacity, 
            dashArray: this.dashArray, 
        });
    };

    LineTool.prototype.onMouseDrag = function (event) {
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

    LineTool.prototype.onMouseUp = function (event) {
        addHistory([this.currentPath.index, this.currentPath]);
    };


    // The RectangleTool class, a subclass of paper.Tool
    function RectangleTool(color, thickness, opacity, dash, snapTolerance) {
        paper.Tool.call(this);
        this.strokeColor = color || "black";
        this.strokeWidth = thickness || 2;
        this.opacity = opacity || 1;
        this.dashArray = dash || [];
        this.snapTolerance = snapTolerance || 20; // Set to -1 to disable snap
        this.firstPoint = null;
    }
    RectangleTool.prototype = Object.create(paper.Tool.prototype);
    RectangleTool.prototype.constructor = RectangleTool;

    RectangleTool.prototype.rectangle = function (p1, p2) {
        return [p1, new paper.Point(p1.x, p2.y), p2, new paper.Point(p2.x, p1.y)];
    }

    RectangleTool.prototype.onMouseDown = function (event) {
        noMoreRedos();
        this.firstPoint = event.point;
        this.currentPath = new paper.Path({
            segments: this.rectangle(event.point, event.point), 
            closed: true, 
            strokeColor: this.strokeColor, 
            strokeWidth: this.strokeWidth, 
            strokeJoin: "miter", 
            opacity: this.opacity, 
            dashArray: this.dashArray, 
        });
    };

    RectangleTool.prototype.onMouseDrag = function (event) {
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

    RectangleTool.prototype.onMouseUp = function (event) {
        addHistory([this.currentPath.index, this.currentPath]);
    };


    // The RemoveTool class, a subclass of paper.Tool
    function RemoveTool(thickness) {
        paper.Tool.call(this);
        this.hitTestOptions = {fill: true, stroke: true, segments: true, tolerance: thickness || 10};
    }
    RemoveTool.prototype = Object.create(paper.Tool.prototype);
    RemoveTool.prototype.constructor = RemoveTool;

    RemoveTool.prototype.onMouseDown = function (event) {
        noMoreRedos();
        this.toBeRemoved = {};
        this.removeItemsAt(event.point);
    };

    RemoveTool.prototype.onMouseDrag = function (event) {
        this.removeItemsAt(event.point);
    };

    RemoveTool.prototype.removeItemsAt = function (point) {
        var results = paper.project.hitTestAll(point, this.hitTestOptions);
        for(var result of results) {
            var item = result.item;
            if(!item.ignore && !this.toBeRemoved[item.index]) {
                item.opacity *= 0.4;
                this.toBeRemoved[item.index] = item;
            }
        }
    };

    RemoveTool.prototype.onMouseUp = function (event) {
        var item;
        var histItem = [];
        for(item of Object.values(this.toBeRemoved)) {
            histItem.push(-item.index - 1, item)
            item.remove();
            item.opacity /= 0.4;
        }
        if(histItem.length > 0) {
            addHistory(histItem);
        }
    };


    // The EraseTool class, a subclass of paper.Tool
    function EraseTool(thickness) {
        paper.Tool.call(this);
        this.strokeWidth = thickness || 20;
    }
    EraseTool.prototype = Object.create(paper.Tool.prototype);
    EraseTool.prototype.constructor = EraseTool;

    EraseTool.prototype.onMouseDown = function (event) {
        noMoreRedos();
        this.currentPath = new paper.Path({
            blendMode: "destination-out", 
            segments: [event.point], 
            strokeColor: "black", 
            strokeWidth: this.strokeWidth, 
            strokeCap: "round", 
            strokeJoin: "round", 
            opacity: 1, 
        });
        this.currentPath.ignore = true;
    };

    EraseTool.prototype.onMouseDrag = function (event) {
        this.currentPath.add(event.point);
    };

    EraseTool.prototype.onMouseUp = function (event) {
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
                    newPaths.forEach(function (newPath, j) {
                        histItem.push(index + j, newPath);
                    });
                    activeLayer.insertChildren(index, newPaths);
                    i = pathCopy.index;
                }
            }
        }
        addHistory(histItem);
    };


    // The PointerTool class, a subclass of paper.Tool
    function PointerTool(color, thickness, opacity, fade) {
        paper.Tool.call(this);
        this.point = new paper.Path({
            segments: [], 
            strokeColor: color || "red", 
            strokeWidth: thickness || 10, 
            strokeCap: "round", 
            strokeJoin: "round", 
        });
        this.point.ignore = true;
        this.point.addTo(pointerLayer);
        this.opacity = opacity || 0.66;
        this.tween = null;
        this.tweenOptions = fade || {duration: 500, easing: "easeInQuad"};
    }
    PointerTool.prototype = Object.create(paper.Tool.prototype);
    PointerTool.prototype.constructor = PointerTool;

    PointerTool.prototype.onMouseDown = function (event) {
        if(this.tween) {
            this.tween.stop();
        }
        this.point.opacity = this.opacity;
        this.point.segments = [event.point, event.point];
    };

    PointerTool.prototype.onMouseDrag = function (event) {
        this.point.segments = [event.point, event.point];
    };

    PointerTool.prototype.onMouseUp = function (event) {
        this.tween = this.point.tween({opacity: 0}, this.tweenOptions);
    };


    // The TrailingPointerTool class, a subclass of paper.Tool
    function TrailingPointerTool(color, thickness, opacity, fade) {
        paper.Tool.call(this);
        this.paths = new paper.CompoundPath({
            strokeColor: color || "red", 
            strokeWidth: thickness || 10, 
            strokeCap: "round", 
            strokeJoin: "round", 
        });
        this.paths.addTo(pointerLayer);
        this.opacity = opacity || 0.6;
        this.tween = null;
        this.tweenOptions = fade || {duration: 2000, easing: "easeInCubic"};
    }
    TrailingPointerTool.prototype = Object.create(paper.Tool.prototype);
    TrailingPointerTool.prototype.constructor = TrailingPointerTool;

    TrailingPointerTool.prototype.onMouseDown = function (event) {
        if(this.tween) {
            this.tween.stop();
            this.tween = null;
        }
        this.paths.opacity = this.opacity;
        this.paths.moveTo(event.point);
        this.paths.lastChild.ignore = true;
    };

    TrailingPointerTool.prototype.onMouseDrag = function (event) {
        this.paths.lastChild.add(event.point);
    };

    TrailingPointerTool.prototype.onMouseUp = function (event) {
        this.tween = this.paths.tween({opacity: 0}, this.tweenOptions);
        this.tween.then(this.finish.bind(this));
    };

    TrailingPointerTool.prototype.finish = function () {
        this.tween = null;
        this.paths.removeChildren();
    };


    // Now set up the actual UI
    function setupUI() {
        var allMyTools = {
            pen_tool:           new PenTool("darkblue"), 
            highlighter_tool:   new PenTool("lightgreen", 18, 0.4), 
            line_tool:          new LineTool("darkblue"), 
            rectangle_tool:     new RectangleTool("darkblue"), 
            eraser_tool:        new EraseTool(), 
            remove_tool:        new RemoveTool(), 
            laser_pointer_tool: new TrailingPointerTool(), 
        };
        var allMyButtons = {};

        function selectTool(toolName) {
            var selected = document.getElementsByClassName("notetaker-toolbar-item selected");
            for(let button of selected) {
                if(button.id !== toolName) {
                    button.classList.remove("selected");
                }
            }
            allMyButtons[toolName].classList.add("selected");
            allMyTools[toolName].activate();
        }

        for(let toolName in allMyTools) {
            let button = document.getElementById(toolName);
            allMyButtons[toolName] = button;
            button.onclick = () => selectTool(toolName);
        }
        undoButton.disabled = true;
        redoButton.disabled = true;
        selectTool("pen_tool");
    }
    setupUI();

    paper.view.draw();
} );

