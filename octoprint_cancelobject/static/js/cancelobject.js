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
        
        self.addRegex = function() {
            self.object_regex.push({objreg : ""});
        };

        self.removeRegex = function(regex) {
            self.object_regex.remove(regex)
        };

        self.onStartupComplete = function() {
             addCanvasOverlays();
             CancelButtons();
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
            clearContext(ctx);
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
        
        function confirm_cancel_button(event) {
        	console.log(event.target);
            var theobject = event.target.value;
            confirm_cancel(theobject);
        }
        
        function confirm_cancel(objid) {
            showConfirmationDialog({
                title: gettext("Are you sure?"),
                message: gettext("<p><strong>You are about to cancel this object.</strong>"),
                question: gettext("Are you sure you want to do this?"),
                cancel: gettext("Exit"),
                proceed: gettext("Yes, Cancel It"),
                onproceed:  function() {
                        	//thebutton.attr("disabled", "disabled");
                            self.cancelObject(objid);
                        }
              });
        }
        
        //Move this to its own function so we can use it with gcodeviewer
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
                '<div class="btn btn-mini disabled resetCO" title="'+ gettext("Reset objects, requires printing to recalculate") +'">'+
                  '<i class="fa"></i>'+ gettext("Reset object") +'</div>'+
                '<div class="btn btn-mini disabled cancelCO" title="'+ gettext("Choose object to cancel") +'">'+
                  '<i class="fa"></i>'+ gettext("Cancel Objects") +'</div>'+
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
            } else if ($button.hasClass("cancelCO")) {
            	if (!self.cancel_mode) {
            	    startCancelMode();
              	}
              	else { endCancelMode(); }
            }
          }
        });
        
        enableCancelButtons(true);
      }
    }
    function startCancelMode() {
        var $gcodeCanvas = $("#gcode_canvas");
        $gcodeCanvas.on("click", check_point);
       
    }
    
    function endCancelMode() {
        var $gcodeCanvas = $("#gcode_canvas");
        $gcodeCanvas.off("click", check_point);
    }
    
    function removeCancelButtons() {
      $("#gcode_cancel_controls").remove();
      delete self.$cancelButtons;
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

    function addCanvasOverlays() {
      if ($("#canvas_container").find(".gcode_canvas_wrapper").length == 0) {
        var $gcodeCanvas = $("#gcode_canvas");
        var $wrapper = $('<div class="gcode_canvas_wrapper"></div>');
        $gcodeCanvas[0].parentNode.insertBefore($wrapper[0], $gcodeCanvas[0]);
        $wrapper.append($gcodeCanvas);
        cloneNodeSize($gcodeCanvas[0], $wrapper[0]);
        appendOverlay($wrapper, $cancelOverlay, $gcodeCanvas);
        
      }
    }
    
   function check_point(event) {
   	  //assume all circular
   	  console.log("Checking point");
   	  var pt = eventPositionToCanvasPt(event)
   	  
   	  if (self.ObjectList.length > 0) {    
            for (var i = 0; i < self.ObjectList.length; i++) {
        		if (self.ObjectList[i]["ignore"]) { continue; }
        		var px = (self.ObjectList[i]["max_x"] + self.ObjectList[i]["min_x"])/2
        		var py = (self.ObjectList[i]["max_y"] + self.ObjectList[i]["min_y"])/2
                var r = 4;
                var check = Math.hypot(px - pt.x, py - pt.y);
                //console.log(check);
                
                if (check <= r) { 
                    confirm_cancel(self.ObjectList[i]["id"]);
                    break;
                }

             }
        }	
      
    }
    
    var pixelRatio = window.devicePixelRatio || 1;
    function eventPositionToCanvasPt(event) {
      var canvas = $cancelOverlay[0];
      var x = (event.offsetX !== undefined ? event.offsetX : (event.pageX - canvas.offsetLeft));
      var y = (event.offsetY !== undefined ? event.offsetY : (event.pageY - canvas.offsetTop));
      var pt = transformedPoint(x * pixelRatio, y * pixelRatio);
      return pt;
    }

    function appendOverlay($parent, $overlay, $canvas) {
      $parent.append($overlay);
      cloneNodeSize($canvas[0], $overlay[0]);
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

    function clearContext(ctx) {
      var p1 = transformedPoint(0, 0);
      var p2 = transformedPoint(ctx.canvas.width, ctx.canvas.height);
      ctx.clearRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }
    
    function cloneNodeSize(fromNode, toNode) {
      toNode.style.height = fromNode.style.height || fromNode.width+"px";
      toNode.style.width = fromNode.style.width || fromNode.height+"px";
      if ((toNode.width !== undefined) && (fromNode.width !== undefined)) {
        toNode.width = fromNode.width;
        toNode.height = fromNode.height;
      }
    }

    var renderFrameCallbacks;
    
    function renderFrame(id, callback /*, ...args */) {
      if (renderFrameCallbacks == null) {
        renderFrameCallbacks = {};

        requestAnimationFrame(function() {
          var callbacks = renderFrameCallbacks;
          renderFrameCallbacks = null;

          for (var id in callbacks) {
            var cb = callbacks[id];
            cb[0].apply(null, cb[1]);
          }
        });
      }

      if (!renderFrameCallbacks[id]) {
        renderFrameCallbacks[id] = [ callback, Array.prototype.slice.call(arguments, 2) ];
      }
    }
    
    function rendercancelOverlay() {
      renderFrame("cancelOverlay",the_callback);
    }
    
    function the_callback() {
        var ctx = cancelOverlayContext;
        ctx.save();
        clearContext(ctx);       
        if (self.ObjectList.length > 0) {    
            for (var i = 0; i < self.ObjectList.length; i++) {
        		//Ignore entries that are just there for functional purposes
        		if (self.ObjectList[i]["ignore"]) { continue; }
        		ctx.beginPath();
        		var px = (self.ObjectList[i]["max_x"] + self.ObjectList[i]["min_x"])/2
        		var py = (self.ObjectList[i]["max_y"] + self.ObjectList[i]["min_y"])/2
        		//var px = (ObjectList[i]["max_x"])
        		//var py = (ObjectList[i]["max_y"])
        		ctx.fillStyle = "red";
        		ctx.arc(px, py, 4, 0, 2 * Math.PI);
        		ctx.fill()
        	    //ctx.drawImage(cancel_image,px-2, py-2, 4, 4);
        	    //console.log(ObjectList[i]["id"],ObjectList[i]["max_x"], ObjectList[i]["min_x"],ObjectList[i]["max_y"], ObjectList[i]["min_y"]);
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
    
    var svg = document.createElementNS("http://www.w3.org/2000/svg",'svg');
    var pt  = svg.createSVGPoint();
    overlayXform = svg.createSVGMatrix();
    
    function transformedPoint(x,y) {
        pt.x=x; pt.y=y;
        return pt.matrixTransform(overlayXform.inverse());
    }
    GCODE.renderer.setOption({
        onViewportChange: function(xform) {
          overlayXform = xform;
          cancelOverlayContext.setTransform(xform.a, xform.b, xform.c, xform.d, xform.e, xform.f);
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
