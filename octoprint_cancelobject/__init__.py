# coding=utf-8
from __future__ import absolute_import

### (Don't forget to remove me)
# This is a basic skeleton for your plugin's __init__.py. You probably want to adjust the class name of your plugin
# as well as the plugin mixins it's subclassing from. This is really just a basic skeleton to get you started,
# defining your plugin as a template plugin, settings and asset plugin. Feel free to add or remove mixins
# as necessary.
#
# Take a look at the documentation on what other plugin mixins are available.

import octoprint.plugin
import octoprint.filemanager
import octoprint.filemanager.util
import octoprint.printer
import octoprint.util
import re
import flask
from flask.ext.login import current_user

from octoprint.events import Events

OBJECT_REGEX = "; process (.*)"

class ModifyComments(octoprint.filemanager.util.LineProcessorStream):
	def process_line(self, line):

		if line.startswith(";"):
			line = self._matchComment(line)

		if not len(line):
			return None
		return line

	def _matchComment(self, line):
		pattern = re.compile(OBJECT_REGEX)
		matched = pattern.match(line)
		if matched:
			obj = matched.group(1)
			line = "#Object "+obj+"\n"
		return line

#TODO: Add all the neccessary reset stuff on various events (cancel, unload, etc.)

class CancelobjectPlugin(octoprint.plugin.StartupPlugin,
						 octoprint.plugin.SettingsPlugin,
						 octoprint.plugin.AssetPlugin,
						 octoprint.plugin.TemplatePlugin,
						 octoprint.plugin.SimpleApiPlugin,
						 octoprint.plugin.EventHandlerPlugin):

	def __init__(self):
		
		self.object_list = []
		self.skipping = False
		self.active_object = None
		
		

	def get_assets(self):
		# Define your plugin's asset files to automatically include in the
		# core UI here.
		return dict(
			js=["js/cancelobject.js"],
			
		)
		
	def get_settings_defaults(self):
		return dict(object_regex="; process (.*)",
					retract = 0.0,
					retractfr = 300,
					shownav = 'true',
					pause = 'false')

	def get_template_configs(self):
		return [
		dict(type="settings", custom_bindings=False)
		]

	def modify_file(self, path, file_object, blinks=None, printer_profile=None, allow_overwrite=True, *args,**kwargs):
		if not octoprint.filemanager.valid_file_type(path, type="gcode"):
			return file_object

		import os
		name, _ = os.path.splitext(file_object.filename)

		modfile = octoprint.filemanager.util.StreamWrapper(file_object.filename,ModifyComments(file_object.stream()))
		
		return modfile
		
	def get_api_commands(self):
		return dict(
			skip=[],
			cancel=["cancelled"]
		)	

	def on_api_command(self, command, data):
		import flask
		if command == "skip":
			self._logger.info("skip current object called")
			self.skip_to_next()
			
		elif command == "cancel":
			if current_user.is_anonymous():
				return "Insufficient rights", 403
				
			cancelled = data["cancelled"]
			self._logger.info("cancel object called, cancelled is {cancelled}".format(**data))
			self.cancel_object(cancelled)

	def on_api_get(self, request):
		self.updateobjects()
		self.updatedisplay()
		
	def updateobjects(self):
		if len(self.object_list) > 0:
			self._plugin_manager.send_plugin_message(self._identifier, dict(objects=self.object_list))

	def updatedisplay(self):
		navmessage = ""
		
		if self.active_object:
			navmessage=str(self.active_object)
		
		if self._settings.get(['shownav']):
			self._plugin_manager.send_plugin_message(self._identifier, dict(navBarActive=navmessage))
		
	def on_event(self, event, payload):
		if event == Events.FILE_SELECTED:
			self.object_list = []
			selectedFile = payload.get("file", "")
			with open(selectedFile, "r") as f:
				i = 0
				for line in f:
					try:
						obj = self.process_line(line)
						if obj:
							obj["id"] = i
							self.object_list.append(obj)
							i=i+1
					except (ValueError, RuntimeError):
						print("Error")
			#Send objects to server
			self._plugin_manager.send_plugin_message(self._identifier, dict(objects=self.object_list))

			
	def process_line(self, line):
		if line.startswith("#"):
			obj = self.check_object(line)
			if obj:
			#maybe it is faster to put them all in a list and uniquify with a set?
				entry = self.get_entry(obj)
				if entry:
					return None
				else:
					return dict({"object" : obj, "id" : None, "active" : False, "cancelled" : False})
			else:
				return None
		
	def check_object(self, line):
		pattern = re.compile("#Object (.*)")
		matched = pattern.match(line)
		if matched:
			obj = matched.group(1)
			return obj
		return None

	def get_entry(self, name):
		for o in self.object_list:
			if o["object"] == name:
				return o
		return None
	
	def get_entry_byid(self, objid):
		for o in self.object_list:
			if o["id"] == objid:
				return o
		return None

	#Not used anymore
	def skip_to_next(self):
		#skip the current object and put it in the cancel list
		obj = self.get_entry(self.active_object)
		obj["cancelled"] = True
		self.skipping = True
		
	def cancel_object(self, cancelled):
		self._logger.info("Object %s cancelled" % cancelled)
		obj = self.get_entry(cancelled)
		obj["cancelled"] = True
		if obj["active"]:
			self.skipping = True
			if self._settings.get(["pause"]):
				self._logger.info("Pausing print.")
                self._printer.pause_print()
				
		  
	def check_queue(self, comm_instance, phase, cmd, cmd_type, gcode, tags, *args, **kwargs):
		
		if cmd.startswith('#'):
			obj = self.check_object(cmd)
			if obj:
				entry = self.get_entry(obj)
				if entry["cancelled"]:
					self._logger.info("Hit a cancelled object, %s" % obj)
					self.skipping = True
				else:
				#we are coming out of a skipping block, reset extrusion, retract
					if self.skipping:
						retract = self._settings.get(['retract'])
						retractfr = self._settings.get(['retractfr'])
						self._logger.info("Coming out of skipping block")
						if retract:
							cmd = [("G92 E0",),("G1 E-{0} F{1}".format(retract,retractfr),)]
						else:
							cmd = "G92 E0"
						self.skipping = False
						
					self.active_object = entry["object"]
					self.updatedisplay()
								
		if self.skipping:
			return '; object skipped'
		else:
			return cmd
			
	def get_update_information(self):
		# Define the configuration for your plugin to use with the Software Update
		# Plugin here. See https://github.com/foosel/OctoPrint/wiki/Plugin:-Software-Update
		# for details.
		return dict(
			cancelobject=dict(
				displayName="Cancel object",
				displayVersion=self._plugin_version,

				# version check: github repository
				type="github_release",
				user="paukstelis",
				repo="OctoPrint-Cancelobject",
				current=self._plugin_version,

				# update method: pip
				pip="https://github.com/you/OctoPrint-Cancelobject/archive/{target_version}.zip"
			)
		)


# If you want your plugin to be registered within OctoPrint under a different name than what you defined in setup.py
# ("OctoPrint-PluginSkeleton"), you may define that here. Same goes for the other metadata derived from setup.py that
# can be overwritten via __plugin_xyz__ control properties. See the documentation for that.
__plugin_name__ = "Cancel Objects"

def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = CancelobjectPlugin()

	global __plugin_hooks__
	__plugin_hooks__ = {
		
		"octoprint.filemanager.preprocessor": __plugin_implementation__.modify_file,
		"octoprint.comm.protocol.gcode.queuing": __plugin_implementation__.check_queue
	}