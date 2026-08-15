extends CharacterBody3D
class_name Player
## First-person controller. Port of `src/systems/player.ts`.
##
## Native gains: real capsule-vs-world sweeps via `move_and_slide()` (Jolt or
## Godot Physics, on a physics thread) instead of a hand-rolled per-axis AABB
## resolver, plus proper slope handling and step-up for free.

signal seated_changed(seated: bool)

const EYE_STAND := 1.66
const EYE_CROUCH := 0.98
const HEIGHT_STAND := 1.78
const HEIGHT_CROUCH := 1.12
const RADIUS := 0.34
const JUMP_SPEED := 5.4
const SPEED_WALK := 3.5
const SPEED_SPRINT := 6.1
const SPEED_CROUCH := 1.9
## Below this height the player has left the world and must be recovered.
const VOID_Y := -12.0

enum Mode { WALKING, SEATED, TRANSITION, FROZEN }

@export var mouse_sensitivity := 0.0022
@export var invert_y := false

var mode: Mode = Mode.WALKING
var crouching := false
var sprinting := false
var speed_scale := 1.0
var lamp_on := false

var _yaw := 0.0
var _pitch := 0.0
var _eye_height := EYE_STAND
var _bob_phase := 0.0
var _bob_amount := 0.0
var _step_accum := 0.0
var _landing_impulse := 0.0
var _was_grounded := true
## Cached once — ProjectSettings.get_setting() is a dictionary lookup and this
## runs every physics frame.
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 18.5)
## Last position where the player was safely standing, for void recovery.
var _last_safe := Vector3.ZERO

# seat transition
var _seat: Dictionary = {}
var _t := 0.0
var _t_duration := 0.85
var _from_pos := Vector3.ZERO
var _from_yaw := 0.0
var _from_pitch := 0.0
var _to: Dictionary = {}
var _exiting := false
var _on_done: Callable = Callable()

@onready var camera: Camera3D = $Camera3D
@onready var lamp: SpotLight3D = $Camera3D/Lamp
@onready var _collider: CollisionShape3D = $CollisionShape3D


func _ready() -> void:
	var caps := CapsuleShape3D.new()
	caps.radius = RADIUS
	caps.height = HEIGHT_STAND
	_collider.shape = caps
	_collider.position.y = HEIGHT_STAND * 0.5
	collision_layer = 2
	collision_mask = 1
	floor_max_angle = deg_to_rad(50.0)
	floor_snap_length = 0.45
	# step-up over small ledges, matching the web build's 0.42 m step height
	set_safe_margin(0.001)
	lamp.visible = false


func teleport(x: float, y: float, z: float, yaw: float = 0.0) -> void:
	global_position = Vector3(x, y, z)
	velocity = Vector3.ZERO
	_yaw = yaw
	_pitch = 0.0
	mode = Mode.WALKING
	_seat.clear()
	_last_safe = global_position


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		if GameState.cinematic:
			return
		var mm := event as InputEventMouseMotion
		_yaw -= mm.relative.x * mouse_sensitivity
		var dy := mm.relative.y * mouse_sensitivity * (-1.0 if invert_y else 1.0)
		var limit := 1.0 if mode == Mode.SEATED else 1.45
		_pitch = clampf(_pitch - dy, -limit, limit)


func _physics_process(delta: float) -> void:
	match mode:
		Mode.TRANSITION:
			_update_transition(delta)
		Mode.SEATED:
			if not _seat.is_empty():
				camera.global_position = _seat["position"]
			_apply_rotation()
		Mode.FROZEN:
			_apply_rotation()
		_:
			_update_walking(delta)


func _update_walking(delta: float) -> void:
	# ---- crouch (only stand if there is headroom) --------------------------
	var want_crouch := Input.is_action_pressed("crouch")
	if want_crouch != crouching:
		if want_crouch:
			crouching = true
			_resize(HEIGHT_CROUCH)
		elif not _blocked_above():
			crouching = false
			_resize(HEIGHT_STAND)

	sprinting = Input.is_action_pressed("sprint") and not crouching and is_on_floor()

	# ---- horizontal movement ----------------------------------------------
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var speed := SPEED_CROUCH if crouching else (SPEED_SPRINT if sprinting else SPEED_WALK)
	speed *= speed_scale

	# -Z is forward
	var wish := Vector3(
		-sin(_yaw) * -input_dir.y + cos(_yaw) * input_dir.x,
		0.0,
		-cos(_yaw) * -input_dir.y - sin(_yaw) * input_dir.x
	)
	if wish.length_squared() > 0.00001:
		wish = wish.normalized()

	var target_v := wish * speed
	# Air control is deliberately weaker so jumps feel weighty.
	var half_life := (0.055 if input_dir.length_squared() > 0.0 else 0.075) if is_on_floor() else 0.35
	var k := 1.0 - pow(2.0, -delta / half_life)
	velocity.x = lerpf(velocity.x, target_v.x, k)
	velocity.z = lerpf(velocity.z, target_v.z, k)

	# ---- gravity + jump ----------------------------------------------------
	if not is_on_floor():
		velocity.y -= _gravity * delta
	elif Input.is_action_just_pressed("jump") and not crouching:
		velocity.y = JUMP_SPEED
		Audio.play_noise(0.12, 0.06, 700.0, 300.0)

	move_and_slide()

	# ---- void guard --------------------------------------------------------
	# Belt and braces: if the player ever ends up below the deck (a seam in the
	# collision, or clipping at high speed), put them back on solid ground
	# instead of falling forever. The deck plan is built so this should never
	# fire inside the ship; it is here so a geometry bug can never soft-lock a run.
	if global_position.y < VOID_Y:
		_recover_from_void()

	# ---- landing impact ----------------------------------------------------
	var grounded := is_on_floor()
	if grounded and global_position.y > VOID_Y:
		_last_safe = global_position
	if not _was_grounded and grounded:
		var impact := clampf(absf(velocity.y) / 12.0, 0.0, 1.0)
		_landing_impulse = impact * 0.16
		if impact > 0.12:
			Audio.footstep(surface_under())
	_was_grounded = grounded

	# ---- head bob + footsteps ---------------------------------------------
	var planar := Vector2(velocity.x, velocity.z).length()
	var moving := grounded and planar > 0.4
	_bob_amount = lerpf(
		_bob_amount, clampf(planar / 6.0, 0.15, 1.0) if moving else 0.0, 1.0 - pow(2.0, -delta / 0.12)
	)
	if moving:
		var cadence := 9.4 if sprinting else (4.2 if crouching else 6.6)
		_bob_phase += delta * cadence
		_step_accum += planar * delta
		var stride := 2.35 if sprinting else 1.75
		if _step_accum >= stride:
			_step_accum = 0.0
			Audio.footstep(surface_under())
	else:
		_step_accum = 0.0

	var target_eye := EYE_CROUCH if crouching else EYE_STAND
	_eye_height = lerpf(_eye_height, target_eye, 1.0 - pow(2.0, -delta / 0.09))
	_landing_impulse = lerpf(_landing_impulse, 0.0, 1.0 - pow(2.0, -delta / 0.12))

	var bob_y := sin(_bob_phase * 2.0) * 0.032 * _bob_amount
	var bob_x := cos(_bob_phase) * 0.022 * _bob_amount
	camera.position = Vector3(cos(_yaw) * bob_x, _eye_height + bob_y - _landing_impulse, -sin(_yaw) * bob_x)
	_apply_rotation(sin(_bob_phase) * 0.006 * _bob_amount)

	if Input.is_action_just_pressed("flashlight"):
		lamp_on = not lamp_on
		lamp.visible = lamp_on
		Audio.switch_clunk()


## Return the player to the nearest safe footing after a fall out of the world.
func _recover_from_void() -> void:
	velocity = Vector3.ZERO
	var terrain := get_tree().get_first_node_in_group("terrain")
	if terrain != null and terrain.has_method("height_at"):
		# on the planet: drop back onto the surface
		var h: float = terrain.height_at(_last_safe.x, _last_safe.z)
		global_position = Vector3(_last_safe.x, h + 1.0, _last_safe.z)
	else:
		global_position = _last_safe + Vector3(0.0, 0.6, 0.0)
	if GameState.has_method("notify"):
		GameState.notify("Recovered — you left the deck", &"warn")


func _resize(h: float) -> void:
	var caps := _collider.shape as CapsuleShape3D
	caps.height = h
	_collider.position.y = h * 0.5


func _blocked_above() -> bool:
	var space := get_world_3d().direct_space_state
	var params := PhysicsShapeQueryParameters3D.new()
	var caps := CapsuleShape3D.new()
	caps.radius = RADIUS
	caps.height = HEIGHT_STAND
	params.shape = caps
	params.transform = Transform3D(Basis(), global_position + Vector3.UP * HEIGHT_STAND * 0.5)
	params.collision_mask = 1
	params.exclude = [get_rid()]
	return not space.intersect_shape(params, 1).is_empty()


func _apply_rotation(roll: float = 0.0) -> void:
	camera.rotation = Vector3(_pitch, _yaw, roll)


## Which material are we standing on? Drives footstep audio.
func surface_under() -> StringName:
	var terrain := get_tree().get_first_node_in_group("terrain")
	if terrain != null and terrain.has_method("surface_at"):
		return terrain.surface_at(global_position.x, global_position.z)
	return &"metal"


# ---------------------------------------------------------------- seating


func sit(seat: Dictionary, on_done: Callable = Callable()) -> void:
	if mode != Mode.WALKING:
		return
	_from_pos = camera.global_position
	_from_yaw = _yaw
	_from_pitch = _pitch
	_to = seat
	_exiting = false
	_t = 0.0
	mode = Mode.TRANSITION
	_on_done = func() -> void:
		_seat = seat
		mode = Mode.SEATED
		seated_changed.emit(true)
		if on_done.is_valid():
			on_done.call()


func stand(on_done: Callable = Callable()) -> void:
	if mode != Mode.SEATED or _seat.is_empty():
		return
	var seat := _seat
	_from_pos = camera.global_position
	_from_yaw = _yaw
	_from_pitch = _pitch
	_to = {
		"position": seat["exit"] + Vector3(0, EYE_STAND, 0),
		"yaw": _yaw,
		"pitch": 0.0,
		"exit": seat["exit"],
	}
	_exiting = true
	_t = 0.0
	mode = Mode.TRANSITION
	_on_done = func() -> void:
		global_position = seat["exit"]
		velocity = Vector3.ZERO
		_seat.clear()
		mode = Mode.WALKING
		seated_changed.emit(false)
		if on_done.is_valid():
			on_done.call()


func _update_transition(delta: float) -> void:
	if _to.is_empty():
		mode = Mode.WALKING
		return
	_t = minf(1.0, _t + delta / _t_duration)
	var e := _ease_in_out_cubic(_t)
	camera.global_position = _from_pos.lerp(_to["position"], e)

	var dyaw: float = _to["yaw"] - _from_yaw
	while dyaw > PI:
		dyaw -= TAU
	while dyaw < -PI:
		dyaw += TAU
	_yaw = _from_yaw + dyaw * e
	_pitch = lerpf(_from_pitch, _to["pitch"], e)
	_apply_rotation()

	if _t >= 1.0:
		var cb := _on_done
		_on_done = Callable()
		_to = {}
		if _exiting:
			_eye_height = EYE_STAND
		if cb.is_valid():
			cb.call()


func _ease_in_out_cubic(t: float) -> float:
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func is_seated() -> bool:
	return mode == Mode.SEATED


func eye_position() -> Vector3:
	return camera.global_position


func look_direction() -> Vector3:
	return -camera.global_transform.basis.z


func sync_seat(pos: Vector3) -> void:
	if not _seat.is_empty():
		_seat["position"] = pos