/*
 * View model for OctoPrint-Cancelobject
 *
 * Author: Paul Paukstelis
 * Notes: Don't laugh. My first ever attempt trying to understand javascript!
 * License: AGPLv3
 */
$(function() {
    function CancelobjectViewModel(parameters) {
    	var PLUGIN_ID = "cancelobject";
        var self = this;
        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.navBarActive = ko.observable();
        self.ObjectList = ko.observableArray();

        self.onBeforeBinding = function() {
            OctoPrint.get("api/plugin/"+PLUGIN_ID);
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
        }
        
        self.updateObjectList = function() {
        	//start a new table
        	var table = document.createElement("table");
        	if (self.ObjectList.length > 0) {
        		var columnCount = self.ObjectList[0].length;
        		for (var i = 0; i < self.ObjectList.length; i++) {
        			//Ignore entries that are just there for functional purposes
        			if (self.ObjectList[i]["ignore"]) { continue; }
        			var row = table.insertRow(-1);
        			var cell1 = row.insertCell(-1);
        			cell1.innerHTML = self.ObjectList[i]["object"];
        			var cell2 = row.insertCell(-1);
        			//Can't seem to figure out how to have disabled = false and keep it active, so doing this
        			if (self.ObjectList[i]["cancelled"]) {
        				cell2.innerHTML = '<button class="cancel-btn" disabled="disabled" value="'+cell1.innerHTML+'">Cancel</button>';	
        			}
        			else {
        				cell2.innerHTML = '<button class="cancel-btn" value="'+cell1.innerHTML+'">Cancel</button>';
        			}
        		}
        	}
        	
        	var divContainer = document.getElementById("cancel-table");
        	divContainer.innerHTML = "";
        	divContainer.appendChild(table);
        }
        
        //Seems I can only bind this to document?
        $(document.body).on("click", ".cancel-btn", function (event) {
            console.log($(this).attr("value"));
            var thebutton = $(this);
            var theobject = $(this).attr("value");
            showConfirmationDialog({
                        title: gettext("Are you sure?"),
                        message: gettext("<p><strong>You are about to cancel this object.</strong>"),
                        question: gettext("Are you sure you want to do this?"),
                        cancel: gettext("Exit"),
                        proceed: gettext("Yes, Cancel It"),
                        onproceed:  function() {
                        	thebutton.attr("disabled", "disabled");
                            self.cancelObject(thebutton.attr("value"));
                        }
              });
    	});
    	
        self.onDataUpdaterPluginMessage = function (plugin, data) {          
        	if (data.navBarActive){
                self.navBarActive('Current Object: '+data.navBarActive);
            }
            //New list of objects
            if (data.objects){
            	self.ObjectList = data.objects;
            	self.updateObjectList();
            }
        }
    }
    
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable OCTOPRINT_VIEWMODELS
    OCTOPRINT_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        CancelobjectViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["loginStateViewModel","settingsViewModel"],

        // Finally, this is the list of selectors for all elements we want this view model to be bound to.
        
        ["#navbar_plugin_cancelobject","#tab_plugin_cancelobject"]
    ]);
});