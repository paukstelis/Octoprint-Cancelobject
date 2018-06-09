# OctoPrint-Cancelobject

This plugin allows the user to interactively cancel objects in gcode based on comment tags added by the slicer.
Currently, the only working model is using Simplify3D and including a separate process for each object (or group of
objects) that the user may want to cancel. 
## Setup

Install via the bundled [Plugin Manager](https://github.com/foosel/OctoPrint/wiki/Plugin:-Plugin-Manager)
or manually using this URL:

    https://github.com/paukstelis/OctoPrint-Cancelobject/archive/master.zip

## Configuration
Be default, active object (current object being queued) is displayed in the NavBar.
Gcode (comma delimited) can be injected before or after the server reaches a cancelled object.
This may be need for retractions or resetting extrusion distance in some cases.
Simplify3D resets extrusion distances between processes if the 'Allow zeroing of extrusion distance' setting is set,
which is a necessary behaviour for this to work correctly.
