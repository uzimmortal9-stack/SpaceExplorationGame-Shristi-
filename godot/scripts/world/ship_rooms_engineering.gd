extends RefCounted
class_name ShipRoomsEngineering
## Engineering half of the ship: fuel, life support, power, reactor, warp core,
## workshop and the cargo bay / boarding ramp.
##
## Split out of ship_rooms.gd purely for file size; `ShipRooms` owns the node
## tree and passes itself in as `host` so placement and host.tickers stay in one
## place.

var host: ShipRooms


func _init(owner: ShipRooms) -> void:
	host = owner


func build() -> void:
	_furnish_fuel()
	_furnish_life_support()
	_furnish_power()
	_furnish_reactor()
	_furnish_warp()
	_furnish_engineering()
	_furnish_cargo()
	_furnish_corridors()


# --------------------------------------------------------------- engineering

func _furnish_fuel() -> void:
	var r := host._room("fuel")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5
	var bay_z: float = r["z0"] + 2.2

	var fluids: Array = []
	for i in 3:
		var tx := cx - 2.4 + i * 2.4
		var shell := host._cylinder(0.62, 2.2, Color.BLACK, 0.0)
		var smat: StandardMaterial3D = shell.material_override
		smat.albedo_color = Color(0.62, 0.83, 0.91, 0.22)
		smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		smat.emission_enabled = false
		smat.roughness = 0.07
		shell.position = Vector3(tx, 1.25, bay_z)
		host.add_child(shell)

		var fluid := host._cylinder(0.56, 1.7, Color(0.063, 0.565, 0.753), 0.5)
		var fmat: StandardMaterial3D = fluid.material_override
		fmat.albedo_color = Color(0.165, 0.831, 1.0, 0.85)
		fmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		fluid.position = Vector3(tx, 1.0, bay_z)
		host.add_child(fluid)
		fluids.append(fluid)

		var tl := OmniLight3D.new()
		tl.light_color = Color(0.212, 0.784, 1.0)
		tl.light_energy = 1.3
		tl.omni_range = 4.5
		tl.position = Vector3(tx, 1.4, bay_z + 0.6)
		host.add_child(tl)

	host._glass(cx, 1.35, bay_z + 1.4, 8.0, 2.3, 0.0)
	for i in range(-2, 3):
		var mullion := host._box(Vector3(0.12, 2.5, 0.18), Color(0.078, 0.098, 0.125), 0.38, 0.8)
		mullion.position = Vector3(cx + i * 2.0, 1.35, bay_z + 1.4)
		host.add_child(mullion)

	for i in 4:
		var pipe := host._cylinder(0.09, 9.5, Color.BLACK, 0.0)
		var pmat: StandardMaterial3D = pipe.material_override
		pmat.albedo_color = Color(0.553, 0.592, 0.639)
		pmat.emission_enabled = false
		pmat.metallic = 0.9
		pipe.rotation.z = PI * 0.5
		pipe.position = Vector3(cx, 2.5 - i * 0.16, cz + 1.0 + i * 0.9)
		host.add_child(pipe)

	for i in 3:
		var vx := cx - 2.0 + i * 2.0
		var vz := cz + 1.9
		var wheel := MeshInstance3D.new()
		var torus := TorusMesh.new()
		torus.inner_radius = 0.16
		torus.outer_radius = 0.22
		wheel.mesh = torus
		var wmat := StandardMaterial3D.new()
		wmat.albedo_color = Color(0.753, 0.443, 0.227)
		wmat.metallic = 0.95
		wmat.roughness = 0.3
		wheel.material_override = wmat
		wheel.position = Vector3(vx, 1.55, vz)
		host.add_child(wheel)
		var open := [false]
		var idx := i
		Interact.register({
			"id": "valve_%d" % idx, "position": Vector3(vx, 1.5, vz), "radius": 1.7,
			"kind": &"toggle", "label": "Valve %d" % (idx + 1),
			"on_use": func() -> String:
				open[0] = not open[0]
				Audio.play_noise(0.5, 0.16, 900.0, 2400.0, 1.6)
				Audio.switch_clunk()
				return ("Close valve %d" if open[0] else "Open valve %d") % (idx + 1),
		})
		host.tickers.append(func(delta: float, _t: float) -> void:
			if open[0]: wheel.rotation.y += delta * 2.0)

	host.props.place("vessel_tall", r["x1"] - 1.6, cz + 1.0, {"height": 2.2, "solid": true})
	host.props.place("barrel_large", r["x1"] - 1.6, cz + 2.8, {"height": 1.4, "solid": true})
	host.props.place("console", r["x0"] + 1.3, cz + 1.4, {"ry": PI * 0.5, "height": 1.15, "solid": true})
	host._screen(r["x0"] + 0.08, 1.9, cz - 0.6, PI * 0.5, [
		{"text": "FUEL PROCESSING", "size": 24, "color": Color(1.0, 0.69, 0.0), "y": 22.0},
		{"text": "PRESSURE  212 kPa", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 72.0},
		{"text": "TEMP       -21 C", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 110.0},
		{"text": "FLOW      0.0 L/s", "size": 20, "color": Color(0.5, 0.58, 0.67), "y": 148.0},
		{"text": "PURITY     99.2%", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 186.0},
	], 1.5, 0.76, 0.85)

	var extracting := [0.0]
	Interact.register({
		"id": "fuel_extractor", "position": Vector3(r["x1"] - 1.6, 1.3, cz + 1.0), "radius": 2.2,
		"kind": &"use", "label": "Run hydrogen extractor",
		"on_use": func() -> String:
			if extracting[0] > 0.0: return "Extracting..."
			if GameState.systems["fuel"] > 0.985:
				Audio.ui_denied()
				GameState.notify("Tanks already full", &"warn")
				return "Run hydrogen extractor"
			extracting[0] = 6.0
			Audio.ui_confirm()
			Audio.play_noise(2.4, 0.16, 400.0, 1400.0)
			GameState.notify("Extracting hydrogen from local medium...")
			return "Run hydrogen extractor",
	})
	host.tickers.append(func(delta: float, _t: float) -> void:
		if extracting[0] > 0.0:
			extracting[0] -= delta
			GameState.systems["fuel"] = clampf(GameState.systems["fuel"] + delta * 0.03, 0.0, 1.0)
			if extracting[0] <= 0.0:
				Audio.ui_confirm()
				GameState.notify("Fuel at %d%%" % int(GameState.systems["fuel"] * 100.0), &"good")
				GameState.push_systems()
				extracting[0] = 0.0
		var lvl: float = 0.35 + GameState.systems["fuel"] * 0.65
		for f in fluids:
			f.scale.y = lerpf(f.scale.y, lvl, 1.0 - pow(0.01, delta))
			f.position.y = 1.0 - (1.0 - f.scale.y) * 0.85)


func _furnish_life_support() -> void:
	var r := host._room("lifesupport")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5
	host.props.line("vessel_tall", Vector2(r["x0"] + 1.4, r["z0"] + 1.5), Vector2(r["x0"] + 1.4, r["z1"] - 1.5), 3,
		{"height": 2.1, "solid": true})
	host.props.place("barrel_large", r["x1"] - 1.4, r["z0"] + 1.6, {"height": 1.5, "solid": true})
	host.props.place("barrel_large", r["x1"] - 1.4, r["z0"] + 3.4, {"height": 1.5, "solid": true})
	host.props.place("console", cx + 1.0, r["z1"] - 1.2, {"ry": PI, "height": 1.15, "solid": true})

	var fans: Array = []
	for i in 3:
		var fan := host.props.place("fan", r["x1"] - 0.3, r["z0"] + 2.0 + i * 2.0, {"ry": PI * 0.5, "height": 1.0, "y": 1.5})
		if fan: fans.append(fan)
	host.tickers.append(func(delta: float, _t: float) -> void:
		for f in fans: f.rotation.z += delta * 7.5)

	host._screen(r["x0"] + 0.08, 1.9, cz, PI * 0.5, [
		{"text": "LIFE SUPPORT", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 22.0},
		{"text": "O2         98%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 72.0},
		{"text": "CO2 SCRUB   OK", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 110.0},
		{"text": "HUMIDITY   41%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 148.0},
		{"text": "TEMP     21.4 C", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 186.0},
	], 1.6, 0.8, 0.85)

	Interact.register({
		"id": "ls_diag", "position": Vector3(cx + 1.0, 1.2, r["z1"] - 1.2), "radius": 2.1,
		"kind": &"use", "label": "Run life-support diagnostic",
		"on_use": func() -> String:
			Audio.play_tone(500.0, 0.6, 0.06, 900.0)
			GameState.notify("Life support nominal on all loops", &"good")
			return "Run life-support diagnostic",
	})


func _furnish_power() -> void:
	var r := host._room("power")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5
	host.props.line("crate_large", Vector2(r["x0"] + 1.4, r["z0"] + 1.6), Vector2(r["x0"] + 1.4, r["z1"] - 1.6), 3,
		{"ry": PI * 0.5, "height": 1.6, "solid": true})
	host.props.line("capsule", Vector2(r["x1"] - 1.4, r["z0"] + 1.8), Vector2(r["x1"] - 1.4, r["z1"] - 1.8), 4,
		{"height": 1.5, "solid": true, "collider_scale": 0.7})

	var names := ["ENGINES", "LIFE SUP", "WARP CORE", "LIGHTS", "SHIELDS", "SCIENCE"]
	for i in names.size():
		var sx := cx - 2.0 + float(i % 3) * 2.0
		var sy := 1.9 - float(i / 3) * 0.65
		var plate := host._box(Vector3(0.5, 0.42, 0.09), Color(0.078, 0.098, 0.125), 0.35, 0.85)
		plate.position = Vector3(sx, sy, r["z0"] + 0.14)
		host.add_child(plate)
		var lever := host._cylinder(0.045, 0.2, Color(0.0, 0.85, 1.0), 0.9)
		lever.position = Vector3(sx, sy + 0.02, r["z0"] + 0.22)
		host.add_child(lever)
		var on := [true]
		var idx := i
		var lmat: StandardMaterial3D = lever.material_override
		Interact.register({
			"id": "breaker_%d" % idx, "position": Vector3(sx, sy, r["z0"] + 0.5), "radius": 1.5,
			"kind": &"toggle", "label": "%s breaker" % names[idx],
			"on_use": func() -> String:
				on[0] = not on[0]
				Audio.switch_clunk()
				lmat.emission_energy_multiplier = 0.9 if on[0] else 0.06
				lever.rotation.x = 0.0 if on[0] else 0.6
				GameState.notify("%s %s" % [names[idx], "ONLINE" if on[0] else "ISOLATED"],
					&"good" if on[0] else &"warn")
				return "%s breaker" % names[idx],
		})

	host._screen(r["x1"] - 0.09, 1.95, cz, -PI * 0.5, [
		{"text": "POWER DISTRIBUTION", "size": 24, "color": Color(1.0, 0.69, 0.0), "y": 22.0},
		{"text": "ENGINES      34%", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 66.0},
		{"text": "LIFE SUP     12%", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 100.0},
		{"text": "WARP CORE    28%", "size": 20, "color": Color(1.0, 0.69, 0.0), "y": 134.0},
		{"text": "LIGHTS        6%", "size": 20, "color": Color(0.24, 0.91, 0.55), "y": 168.0},
		{"text": "RESERVE      20%", "size": 20, "color": Color(0.0, 0.94, 1.0), "y": 202.0},
	], 1.7, 0.85, 0.85)
	host.props.place("access_point", cx, r["z1"] - 1.2, {"height": 0.6, "solid": true})


func _furnish_reactor() -> void:
	var r := host._room("reactor")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	var core := Node3D.new()
	core.position = Vector3(cx, 0, cz)
	host.add_child(core)
	host.refs["reactor_core"] = core

	var pedestal := host._cylinder(1.2, 0.5, Color.BLACK, 0.0)
	var pm: StandardMaterial3D = pedestal.material_override
	pm.albedo_color = Color(0.11, 0.13, 0.16)
	pm.emission_enabled = false
	pedestal.position.y = 0.25
	core.add_child(pedestal)
	var cap := host._cylinder(1.2, 0.5, Color.BLACK, 0.0)
	var cm: StandardMaterial3D = cap.material_override
	cm.albedo_color = Color(0.11, 0.13, 0.16)
	cm.emission_enabled = false
	cap.position.y = 3.65
	core.add_child(cap)

	var plasma := host._cylinder(0.4, 2.85, Color(1.0, 0.722, 0.369), 2.0)
	var plmat: StandardMaterial3D = plasma.material_override
	plmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	plmat.albedo_color = Color(1.0, 0.722, 0.369, 0.85)
	plmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	plasma.position.y = 1.95
	core.add_child(plasma)

	var core_light := OmniLight3D.new()
	core_light.light_color = Color(1.0, 0.643, 0.271)
	core_light.light_energy = 6.0
	core_light.omni_range = 16.0
	core_light.position = Vector3(cx, 2.0, cz)
	host.add_child(core_light)

	var rings: Array = []
	for i in 3:
		var ring := MeshInstance3D.new()
		var t := TorusMesh.new()
		t.inner_radius = 0.86
		t.outer_radius = 0.98
		ring.mesh = t
		var rm := StandardMaterial3D.new()
		rm.albedo_color = Color(0.87, 0.9, 0.93)
		rm.metallic = 1.0
		rm.roughness = 0.14
		ring.material_override = rm
		ring.position.y = 1.0 + i * 0.95
		core.add_child(ring)
		rings.append(ring)

	for rail: Array in [[0.0, 2.4, 0.0], [0.0, -2.4, 0.0], [2.4, 0.0, PI * 0.5], [-2.4, 0.0, PI * 0.5]]:
		host.props.place("railing", cx + rail[0], cz + rail[1], {"ry": rail[2], "width": 4.0})

	host.props.line("console", Vector2(r["x0"] + 1.3, r["z0"] + 1.6), Vector2(r["x0"] + 1.3, r["z1"] - 1.6), 3,
		{"ry": PI * 0.5, "height": 1.15, "solid": true})
	host.props.place("barrel_large", r["x1"] - 1.4, r["z0"] + 1.5, {"height": 1.4, "solid": true})

	host._screen(r["x0"] + 0.08, 2.0, cz, PI * 0.5, [
		{"text": "PRIMARY REACTOR", "size": 24, "color": Color(1.0, 0.4, 0.0), "y": 22.0},
		{"text": "OUTPUT      72%", "size": 24, "color": Color(0.24, 0.91, 0.55), "y": 76.0},
		{"text": "CORE TEMP 2841 K", "size": 24, "color": Color(1.0, 0.69, 0.0), "y": 118.0},
		{"text": "CONTAINMENT  OK", "size": 24, "color": Color(0.24, 0.91, 0.55), "y": 160.0},
		{"text": "! RADIATION HAZARD", "size": 18, "color": Color(1.0, 0.13, 0.27), "y": 206.0},
	], 1.7, 0.85, 0.9)

	Interact.register({
		"id": "reactor_output", "position": Vector3(r["x0"] + 1.3, 1.2, cz), "radius": 2.2,
		"kind": &"use", "label": "Raise reactor output",
		"on_use": func() -> String:
			GameState.systems["reactor_output"] = clampf(GameState.systems["reactor_output"] + 0.12, 0.0, 1.0)
			GameState.systems["power"] = clampf(GameState.systems["power"] + 0.05, 0.0, 1.0)
			Audio.ui_confirm()
			GameState.notify("Reactor output %d%%" % int(GameState.systems["reactor_output"] * 100.0), &"good")
			GameState.push_systems()
			return "Raise reactor output",
	})

	host.tickers.append(func(delta: float, t: float) -> void:
		var out: float = GameState.systems["reactor_output"]
		plasma.scale = Vector3(1.0 + sin(t * 5.0) * 0.035, 1.0, 1.0 + cos(t * 4.3) * 0.035)
		plmat.emission_energy_multiplier = 1.4 + out * 1.2 + sin(t * 9.0) * 0.15
		core_light.light_energy = 4.0 + out * 5.0 + sin(t * 7.0) * 0.8
		for i in rings.size():
			rings[i].rotation.y += delta * (0.4 + i * 0.22) * (0.5 + out))


func _furnish_warp() -> void:
	var r := host._room("warp")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	var core := Node3D.new()
	core.position = Vector3(cx, 0, cz)
	host.add_child(core)
	host.refs["warp_core"] = core

	var base := host._cylinder(1.7, 0.55, Color.BLACK, 0.0)
	var bm: StandardMaterial3D = base.material_override
	bm.albedo_color = Color(0.11, 0.13, 0.16)
	bm.emission_enabled = false
	base.position.y = 0.275
	core.add_child(base)
	var top := host._cylinder(1.7, 0.55, Color.BLACK, 0.0)
	var tm: StandardMaterial3D = top.material_override
	tm.albedo_color = Color(0.11, 0.13, 0.16)
	tm.emission_enabled = false
	top.position.y = 4.05
	core.add_child(top)

	var energy := host._cylinder(0.6, 3.1, Color(0.286, 0.910, 1.0), 2.2)
	var em: StandardMaterial3D = energy.material_override
	em.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	em.albedo_color = Color(0.286, 0.910, 1.0, 0.7)
	em.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	energy.position.y = 2.16
	core.add_child(energy)

	var core_light := OmniLight3D.new()
	core_light.light_color = Color(0.286, 0.910, 1.0)
	core_light.light_energy = 5.0
	core_light.omni_range = 22.0
	core_light.position = Vector3(cx, 2.2, cz)
	host.add_child(core_light)
	host.refs["warp_core_light"] = core_light

	var spin_rings: Array = []
	for i in 4:
		var ring := MeshInstance3D.new()
		var t := TorusMesh.new()
		t.inner_radius = 1.37
		t.outer_radius = 1.47
		ring.mesh = t
		var rm := StandardMaterial3D.new()
		rm.albedo_color = Color(0.87, 0.9, 0.93)
		rm.metallic = 1.0
		rm.roughness = 0.14
		ring.material_override = rm
		ring.position.y = 0.9 + i * 0.85
		core.add_child(ring)
		spin_rings.append(ring)

	# ---- pedestal: red cover + physical lever -------------------------------
	var pedx := cx + 3.6
	var pedz := cz + 1.4
	host.props.place("console", pedx, pedz, {"ry": -PI * 0.5, "height": 1.1, "solid": true})

	var cover_pivot := Node3D.new()
	cover_pivot.position = Vector3(pedx, 1.12, pedz - 0.22)
	host.add_child(cover_pivot)
	var cover := host._box(Vector3(0.42, 0.028, 0.42), Color(0.824, 0.122, 0.200), 0.35, 0.25)
	cover.position.z = 0.21
	cover_pivot.add_child(cover)
	host.refs["warp_cover"] = cover_pivot

	var lever_pivot := Node3D.new()
	lever_pivot.position = Vector3(pedx, 1.1, pedz)
	host.add_child(lever_pivot)
	var shaft := host._cylinder(0.03, 0.36, Color.BLACK, 0.0)
	var shm: StandardMaterial3D = shaft.material_override
	shm.albedo_color = Color(0.87, 0.9, 0.93)
	shm.metallic = 1.0
	shm.emission_enabled = false
	shaft.position.y = 0.18
	lever_pivot.add_child(shaft)
	var knob := host._emissive_sphere(0.062, Color(1.0, 0.13, 0.27), 1.2)
	knob.position.y = 0.37
	lever_pivot.add_child(knob)
	host.refs["warp_lever"] = lever_pivot

	var cover_open := [false]
	var cover_t := [0.0]
	var lever_t := [0.0]

	Interact.register({
		"id": "warp_cover", "position": Vector3(pedx, 1.2, pedz), "radius": 1.9,
		"kind": &"open", "label": "Lift warp safety cover",
		"on_use": func() -> String:
			cover_open[0] = not cover_open[0]
			Audio.switch_clunk()
			return "Close warp safety cover" if cover_open[0] else "Lift warp safety cover",
	})
	Interact.register({
		"id": "warp_lever", "position": Vector3(pedx, 1.35, pedz), "radius": 1.8,
		"kind": &"lever", "label": "Pull warp lever", "detail": "Cover must be open",
		"enabled": false,
		"on_use": func() -> String:
			if not GameState.warp_armed:
				Audio.ui_denied()
				GameState.notify("Warp not armed - lock a target and arm from the bridge", &"warn")
				return "Pull warp lever"
			Audio.lever_pull()
			GameState.warp_lever_pulled = true
			lever_t[0] = 1.0
			host.warp_lever_pulled.emit()
			Interact.set_enabled("warp_lever", false)
			return "Warp engaged",
	})

	host._screen(r["x0"] + 0.09, 2.1, cz, PI * 0.5, [
		{"text": "WARP DRIVE", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 22.0},
		{"text": "CHARGE      0%", "size": 28, "color": Color(0.5, 0.58, 0.67), "y": 80.0},
		{"text": "CORE TEMP  318 K", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 128.0},
		{"text": "STABILITY  100%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 168.0},
		{"text": "DEST:  --", "size": 20, "color": Color(1.0, 0.69, 0.0), "y": 210.0},
	], 2.0, 1.0, 0.9)

	host.props.place("column_pipes", r["x0"] + 1.2, r["z0"] + 1.2, {"height": 4.4})
	host.props.place("column_pipes", r["x1"] - 1.2, r["z0"] + 1.2, {"height": 4.4})
	host.props.line("crate", Vector2(r["x0"] + 1.4, r["z1"] - 1.4), Vector2(r["x0"] + 3.4, r["z1"] - 1.4), 2,
		{"height": 0.7, "solid": true})

	host.tickers.append(func(delta: float, t: float) -> void:
		cover_t[0] = clampf(cover_t[0] + (delta * 2.6 if cover_open[0] else -delta * 2.6), 0.0, 1.0)
		cover_pivot.rotation.x = -host._ease(cover_t[0]) * 1.5
		Interact.set_enabled("warp_lever", cover_t[0] > 0.85 and not GameState.warp_lever_pulled)
		lever_pivot.rotation.x = lerpf(lever_pivot.rotation.x, lever_t[0] * 0.95, 1.0 - pow(0.002, delta))

		var charge: float = GameState.systems["warp_charge"]
		var spin := 0.5 + charge * 9.0
		for i in spin_rings.size():
			spin_rings[i].rotation.y += delta * spin * (1.0 if i % 2 == 0 else -1.0) * (0.6 + i * 0.2)
		core.rotation.y += delta * charge * 0.9
		em.emission_energy_multiplier = 1.6 + charge * 2.4 + sin(t * (4.0 + charge * 26.0)) * 0.2
		energy.scale = Vector3(1.0 + charge * 0.12, 1.0, 1.0 + charge * 0.12)
		core_light.light_energy = 4.0 + charge * 14.0 + sin(t * 12.0) * (0.5 + charge * 2.0))


func _furnish_engineering() -> void:
	var r := host._room("engineering")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5
	host.props.place("desk_large", cx, r["z0"] + 1.4, {"height": 0.9, "solid": true})
	host.props.line("shelves_tall", Vector2(r["x0"] + 0.9, r["z0"] + 3.0), Vector2(r["x0"] + 0.9, r["z1"] - 1.4), 2,
		{"ry": PI * 0.5, "height": 2.0, "solid": true, "collider_scale": 0.7})
	host.props.place("crate_large", r["x1"] - 1.4, r["z1"] - 1.5, {"height": 1.0, "solid": true})
	host.props.place("barrel_open", r["x1"] - 1.4, r["z1"] - 3.2, {"height": 0.9, "solid": true})
	host.props.scatter(["ammo_box", "healthpack", "keycard", "health_tube"],
		cx - 1.2, r["z0"] + 1.1, cx + 1.2, r["z0"] + 1.7, 7, {"height": 0.16, "y": 0.9})
	host.props.place("access_point", r["x1"] - 1.0, cz, {"height": 0.6, "solid": true})
	host._screen(r["x0"] + 0.08, 1.85, cz - 1.0, PI * 0.5, [
		{"text": "MAINTENANCE", "size": 24, "color": Color(1.0, 0.69, 0.0), "y": 22.0},
		{"text": "OPEN TASKS    3", "size": 22, "color": Color(1.0, 0.69, 0.0), "y": 78.0},
		{"text": "PORT RCS SEAL", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 118.0},
		{"text": "COOLANT LOOP B", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 152.0},
		{"text": "GEAR STRUT #3", "size": 18, "color": Color(0.5, 0.58, 0.67), "y": 186.0},
	], 1.3, 0.66, 0.8)
	Interact.register({
		"id": "eng_diag", "position": Vector3(cx, 1.1, r["z0"] + 1.4), "radius": 2.2,
		"kind": &"use", "label": "Run hull diagnostic",
		"on_use": func() -> String:
			Audio.play_tone(380.0, 0.8, 0.06, 820.0, &"triangle")
			GameState.notify("Hull integrity 100% - no breaches", &"good")
			return "Run hull diagnostic",
	})


func _furnish_cargo() -> void:
	var r := host._room("cargo")
	var cx: float = (r["x0"] + r["x1"]) * 0.5
	var cz: float = (r["z0"] + r["z1"]) * 0.5

	for i in 4:
		var pz: float = r["z0"] + 2.2 + i * 2.6
		host.props.place("crate_large", r["x0"] + 2.2, pz, {"height": 1.5, "solid": true, "ry": i * 0.04})
		if i % 2 == 0:
			host.props.place("crate", r["x0"] + 2.2, pz, {"height": 1.0, "y": 1.5, "ry": 0.2})
		host.props.place("crate_tarp" if i % 2 else "crate", r["x1"] - 2.2, pz,
			{"height": 1.2 if i % 2 else 1.1, "solid": true, "ry": -i * 0.05})
	host.props.place("container_full", r["x0"] + 2.4, cz + 3.4, {"height": 0.7, "solid": true})
	host.props.place("container_full", r["x1"] - 2.4, cz + 3.4, {"height": 0.7, "solid": true, "ry": 0.3})
	host.props.place("barrel", r["x1"] - 4.6, r["z0"] + 1.6, {"height": 0.9, "solid": true})
	host.props.place("barrel_large", r["x0"] + 4.8, r["z0"] + 1.6, {"height": 1.4, "solid": true})
	host.props.place("shelves_tall", r["x0"] + 1.2, r["z1"] - 2.4,
		{"ry": PI * 0.5, "height": 2.0, "solid": true, "collider_scale": 0.7})
	host.props.place("crate", 0.0, r["z0"] + 1.4, {"height": 0.8, "solid": true, "ry": 0.15})

	# EVA suit station
	for i in 2:
		var sx: float = r["x0"] + 1.4
		var sz := cz - 2.2 + i * 2.0
		host.props.place("pod", sx, sz, {"ry": PI * 0.5, "height": 2.0})
		var l := OmniLight3D.new()
		l.light_color = Color(0.498, 0.847, 1.0)
		l.light_energy = 1.0
		l.omni_range = 3.0
		l.position = Vector3(sx + 0.4, 1.6, sz)
		host.add_child(l)

	host._screen(r["x0"] + 0.09, 1.9, cz + 1.4, PI * 0.5, [
		{"text": "EVA SUIT STATION", "size": 24, "color": Color(0.0, 0.94, 1.0), "y": 22.0},
		{"text": "O2          100%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 74.0},
		{"text": "PRESSURE     NOM", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 112.0},
		{"text": "BATTERY      98%", "size": 22, "color": Color(0.24, 0.91, 0.55), "y": 150.0},
		{"text": "STATUS    STOWED", "size": 22, "color": Color(1.0, 0.69, 0.0), "y": 190.0},
	], 1.5, 0.76, 0.85)

	Interact.register({
		"id": "suit_up", "position": Vector3(r["x0"] + 2.0, 1.3, cz - 1.2), "radius": 2.4,
		"kind": &"use", "label": "Don EVA suit",
		"on_use": func() -> String:
			GameState.suit_on = not GameState.suit_on
			Audio.play_noise(1.2, 0.2, 500.0, 1800.0)
			Audio.ui_confirm()
			GameState.notify("EVA suit sealed - life support nominal" if GameState.suit_on
				else "EVA suit stowed", &"good")
			return "Stow EVA suit" if GameState.suit_on else "Don EVA suit",
	})

	# ---- boarding ramp -------------------------------------------------------
	var ramp := Node3D.new()
	ramp.name = "BoardingRamp"
	ramp.position = Vector3(cx, 0.02, r["z1"])
	host.add_child(ramp)
	host.refs["ramp"] = ramp

	var deck := host._box(Vector3(ShipLayout.RAMP_WIDTH, 0.16, ShipLayout.RAMP_LENGTH),
		Color(0.165, 0.188, 0.220), 0.58, 0.55)
	deck.position = Vector3(0, -0.08, ShipLayout.RAMP_LENGTH * 0.5)
	ramp.add_child(deck)
	for sx in [-1.0, 1.0]:
		var rail := host._box(Vector3(0.12, 0.5, ShipLayout.RAMP_LENGTH), Color(0.078, 0.098, 0.125), 0.38, 0.8)
		rail.position = Vector3(sx * ShipLayout.RAMP_WIDTH * 0.5 - sx * 0.06, 0.2, ShipLayout.RAMP_LENGTH * 0.5)
		ramp.add_child(rail)
	for i in range(1, 7):
		var grip := host._box(Vector3(ShipLayout.RAMP_WIDTH - 0.3, 0.03, 0.1), Color(1.0, 0.4, 0.0), 0.6, 0.1)
		grip.position = Vector3(0, 0.01, float(i) * ShipLayout.RAMP_LENGTH / 7.0)
		ramp.add_child(grip)

	# the ramp itself is walkable, and seals the hull when raised
	var ramp_body := StaticBody3D.new()
	ramp_body.collision_layer = 1
	var ramp_shape := CollisionShape3D.new()
	var rbox := BoxShape3D.new()
	rbox.size = Vector3(ShipLayout.RAMP_WIDTH, 0.16, ShipLayout.RAMP_LENGTH)
	ramp_shape.shape = rbox
	ramp_shape.position = Vector3(0, -0.08, ShipLayout.RAMP_LENGTH * 0.5)
	ramp_body.add_child(ramp_shape)
	ramp.add_child(ramp_body)

	var ramp_open := [false]
	var ramp_t := [0.0]
	Interact.register({
		"id": "cargo_ramp", "position": Vector3(cx, 1.2, r["z1"] - 1.6), "radius": 3.2,
		"kind": &"ramp", "label": "Lower boarding ramp",
		"on_use": func() -> String:
			if not GameState.has_landed:
				Audio.ui_denied()
				GameState.notify("Cannot open the ramp in flight", &"warn")
				return "Lower boarding ramp"
			ramp_open[0] = not ramp_open[0]
			Audio.play_noise(2.4, 0.3, 260.0, 900.0, 1.0)
			Audio.play_tone(70.0, 1.8, 0.1, 110.0, &"saw")
			GameState.notify("Boarding ramp lowering" if ramp_open[0] else "Boarding ramp raising")
			if ramp_open[0]:
				GameState.complete_objective("ramp")
			return "Raise boarding ramp" if ramp_open[0] else "Lower boarding ramp",
	})
	host.tickers.append(func(delta: float, _t: float) -> void:
		ramp_t[0] = clampf(ramp_t[0] + (delta * 0.42 if ramp_open[0] else -delta * 0.42), 0.0, 1.0)
		ramp.rotation.x = _ease_out(ramp_t[0]) * 0.60
		GameState.systems["ramp_angle"] = ramp_t[0])


func _furnish_corridors() -> void:
	var z := -12.0
	while z < 62.0:
		host.props.place("cable_a", -1.85, z, {"y": 2.55, "no_shadow": true})
		host.props.place("access_point", 1.55, z + 4.0, {"height": 0.55, "ry": -PI * 0.5})
		z += 8.0
	z = -8.0
	while z < 60.0:
		host.props.place("crate", -1.5, z, {"height": 0.5, "solid": true, "ry": 0.2})
		z += 16.0


func _ease_out(t: float) -> float:
	return 1.0 - pow(1.0 - t, 3.0)
