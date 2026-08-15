extends Node3D
class_name InteriorLighting
## Interior light rig. Port of `src/world/ship/lighting.ts`.
##
## Environment-first, exactly as in the web build:
##   1. A real HDRI drives the WorldEnvironment sky so PBR surfaces reflect
##      something (set up in game_world.gd).
##   2. Physical fixtures shape each room — an OmniLight3D standing in for the
##      ceiling panel plus a low fill, tinted per room mood.
##   3. Emissive is accent only. Remove this rig and the ship goes dark.
##
## Native gain: Forward+ uses clustered lighting, so ~90 real-time lights cost
## a fraction of what WebGL2's forward renderer charged. Only a handful cast
## shadows, chosen as "hero" fixtures.

const MOODS := {
	"command": {"key": Color(0.839, 0.902, 1.0), "ki": 5.5, "fill": Color(0.165, 0.267, 0.376), "fi": 1.1},
	"utility": {"key": Color(0.784, 0.839, 0.894), "ki": 4.6, "fill": Color(0.133, 0.188, 0.247), "fi": 0.9},
	"crew": {"key": Color(1.0, 0.851, 0.675), "ki": 4.8, "fill": Color(0.239, 0.184, 0.141), "fi": 1.3},
	"medical": {"key": Color(0.937, 0.973, 1.0), "ki": 7.0, "fill": Color(0.200, 0.282, 0.361), "fi": 1.2},
	"engineering":
	{"key": Color(1.0, 0.745, 0.447), "ki": 4.4, "fill": Color(0.251, 0.157, 0.102), "fi": 1.0},
	"science": {"key": Color(0.804, 0.953, 1.0), "ki": 5.4, "fill": Color(0.122, 0.267, 0.314), "fi": 1.1},
	"cargo": {"key": Color(0.812, 0.851, 0.902), "ki": 4.2, "fill": Color(0.137, 0.169, 0.212), "fi": 0.85},
	"service": {"key": Color(0.875, 0.914, 0.961), "ki": 4.4, "fill": Color(0.173, 0.216, 0.259), "fi": 1.0},
}

## Hero fixtures that cast shadows — everything else is unshadowed.
const SHADOW_SPOTS := [
	[0.0, -24.0, 3.2],  # bridge
	[0.0, 55.0, 4.6],  # warp core
	[0.0, 70.0, 4.2],  # cargo bay
]

var _panels: Array = []  ## [{light, base}]
var _fills: Array = []
var _alerts: Array[SpotLight3D] = []
var _pulse := 0.0
var _alert_on := false
var _time := 0.0


func build(quality: StringName = &"high") -> void:
	name = "InteriorLighting"

	for room: Dictionary in ShipLayout.ROOMS:
		var w: float = room["x1"] - room["x0"]
		var d: float = room["z1"] - room["z0"]
		var ceiling: float = room["ceiling"]
		var mood: String = room["mood"]

		# one panel per ~7 m so large rooms are evenly lit
		var nx := maxi(1, int(round(w / 7.0)))
		var nz := maxi(1, int(round(d / 7.0)))
		for i in nx:
			for j in nz:
				var x: float = room["x0"] + w * (i + 0.5) / nx
				var z: float = room["z0"] + d * (j + 0.5) / nz
				_add_panel(x, z, ceiling, mood, maxf(w / nx, d / nz))

		_add_fill(
			(room["x0"] + room["x1"]) * 0.5,
			ceiling * 0.55,
			(room["z0"] + room["z1"]) * 0.5,
			mood,
			maxf(w, d) * 1.1
		)

		if mood == "engineering" or room["id"] == "defense":
			_add_alert((room["x0"] + room["x1"]) * 0.5, ceiling - 0.3, (room["z0"] + room["z1"]) * 0.5)

	# corridor strip lighting
	for c: Dictionary in ShipLayout.CORRIDORS:
		var len_x: float = c["x1"] - c["x0"]
		var len_z: float = c["z1"] - c["z0"]
		var along_z := len_z > len_x
		var length := maxf(len_x, len_z)
		var count := maxi(1, int(round(length / 6.0)))
		for i in count:
			var t := (i + 0.5) / count
			var x: float = (c["x0"] + c["x1"]) * 0.5 if along_z else c["x0"] + len_x * t
			var z: float = c["z0"] + len_z * t if along_z else (c["z0"] + c["z1"]) * 0.5
			_add_panel(x, z, ShipLayout.DECK_HEIGHT, "utility", 3.0)

	if quality != &"low":
		for spot: Array in SHADOW_SPOTS:
			_add_shadow_spot(spot[0], spot[1], spot[2], quality)


func _add_panel(x: float, z: float, ceiling: float, mood: String, extent: float) -> void:
	var spec: Dictionary = MOODS.get(mood, MOODS["utility"])
	var light := OmniLight3D.new()
	light.light_color = spec["key"]
	light.light_energy = spec["ki"] * 0.30
	light.omni_range = maxf(extent * 1.4, 6.0)
	light.omni_attenuation = 1.4
	light.shadow_enabled = false
	light.position = Vector3(x, ceiling - 0.25, z)
	# distance fade keeps far rooms off the light cluster entirely
	light.distance_fade_enabled = true
	light.distance_fade_begin = 34.0
	light.distance_fade_length = 12.0
	add_child(light)
	_panels.append({"light": light, "base": light.light_energy})


func _add_fill(x: float, y: float, z: float, mood: String, dist: float) -> void:
	var spec: Dictionary = MOODS.get(mood, MOODS["utility"])
	var light := OmniLight3D.new()
	light.light_color = spec["fill"]
	light.light_energy = spec["fi"] * 0.55
	light.omni_range = dist
	light.omni_attenuation = 1.8
	light.shadow_enabled = false
	light.position = Vector3(x, y, z)
	light.distance_fade_enabled = true
	light.distance_fade_begin = 40.0
	light.distance_fade_length = 14.0
	add_child(light)
	_fills.append({"light": light, "base": light.light_energy})


func _add_alert(x: float, y: float, z: float) -> void:
	var s := SpotLight3D.new()
	s.light_color = Color(1.0, 0.2, 0.267)
	s.light_energy = 0.0
	s.spot_range = 12.0
	s.spot_angle = 45.0
	s.shadow_enabled = false
	s.position = Vector3(x, y, z)
	s.rotation.x = -PI * 0.5
	add_child(s)
	_alerts.append(s)


func _add_shadow_spot(x: float, z: float, ceiling: float, quality: StringName) -> void:
	var s := SpotLight3D.new()
	s.light_color = Color.WHITE
	s.light_energy = 3.2
	s.spot_range = 26.0
	s.spot_angle = 56.0
	s.spot_angle_attenuation = 0.6
	s.shadow_enabled = true
	# Soften the filter on lower presets; the atlas is shared across all
	# positional shadows, so hero lights need a tighter bias when it shrinks.
	var tighter := quality == &"medium"
	s.shadow_bias = 0.04 if tighter else 0.03
	s.shadow_normal_bias = 1.6 if tighter else 1.2
	s.position = Vector3(x, ceiling - 0.25, z)
	s.rotation.x = -PI * 0.5
	s.distance_fade_enabled = true
	s.distance_fade_begin = 32.0 if tighter else 45.0
	s.distance_fade_length = 15.0
	add_child(s)


func set_pulse(v: float) -> void:
	_pulse = clampf(v, 0.0, 1.0)


func set_alert(on: bool) -> void:
	_alert_on = on


func _process(delta: float) -> void:
	_time += delta
	if _pulse > 0.001:
		var f := 1.0 - _pulse * 0.45 * (0.5 + 0.5 * sin(_time * 11.0))
		for p: Dictionary in _panels:
			p["light"].light_energy = p["base"] * f
		for f2: Dictionary in _fills:
			f2["light"].light_energy = f2["base"] * (1.0 - _pulse * 0.3)
	elif _panels.size() > 0 and _panels[0]["light"].light_energy != _panels[0]["base"]:
		for p: Dictionary in _panels:
			p["light"].light_energy = p["base"]
		for f2: Dictionary in _fills:
			f2["light"].light_energy = f2["base"]

	var a := (0.5 + 0.5 * sin(_time * 6.0)) * 6.0 if _alert_on else 0.0
	for s in _alerts:
		s.light_energy = a