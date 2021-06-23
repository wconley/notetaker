# My vision for this

The main goal of this project is to have a way to create slide-based presentations, similar to Beamer for LaTeX, but with two capabilities built-in: 

1. The ability to, as easily as possible, add *interactive* graphs, charts, and other widgets, which the presenter/reader can interact with directly within the presentation viewer. In particular, this means without having to launch an external program (which may not be available on all computers), and without relying on an external server for computations (as in a Jupyter notebook). 
2. The ability to use any slide in the presentation as a full-fledged whiteboard, for making hand-written notes/annotations on top of the slides. Once again, this could be done via an external app layered on top of the slide viewer, but it would be much better if it were integrated into the slide viewer itself. It will also be really useful to be able to dynamically, with a simple push of a button or a keyboard shortcut, insert a new blank slide into the presentation to be used as a blank whiteboard. 

## To elaborate...

As I see it right now, there are three main components to this project: the presentation tool, the whiteboard functionality, and then... *some* way of embedding the interactive content. It seems clear that the right way to do all of this is in a web browser, so it's convenient that all of the above can be (and have been) implemented in HTML and Javascript, at least to some extent. The challenge will be to combine them in such a way that they work together seamlessly and smoothly. Below I elaborate on each of these pieces in more detail. 

### The presentation tool

This doesn't even have to be strictly a slide-based presenter a la PowerPoint, Beamer, Google slides, etc. For many purposes, I might be happy with (and in some cases might even prefer) a scrollable document instead. (Tangent: For such purposes, the iodide project sounds/sounded incredibly promising. Too bad it's no longer being actively maintained.) In any case, there are many HTML/Javascript based slide frameworks out there, including several open source ones, some of which look quite powerful and richly featured. Probably the most featureful among the open source options right now is Reveal.js. So I'll likely start my experimentation with that. 

One important, but hopefully easy, technical hurdle here is that, whenever a slide contains interactive content, it will be important to be able to give the keyboard/mouse focus to that content, and thereby take it away from the presentation app. For example, say we set up a Jupyter-style interactive with one or more sliders. Clicking/tapping on a slider should give it the keyboard focus, so that the arrow keys and possibly other keybindings can be used to move the slider. However, Reveal.js and most other presentation tools bind the arrow keys to the actions of navigating to the next and previous slides or fragments. So this needs to be resolved, somehow. 

Note: It appears that Reveal.js has a configuration option for addressing this exact issue. So hopefully this will be an easy one. 


### The whiteboard functionality

I have considered using a separate tool for this, e.g. an app running on a tablet that simply let's you draw overtop of any other app. (Apparently Windows 10 tablets/hybrids have this ability.) However, it would be much better if this were integrated with the presentation app, so that the annotations stay with the slide that they're written on, and perhaps can even be saved with it later. (See features 7 and 8 in the list below.) 

Since the current plan is to implement this in the browser, there are many HTML/Javascript solutions for a basic in-browser whiteboard/sketchpad. Indeed, since the introduction of HTML5 and the “canvas” element, these little apps abound. This seems to be a basic introductory coding exercise to show what you can do with an HTML canvas. However, so far, none of the ones that I've seen allow many of the more advanced features of a good whiteboard app like Notability or GoodNotes. From what I can tell, to do this right, this one will require far more custom work than either of the other two. 

Here are some features I'd like to have: 
1. **Essential:** High resolution and low latency! It must be possible to write neatly at a natural speed! I'm really not sure if this is even really possible right now in a browser with canvas+Javascript, so hopefully this isn't a complete non-starter. 
2. **Essential:** Draw onto a canvas that covers the entire page/slide, but that has a higher z-index than other elements and a completely transparent background, so that the canvas itself doesn't obscure the content of the slide underneath. 
3. **Essential:** Be able to switch drawing mode on and off, while leaving the canvas visible. When drawing mode is on, all clicks/touches only affect the whiteboard, i.e. draw or erase things. When drawing mode is off, the stuff that has been drawn on the canvas is still visible overtop of the slide, just as before, but now clicks/touches *pass through* the canvas to the elements underneath, so that you can interact with them. They can also receive the keyboard focus and respond to keypresses. 
4. **Important:** Multiple colors available, preferably with some way of customizing the choices. Likewise customizable pen thickness, and opacity (alpha). Note that a highlighter tool can be implemented easily by combining these features: it's just very thick pen stroke with lower opacity, and usually lighter/pastel colors. It might be nice to be able to have certain combinations of these saved as “favorite” tools, as Notability allows. 
5. **Preferably:** Two different forms of erase tool: one that just erases the areas that you swipe over, and another that erases whole objects/pen strokes all at once. The latter will be the more technically difficult to implement. Note that for the former, it is ***not*** sufficient to just draw on the canvas in white, or whatever the background color is, because we may be drawing overtop of other content on the slides, and erasing what we've drawn should *reveal* the content beneath. 
6. **Preferably:** Many-level undo and redo. 
7. **Important:** The annotations should be attached to the slide where they are made, so that when one navigates to another slide, they disappear, but when one navigates back to that slide, they are restored in exactly the same place. 
8. **In an ideal world:** It would be nice to be able to save/export the annotations, or the slides together with the annotations on them. For example, Reveal.js and many similar frameworks support exporting a slideshow to PDF. It would be great if everything drawn on the whiteboard on each slide could be exported along with that. Or something along those lines. 
9. **Preferably:** A button and/or keyboard shortcut to insert a new blank slide right after the current one, and immediately switch to that slide, for the purposes of drawing on a blank whiteboard. 
10. **In an ideal world:** A “laser pointer” tool. The simplest would be to implement this as a simple dot that moves around. But really slick would be to implement fading trails. For this, it might be easiest to implement it as a second canvas on top of the main one, since its content is totally dynamic. Hopefully this wouldn't be too big a performance penalty, since much of the time this second canvas would be empty. 
11. **In an ideal world:** Tools for drawing straight lines, rectangles, and maybe circles/ellipses. Once again, due to the more dynamic nature of these, it might be easiest to render them first using the second canvas on top of the first, until the user lifts the mouse button/pen, at which point they are finalized and drawn onto the main canvas. 

***Strategy:*** Experiment first with just getting a standalone whiteboard-in-a-browser working well, with most/all of features 1–6 above implemented. Get it working over top of some page with other content, including e.g. some Plotly graphs, so that you can test features 2–3 above! Then work on integrating this into Reveal.js (hopefully as a plugin?), with feature 7 and hopefully feature 8. 

Technical notes: 
1. It seems that #3 above can be achieved by setting the CSS property "pointer-events" to "none" on the canvas element. This will completely disable all mouse pointer events on the canvas. It *should* allow pointer events to propagate through to elements underneath the canvas, if I understand it correctly. 
2. For the first type of erase tool, in #5 above, it looks like the correct way to achieve this is to stroke a path on the canvas with a solid color, perhaps white or perhaps it doesn't matter, with opacity 1, and with the "globalCompositeOperation" set to "destination-out".
3. For the second type of erase tool, in #5 above, it might be a much better solution to use SVG instead of/in addition to a canvas element. With SVG, each pen stroke (path) would become an actual XML element, which would make it much easier to select them by mouse. This could also make it possible/easier to implement cut/copy/paste. 
4. I need to experiment with both SVG and canvas for this. I suspect that SVG would be slower than drawing on a canvas. Also, SVG apparently tends to bog down/break once you get up to 1000s of paths/elements. But that may not matter for us, and regardless, the way we're doing things, our solution might also bog down if we ever got up to that many elements anyway! It's also possible a hybrid approach could work here: as you're drawing, a canvas is used to render the current path, overtop of all others. As soon as the current path is finished (mouseup or mouseout event), it is converted to an SVG path and added to the SVG. This also allows the canvas itself to remain cleared, completely empty, most of the time, which should make it much easier to manage. It is apparently possible to put an "svg" element directly inside of a "canvas" element. 
5. As an alternative to considering SVG, also look into libraries like Fabric-JS, CreateJS, and Zim. These apparently “can relatively quickly integrate mouse events, hit tests, multitouch gestures, drag and drop capabilities, controls, and more” into a canvas-based application. See also Paper.js. 


### Embedding interactive content, graphs, etc

This could be done just using pure javascript libraries like jQueryUI, Plotly, etc. But for more math/data science stuff, it would be awesome to use Pyodide, to get a whole scientific computing stack, and be able to write the code for these interactives in Python. 

Another issue will be how to set all this up in such a way that it's easy to create new documents, with all of my own customizations and libraries available at the outset, with minimal boilerplate. This should be possible by just importing one or two big .js scripts, which should be loadable even from the filesystem without having to be served by a webserver. If they are to contain my own personal library of Python helper functions, this might be a bit of a mess, but hopefully not too much. 


