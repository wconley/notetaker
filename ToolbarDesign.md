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

To facilitate having multiple canvases, plus the ability to have a single toolbar that can control more than one canvas, here's what we need to do: 
    - Toolbar class: 
        - Encapsulates a paper.PaperScope. All tools created for this toolbar should be created in that PaperScope, so it's important to call PaperScope.activate() before constructing the paper.Tool. (Currently this happens in the activate method of the NotetakerTool, but it could probably be done in the constructor if we modify a few things. This would probably be more sensible.) 
        - Maintains a (Weak?)Map of DOM canvas objects to paper.Project-s for the canvases/projects that it controls. This is necessary for paper.Tool event handlers to work correctly. 
        - Also keeps track, somehow, of which of its canvases/projects is the “active” one, and provides methods for changing that. 
            - Note that the paper.PaperScope keeps a reference to which of *its* paper.Project-s is active. 
            - Could we just use this mechanism? 
            - If so, we would either have to maintain a Map from paper.Project objects to Notetaker objects, or we would have to attach a reference to our Notetaker object directly to the paper.Project. 
            - The latter (monkey-patching, essentially) is more risky/frowned-upon. 
            - Or, of course, we could maintain our own reference to which Notetaker object is active, and method(s) for activating one. 
        - Is constructed by querying the DOM for buttons/inputs with appropriate attributes set. Takes over managing the state of those elements, but otherwise doesn't do any significant DOM manipulation. 
    - Custom element <notetaker-toolbar>: Takes a config-url (and optionally a theme-url) as attributes, loads them if necessary, and builds/styles the corresponding toolbar in its shadow-DOM. Then also constructs a Toolbar object (passing itself to the constructor) to control it. 
    - Notetaker class/web component (custom element <note-taker>): 
        - Encapsulates a paper.Project, within the paper.PaperScope of the Toolbar that controls it. 
        - Also encapsulates its own History object, corresponding to that paper.Project. 
            - The undo and redo buttons of a Toolbar must operate on the History object of the toolbar's *active* Notetaker object. 
            - This also means that when a different Notetaker is activated, we have to update the status of the undo and redo buttons of the toolbar, to reflect whether they are disabled or not. 
            - So the history object no longer controls the undo/redo buttons! 
            - However, it may still need to be able to tell the toolbar when to update these buttons, in some cases. 
            - Perhaps just have getter(s) to query whether they should be disabled, on demand. 
            - Perhaps just fold the History class into the Notetaker element class (!), since there's really not much else there. Otherwise, you need (at least) references toolbar <==> notetaker <==> history, and often one has to go through the middle just to get to the other. 
    - There should be a module-global Map, called toolbars, that maps DOM elements (or element IDs) to Toolbar objects. 
        - The reason this is needed is that a toolbar element can be one of our <notetaker-toolbar> custom elements, *or* it can be built by the user in HTML. In the latter case, if multiple <note-taker>s are to use the same toolbar, we need to ensure that they use the same Toolbar object. 
        - For a <note-taker> with its own built-in toolbar, this is unnecessary, as its toolbar can't be shared with another <note-taker>. 

Ways of constructing and configuring a <note-taker> and its toolbar: 
1. <note-taker> with attached toolbar (the most basic, what we got working first)
    - Specify config-url (and optionally theme-url) as attributes on the <note-taker> element. It is an error (or at least undefined behavior) to specify one/both of these and also a toolbar-id attribute. 
    - The <note-taker> must load the config, at least, because it needs to know the toolbar position. It must then create its own <notetaker-toolbar> and corresponding ToolbarController. But it would be nice if it could just pass the config and/or theme directly to the <notetaker-toolbar>. Alternatively, it could just bypass <notetaker-toolbar>, and directly construct the toolbar DOM itself. 
2. Detached toolbar, controlling one or more <note-taker>s
    - Specify config-url (and optionally theme-url) as attributes on the <notetaker-toolbar> element. Specify toolbar-id on the <note-taker> element. 
    - In this situation, the <note-taker> may be constructed/connected first, or the <notetaker-toolbar> may be, *and* there may be multiple <note-taker>s that get constructed before and/or after their corresponding <notetaker-toolbar>. 
    - Since the <note-taker> encapsulates a paper.Project, and this can't/shouldn't be constructed until we have a paper.PaperScope for it (which is encapsulated by the Toolbar), we can't complete the paper.js-related parts of the setup of the <note-taker> until its Toolbar is all set up. So the connectedCallback of <note-taker> should just do the DOM setup (which in the detached case is very little) and then... maybe set up a callback/promise for the paper.js-related parts of the setup? Or... read on. 
    - Since the Toolbar object, and even the <notetaker-toolbar> element, may not even exist when the <note-taker> is being set up, we need something more than just a simple Map from toolbar-ids/<notetaker-toolbar>s to Toolbar objects. But a Proxy object should be enough: if the Toolbar object corresponding to that toolbar-id does not exist, it is created, associated to that id, and returned. If it exists, it is returned. Then the constructor for Toolbar *just* sets up the paper.PaperScope, without setting up any tools or anything (yet), nor doing anything with the DOM. 
    - When the <notetaker-toolbar> has *finished* setting itself up (added all its DOM stuff), it *also* looks up its Toolbar object in the same way, via its id, and calls a method on the Toolbar saying “Here I am. Inspect my DOM and configure yourself accordingly.” 
3. Custom (HTML) toolbar, controlling one or more <note-taker>s
    - Same as above, but slight addendum to the second-to-last bullet: the Toolbar constructor checks the type of element with the given id. If it's a <notetaker-toolbar>, it does nothing (waiting for the <notetaker-toolbar> to set itself up and call the appropriate method). *Otherwise*, it goes ahead and sets itself up, under the assumption that the DOM for the custom toolbar is all ready to go. It would be nice to provide a way for a user to call this manually, as well, so that if they wanted to use JS to set up their custom toolbar, they could do so and then let the Toolbar object know it's ready to go. 

