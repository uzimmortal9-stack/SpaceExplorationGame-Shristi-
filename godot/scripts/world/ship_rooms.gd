extends Node3D
class_name ShipRooms
## Furnishes every compartment and registers its interactions.
## Port of `src/world/ship/rooms*.ts`.
##
## Each `_furnish_*` places real downloaded models and wires the interactions
## for that room. Anything needing per-frame motion registers a ticker.

signal warp_lever_pulled()
signal pilot_seat_used()
signal nav_requested()
signal alert_toggled(on: bool)

## Long-form dialogue, hoisted so the call sites stay readable.
const LOG_CABIN_A := (
	"\u201cDay 412 - the Ilex relay still repeats every 11.4 hours. Command says it is "
	+ "debris. I have listened four hundred times. It is not debris.\u201d"
)
const LOG_CABIN_B := (
	"\u201cSample 118 from the Ilex canopy is still metabolising in vacuum. Whatever "
	+ "grows down there does not obey our biology.\u201d"
)
const BRIEFING_LINE := (
	"\u201cAurora Drift, this is Gateway Control. The Ilex relay has been repeating for "
	+ "eleven months. You are the closest hull. Investigate and report.\u201d"
)

var props: PropPlacer
var tickers: Array[Callable] = []
var refs: Dictionary = {}

var _elapsed := 0.0
var _rng := RandomNumberGenerator.new()


func build() -> void:
	name = "ShipRooms"
	_rng.seed = 0x51A1C3
	props = PropPlacer.new()
	props.setup()
	add_child(props)

	_signage()
	_furnish_bridge()
	_furnish_cabin("cabin_a")
	_furnish_cabin("cabin_b")
	_furnish_washroom("washroom_a")
	_furnish_washroom("washroom_b")
	_furnish_lounge()
	_furnish_galley()
	_furnish_medical()
	_furnish_science()
	_furnish_comms()
	_furnish_defense()
	_furnish_storage()
	var engineering := ShipRoomsEngineering.new(self)
	engineering.build()


func _process(delta: float) -> void:
	_elapsed += delta
	for t in tickers:
		t.call(delta, _elapsed)


# ------------------------------------------------------------------ helpers

func _room(id: String) -> Dictionary:
	for r: Dictionary in ShipLayout.ROOMS:
		if r["id"] == id:
			return r
	return {}


## A world-space display panel — the diegetic UI the design brief calls for.
func _screen(x: float, y: float, z: float, ry: float, lines: Array,
		w: float = 1.3, h: float = 0.66, energy: float = 0.8) -> MeshInstance3D:
	var vp := SubViewport.new()
	vp.size = Vector2i(512, 256)
	vp.transparent_bg = false
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	vp.disable_3d = true

	var bg := ColorRect.new()
	bg.color = Color(0.024, 0.043, 0.071)
	bg.size = Vector2(512, 256)
	vp.add_child(bg)

	var y_cursor := 22.0
	for line: Dictionary in lines:
		var lbl := Label.new()
		lbl.text = line["text"]
		lbl.position = Vector2(line.get("x", 24.0), line.get("y", y_cursor))
		lbl.add_theme_color_override("font_color", line.get("color", Color(0.0, 0.94, 1.0)))
		lbl.add_theme_font_size_override("font_size", int(line.get("size", 22)))
		vp.add_child(lbl)
		y_cursor += 34.0

	add_child(vp)

	var quad := QuadMesh.new()
	quad.size = Vector2(w, h)
	var mi := MeshInstance3D.new()
	mi.mesh = quad
	var mat := StandardMaterial3D.new()
	var tex := vp.get_texture()
	mat.albedo_texture = tex
	mat.emission_enabled = true
	mat.emission_texture = tex
	mat.emission_energy_multiplier = energy
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	mat.roughness = 0.24
	mi.material_override = mat
	mi.position = Vector3(x, y, z)
	mi.rotation.y = ry
	add_child(mi)
	return mi


func _signage() -> void:
	for room: Dictionary in ShipLayout.ROOMS:
		var cx: float = (room["x0"] + room["x1"]) * 0.5
		var toward: float = 1.0 if cx < 0.0 else -1.0
		var wall_x: float = room["x1"] if cx < 0.0 else room["x0"]
		var x := wall_x + toward * 0.08
		var z: float = (room["z0"] + room["z1"]) * 0.5
		var ry: float = PI * 0.5 if toward > 0.0 else -PI * 0.5

		if room["id"] in ["bridge", "warp", "cargo"]:
			x = cx
			z = room["z1"] - 0.08 if room["id"] == "bridge" else room["z0"] + 0.08
			ry = 0.0 if room["id"] == "bridge" else PI

		_screen(x, 2.28, z, ry, [
			{"text": room["name"], "size": 44, "color": Color(0.918, 0.965, 1.0), "y": 60.0},
			{"text": room["subtitle"], "size": 20, "color": Color(0.0, 0.94, 1.0), "y": 130.0},
		], 1.5, 0.64, 0.55)


# ------------------------------------------------------------------- bridge

func _furnish_bridge() -> void:
	var seat_l := props.place("seat", ShipLayout.PILOT_SEAT.x, ShipLayout.PILOT_SEAT.z,
		{"ry": PI, "height": 1.5})
	props.place("seat", ShipLayout.COPILOT_SEAT.x, ShipLayout.COPILOT_SEAT.z,
		{"ry": PI, "height": 1.5})
	refs["pilot_seat"] = seat_l

	# curved console bank in front of the seats
	for i in range(-3, 4):
		var angle := i * 0.16
		var x := sin(angle) * 3.4
		var z := -26.6 - cos(angle) * 3.4 * 0.18
		props.place("console" if i % 2 == 0 else "console_small", x, z,
			{"ry": PI + angle, "height": 1.15, "solid": true, "collider_scale": 0.8})

	# forward viewport with structural mullions
	_glass(0.0, 1.75, -29.92, 15.6, 2.5, 0.0)
	for i in range(-3, 4):
		var bar := _box(Vector3(0.12, 2.6, 0.22), Color(0.078, 0.098, 0.125), 0.38, 0.8)
		bar.position = Vector3(i * 2.55, 1.75, -29.86)
		add_child(bar)

	# angled MFDs, flush with the dashboard rake
	var nav := _screen(-1.5, 1.28, -26.1, 0.0, [
		{"text": "NAV / TARGET", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 18.0},
		{"text": "NO TARGET", "size": 40, "color": Color(1.0, 0.69, 0.0), "y": 82.0},
		{"text": "SELECT DESTINATION  [M]", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 150.0},
		{"text": "WARP   STANDBY", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 198.0},
	], 1.15, 0.58, 1.0)
	nav.rotation = Vector3(-0.62, 0.0, 0.0)
	refs["mfd_nav"] = nav

	var status := _screen(1.5, 1.28, -26.1, 0.0, [
		{"text": "SYSTEMS", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 18.0},
		{"text": "HULL      100%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 70.0},
		{"text": "FUEL       82%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 110.0},
		{"text": "POWER      94%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 150.0},
		{"text": "GEAR        UP", "size": 22, "color": Color(1.0, 0.69, 0.0), "y": 190.0},
	], 1.15, 0.58, 1.0)
	status.rotation = Vector3(-0.62, 0.0, 0.0)
	refs["mfd_status"] = status

	_build_hologram()
	_build_throttle()
	_build_dash_warp()
	_build_bridge_stations()

	# side windows
	for sx in [-1.0, 1.0]:
		_glass(sx * 8.92, 1.85, -23.0, 6.2, 1.5, -PI * 0.5 if sx > 0.0 else PI * 0.5)

	props.place("mug", -2.6, -25.4, {"height": 0.11, "y": 1.02})
	props.place("keycard", 2.35, -25.6, {"height": 0.02, "y": 1.02, "ry": 0.4})


func _build_hologram() -> void:
	var holo := Node3D.new()
	holo.name = "Hologram"
	holo.position = Vector3(0, 1.05, -24.3)
	add_child(holo)
	refs["hologram"] = holo

	props.place("teleporter", 0.0, -24.3, {"height": 0.75, "solid": true, "collider_scale": 0.7})

	var light := OmniLight3D.new()
	light.light_color = Color(0.22, 0.85, 1.0)
	light.light_energy = 1.6
	light.omni_range = 5.5
	light.position = Vector3(0, 1.5, -24.3)
	add_child(light)

	# sun
	var sun := _emissive_sphere(0.11, Color(1.0, 0.82, 0.54), 2.5)
	sun.position.y = 0.62
	holo.add_child(sun)

	var planets := [
		{"c": Color(0.659, 0.475, 0.310), "r": 0.32, "s": 0.032, "sp": 0.55},
		{"c": Color(0.373, 0.561, 0.816), "r": 0.46, "s": 0.044, "sp": 0.38},
		{"c": Color(0.275, 0.757, 0.478), "r": 0.62, "s": 0.052, "sp": 0.27},
		{"c": Color(0.816, 0.627, 0.353), "r": 0.80, "s": 0.070, "sp": 0.19},
	]
	var nodes: Array = []
	for i in planets.size():
		var p: Dictionary = planets[i]
		var ring := _orbit_ring(p["r"])
		ring.position.y = 0.62
		holo.add_child(ring)
		var body := _emissive_sphere(p["s"], p["c"], 1.6)
		body.position = Vector3(p["r"], 0.62, 0.0)
		holo.add_child(body)
		nodes.append({"node": body, "radius": p["r"], "speed": p["sp"],
			"angle": _rng.randf() * TAU})
	refs["holo_planets"] = nodes

	tickers.append(func(delta: float, _t: float) -> void:
		for pn: Dictionary in nodes:
			pn["angle"] += delta * pn["speed"]
			pn["node"].position = Vector3(
				cos(pn["angle"]) * pn["radius"], 0.62, sin(pn["angle"]) * pn["radius"])
		holo.rotation.y += delta * 0.08)

	Interact.register({
		"id": "holo_nav",
		"position": Vector3(0, 1.1, -24.3),
		"radius": 2.4,
		"kind": &"use",
		"label": "Navigation hologram",
		"detail": "Open target selector",
		"on_use": func() -> String:
			Audio.ui_confirm()
			nav_requested.emit()
			return "Navigation hologram",
	})


func _build_throttle() -> void:
	var base := _box(Vector3(0.34, 0.09, 0.28), Color(0.078, 0.098, 0.125), 0.38, 0.8)
	base.position = Vector3(-0.72, 1.06, -25.5)
	add_child(base)

	var lid := Node3D.new()
	lid.position = Vector3(-0.72, 1.11, -25.64)
	var plate := _box(Vector3(0.32, 0.03, 0.26), Color(1.0, 0.4, 0.0), 0.6, 0.1)
	plate.position.z = 0.13
	lid.add_child(plate)
	add_child(lid)
	refs["throttle_lid"] = lid

	var button := _cylinder(0.062, 0.035, Color(1.0, 0.69, 0.0), 0.9)
	button.position = Vector3(-0.72, 1.115, -25.5)
	add_child(button)

	var lid_open := [false]
	var lid_t := [0.0]

	Interact.register({
		"id": "throttle_lid",
		"position": Vector3(-0.72, 1.12, -25.5),
		"radius": 1.9,
		"kind": &"open",
		"label": "Open throttle safety lid",
		"on_use": func() -> String:
			lid_open[0] = not lid_open[0]
			Audio.switch_clunk()
			return "Close throttle safety lid" if lid_open[0] else "Open throttle safety lid",
	})

	Interact.register({
		"id": "throttle_button",
		"position": Vector3(-0.72, 1.14, -25.5),
		"radius": 1.7,
		"kind": &"button",
		"label": "Engage main drive",
		"detail": "Safety lid must be open",
		"enabled": false,
		# The button sits 2 cm under the lid, so both are always in range with an
		# identical facing dot. Distance/radius alone therefore always favoured
		# the lid (the wider radius), and the button — although enabled and lit —
		# could never become the candidate. The drive stayed unarmed, the pilot
		# seat refused to accept you, and the ship could never be flown.
		# Once the lid is open the button must outrank it.
		"priority": 1.0,
		"on_use": func() -> String:
			Audio.ui_confirm()
			Audio.lever_pull()
			GameState.throttle_unlocked = true
			GameState.notify("Main drive armed — take the pilot seat", &"good")
			GameState.complete_objective("throttle")
			Interact.set_enabled("throttle_button", false)
			return "Main drive armed",
	})

	var mat: StandardMaterial3D = button.material_override
	tickers.append(func(delta: float, t: float) -> void:
		lid_t[0] = clampf(lid_t[0] + (delta * 2.4 if lid_open[0] else -delta * 2.4), 0.0, 1.0)
		lid.rotation.x = -_ease(lid_t[0]) * 1.35
		Interact.set_enabled("throttle_button",
			lid_t[0] > 0.8 and not GameState.throttle_unlocked)
		if GameState.throttle_unlocked:
			mat.emission_energy_multiplier = 1.5
		elif lid_t[0] > 0.8:
			mat.emission_energy_multiplier = 0.7 + sin(t * 6.0) * 0.5
		else:
			mat.emission_energy_multiplier = 0.12)


func _build_dash_warp() -> void:
	var panel := _box(Vector3(0.4, 0.06, 0.3), Color(0.078, 0.098, 0.125), 0.38, 0.8)
	panel.position = Vector3(0.72, 1.06, -25.5)
	add_child(panel)

	var btn := _cylinder(0.055, 0.032, Color(1.0, 0.13, 0.27), 0.4)
	btn.position = Vector3(0.72, 1.11, -25.5)
	add_child(btn)

	Interact.register({
		"id": "dash_warp",
		"position": Vector3(0.72, 1.12, -25.5),
		"radius": 1.8,
		"kind": &"button",
		"label": "Arm warp drive",
		"detail": "Requires a locked target",
		"on_use": func() -> String:
			if GameState.target.is_empty():
				Audio.ui_denied()
				GameState.notify("No destination locked — use the nav hologram", &"warn")
				return "Arm warp drive"
			GameState.warp_armed = true
			Audio.ui_confirm()
			GameState.notify("Warp drive armed — pull the lever in the drive room", &"good")
			GameState.complete_objective("arm_warp")
			GameState.add_objective("pull_lever", "Pull the warp lever in the Warp Drive room")
			return "Warp drive armed",
	})

	var mat: StandardMaterial3D = btn.material_override
	tickers.append(func(_delta: float, t: float) -> void:
		mat.emission_energy_multiplier = (1.4 + sin(t * 8.0) * 0.4) if GameState.warp_armed else 0.25)


func _build_bridge_stations() -> void:
	# aft crew stations so the largest compartment reads as crewed
	for sx_val in [-1.0, 1.0]:
		var sx: float = float(sx_val)
		var bx: float = sx * 5.6
		var ry: float = -PI * 0.5 if sx > 0.0 else PI * 0.5
		props.place("desk_large", bx, -21.0, {"ry": ry, "height": 0.85, "solid": true})
		props.place("office_chair", bx - sx * 1.5, -21.0,
			{"ry": -ry, "height": 1.05, "solid": true, "collider_scale": 0.6})
		props.place("console_small", bx + sx * 0.25, -21.0, {"ry": ry, "height": 0.4, "y": 0.85})
		props.place("mug", bx - sx * 0.4, -20.2, {"height": 0.1, "y": 0.85})
		props.place("console", sx * 7.4, -24.4, {"ry": ry, "height": 1.15, "solid": true})
		props.place("shelves_thin", sx * 7.8, -18.4,
			{"ry": ry, "height": 1.9, "solid": true, "collider_scale": 0.7})
		props.place("plant_b", sx * 7.6, -17.0, {"height": 0.9})
		props.place("crate", sx * 6.6, -17.2, {"height": 0.55, "solid": true, "ry": sx * 0.3})

		if sx > 0.0:
			_screen(sx * 8.9, 1.95, -21.5, -PI * 0.5, [
				{"text": "PROPULSION", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 18.0},
				{"text": "MAIN DRIVE   IDLE", "size": 20, "color": Color(1.0, 0.69, 0.0), "y": 70.0},
				{"text": "RCS           NOM", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 110.0},
				{"text": "REACTOR       72%", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 150.0},
				{"text": "WARP CORE    COLD", "size": 20, "color": Color(0.5, 0.58, 0.67), "y": 190.0},
			], 1.5, 0.75, 0.8)
		else:
			_screen(sx * 8.9, 1.95, -21.5, PI * 0.5, [
				{"text": "NAVIGATION", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 18.0},
				{"text": "SYSTEM   AURELIS", "size": 20, "color": Color(0.86, 0.91, 0.95), "y": 70.0},
				{"text": "BODIES          6", "size": 20, "color": Color(0.86, 0.91, 0.95), "y": 110.0},
				{"text": "BEARING   214.6", "size": 20, "color": Color(1.0, 0.69, 0.0), "y": 150.0},
				{"text": "DRIFT      0.02", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 190.0},
			], 1.5, 0.75, 0.8)

	props.place("console", 0.0, -16.9, {"height": 1.15, "solid": true})
	props.place("railing", -4.5, -17.2, {"width": 4.0})
	props.place("railing", 4.5, -17.2, {"width": 4.0})
	props.place("light_floor", -8.4, -27.5, {"height": 0.5})
	props.place("light_floor", 8.4, -27.5, {"height": 0.5})
	props.place("healthpack", 6.2, -20.4, {"height": 0.14, "y": 0.85, "ry": 0.5})

	Interact.register({
		"id": "pilot_seat",
		"position": Vector3(ShipLayout.PILOT_SEAT.x, 0.9, ShipLayout.PILOT_SEAT.z + 0.6),
		"radius": 2.2,
		"kind": &"sit",
		"label": "Take the pilot seat",
		"on_use": func() -> String:
			pilot_seat_used.emit()
			return "Take the pilot seat",
	})


# ------------------------------------------------------------ crew quarters

func _furnish_cabin(id: String) -> void:
	var room := _room(id)
	var cz: float = (room["z0"] + room["z1"]) * 0.5
	var bed_z := cz - 1.2

	props.place("bed", room["x0"] + 2.0, bed_z,
		{"ry": PI * 0.5, "height": 0.62, "solid": true, "collider_scale": 0.95})
	props.place("nightstand", room["x0"] + 0.9, bed_z + 1.9, {"height": 0.55, "solid": true})
	props.place("desk_lamp", room["x0"] + 0.9, bed_z + 1.9, {"height": 0.42, "y": 0.55})

	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.788, 0.541)
	lamp.light_energy = 2.2
	lamp.omni_range = 4.2
	lamp.position = Vector3(room["x0"] + 0.9, 1.25, bed_z + 1.9)
	add_child(lamp)
	var lamp_on := [true]
	Interact.register({
		"id": "%s_lamp" % id,
		"position": Vector3(room["x0"] + 0.9, 1.1, bed_z + 1.9),
		"radius": 1.7,
		"kind": &"toggle",
		"label": "Desk lamp",
		"on_use": func() -> String:
			lamp_on[0] = not lamp_on[0]
			lamp.light_energy = 2.2 if lamp_on[0] else 0.0
			Audio.switch_clunk()
			return "Switch off desk lamp" if lamp_on[0] else "Switch on desk lamp",
	})

	# ---- PDLC smart window --------------------------------------------------
	var win := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(2.1, 1.15)
	win.mesh = quad
	var wmat := StandardMaterial3D.new()
	wmat.albedo_color = Color(0.87, 0.92, 0.95, 0.08)
	wmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	wmat.roughness = 0.05
	wmat.metallic = 0.0
	wmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	win.material_override = wmat
	win.position = Vector3(room["x0"] + 0.06, 1.6, bed_z)
	win.rotation.y = PI * 0.5
	add_child(win)

	var frame := _box(Vector3(0.1, 1.32, 2.28), Color(0.078, 0.098, 0.125), 0.38, 0.8)
	frame.position = Vector3(room["x0"] + 0.02, 1.6, bed_z)
	add_child(frame)

	var opaque := [0.0]
	var want := [false]
	Interact.register({
		"id": "%s_window" % id,
		"position": Vector3(room["x0"] + 0.5, 1.4, bed_z + 1.0),
		"radius": 2.0,
		"kind": &"toggle",
		"label": "Darken viewport (PDLC)",
		"on_use": func() -> String:
			want[0] = not want[0]
			Audio.play_tone(420.0, 0.22, 0.07, 300.0)
			return "Clear viewport (PDLC)" if want[0] else "Darken viewport (PDLC)",
	})
	tickers.append(func(delta: float, _t: float) -> void:
		opaque[0] = clampf(opaque[0] + (delta * 1.4 if want[0] else -delta * 1.4), 0.0, 1.0)
		var a := lerpf(0.08, 1.0, opaque[0])
		var c := lerpf(0.87, 0.02, opaque[0])
		wmat.albedo_color = Color(c, c + 0.03, c + 0.05, a)
		wmat.roughness = lerpf(0.05, 0.85, opaque[0]))

	# ---- workstation --------------------------------------------------------
	var desk_z := cz + 2.2
	props.place("desk_plain", room["x0"] + 2.2, desk_z,
		{"ry": PI * 0.5, "height": 0.76, "solid": true})
	var top := 0.76
	props.place("office_chair", room["x0"] + 3.6, desk_z,
		{"ry": -PI * 0.5, "height": 1.05, "solid": true, "collider_scale": 0.6})
	props.place("console_small", room["x0"] + 2.1, desk_z,
		{"ry": PI * 0.5, "height": 0.32, "y": top})

	var log_lines: Array = []
	if id == "cabin_a":
		log_lines = [
			{"text": "PERSONAL LOG", "size": 22, "color": Color(0.0, 0.94, 1.0), "y": 16.0},
			{"text": "Day 412 - still no", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 56.0},
			{"text": "answer from Ilex relay.", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 84.0},
			{"text": "Signal repeats every", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 120.0},
			{"text": "11.4 hours. Someone", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 148.0},
			{"text": "is down there.", "size": 19, "color": Color(1.0, 0.69, 0.0), "y": 176.0},
		]
	else:
		log_lines = [
			{"text": "RESEARCH LOG", "size": 22, "color": Color(0.0, 0.94, 1.0), "y": 16.0},
			{"text": "Sample 118 is still", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 56.0},
			{"text": "metabolising in vacuum.", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 84.0},
			{"text": "Whatever grows there", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 120.0},
			{"text": "does not obey our", "size": 19, "color": Color(0.86, 0.91, 0.95), "y": 148.0},
			{"text": "biology.", "size": 19, "color": Color(1.0, 0.69, 0.0), "y": 176.0},
		]
	var laptop := _screen(room["x0"] + 2.02, top + 0.26, desk_z, PI * 0.5, log_lines, 0.34, 0.21, 0.9)
	laptop.rotation.x = -0.16

	var say_text := LOG_CABIN_A if id == "cabin_a" else LOG_CABIN_B
	Interact.register({
		"id": "%s_laptop" % id,
		"position": Vector3(room["x0"] + 2.1, top + 0.25, desk_z),
		"radius": 1.7,
		"kind": &"read",
		"label": "Read personal log",
		"on_use": func() -> String:
			Audio.beep(1100.0)
			GameState.say(say_text, 8.0)
			return "Read personal log",
	})

	props.place("keycard", room["x0"] + 2.6, desk_z - 0.42, {"height": 0.02, "y": top, "ry": 0.3})
	props.place("healthpack", room["x0"] + 2.7, desk_z + 0.5, {"height": 0.1, "y": top, "ry": -0.4})
	props.place("mug", room["x0"] + 2.45, desk_z + 0.72, {"height": 0.1, "y": top})

	_screen(room["x0"] + 0.07, 1.72, desk_z, PI * 0.5, [
		{"text": "AURORA DRIFT", "size": 32, "color": Color(0.918, 0.965, 1.0), "y": 30.0},
		{"text": "SURVEY VESSEL - DECK 1", "size": 18, "color": Color(0.0, 0.94, 1.0), "y": 78.0},
		{"text": "MISSION DAY 412", "size": 22, "color": Color(1.0, 0.69, 0.0), "y": 128.0},
		{"text": "CREW 2 - O2 NOMINAL", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 172.0},
	], 1.15, 0.58, 0.75)

	props.place("closet", room["x1"] - 1.1, cz + 0.4, {"ry": -PI * 0.5, "height": 2.05, "solid": true})
	props.place("locker", room["x1"] - 1.1, cz - 2.0, {"ry": -PI * 0.5, "height": 1.9, "solid": true})
	props.place("bookshelf", (room["x0"] + room["x1"]) * 0.5 + 1.6, room["z0"] + 0.7,
		{"height": 1.85, "solid": true})
	props.place("plant_a", room["x1"] - 1.2, room["z1"] - 1.1, {"height": 0.7})
	props.place("crate", (room["x0"] + room["x1"]) * 0.5 - 0.4, room["z1"] - 1.2,
		{"height": 0.5, "ry": 0.3, "solid": true})
	props.place("trashcan", room["x0"] + 4.4, desk_z + 1.4, {"height": 0.45})
	props.place("carpet", (room["x0"] + room["x1"]) * 0.5, cz, {"width": 3.0, "no_shadow": true})

	Interact.register({
		"id": "%s_bed" % id,
		"position": Vector3(room["x0"] + 2.0, 0.7, bed_z),
		"radius": 2.0,
		"kind": &"use",
		"label": "Rest",
		"on_use": func() -> String:
			Audio.play_tone(300.0, 0.5, 0.06, 200.0)
			GameState.say("You lie back for a while. The hull ticks as it cools.", 4.0)
			return "Rest",
	})


# ---------------------------------------------------------- primitive makers

func _box(size: Vector3, colour: Color, rough: float, metal: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := BoxMesh.new()
	m.size = size
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = colour
	mat.roughness = rough
	mat.metallic = metal
	mi.material_override = mat
	return mi


func _cylinder(radius: float, height: float, emit: Color, energy: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := CylinderMesh.new()
	m.top_radius = radius
	m.bottom_radius = radius
	m.height = height
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.02, 0.027, 0.039)
	mat.roughness = 0.4
	mat.metallic = 0.2
	mat.emission_enabled = true
	mat.emission = emit
	mat.emission_energy_multiplier = energy
	mi.material_override = mat
	return mi


func _emissive_sphere(radius: float, colour: Color, energy: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	m.radial_segments = 16
	m.rings = 10
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = colour
	mat.emission_enabled = true
	mat.emission = colour
	mat.emission_energy_multiplier = energy
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


func _orbit_ring(radius: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := TorusMesh.new()
	m.inner_radius = radius - 0.004
	m.outer_radius = radius + 0.004
	m.rings = 64
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.184, 0.816, 1.0, 0.28)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


func _glass(x: float, y: float, z: float, w: float, h: float, ry: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(w, h)
	mi.mesh = q
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.62, 0.83, 0.91, 0.10)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.05
	mat.metallic = 0.0
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = mat
	mi.position = Vector3(x, y, z)
	mi.rotation.y = ry
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


func _ease(t: float) -> float:
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


# ------------------------------------------------------------- service rooms

func _furnish_washroom(id: String) -> void:
	var r := _room(id)
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	props.place("toilet", r["x0"] + 1.1, r["z0"] + 1.3, {"ry": PI * 0.5, "height": 0.82, "solid": true})
	props.place("sink", r["x1"] - 1.0, r["z0"] + 1.4, {"ry": -PI * 0.5, "height": 0.92, "solid": true})
	props.place("shower", r["x0"] + 1.3, r["z1"] - 1.5, {"height": 2.1, "solid": true, "collider_scale": 0.7})
	props.place("bathtub", cx + 1.0, r["z1"] - 1.5, {"ry": PI * 0.5, "height": 0.62, "solid": true})
	props.place("towel", r["x1"] - 0.3, r["z0"] + 3.0, {"ry": -PI * 0.5, "height": 0.7})
	props.place("trashcan", r["x0"] + 0.7, r["z0"] + 3.2, {"height": 0.42})
	props.place("drawer", r["x1"] - 1.0, r["z1"] - 3.4, {"ry": -PI * 0.5, "height": 0.85, "solid": true})

	var mirror := MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.9, 0.75)
	mirror.mesh = q
	var mmat := StandardMaterial3D.new()
	mmat.albedo_color = Color(0.87, 0.92, 0.95)
	mmat.roughness = 0.04
	mmat.metallic = 1.0
	mirror.material_override = mmat
	mirror.position = Vector3(r["x1"] - 0.09, 1.62, r["z0"] + 1.4)
	mirror.rotation.y = -PI * 0.5
	add_child(mirror)

	Interact.register({
		"id": "%s_sink" % id, "position": Vector3(r["x1"] - 0.8, 1.0, r["z0"] + 1.4),
		"radius": 1.6, "kind": &"use", "label": "Run the basin",
		"on_use": func() -> String:
			Audio.play_noise(1.6, 0.14, 2600.0, 1400.0, 0.7)
			return "Run the basin",
	})
	Interact.register({
		"id": "%s_shower" % id, "position": Vector3(r["x0"] + 1.3, 1.2, r["z1"] - 2.3),
		"radius": 1.8, "kind": &"use", "label": "Activate shower",
		"on_use": func() -> String:
			Audio.play_noise(2.6, 0.18, 3200.0, 1600.0, 0.5)
			return "Activate shower",
	})
	Interact.register({
		"id": "%s_toilet" % id, "position": Vector3(r["x0"] + 1.1, 0.8, r["z0"] + 1.3),
		"radius": 1.5, "kind": &"use", "label": "Vacuum flush",
		"on_use": func() -> String:
			Audio.play_noise(0.9, 0.26, 1800.0, 320.0, 1.6)
			return "Vacuum flush",
	})


func _furnish_lounge() -> void:
	var r := _room("lounge")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	props.place("couch", cx - 1.4, cz + 1.6, {"ry": PI, "height": 0.85, "solid": true, "collider_scale": 0.85})
	props.place("couch_small", cx + 2.4, cz + 0.4, {"ry": -PI * 0.5, "height": 0.85, "solid": true, "collider_scale": 0.85})
	props.place("chair_soft", cx - 3.0, cz - 0.6, {"ry": 0.6, "height": 0.95, "solid": true, "collider_scale": 0.7})
	props.place("table_round", cx - 1.2, cz - 0.2, {"height": 0.48, "solid": true, "collider_scale": 0.8})
	props.place("mug", cx - 1.0, cz - 0.1, {"height": 0.11, "y": 0.48})
	props.place("plate", cx - 1.5, cz - 0.35, {"height": 0.03, "y": 0.48})
	props.place("plant_b", r["x1"] - 1.0, r["z0"] + 1.0, {"height": 1.0})
	props.place("plant_c", r["x0"] + 1.0, r["z1"] - 1.0, {"height": 0.95})
	props.place("bookshelf", r["x1"] - 0.9, cz + 2.2, {"ry": -PI * 0.5, "height": 1.8, "solid": true})
	props.place("carpet", cx - 1.2, cz + 0.4, {"width": 4.2, "no_shadow": true})

	_glass(r["x1"] - 0.08, 1.75, cz, 6.4, 1.7, -PI * 0.5)
	_screen(r["x0"] + 0.08, 1.85, cz, PI * 0.5, [
		{"text": "AURORA MEDIA", "size": 28, "color": Color(0.918, 0.965, 1.0), "y": 30.0},
		{"text": "ARCHIVE - 214 TITLES", "size": 18, "color": Color(0.0, 0.94, 1.0), "y": 76.0},
		{"text": "NOW PLAYING", "size": 17, "color": Color(0.5, 0.58, 0.67), "y": 130.0},
		{"text": "Orbital Sunrise - Loop", "size": 20, "color": Color(1.0, 0.69, 0.0), "y": 168.0},
	], 1.9, 0.96, 0.7)
	_screen(r["x0"] + 0.08, 2.4, cz + 2.6, PI * 0.5, [
		{"text": "MISSION TIME", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 24.0},
		{"text": "412:07:44", "size": 52, "color": Color(1.0, 0.69, 0.0), "y": 80.0},
	], 0.86, 0.32, 0.9)

	var dx: float = r["x0"] + 1.4
	var dz: float = r["z0"] + 1.2
	props.place("vessel_tall", dx, dz, {"height": 1.35, "solid": true})
	var cup := props.place("mug", dx + 0.34, dz + 0.1, {"height": 0.1, "y": 0.86})
	if cup: cup.visible = false
	var brewing := [0.0]
	Interact.register({
		"id": "coffee", "position": Vector3(dx, 1.1, dz + 0.5), "radius": 1.9,
		"kind": &"button", "label": "Brew a coffee",
		"on_use": func() -> String:
			if brewing[0] > 0.0: return "Brewing..."
			brewing[0] = 2.6
			Audio.ui_click(); Audio.pour()
			GameState.notify("Galley: brewing")
			return "Brew a coffee",
	})
	tickers.append(func(delta: float, _t: float) -> void:
		if brewing[0] > 0.0:
			brewing[0] -= delta
			if cup: cup.visible = true
			if brewing[0] <= 0.0:
				Audio.play_tone(900.0, 0.09, 0.06)
				brewing[0] = 0.0)

	var orb := _emissive_sphere(0.075, Color(0.78, 0.85, 0.91), 0.3)
	orb.position = Vector3(cx + 0.6, 1.75, cz - 2.0)
	add_child(orb)
	tickers.append(func(_delta: float, t: float) -> void:
		orb.position.y = 1.75 + sin(t * 0.9) * 0.09
		orb.position.x = cx + 0.6 + cos(t * 0.6) * 0.06)


func _furnish_galley() -> void:
	var r := _room("galley")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	props.line("kitchen_counter", Vector2(r["x1"] - 1.0, r["z0"] + 1.4), Vector2(r["x1"] - 1.0, r["z0"] + 4.4), 3,
		{"ry": -PI * 0.5, "height": 0.92, "solid": true})
	props.place("kitchen_sink", r["x1"] - 1.0, r["z0"] + 5.6, {"ry": -PI * 0.5, "height": 0.92, "solid": true})
	props.place("oven", r["x1"] - 1.0, r["z1"] - 1.3, {"ry": -PI * 0.5, "height": 0.95, "solid": true})
	props.place("fridge", r["x0"] + 1.1, r["z0"] + 1.5, {"ry": PI * 0.5, "height": 1.9, "solid": true})
	props.line("kitchen_cabinet", Vector2(r["x1"] - 0.6, r["z0"] + 1.6), Vector2(r["x1"] - 0.6, r["z0"] + 4.6), 3,
		{"ry": -PI * 0.5, "height": 0.75, "y": 1.45})

	props.place("table_long", cx - 1.2, cz, {"height": 0.76, "solid": true, "collider_scale": 0.9})
	for i in 3:
		props.place("stool", cx - 2.6 + i * 1.4, cz - 1.35, {"height": 0.72, "solid": true, "collider_scale": 0.6})
		props.place("stool", cx - 2.6 + i * 1.4, cz + 1.35, {"height": 0.72, "solid": true, "collider_scale": 0.6})
		props.place("plate", cx - 2.6 + i * 1.4, cz - 0.4, {"height": 0.03, "y": 0.76})
		props.place("mug", cx - 2.4 + i * 1.4, cz + 0.35, {"height": 0.1, "y": 0.76})
	props.place("healthpack", cx - 0.4, cz + 0.1, {"height": 0.12, "y": 0.76, "ry": 0.4})

	var fdx: float = r["x0"] + 1.2
	var fdz: float = cz + 1.6
	props.place("vessel", fdx, fdz, {"height": 1.2, "solid": true})
	Interact.register({
		"id": "food_dispenser", "position": Vector3(fdx, 1.1, fdz + 0.5), "radius": 1.9,
		"kind": &"button", "label": "Dispense ration",
		"on_use": func() -> String:
			Audio.ui_click()
			Audio.play_noise(1.5, 0.12, 700.0, 1400.0)
			GameState.notify("Rehydration cycle started")
			return "Dispense ration",
	})
	Interact.register({
		"id": "galley_cabinet", "position": Vector3(r["x1"] - 0.9, 1.5, r["z0"] + 3.0), "radius": 1.8,
		"kind": &"open", "label": "Open supply cabinet",
		"on_use": func() -> String:
			Audio.switch_clunk()
			GameState.say("Sealed pouches, powdered stock, and someone's hoarded chilli sauce.", 4.0)
			return "Open supply cabinet",
	})
	_screen(r["x0"] + 0.08, 1.8, r["z1"] - 1.8, PI * 0.5, [
		{"text": "GALLEY", "size": 26, "color": Color(0.918, 0.965, 1.0), "y": 28.0},
		{"text": "STORES   412 DAYS", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 80.0},
		{"text": "WATER RECLAIM  98%", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 120.0},
		{"text": "STERILISER   READY", "size": 20, "color": Color(0.0, 0.94, 1.0), "y": 160.0},
	], 1.3, 0.66, 0.7)


func _furnish_medical() -> void:
	var r := _room("medical")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	props.place("bed", cx - 2.2, cz - 1.4, {"ry": PI * 0.5, "height": 0.62, "solid": true})
	props.place("bed", cx - 2.2, cz + 1.6, {"ry": PI * 0.5, "height": 0.62, "solid": true})

	for bz in [cz - 1.4, cz + 1.6]:
		var post := _box(Vector3(0.1, 1.5, 0.1), Color(0.87, 0.9, 0.93), 0.14, 1.0)
		post.position = Vector3(cx - 2.2, 2.2, bz - 1.3)
		add_child(post)
		var head := _cylinder(0.27, 0.14, Color(0.05, 0.05, 0.05), 0.0)
		head.position = Vector3(cx - 2.2, 2.72, bz)
		add_child(head)
		var lamp := SpotLight3D.new()
		lamp.light_color = Color(0.957, 0.984, 1.0)
		lamp.light_energy = 3.0
		lamp.spot_range = 6.0
		lamp.spot_angle = 38.0
		lamp.position = Vector3(cx - 2.2, 2.6, bz)
		lamp.rotation.x = -PI * 0.5
		add_child(lamp)

	props.place("pod", r["x1"] - 1.5, r["z0"] + 2.0, {"ry": -PI * 0.5, "height": 2.3, "solid": true, "collider_scale": 0.75})
	props.place("capsule", r["x1"] - 1.5, r["z0"] + 4.4, {"height": 1.5, "solid": true})
	props.line("shelves_thin", Vector2(r["x0"] + 0.9, r["z1"] - 1.4), Vector2(r["x0"] + 0.9, r["z1"] - 3.4), 2,
		{"ry": PI * 0.5, "height": 1.9, "solid": true, "collider_scale": 0.7})
	props.place("desk_medium", cx + 1.4, r["z1"] - 1.3, {"ry": PI, "height": 0.8, "solid": true})
	props.scatter(["syringe", "health_tube", "healthpack"], cx + 0.5, r["z1"] - 1.6, cx + 2.3, r["z1"] - 1.0, 6,
		{"height": 0.15, "y": 0.8})

	_screen(r["x0"] + 0.08, 1.9, cz - 1.4, PI * 0.5, [
		{"text": "PATIENT 01", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 22.0},
		{"text": "BPM    68", "size": 28, "color": Color(0.24, 0.91, 0.55), "y": 76.0},
		{"text": "SPO2   98%", "size": 28, "color": Color(0.24, 0.91, 0.55), "y": 124.0},
		{"text": "TEMP   36.6C", "size": 28, "color": Color(0.24, 0.91, 0.55), "y": 172.0},
	], 1.2, 0.62, 0.85)

	Interact.register({
		"id": "med_scanner", "position": Vector3(cx - 2.2, 1.1, cz - 1.4), "radius": 2.2,
		"kind": &"use", "label": "Run medical scan",
		"on_use": func() -> String:
			Audio.play_tone(520.0, 1.4, 0.07, 1400.0)
			GameState.notify("Diagnostic scan running...")
			GameState.say("Scan complete. No anomalies. Elevated cortisol - recommend rest.", 5.0)
			return "Run medical scan",
	})


func _furnish_science() -> void:
	var r := _room("science")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	props.line("desk_large", Vector2(r["x0"] + 1.6, r["z0"] + 1.6), Vector2(r["x0"] + 1.6, r["z1"] - 1.6), 3,
		{"ry": PI * 0.5, "height": 0.85, "solid": true})
	props.line("shelves_tall", Vector2(r["x1"] - 0.9, r["z0"] + 1.8), Vector2(r["x1"] - 0.9, r["z1"] - 1.8), 3,
		{"ry": -PI * 0.5, "height": 2.0, "solid": true, "collider_scale": 0.7})
	props.scatter(["health_tube", "syringe", "vessel", "capsule"],
		r["x0"] + 1.1, r["z0"] + 1.8, r["x0"] + 2.1, r["z1"] - 1.8, 12, {"height": 0.2, "y": 0.85})
	props.place("plant_c", cx + 2.2, r["z0"] + 1.8, {"height": 1.0, "y": 0.3})

	var tank_light := OmniLight3D.new()
	tank_light.light_color = Color(0.384, 1.0, 0.69)
	tank_light.light_energy = 1.6
	tank_light.omni_range = 4.0
	tank_light.position = Vector3(cx + 2.2, 1.2, r["z0"] + 1.8)
	add_child(tank_light)

	props.place("console", cx + 1.2, cz + 1.0, {"height": 1.0, "solid": true})
	var specimen := _emissive_sphere(0.22, Color(0.369, 0.941, 0.784), 1.2)
	specimen.position = Vector3(cx + 1.2, 1.35, cz + 1.0)
	add_child(specimen)
	tickers.append(func(delta: float, _t: float) -> void:
		specimen.rotation.y += delta * 0.7)

	Interact.register({
		"id": "lab_analyse", "position": Vector3(cx + 1.2, 1.2, cz + 1.0), "radius": 2.1,
		"kind": &"use", "label": "Analyse sample",
		"on_use": func() -> String:
			Audio.play_tone(400.0, 1.8, 0.06, 1600.0, &"triangle")
			GameState.notify("Spectrograph running...")
			GameState.say("Xi-4 has no terrestrial analogue. It is still metabolising after 40 days in vacuum.", 6.0)
			return "Analyse sample",
	})
	_screen(r["x0"] + 0.08, 1.85, cz, PI * 0.5, [
		{"text": "SPECTROGRAPH", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 22.0},
		{"text": "AWAITING SAMPLE", "size": 28, "color": Color(0.5, 0.58, 0.67), "y": 100.0},
		{"text": "PLACE SPECIMEN ON PLINTH", "size": 16, "color": Color(0.5, 0.58, 0.67), "y": 180.0},
	], 1.6, 0.8, 0.8)


func _furnish_comms() -> void:
	var r := _room("comms")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	props.place("table_long", cx, cz, {"height": 0.76, "solid": true, "collider_scale": 0.9})
	for seat: Array in [[cx - 1.6, cz - 1.5, 0.0], [cx, cz - 1.5, 0.0], [cx + 1.6, cz - 1.5, 0.0],
			[cx - 1.6, cz + 1.5, PI], [cx, cz + 1.5, PI], [cx + 1.6, cz + 1.5, PI]]:
		props.place("chair_soft", seat[0], seat[1], {"ry": seat[2], "height": 0.95, "solid": true, "collider_scale": 0.6})

	var disc := _emissive_sphere(0.34, Color(0.247, 0.816, 1.0), 0.8)
	disc.position = Vector3(cx, 1.22, cz)
	add_child(disc)
	var hl := OmniLight3D.new()
	hl.light_color = Color(0.247, 0.816, 1.0)
	hl.light_energy = 1.4
	hl.omni_range = 4.0
	hl.position = Vector3(cx, 1.3, cz)
	add_child(hl)
	tickers.append(func(delta: float, t: float) -> void:
		disc.rotation.y += delta * 0.35
		hl.light_energy = 1.4 + sin(t * 3.0) * 0.25)

	_screen(r["x1"] - 0.09, 1.95, cz, -PI * 0.5, [
		{"text": "MISSION BRIEFING", "size": 28, "color": Color(0.918, 0.965, 1.0), "y": 26.0},
		{"text": "TARGET: ILEX PRIME (III)", "size": 20, "color": Color(1.0, 0.69, 0.0), "y": 78.0},
		{"text": "REPEATING SIGNAL - 11.4 H", "size": 18, "color": Color(0.0, 0.94, 1.0), "y": 118.0},
		{"text": "BEARING 214.6 MARK 9", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 156.0},
		{"text": "AUTHORISATION: OKONKWO", "size": 16, "color": Color(0.5, 0.58, 0.67), "y": 200.0},
	], 3.0, 1.5, 0.75)

	props.place("console", r["x0"] + 1.3, r["z0"] + 1.4, {"ry": PI * 0.5, "height": 1.15, "solid": true})
	props.place("console_small", r["x0"] + 1.3, r["z1"] - 1.4, {"ry": PI * 0.5, "height": 1.4, "solid": true})
	props.place("satellite_dish", r["x0"] + 1.4, cz, {"height": 1.6, "solid": true, "collider_scale": 0.6})

	Interact.register({
		"id": "comms_brief", "position": Vector3(cx, 1.1, cz), "radius": 2.6,
		"kind": &"use", "label": "Play mission briefing",
		"on_use": func() -> String:
			Audio.ui_confirm()
			GameState.say(BRIEFING_LINE, 9.0)
			GameState.complete_objective("briefing")
			return "Play mission briefing",
	})
	Interact.register({
		"id": "comms_console", "position": Vector3(r["x0"] + 1.3, 1.2, r["z0"] + 1.4), "radius": 1.9,
		"kind": &"use", "label": "Long-range comms",
		"on_use": func() -> String:
			Audio.play_noise(1.2, 0.1, 1400.0, 600.0, 2.5)
			GameState.say("Static. Then, faintly, the signal again - eleven tones, always in the same order.", 6.0)
			return "Long-range comms",
	})


func _furnish_defense() -> void:
	var r := _room("defense")
	var cz: float = (r["z0"] + r["z1"]) * 0.5
	props.line("locker", Vector2(r["x0"] + 0.9, r["z0"] + 1.4), Vector2(r["x0"] + 0.9, r["z1"] - 1.4), 4,
		{"ry": PI * 0.5, "height": 1.95, "solid": true})
	props.place("rifle", r["x0"] + 1.6, r["z0"] + 2.2, {"height": 0.14, "y": 1.35, "ry": PI * 0.5})
	props.place("sniper", r["x0"] + 1.6, r["z0"] + 3.6, {"height": 0.14, "y": 1.35, "ry": PI * 0.5})
	props.place("pistol", r["x0"] + 1.6, r["z0"] + 4.8, {"height": 0.1, "y": 1.35, "ry": PI * 0.5})
	props.place("ammo_box", (r["x0"] + r["x1"]) * 0.5 - 0.5, r["z1"] - 1.3, {"height": 0.32, "solid": true})
	props.place("crate", (r["x0"] + r["x1"]) * 0.5 + 0.9, r["z1"] - 1.3, {"height": 0.6, "solid": true})
	props.line("console", Vector2(r["x1"] - 1.3, r["z0"] + 1.6), Vector2(r["x1"] - 1.3, r["z1"] - 1.6), 3,
		{"ry": -PI * 0.5, "height": 1.2, "solid": true})

	var feeds := ["BOW CAM", "CARGO CAM", "ENGINE CAM", "AFT CAM"]
	for i in 4:
		var row := i / 2   # deliberate integer division: 2x2 grid of feeds
		var col := i % 2
		_screen(r["x1"] - 0.09, 1.62 + float(row) * 0.72, cz - 1.1 + float(col) * 2.2, -PI * 0.5, [
			{"text": feeds[i], "size": 20, "color": Color(0.0, 0.94, 1.0), "y": 18.0},
			{"text": "SIGNAL OK", "size": 24, "color": Color(0.24, 0.91, 0.55), "y": 76.0},
			{"text": "--- NO CONTACT ---", "size": 16, "color": Color(0.5, 0.58, 0.67), "y": 132.0},
		], 1.0, 0.56, 0.65)

	var alert := [false]
	Interact.register({
		"id": "security_alert", "position": Vector3(r["x1"] - 1.3, 1.3, cz), "radius": 2.2,
		"kind": &"toggle", "label": "Toggle red alert",
		"on_use": func() -> String:
			alert[0] = not alert[0]
			Audio.switch_clunk()
			if alert[0]: Audio.alarm()
			GameState.notify("RED ALERT - all hands" if alert[0] else "Alert cleared",
				&"warn" if alert[0] else &"good")
			alert_toggled.emit(alert[0])
			return "Clear red alert" if alert[0] else "Toggle red alert",
	})
	Interact.register({
		"id": "turret_control", "position": Vector3(r["x1"] - 1.3, 1.3, cz + 2.2), "radius": 2.0,
		"kind": &"use", "label": "Turret camera",
		"on_use": func() -> String:
			Audio.beep(700.0)
			GameState.say("Aft turret slews to bearing 180. Nothing but stars and the slow wheel of the belt.", 5.0)
			return "Turret camera",
	})


func _furnish_storage() -> void:
	var r := _room("storage")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	props.line("shelves_tall", Vector2(r["x0"] + 0.9, r["z0"] + 1.6), Vector2(r["x0"] + 0.9, r["z1"] - 1.6), 4,
		{"ry": PI * 0.5, "height": 2.1, "solid": true, "collider_scale": 0.8})
	props.line("shelves_short", Vector2(r["x1"] - 0.9, r["z0"] + 2.0), Vector2(r["x1"] - 0.9, r["z1"] - 3.4), 3,
		{"ry": -PI * 0.5, "height": 1.3, "solid": true, "collider_scale": 0.8})
	props.place("crate_large", cx + 1.4, r["z0"] + 1.5, {"height": 1.0, "solid": true, "ry": 0.1})
	props.place("crate", cx + 1.2, r["z0"] + 3.2, {"height": 0.75, "solid": true, "ry": -0.2})
	props.place("crate_tarp", cx - 1.0, r["z1"] - 1.6, {"height": 0.9, "solid": true, "ry": 0.4})
	props.place("container_full", cx + 1.6, r["z1"] - 3.0, {"height": 0.55, "solid": true})
	props.place("barrel", r["x1"] - 2.2, r["z1"] - 1.4, {"height": 0.9, "solid": true})
	props.place("barrel_open", r["x1"] - 3.2, r["z1"] - 1.4, {"height": 0.9, "solid": true})
	props.scatter(["healthpack", "health_tube", "ammo_box", "keycard", "syringe"],
		r["x0"] + 0.6, r["z0"] + 1.8, r["x0"] + 1.2, r["z1"] - 1.8, 10, {"height": 0.16, "y": 1.05})

	# ---- freezer with two-part sliding glass --------------------------------
	var fzx := cx - 1.6
	var fzz: float = r["z0"] + 2.4
	var cabinet := _box(Vector3(2.0, 2.1, 0.9), Color(0.553, 0.592, 0.639), 0.34, 0.9)
	cabinet.position = Vector3(fzx, 1.05, fzz)
	add_child(cabinet)
	var glass_l := _box(Vector3(0.9, 0.92, 0.04), Color(0.62, 0.83, 0.91), 0.07, 0.0)
	var gmat: StandardMaterial3D = glass_l.material_override
	gmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	gmat.albedo_color.a = 0.35
	glass_l.position = Vector3(fzx - 0.45, 1.52, fzz + 0.46)
	add_child(glass_l)
	var glass_r := _box(Vector3(0.9, 0.92, 0.04), Color(0.62, 0.83, 0.91), 0.07, 0.0)
	var gmat2: StandardMaterial3D = glass_r.material_override
	gmat2.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	gmat2.albedo_color.a = 0.35
	glass_r.position = Vector3(fzx + 0.45, 0.58, fzz + 0.46)
	add_child(glass_r)

	var chill := OmniLight3D.new()
	chill.light_color = Color(0.561, 0.847, 1.0)
	chill.light_energy = 1.4
	chill.omni_range = 3.4
	chill.position = Vector3(fzx, 1.5, fzz + 0.3)
	add_child(chill)

	var fz_open := [false]
	var fz_t := [0.0]
	Interact.register({
		"id": "freezer", "position": Vector3(fzx, 1.4, fzz + 0.7), "radius": 2.2,
		"kind": &"open", "label": "Open freezer",
		"on_use": func() -> String:
			fz_open[0] = not fz_open[0]
			Audio.play_noise(0.6, 0.2, 500.0, 1600.0, 0.9)
			return "Close freezer" if fz_open[0] else "Open freezer",
	})
	tickers.append(func(delta: float, _t: float) -> void:
		fz_t[0] = clampf(fz_t[0] + (delta * 1.5 if fz_open[0] else -delta * 1.5), 0.0, 1.0)
		var e := _ease(fz_t[0])
		glass_l.position.y = lerpf(1.52, 2.02, e)
		glass_r.position.y = lerpf(0.58, 0.10, e))

	for i in 3:
		var lx := cx - 1.4 + i * 1.4
		var lz: float = r["z1"] - 1.0
		var locker := props.place("locker", lx, lz, {"ry": PI, "height": 1.9, "solid": true})
		var open := [false]
		var t := [0.0]
		var idx := i
		Interact.register({
			"id": "locker_%d" % idx, "position": Vector3(lx, 1.1, lz - 0.6), "radius": 1.8,
			"kind": &"open", "label": "Open locker %d" % (idx + 1),
			"on_use": func() -> String:
				open[0] = not open[0]
				Audio.switch_clunk()
				return ("Close locker %d" if open[0] else "Open locker %d") % (idx + 1),
		})
		tickers.append(func(delta: float, _tt: float) -> void:
			t[0] = clampf(t[0] + (delta * 2.2 if open[0] else -delta * 2.2), 0.0, 1.0)
			if locker: locker.rotation.y = PI + _ease(t[0]) * 0.9)

