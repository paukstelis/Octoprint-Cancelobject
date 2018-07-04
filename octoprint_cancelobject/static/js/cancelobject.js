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
        
        self.toggleFeature = function(entry,name) {
        	$.ajax({
				url: API_BASEURL + "plugin/cancelobject",
				type: "POST",
				dataType: "json",
				data: JSON.stringify({
					command: "toggle",
					entryid: entry,
					feature: name 
				}),
				contentType: "application/json; charset=UTF-8"
			});	
        }

        self.updateObjectList = function() {
        	//start a new entry, don't yet know if this is something that can be done with jinja2
        	var divContainer = document.getElementById("cancel-table");
        	if (self.ObjectList.length > 0) {
        		for (var i = 0; i < self.ObjectList.length; i++) {
        			//Ignore entries that are just there for functional purposes
        			if (self.ObjectList[i]["ignore"]) { continue; }
        			
        			var entry = document.createElement("div"); entry.className = "something2";
        			entry.id = "entry"+i;
        			
        			var objname = document.createElement("label"); objname.className = "something3";
        			objname.appendChild(document.createTextNode(self.ObjectList[i]["object"]));
        			//objname.innerHTML = "<h3>"+self.ObjectList[i]["object"]+"</h3>";
        			entry.appendChild(objname);
        			
        			var features = document.createElement("div"); features.className = "accordion-group featurediv";
        			var featureheading = document.createElement("div"); featureheading.className = "accordion-heading";
        			features.appendChild(featureheading);
        			
        			var firstspan = document.createElement("anchor");
        			firstspan.className = "accordion-toggle ";
        			firstspan.dataset.toggle = "collapse";
        			firstspan.dataset.target = "#"+self.ObjectList[i]["object"]+"features";
        			firstspan.innerHTML = "Toggle Feature";
        			featureheading.appendChild(firstspan);
        			
        			var featurebody = document.createElement("div"); featurebody.className = "accordion-body collapse";
        			featurebody.id = self.ObjectList[i]["object"]+"features";
        			var list = document.createElement('ul');
        			list.className = "items";
        			
        			for (var k = 0; k < self.ObjectList[i]["features"].length; k++) {
        				var feature = document.createElement("li"); feature.className = "feature";
        				
        				var checkbox = document.createElement("input");
        				checkbox.className = "featurecheck";
        				checkbox.type = "checkbox";
        				checkbox.name = self.ObjectList[i]["features"][k]["name"];
        				checkbox.checked = true;
        				checkbox.id = i+self.ObjectList[i]["features"][k]["name"];
        				checkbox.setAttribute('entryid', i);
        				
        				if (self.ObjectList[i]["features"][k]["cancel"]) { checkbox.checked = false; }
        				var label = document.createElement("label"); label.className = "feature";
        				label.htmlFor = i+self.ObjectList[i]["features"][k]["name"];
        				label.appendChild(document.createTextNode(self.ObjectList[i]["features"][k]["name"]));
        				label.innerHTML += "<p>";
        				
        				feature.appendChild(checkbox);
        				feature.appendChild(label);
        				list.appendChild(feature);
        				featurebody.append(list);
        				
        				//features.innerHTML += "<p>";
        			}
        			features.appendChild(featurebody);
        			
        			var cancelbutton = document.createElement("BUTTON"); cancelbutton.className = "cancelbutton btn";
        			cancelbutton.value = i;
        			cancelbutton.innerHTML = "Cancel";
        			if (self.ObjectList[i]["cancelled"]) { cancelbutton.disabled = true; }
        			entry.appendChild(cancelbutton);
        			
        			entry.appendChild(features);
        			divContainer.appendChild(entry);
        		}
        			
        	}

        }

        //Seems I can only bind this to document?
        $(document.body).on("click", ".cancelbutton", function (event) {
            console.log($(this).attr("value"));
            var thebutton = $(this);
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
    	
    	$(document.body).on("change",".featurecheck", function (event) {

			var thebox = $(this);
			var thename = $(this).attr("name");
			var theentry = $(this).attr("entryid");
			
			self.toggleFeature(theentry,thename);
			
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