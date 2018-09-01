/*
 * View model for OctoPrint-Cancelobject
 *
 * Author: Paul Paukstelis
 * License: AGPLv3
 */
$(function() {
    function CancelobjectViewModel(parameters) {
    	var PLUGIN_ID = "cancelobject";
        var self = this;
        
        self.global_settings = parameters[0];
        self.loginState = parameters[1];
        
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
            console.log(self.object_regex.slice(0))
        };

        self.removeRegex = function(regex) {
            self.object_regex.remove(regex)
            console.log(self.object_regex.slice(0))
        };

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
    }
    
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable OCTOPRINT_VIEWMODELS
    OCTOPRINT_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        CancelobjectViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["settingsViewModel","loginStateViewModel"],

        // Finally, this is the list of selectors for all elements we want this view model to be bound to.
        
        ["#navbar_plugin_cancelobject","#tab_plugin_cancelobject","#settings_plugin_cancelobject"]
    ]);
});