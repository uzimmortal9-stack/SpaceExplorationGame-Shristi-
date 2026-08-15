extends Node3D
## Game — orchestration and the phase machine. Port of `src/game.ts`.
##
## THE KEY DIFFERENCE FROM THE WEB BUILD
##
## The browser version built BOTH scenes during boot — the ship *and* the
## 2.7M-triangle planet — decoded ~30 MB of GLB, and ran four PMREM convolutions
## before the menu appeared. That is what killed the tab.
##
## Here:
##   * only the SHIP's asset group loads at startup (~95 models, threaded)
##   * the planet's library is requested when warp is engaged, while the tunnel
##     cinematic is playing, so the load is hidden inside gameplay
##   * the planet is freed when leaving the surface, and vice versa
##   * every load runs on a worker thread, so the window never locks up

const QUALITY_SETTINGS := {
	&"low": {"scale": 0.7, "shadows": false, "msaa": Viewport.MSAA_DISABLED, "ssao": false},
	&"medium": {"scale": 0.85, "shadows": true, "msaa": Viewport.MSAA_2X, "ssao": false},
	&"high": {"scale": 1.0, "shadows": true, "msaa": Viewport.MSAA_4X, "ssao": true},
}

@onready var world_env: WorldEnvironment = $WorldEnvironment
@onready var hud: Hud = $Hud
@onready var boot_screen: Control = $BootScreen
@onready var boot_bar: ProgressBar = $BootScreen/Center/VBox/Bar
@onready var boot_status: Label = $BootScreen/Center/VBox/Status
@onready var menu: Control = $Menu
@onready var distort: ColorRect = $Distort

var player: Player
var ship_root: Node3D
var ship_structure: ShipBuilder
var ship_rooms: ShipRooms
var ship_lighting: InteriorLighting
var doors: DoorSystem
var exterior: ShipExterior
var planet: Planet
var flight: FlightSystem
var warp: WarpSystem
var descent: DescentSystem
var flight_camera: Camera3D

var quality: StringName = &"high"
var _on_surface := false
var _landed_origin := Vector3(0, 0, -40)
var _planet_requested := false


func _ready() -> void:
	Engine.max_fps = 0
	_apply_quality(quality)
	_apply_space_environment()
	menu.visible = false
	distort.visible = false
	hud.build()

	var start_btn := menu.get_node_or_null("Center/VBox/Start") as Button
	if start_btn != null:
		start_btn.pressed.connect(_on_start_pressed)
	var quit_btn := menu.get_node_or_null("Center/VBox/Quit") as Button
	if quit_btn != null:
		quit_btn.pressed.connect(func() -> void: get_tree().quit())

	Assets.progress.connect(_on_asset_progress)
	Assets.finished.connect(_on_ship_assets_ready)
	boot_status.text = "Loading ship assets..."
	Assets.load_group(&"ship")


# ------------------------------------------------------------------ loading


func _on_asset_progress(done: int, total: int, label: String) -> void:
	boot_bar.value = float(done) / float(maxi(total, 1))
	boot_status.text = "Loading %s" % label


func _on_ship_assets_ready() -> void:
	Assets.finished.disconnect(_on_ship_assets_ready)
	boot_status.text = "Assembling the Aurora Drift..."
	await get_tree().process_frame

	_build_ship()
	_build_player()

	boot_status.text = "Ready"
	boot_bar.value = 1.0
	await get_tree().create_timer(0.3).timeout
	boot_screen.visible = false
	menu.visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _build_ship() -> void:
	ship_root = Node3D.new()
	ship_root.name = "Ship"
	add_child(ship_root)

	ship_structure = ShipBuilder.new()
	ship_root.add_child(ship_structure)
	ship_structure.build()

	ship_rooms = ShipRooms.new()
	ship_root.add_child(ship_rooms)
	ship_rooms.build()
	ship_rooms.pilot_seat_used.connect(_sit_in_pilot_seat)
	ship_rooms.warp_lever_pulled.connect(_engage_warp)
	ship_rooms.nav_requested.connect(_open_nav)
	ship_rooms.alert_toggled.connect(func(on: bool): ship_lighting.set_alert(on))

	ship_lighting = InteriorLighting.new()
	ship_root.add_child(ship_lighting)
	ship_lighting.build(quality)

	doors = DoorSystem.new()
	ship_root.add_child(doors)
	doors.build(ship_structure.door_frames)

	exterior = ShipExterior.new()
	exterior.build()
	exterior.visible = false
	add_child(exterior)

	flight_camera = Camera3D.new()
	flight_camera.fov = 70.0
	flight_camera.far = 60000.0
	flight_camera.current = false
	add_child(flight_camera)

	flight = FlightSystem.new()
	flight.camera = flight_camera
	add_child(flight)

	warp = WarpSystem.new()
	add_child(warp)
	warp.build(distort)
	warp.arrived.connect(_on_warp_arrive)

	descent = DescentSystem.new()
	add_child(descent)
	descent.setup(exterior, flight_camera, distort)
	descent.landed.connect(_on_landed)


func _build_player() -> void:
	player = preload("res://scenes/player.tscn").instantiate()
	player.add_to_group("player")
	add_child(player)
	player.teleport(
		ShipLayout.SPAWN["x"], ShipLayout.SPAWN["y"], ShipLayout.SPAWN["z"], ShipLayout.SPAWN["yaw"]
	)


# -------------------------------------------------------------------- start


func _on_start_pressed() -> void:
	# The button doubles as Resume once the run has begun.
	if GameState.phase == GameState.Phase.BOOT or GameState.phase == GameState.Phase.MENU:
		start_game()
	else:
		menu.visible = false
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func start_game() -> void:
	menu.visible = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	GameState.set_phase(GameState.Phase.INTERIOR)
	(
		GameState
		. set_objectives(
			[
				{"id": "briefing", "text": "Review the mission briefing in Comms", "done": false},
				{"id": "throttle", "text": "Arm the main drive on the bridge", "done": false},
				{"id": "sit", "text": "Take the pilot seat", "done": false},
			]
		)
	)
	GameState.push_systems()
	Audio.loop("ship_hum", &"hum", "Ambient")
	Audio.set_loop_gain("ship_hum", 0.5)
	Audio.loop("ship_air", &"air", "Ambient")
	Audio.set_loop_gain("ship_air", 0.16)

func _process(delta: float) -> void:
	if player == null or flight == null or warp == null:
		return

	var overlay_open := menu.visible
	var can_act := not overlay_open and not GameState.cinematic

	if Input.is_action_just_pressed("pause") and not GameState.cinematic:
		_toggle_pause()

	# ---- interaction ------------------------------------------------------
	if can_act and player.mode != Player.Mode.SEATED:
		Interact.update_from(player.eye_position(), player.look_direction())
		if Input.is_action_just_pressed("interact"):
			Interact.activate()
	elif player.is_seated():
		Interact.update_from(player.eye_position(), player.look_direction())
		if can_act and Input.is_action_just_pressed("interact"):
			if not Interact.activate():
				_stand_from_seat()

	# ---- flight -----------------------------------------------------------
	if flight != null and flight.active:
		flight.update(delta, can_act)
		exterior.global_position = flight.ship_position
		exterior.global_transform.basis = flight.ship_basis
		exterior.set_thrust(flight.throttle * (1.0 if flight.boosting else 0.75))
		exterior.visible = flight.camera_mode != FlightSystem.CameraMode.COCKPIT
		ship_root.global_position = flight.ship_position
		ship_root.global_transform.basis = flight.ship_basis
		hud.set_flight(flight.throttle, flight.speed())

		if can_act and Input.is_action_just_pressed("landing_gear"):
			var next := 0.0 if GameState.systems["landing_gear"] > 0.5 else 1.0
			GameState.systems["landing_gear"] = next
			exterior.set_gear(next)
			Audio.play_noise(1.4, 0.24, 700.0, 220.0, 1.5)
			GameState.push_systems()

		if can_act and Input.is_action_just_pressed("warp_engage") \
				and GameState.warp_armed and warp != null and warp.stage == WarpSystem.Stage.READY:
			_engage_warp()

	if warp != null and warp.is_active():
		warp.update(delta, flight.ship_position, flight.ship_basis)

	GameState.push_systems()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and flight != null and flight.active \
			and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		flight.handle_mouse((event as InputEventMouseMotion).relative)


func _toggle_pause() -> void:
	menu.visible = not menu.visible
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if menu.visible else Input.MOUSE_MODE_CAPTURED


# ----------------------------------------------------------------- gameplay


func _sit_in_pilot_seat() -> void:
	if player.mode != Player.Mode.WALKING:
		return
	if not GameState.throttle_unlocked:
		Audio.ui_denied()
		GameState.notify("Open the throttle safety lid and arm the drive first", &"warn")
		return

	player.sit(
		{
			"position":
			(
				ship_root.global_position
				+ Vector3(ShipLayout.PILOT_SEAT.x, 1.32, ShipLayout.PILOT_SEAT.z + 0.15)
			),
			"yaw": PI,
			"pitch": 0.0,
			"exit":
			(
				ship_root.global_position
				+ Vector3(ShipLayout.PILOT_SEAT.x + 1.4, 0.0, ShipLayout.PILOT_SEAT.z + 1.6)
			),
		},
		func() -> void:
			GameState.complete_objective("sit")
			if _on_surface:
				GameState.notify("Systems idle. The Aurora Drift is grounded.")
				return
			GameState.set_phase(GameState.Phase.FLIGHT)
			flight.begin(Vector3.ZERO, Basis.IDENTITY)
			flight_camera.current = true
			exterior.visible = true
			GameState.notify("Flight control transferred", &"good")
			GameState.say("Throttle on W. Nose follows the mouse. Press M to pick a destination.", 7.0)
			GameState.add_objective("target", "Lock a destination with the nav hologram [M]")
	)


func _stand_from_seat() -> void:
	if not player.is_seated():
		return
	player.stand(
		func() -> void:
			if not _on_surface:
				GameState.set_phase(GameState.Phase.INTERIOR)
				flight.end()
				flight_camera.current = false
				player.camera.current = true
				exterior.visible = false
	)


func _open_nav() -> void:
	# Lock the mission destination. A full selector UI lives in the pause menu;
	# the hologram is the diegetic shortcut to the story target.
	(
		GameState
		. set_target(
			{
				"id": "ilex",
				"name": "Ilex Prime",
				"kind": "planet",
				"distance": 15200.0,
				"can_warp": true,
			}
		)
	)
	Audio.target_lock()
	GameState.complete_objective("target")
	GameState.notify("Destination locked: Ilex Prime", &"good")
	GameState.add_objective("arm_warp", "Arm the warp drive from the bridge console")
	if warp.stage == WarpSystem.Stage.IDLE:
		warp.begin_charge()


func _engage_warp() -> void:
	if GameState.target.is_empty():
		Audio.ui_denied()
		return
	if not warp.engage():
		GameState.notify("Warp core still charging", &"warn")
		return
	GameState.set_phase(GameState.Phase.WARP_TUNNEL)
	GameState.set_cinematic(true)
	ship_lighting.set_pulse(1.0)
	GameState.say("Field geometry stable. Engaging.", 4.0)

	# Stream the planet's assets NOW, hidden inside the 7.5 s tunnel.
	if not _planet_requested:
		_planet_requested = true
		Assets.finished.connect(_on_planet_assets_ready, CONNECT_ONE_SHOT)
		Assets.load_group(&"planet")


func _on_planet_assets_ready() -> void:
	planet = Planet.new()
	add_child(planet)
	planet.build(quality)
	planet.visible = false
	planet.signal_found.connect(_on_signal_found)


func _on_warp_arrive() -> void:
	ship_lighting.set_pulse(0.0)
	GameState.notify("Arrived: Ilex Prime", &"good")
	GameState.complete_objective("pull_lever")
	GameState.set_phase(GameState.Phase.ENTRY)
	_begin_descent()


func _begin_descent() -> void:
	if planet == null:
		# assets still streaming — wait a frame and retry
		await get_tree().create_timer(0.5).timeout
		if planet == null:
			await Assets.finished
			if planet == null:
				_on_planet_assets_ready()
	planet.visible = true
	_apply_planet_environment()

	exterior.visible = true
	descent.pad_position = _landed_origin
	GameState.set_cinematic(true)
	flight_camera.current = true
	descent.begin()


func _on_landed() -> void:
	GameState.set_phase(GameState.Phase.LANDED)
	GameState.has_landed = true
	_on_surface = true

	# Move the ship interior onto the pad so the player walks out of the same
	# hull they flew in — no loading screen, no scene swap.
	ship_root.global_position = _landed_origin
	ship_root.rotation = Vector3.ZERO
	exterior.global_position = _landed_origin
	exterior.rotation = Vector3.ZERO

	player.mode = Player.Mode.WALKING
	player.teleport(
		_landed_origin.x + ShipLayout.PILOT_SEAT.x + 1.4,
		_landed_origin.y + 0.2,
		_landed_origin.z + ShipLayout.PILOT_SEAT.z + 1.8,
		0.0
	)
	player.camera.current = true
	flight_camera.current = false
	flight.end()

	GameState.notify("Touchdown confirmed", &"good")
	GameState.add_objective("ramp", "Lower the boarding ramp in the Cargo Bay")
	GameState.add_objective("signal", "Find the source of the signal")
	GameState.say("Engines cooling. Atmosphere is breathable. The ramp is at the stern.", 7.0)
	Audio.set_loop_gain("ship_hum", 0.28)
	Audio.loop("wind", &"wind", "Ambient")


func _on_signal_found() -> void:
	GameState.set_phase(GameState.Phase.SURFACE)
	await get_tree().create_timer(9.0).timeout
	(
		GameState
		. say(
			"You have your answer. Somewhere behind you the Aurora Drift is still humming, waiting to carry it home.",
			10.0
		)
	)
	GameState.notify("MISSION COMPLETE - return to the ship when ready", &"good")
	GameState.add_objective("return", "Return to the Aurora Drift")


# --------------------------------------------------------------- environment


## Deep space: a procedural starfield sky. Without this the background is a
## flat clear colour, so the viewports read as dead black panels and stepping
## outside the hull shows nothing at all.
func _apply_space_environment() -> void:
	var env := world_env.environment
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/space_sky.gdshader")
	mat.set_shader_parameter("star_density", 0.55)
	mat.set_shader_parameter("nebula_strength", 0.35)
	mat.set_shader_parameter("sun_dir", Vector3(0.75, 0.22, -0.62))
	sky.sky_material = mat
	env.sky = sky
	# The HDRI drives reflections; the sky itself is only a modest ambient
	# contributor so the interior rig stays in charge of how the ship is lit.
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.25
	env.ambient_light_energy = 0.6
	env.fog_enabled = false
	_add_system_sun()


## A directional key light standing in for the system's star, so the hull and
## anything outside the windows is genuinely lit rather than flat.
func _add_system_sun() -> void:
	if has_node("SystemSun"):
		return
	var sun := DirectionalLight3D.new()
	sun.name = "SystemSun"
	sun.light_color = Color(1.0, 0.949, 0.878)
	sun.light_energy = 1.5
	sun.shadow_enabled = false
	sun.look_at_from_position(Vector3.ZERO, Vector3(-0.75, -0.22, 0.62), Vector3.UP)
	add_child(sun)


func _apply_planet_environment() -> void:
	var env := world_env.environment
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var hdri := _load_hdri("res://assets/hdri/planet_sky_1k.hdr")
	if hdri != null:
		var pan := PanoramaSkyMaterial.new()
		pan.panorama = hdri
		sky.sky_material = pan
	else:
		var proc := ProceduralSkyMaterial.new()
		proc.sky_top_color = Color(0.35, 0.62, 0.78)
		proc.sky_horizon_color = Color(0.78, 0.90, 0.86)
		sky.sky_material = proc
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.85
	env.fog_enabled = true
	env.fog_light_color = Color(0.53, 0.79, 0.71)
	env.fog_density = 0.0022


func _load_hdri(path: String) -> Texture2D:
	if ResourceLoader.exists(path):
		return load(path) as Texture2D
	return null


func _apply_quality(q: StringName) -> void:
	quality = q
	var s: Dictionary = QUALITY_SETTINGS[q]
	var vp := get_viewport()
	vp.scaling_3d_scale = s["scale"]
	vp.msaa_3d = s["msaa"]
	if world_env != null and world_env.environment != null:
		world_env.environment.ssao_enabled = s["ssao"]