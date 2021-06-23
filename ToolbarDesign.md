Top-level component is toolbar

Configured by a single JSON object, whose main content is an array of toolbar items. Each of these is just an object describing the configuration of a single toolbar item. 

Toolbar is a container for toolbar items. The most common of these is a drawing tool button. However, there can also be widgets such as a color picker or a slider for opacity or strokeWidth. 

Toolbar position can be top, bottom, left, or right. Toolbar will have a size (height if its position is top or bottom, width if its position is left or right). Each toolbar item will have a height/width that is ~90% of this, and many items will be squares of this latter size, or a container with several such squares. 

Toolbar items: 
1. Tool button. Square. Mutually exclusive among themselves, so usually you'd want them grouped next to each other, but this is not enforced. This includes the following: 
    - Drawing tools: pen, line, rectangle, circle(?), bracket(?), eraser, remover
    - Laser pointer and trailing laser pointer
    - Mouse-pointer tool: This deactivates all clicks on the canvas and makes sure they're passed through to whatever is underneath. 
    - For each of these, its icon should indicate the type of drawing tool, color, strokeWidth, and if possible opacity. Dash pattern would be good to include also, if possible. 
3. Undo button. Square. 
4. Redo button. Square. 
5. Opacity slider
6. Stroke-width slider
7. Color choice. Square. This represents a fixed, pre-selected color. Mutually exclusive among themselves, so usually you'd want them grouped next to each other, but this is not enforced. Putting several of these right next to each other functions as a mini color palette. 
8. Color picker button. Square, but on click it pops up a full-scale color-picker of some kind. This may be tricky to implement, or require a specialized library. There are many that are just for color pickers, it seems. 
9. Dash pattern choice. Square. This represents a fixed, pre-selected dash pattern. Mutually exclusive among themselves, so usually you'd want them grouped next to each other, but this is not enforced. 
10. Erase all button. Square. This would ALWAYS use a small, unobtrusive confirmation prompt, perhaps by popping up another square right next to it? 
11. Hide all button. Square. This is a toggle button to temporarily hide everything that has been drawn, and switch to the mouse-pointer tool. This is particularly useful if there's some content underneath that has been obscured too much by the writing/drawing. Pressing it again brings everything right back, and perhaps restores the previously active tool? 

Each drawing tool (as well as laser pointer tools) has various attributes that can be configured. For example, most have color, stroke width, opacity, and dash pattern. For each tool, each of these attributes can be configured to work in any of the following ways: 
    (a) Fixed. Value is specified in configuration, and can't be changed at runtime at all. 
    (b) Variable with default. Default value is specified in configuration. Each time this tool is chosen, this attribute is set to the default. But it may be changed using other toolbar items, e.g. the stroke width can be changed if there is a stroke-width slider in the toolbar. 
    (c) Variable with default and memory. Default value is specified in configuration. First time this tool is chosen, this attribute is set to the default. But it may be changed using other toolbar items, e.g. the stroke width can be changed if there is a stroke-width slider in the toolbar. If user switches to another tool then back to this one, the previous value (not the original default) is restored. 
    (d) Variable without default. This tool always gets this attribute from the relevant toolbar item. E.g. if color is configured this way, there must be some color choice buttons or a color picker on the toolbar, from which this tool will get its color. 
    (e) Variable with memory but no default. This tool initially gets this attribute from the relevant toolbar item. E.g. if color is configured this way, there must be some color choice buttons or a color picker on the toolbar, from which this tool will get its color. If another tool is selected, and this one is re-selected, then the value will go back to its previous value. 

Idea: To keep the configuration language simple, just use a certain character (let's say asterisk: `*`) to indicate that the value can be modified by the relevant controls on the toolbar (color picker, stroke-width slider, opacity slider, dash pattern choice). So, for example, for stroke-width: 
    - Specifying a number (either as `2` or as `"2"` or even as `"2.0"`) will give a fixed value, as described by (a) above. 
    - Specifying a string consisting of a number followed by an asterisk (e.g. `"2*"`) means the number is used initially, but can be changed by stroke-width slider, as in (b) above. 
    - Specifying a string consisting of a number followed by an ampersand (e.g. `"2&"`) means the number is used initially, but can be changed by stroke-width slider. When another tool is selected, but then this one is selected again, the previous value is restored, not the default, as in (c) above. 
    - Specifying a string with just an asterisk (`"*"`) means the stroke-width slider always determines the stroke-width of this tool, as in (d) above. 
    - Specifying a string with just an ampersand (`"&"`) means the stroke-width slider initially determines the stroke-width of this tool, but when another tool is selected and this one is re-selected, its previous value is restored. 
    - Not specifying this property at all means that the value gets the default for that tool. Most likely, for the color for all of the drawing tools, this should be `"&"`, and for all other properties of all tools this should be a fixed value as in (a) above. 
This can be done similarly for colors, which could be specified as `"#6495ED"` or `"cornflowerblue",` or in order to be variable by a color tool: `"#6495ED*"` or `"cornflowerblue*",` or `"#6495ED&"` or `"cornflowerblue&"`. 

Class hierarchy: 
    NotetakerToolbarItem
        NotetakerUndoButton
        NotetakerRedoButton
        NotetakerColorButton (C)
        NotetakerColorPicker (C)
        NotetakerWidthButton (W)
        NotetakerWidthSlider (W)
        NotetakerOpacityButton (O)
        NotetakerOpacitySlider (O)
        NotetakerDashPatternButton (D)
        NotetakerDrawingTool                  (M)
            NotetakerPenTool                  (M)
            NotetakerLineTool                 (M)
            NotetakerRectangleTool            (M)
            NotetakerCircleTool               (M)
            NotetakerBracketTool              (M)
            NotetakerEraserTool               (M)
            NotetakerDeleteTool               (M)
            NotetakerLaserPointerTool         (M)
            NotetakerTrailingLaserPointerTool (M)
        NotetakerPointerTool                  (M)
        NotetakerPassThruTool                 (M)

Note that there are five categories of buttons (C, W, O, D, M) that function as 
radio buttons, and within each of these categories, the buttons mutually exclude 
each other. Probably the easiest way to handle this is to have a variable for 
each group that points to which button of the group is currently selected. Or, 
slightly fancier (but still simple, and possibly better for other purposes) have 
a class that represents a button group, and have five objects of this class. 

