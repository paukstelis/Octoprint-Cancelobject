/*
 * View model for OctoPrint-Cancelobject
 *
 * Author: Paul Paukstelis
 * License: AGPLv3
 */
$(function() {
    var $cancelOverlay = $('<canvas id="gcode_canvas_cancel_overlay">');
    var cancelOverlayContext = $cancelOverlay[0].getContext('2d');

    function CancelobjectViewModel(parameters) {
        var PLUGIN_ID = "cancelobject";
        var self = this;

        self.global_settings = parameters[0];
        self.loginState = parameters[1];
        self.gcodeViewModel = parameters[2];
        self.cancel_mode = false;
        self.navBarActive = ko.observable();
        self.ActiveID = ko.observable();
        self.ObjectList = ko.observableArray();
        self.object_regex = ko.observableArray();
        self.ignored = ko.observableArray();
        self.beforegcode = ko.observableArray();
        self.aftergcode = ko.observableArray();
        self.allowed = ko.observableArray();
        
        self.onBeforeBinding = function() {
            OctoPrint.get("api/plugin/"+PLUGIN_ID);
            self.settings = self.global_settings.settings.plugins.cancelobject;
            self.object_regex(self.settings.object_regex.slice(0));
            self.ignored = self.settings.ignored;
            self.beforegcode = self.settings.beforegcode;
            self.aftergcode = self.settings.aftergcode;
            self.allowed = self.settings.allowed;
            self.shownav = self.settings.shownav;
        };
        
        self.isFileSelected = ko.pureComputed(function() {
            return !!self.gcodeViewModel.selectedFile.path();
        });

        self.isFileSelected.subscribe(function() {
            enableCancelButtons(self.isFileSelected());
        });
        
        self.addRegex = function() {
            self.object_regex.push({objreg : ""});
        };

        self.removeRegex = function(regex) {
            self.object_regex.remove(regex)
        };

        self.onStartupComplete = function() {
             generateOverlays();
             CancelButtons();
             //add click functionality to gcode canvas
             var $gcodeCanvas = $("#gcode_canvas");
             $gcodeCanvas.on("click", check_point);
        }
        
        self.onSettingsBeforeSave = function () {

            self.global_settings.settings.plugins.cancelobject.object_regex(self.object_regex.slice(0));
        };

        self.cancelObject = function(obj) {
            $.ajax({
                url: API_BASEURL + "plugin/cancelobject",
                type: "POST",
                dataType: "json",
                data: JSON.stringify({
                    command: "cancel",
                    cancelled: obj
                }),
                contentType: "application/json; charset=UTF-8"
            }); 
            
            self.updateObjects();
        }
        
        self.updateObjects = function() {
        
            $.ajax({
                url: API_BASEURL + "plugin/cancelobject",
                type: "POST",
                dataType: "json",
                data: JSON.stringify({
                    command: "objlist"
                }),
                contentType: "application/json; charset=UTF-8"
            });
            
        }
        
        self.resetObjects = function() {
        
            $.ajax({
                url: API_BASEURL + "plugin/cancelobject",
                type: "POST",
                dataType: "json",
                data: JSON.stringify({
                    command: "resetpos"
                }),
                contentType: "application/json; charset=UTF-8"
            });
            //Clear our canvas
            var ctx = cancelOverlayContext;
            ctx.save();
            clear_Context(ctx);
            ctx.restore();
        }
        
        self.updateObjectList = function() {
            
            //start a new entry, don't yet know if this is something that can be done with jinja2
            var canceltable = document.getElementById("cancel-table");
            canceltable.innerHTML = "";
            var entries = document.createElement("div"); entries.className = "entries";
            if (self.ObjectList.length > 0) {
                for (var i = 0; i < self.ObjectList.length; i++) {
                    //Ignore entries that are just there for functional purposes
                    if (self.ObjectList[i]["ignore"]) { continue; }
                    
                    var entry = document.createElement("div"); entry.className = "entry";
                    entry.id = "entry"+self.ObjectList[i]["id"];
                    entry.activeobj = "false";
                    
                    var objname = document.createElement("label"); objname.className = "entrylabel";
                    objname.appendChild(document.createTextNode(self.ObjectList[i]["object"]));
                    entry.appendChild(objname);
                    
                    var cancelbutton = document.createElement("BUTTON"); cancelbutton.className = "cancel-btn btn";
                    cancelbutton.value = self.ObjectList[i]["id"];
                    cancelbutton.innerHTML = "Cancel";
                    if (self.ObjectList[i]["cancelled"]) { cancelbutton.disabled = true; }
                    entry.appendChild(cancelbutton);
                    entries.appendChild(entry);
                }

            }
            else { canceltable.innerHTML = "Object list populated when GCODE file is loaded"; }
            canceltable.appendChild(entries);

        }
        
        self.updateActive = function() {
            var entries = $("div[id^='entry']");
            //console.log(entries);
            for (var i = 0; i < entries.length; i++) {
                entries[i].className = "entry";
            }
            var entry = document.getElementById("entry"+self.ActiveID);
            entry.className = "entry activeobject";
        }
        
        function get_object_name(objid) {
            var objname = self.ObjectList[objid]["object"];
            return objname;    
        }
        
        function confirm_cancel_button(event) {
            //console.log(event.target);
            var theobject = event.target.value;
            var objname = get_object_name(theobject);
            confirm_cancel(theobject, objname);
        }
        
        function confirm_cancel(objid, objname) {
            showConfirmationDialog({
                title: gettext("Are you sure?"),
                message: gettext("<p><strong>You are about to cancel object "+objname+".</strong>"),
                question: gettext("Are you sure you want to do this?"),
                cancel: gettext("Exit"),
                proceed: gettext("Yes, Cancel It"),
                onproceed:  function() {
                            //thebutton.attr("disabled", "disabled");
                            self.cancelObject(objid);
                        }
              });
        }
        
        $(document.body).on("click", ".cancel-btn", confirm_cancel_button);
        
        
        self.onDataUpdaterPluginMessage = function (plugin, data) {          
            if (data.navBarActive) {
                self.navBarActive('Current Object: '+data.navBarActive);
            }
            
            if (data.ActiveID >= 0) {
                self.ActiveID = data.ActiveID;
                self.updateActive();
            }
            //New list of objects
            if (data.objects){
                self.ObjectList = data.objects;
                self.updateObjectList();
            }
        }
        
//Everything below here is borrowed heavily from briancfisher's ExcludeRegion plugin
//https://github.com/bradcfisher/OctoPrint-ExcludeRegionPlugin
    function CancelButtons() {
      // Don't create buttons if using TouchUI, since they don't work anyway
      if (self.touchui && self.touchui.isActive())
        return;
      
      if (!$("#gcode_cancel_controls").length) {
        $("#canvas_container").after(
          '<div id="gcode_cancel_controls">'+
            '<div class="main">'+
              gettext("Cancel Objects")+
              ' <div class="btn-group action-buttons">'+
                '<div class="btn btn-mini disabled refreshCO" title="'+ gettext("Refresh object markers") +'">'+
                  '<i class="fa"></i>'+ gettext("Refresh objects") +'</div>'+
                '<div class="btn btn-mini disabled resetCO" title="'+ gettext("Reset objects, requires printing moves to recalculate") +'">'+
                  '<i class="fa"></i>'+ gettext("Reset objects") +'</div>'+
                '<div class="btn btn-mini disabled toggleCO" title="'+ gettext("Toggle object markers on/off") +'">'+
                  '<i class="fa"></i>'+ gettext("Toggle markers") +'</div>'+
              '</div>'+
            '</div>'+
          '</div>'
        );

        // Edit button click event
        self.$cancelButtons = $("#gcode_cancel_controls .btn");

        self.$cancelButtons.click(function() {
          var $button = $(this);

          // Blur self
          $button.blur();

          // Check if button is not disabled
          if (!$button.hasClass("disabled")) {
            if ($button.hasClass("refreshCO")) {
              self.updateObjects();
              rendercancelOverlay();
            } else if ($button.hasClass("resetCO")) {
              self.resetObjects();
              self.updateObjects();
            } else if ($button.hasClass("toggleCO")) {
              var overlay = document.getElementById('gcode_canvas_cancel_overlay');
              if (overlay.style.visibility == 'visible') { overlay.style.visibility='hidden'; }
              else {  overlay.style.visibility='visible'; }
            }
          }
        });       
        enableCancelButtons(self.isFileSelected());
      }
    }
    
    function removeCancelButtons() {
      $("#gcode_cancel_controls").remove();
      delete self.$cancelButtons;
      var $gcodeCanvas = $("#gcode_canvas");
      $gcodeCanvas.off("click", check_point);
    }

    function enableCancelButtons(enabled) {
      
      if (self.$cancelButtons) {
        if (enabled) {
          self.$cancelButtons.removeClass("disabled");
        } else {
          self.$cancelButtons.addClass("disabled");
        }
      }    
    }

    function generateOverlays() {
      if ($("#canvas_container").find(".gcode_canvas_wrapper1").length == 0) {
        var $gcodeCanvas = $("#gcode_canvas");
        var $wrapper = $('<div class="gcode_canvas_wrapper1"></div>');
        $gcodeCanvas[0].parentNode.insertBefore($wrapper[0], $gcodeCanvas[0]);
        $wrapper.append($gcodeCanvas);
        clone_node($gcodeCanvas[0], $wrapper[0]);
        placeOverlay($wrapper, $cancelOverlay, $gcodeCanvas);        
      }
    }
    
   function check_point(event) {
      //assume all circular
      console.log("Checking point");
      var pt = eventToCanvasPt(event)
      
      if (self.ObjectList.length > 0) {    
            for (var i = 0; i < self.ObjectList.length; i++) {
                if (self.ObjectList[i]["ignore"] || self.ObjectList[i]["cancelled"]) { continue; }
                var px = (self.ObjectList[i]["max_x"] + self.ObjectList[i]["min_x"])/2
                var py = (self.ObjectList[i]["max_y"] + self.ObjectList[i]["min_y"])/2
                var r = 4;
                var check = Math.hypot(px - pt.x, py - pt.y);
                console.log(check);
                
                if (check <= r) { 
                    confirm_cancel(self.ObjectList[i]["id"], self.ObjectList[i]["object"]);
                    break;
                }

             }
        }   
    }
    
    var pixRatio = window.devicepixelRatio || 1;
    function eventToCanvasPt(event) {
      var canvas = $cancelOverlay[0];
      var x = (event.offsetX !== undefined ? event.offsetX : (event.pageX - canvas.offsetLeft));
      var y = (event.offsetY !== undefined ? event.offsetY : (event.pageY - canvas.offsetTop));
      var pt = transformPoint(x * pixRatio, y * pixRatio);
      return pt;
    }

    function placeOverlay($parent, $overlay, $canvas) {
      $parent.append($overlay);
      clone_node($canvas[0], $overlay[0]);
    }
    
    function clone_node(fromNode, toNode) {
      toNode.style.height = fromNode.style.height || fromNode.width+"px";
      toNode.style.width = fromNode.style.width || fromNode.height+"px";
      if ((toNode.width !== undefined) && (fromNode.width !== undefined)) {
        toNode.width = fromNode.width;
        toNode.height = fromNode.height;
      }
    } 
    
    var startupComplete = false;
    var gcodeViewerPollingComplete = false;
    
    function initializeControlsIfReady() {
      if (startupComplete && gcodeViewerPollingComplete) {
        if (self.loginState.loggedIn()) {
          addRefreshButton();
        }
      }
    }    

    function clear_Context(ctx) {
      var p1 = transformPoint(0, 0);
      var p2 = transformPoint(ctx.canvas.width, ctx.canvas.height);
      ctx.clearRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }
    
    var render_frameCallbacks;    
    function render_frame(id, callback /*, ...args */) {
      if (render_frameCallbacks == null) {
        render_frameCallbacks = {};

        requestAnimationFrame(function() {
          var callbacks = render_frameCallbacks;
          render_frameCallbacks = null;

          for (var id in callbacks) {
            var cb = callbacks[id];
            cb[0].apply(null, cb[1]);
          }
        });
      }

      if (!render_frameCallbacks[id]) {
        render_frameCallbacks[id] = [ callback, Array.prototype.slice.call(arguments, 2) ];
      }
    }

    var svgs = document.createElementNS("http://www.w3.org/2000/svg",'svg');
    var pts  = svgs.createSVGPoint();
    overXform = svgs.createSVGMatrix();
    
    function rendercancelOverlay() {
      var $gcodeCanvas = $("#gcode_canvas");
      var gc_canvascontext = $gcodeCanvas[0].getContext('2d');
      var matrix = gc_canvascontext.getTransform();
      overXform = matrix
      //console.log(matrix);
      cancelOverlayContext.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      render_frame("cancelOverlay",the_callback);
    }
    
    function the_callback() {
        var ctx = cancelOverlayContext;
        ctx.save();
        clear_Context(ctx);       
        if (self.ObjectList.length > 0) {    
            for (var i = 0; i < self.ObjectList.length; i++) {
                //Ignore entries that are just there for functional purposes
                if (self.ObjectList[i]["ignore"]) { continue; }
                ctx.beginPath();
                var px = (self.ObjectList[i]["max_x"] + self.ObjectList[i]["min_x"])/2
                var py = (self.ObjectList[i]["max_y"] + self.ObjectList[i]["min_y"])/2
                ctx.fillStyle = "orange";
                if (self.ObjectList[i]["cancelled"]) { ctx.fillStyle = "grey"; }
                ctx.arc(px, py, 4, 0, 2 * Math.PI);
                ctx.fill()
                
             }
        }                               
        ctx.restore();           
    }

    var gcodeViewerPollFn = function() {
      if (!GCODE || !GCODE.renderer || !GCODE.renderer.getOptions().hasOwnProperty('onViewportChange')) {
        setTimeout(gcodeViewerPollFn, 10);
        return;
      }
    }

    function transformPoint(x,y) {
        pts.x=x; pts.y=y;
        return pts.matrixTransform(overXform.inverse());
    }
    
    GCODE.renderer.setOption({
        onViewportChange: function(tform) {
          overXform = tform;
          cancelOverlayContext.setTransform(tform.a, tform.b, tform.c, tform.d, tform.e, tform.f);
          rendercancelOverlay();   
        },
    });
}
 
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable OCTOPRINT_VIEWMODELS
    OCTOPRINT_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        CancelobjectViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["settingsViewModel","loginStateViewModel","gcodeViewModel"],

        // Finally, this is the list of selectors for all elements we want this view model to be bound to.
        
        ["#navbar_plugin_cancelobject","#tab_plugin_cancelobject","#settings_plugin_cancelobject"]
    ]);
});
