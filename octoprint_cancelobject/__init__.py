# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import octoprint.filemanager
import octoprint.filemanager.util
import octoprint.printer
import octoprint.util
import re
import flask
from flask.ext.login import current_user

from octoprint.events import Events

class ModifyComments(octoprint.filemanager.util.LineProcessorStream):
	
	def __init__(self, fileBufferedReader, object_regex, reptag):
		super(ModifyComments, self).__init__(fileBufferedReader)
		self._object_regex = object_regex
		self._reptag = reptag
		self.pattern = re.compile(self._object_regex)
	def process_line(self, line):

		if line.startswith(";"):
			line = self._matchComment(line)

		if not len(line):
			return None
		return line

	def _matchComment(self, line):
		
		matched = self.pattern.match(line)
		if matched:
			obj = matched.group(1)
			line = "{0} {1}\n".format(self._reptag, obj)
		return line

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
		self.object_regex = None
		self.reptag = None
		self.beforegcode = []
		self.aftergcode = []
		
	def initialize(self):
		self.object_regex = self._settings.get(["object_regex"])
		self.reptag = self._settings.get(["reptag"])
		self.reptagregex = re.compile("{0} ([^\t\n\r\f\v]*)".format(self.reptag))
		try:
			self.beforegcode = self._settings.get(["beforegcode"]).split(",")
			#Remove any whitespace entries to avoid sending empty lines
			self.beforegcode = filter(None, self.beforegcode)
		except:
			self._logger.info("No beforegcode defined")
		try:
			self.aftergcode = self._settings.get(["aftergcode"]).split(",")
			#Remove any whitespace entries to avoid sending empty lines
			self.aftergcode = filter(None, self.aftergcode)
		except:
			self._logger.info("No aftergcode defined")
		
	def get_assets(self):
		return dict(
			js=["js/cancelobject.js"]
		)
		
	def get_settings_defaults(self):
		return dict(object_regex="; process (.*)",
					reptag = "#Object",
					beforegcode = None,
					aftergocde = None,
					shownav = True,
					pause = False)

	def get_template_configs(self):
		return [
		dict(type="settings", custom_bindings=False)
		]

	def modify_file(self, path, file_object, blinks=None, printer_profile=None, allow_overwrite=True, *args,**kwargs):
		if not octoprint.filemanager.valid_file_type(path, type="gcode"):
			return file_object

		import os
		name, _ = os.path.splitext(file_object.filename)
		obj_regex = self._settings.get(["object_regex"])
		reptag = self._settings.get(["reptag"])
		modfile = octoprint.filemanager.util.StreamWrapper(file_object.filename,ModifyComments(file_object.stream(),obj_regex,reptag))
		
		return modfile
		
	def get_api_commands(self):
		return dict(
			skip=[],
			cancel=["cancelled"]
		)	

	def on_api_command(self, command, data):
		import flask

		if command == "cancel":
			if current_user.is_anonymous():
				return "Insufficient rights", 403
				
			cancelled = data["cancelled"]
			self._cancel_object(cancelled)

	def on_api_get(self, request):
		self._updateobjects()
		self._updatedisplay()
		
	def _updateobjects(self):
		if len(self.object_list) > 0:
			self._logger.info("{0}".format(self.object_list))
			self._plugin_manager.send_plugin_message(self._identifier, dict(objects=self.object_list))

	def _updatedisplay(self):
		navmessage = ""
		
		if self.active_object:
			navmessage=str(self.active_object)
		
		if self._settings.get(['shownav']):
			self._plugin_manager.send_plugin_message(self._identifier, dict(navBarActive=navmessage))
		
	def on_event(self, event, payload):
		if event in (Events.FILE_SELECTED, Events.PRINT_STARTED):
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
			#self._plugin_manager.send_plugin_message(self._identifier, dict(objects=self.object_list))
			self._updateobjects()
			
		elif event in (Events.PRINT_DONE, Events.PRINT_FAILED, Events.PRINT_CANCELLED):
			self.object_list = []
			self._plugin_manager.send_plugin_message(self._identifier, dict(objects=self.object_list))
			self.active_object = 'None'
			self._plugin_manager.send_plugin_message(self._identifier, dict(navBarActive=self.active_object))		
			
	def process_line(self, line):
		if line.startswith(self.reptag[0]):
			obj = self._check_object(line)
			if obj:
			#maybe it is faster to put them all in a list and uniquify with a set?
				entry = self._get_entry(obj)
				if entry:
					return None
				else:
					return dict({"object" : obj, "id" : None, "active" : False, "cancelled" : False})
			else:
				return None
		
	def _check_object(self, line):
		matched = self.reptagregex.match(line)
		if matched:
			obj = matched.group(1)
			print obj
			return obj
		return None

	def _get_entry(self, name):
		for o in self.object_list:
			if o["object"] == name:
				print o
				return o
		return None
	
	def _get_entry_byid(self, objid):
		for o in self.object_list:
			if o["id"] == objid:
				return o
		return None
		
	def _cancel_object(self, cancelled):
		self._logger.info("Object %s cancelled" % cancelled)
		obj = self._get_entry(cancelled)
		obj["cancelled"] = True
		if obj["object"] == self.active_object:
			#TODO: Removing this for now. Maybe hit a race condition in the queue?
			#if self._settings.get_boolean(["pause"]) == True:
			#	self._printer.pause_print()
			self.skipping = True
				  
	def check_queue(self, comm_instance, phase, cmd, cmd_type, gcode, tags, *args, **kwargs):
		if cmd.startswith(self.reptag[0]):
			obj = self._check_object(cmd)
			if obj:
				cmd = None,
				entry = self._get_entry(obj)
				if entry["cancelled"]:
					self._logger.info("Hit a cancelled object, %s" % obj)
					self.skipping = True
					if len(self.beforegcode) > 0:
						return self.beforegcode
				else:
					if self.skipping:
						#Do any post skip injection here
						if len(self.aftergcode) > 0:
							cmd = self.aftergcode
						self.skipping = False
					self.active_object = entry["object"]
					self._updatedisplay()
								
		if self.skipping:
			return None,
		else:
			return cmd
			
	def get_update_information(self):
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
		
__plugin_name__ = "Cancel Objects"

def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = CancelobjectPlugin()

	global __plugin_hooks__
	__plugin_hooks__ = {	
		"octoprint.filemanager.preprocessor": __plugin_implementation__.modify_file,
		"octoprint.comm.protocol.gcode.queuing": __plugin_implementation__.check_queue,
		"octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
	}