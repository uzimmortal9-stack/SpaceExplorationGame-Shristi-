extends Node3D
class_name FlightSystem
## 6-DOF ship handling with three camera modes.
## Port of `src/systems/flight.ts`.

enum CameraMode { COCKPIT, CHASE, ORBITAL }

const MAX_SPEED := 620.0
const BOOST_MULT := 2.7
const ACCEL := 74.0
const PITCH_TORQUE := 1.35
const YAW_TORQUE := 1.1
const ROLL_TORQUE := 2.0
const ANGULAR_DAMP := 0.9

var active := false
var throttle := 0.0
var boosting := false
var flight_assist := true
var camera_mode: CameraMode = CameraMode.COCKPIT

var ship_position := Vector3.ZERO
var ship_basis := Basis.IDENTITY
var velocity := Vector3.ZERO
var angular_velocity := Vector3.ZERO

var _orbit_angle := 0.0
var _cam_pos := Vector3.ZERO
var _cam_basis := Basis.IDENTITY
var _shake := 0.0
var _mouse_delta := Vector2.ZERO

@export var camera: Camera3D
@export var mouse_sensitivity := 0.0022


func speed() -> float:
	return velocity.length()


func forward() -> Vector3:
	return -ship_basis.z


func begin(origin: Vector3, basis: Basis) -> void:
	active = true
	ship_position = origin
	ship_basis = basis
	velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	_cam_pos = origin
	_cam_basis = basis
	Audio.loop("engine", &"engine", "SFX")
	Audio.set_loop_gain("engine", 0.05)


func end() -> void:
	active = false
	throttle = 0.0
	Audio.set_loop_gain("engine", 0.0)


func cycle_camera() -> CameraMode:
	camera_mode = ((camera_mode + 1) % 3) as CameraMode
	Audio.ui_click()
	return camera_mode


func handle_mouse(rel: Vector2) -> void:
	_mouse_delta += rel


func update(delta: float, allow_input: bool) -> void:
	if not active:
		return

	if allow_input:
		var t_axis := 0.0
		if Input.is_action_pressed("move_forward"):
			t_axis += 1.0
		if Input.is_action_pressed("move_back"):
			t_axis -= 1.0
		throttle = clampf(throttle + t_axis * delta * 0.72, 0.0, 1.0)
		boosting = Input.is_action_pressed("sprint") and throttle > 0.05

		if Input.is_action_pressed("jump"):
			throttle = lerpf(throttle, 0.0, 1.0 - pow(2.0, -delta / 0.25))
			velocity *= 1.0 - (1.0 - pow(2.0, -delta / 0.55))

		if Input.is_action_just_pressed("camera_cycle"):
			cycle_camera()

		angular_velocity.x += -_mouse_delta.y * mouse_sensitivity * PITCH_TORQUE * 5.5
		angular_velocity.y += -_mouse_delta.x * mouse_sensitivity * YAW_TORQUE * 5.5
		var roll := 0.0
		if Input.is_action_pressed("roll_left"):
			roll += 1.0
		if Input.is_action_pressed("roll_right"):
			roll -= 1.0
		angular_velocity.z += roll * ROLL_TORQUE * delta * 3.4
	_mouse_delta = Vector2.ZERO

	# integrate rotation
	angular_velocity *= pow(1.0 - ANGULAR_DAMP, delta)
	if angular_velocity.length_squared() > 1e-9:
		ship_basis = ship_basis * Basis.from_euler(angular_velocity * delta)
		ship_basis = ship_basis.orthonormalized()

	# thrust
	var max_speed := MAX_SPEED * (BOOST_MULT if boosting else 1.0)
	var accel := ACCEL * (BOOST_MULT if boosting else 1.0) * throttle
	if accel > 0.01:
		velocity += forward() * accel * delta

	# flight assist bleeds off lateral velocity
	if flight_assist:
		var fwd := forward()
		var along := fwd * velocity.dot(fwd)
		var lateral := velocity - along
		velocity -= lateral * (1.0 - pow(2.0, -delta / 0.9))
		if throttle < 0.02:
			velocity *= 1.0 - (1.0 - pow(2.0, -delta / 2.2))

	if velocity.length() > max_speed:
		velocity = velocity.normalized() * max_speed
	ship_position += velocity * delta

	var load := throttle * (1.5 if boosting else 1.0)
	Audio.set_loop_gain("engine", 0.05 + load * 0.5)
	_shake = lerpf(_shake, load * 0.0035, 1.0 - pow(2.0, -delta / 0.3))

	_update_camera(delta)
	GameState.systems["fuel"] = clampf(GameState.systems["fuel"] - delta * load * 0.0012, 0.0, 1.0)


func _update_camera(delta: float) -> void:
	if camera == null:
		return
	match camera_mode:
		CameraMode.COCKPIT:
			var seat_local := Vector3(ShipLayout.PILOT_SEAT.x, 1.32, ShipLayout.PILOT_SEAT.z + 0.15)
			var target := ship_position + ship_basis * seat_local
			_cam_pos = _cam_pos.lerp(target, 1.0 - pow(2.0, -delta / 0.05))
			_cam_basis = _cam_basis.slerp(ship_basis, 1.0 - pow(2.0, -delta / 0.06))
			camera.global_transform = Transform3D(_cam_basis, _cam_pos)
			camera.fov = lerpf(camera.fov, 82.0 if boosting else 70.0, 1.0 - pow(2.0, -delta / 0.25))
		CameraMode.CHASE:
			var offset := ship_basis * Vector3(0, 34, 172)
			_cam_pos = _cam_pos.lerp(ship_position + offset, 1.0 - pow(2.0, -delta / 0.22))
			camera.global_position = _cam_pos
			camera.look_at(ship_position + forward() * 90.0, ship_basis.y)
			camera.fov = lerpf(camera.fov, 78.0 if boosting else 66.0, 1.0 - pow(2.0, -delta / 0.3))
		CameraMode.ORBITAL:
			_orbit_angle += delta * 0.14
			var off := Vector3(cos(_orbit_angle) * 300.0, 95.0, sin(_orbit_angle) * 300.0)
			_cam_pos = _cam_pos.lerp(ship_position + off, 1.0 - pow(2.0, -delta / 0.3))
			camera.global_position = _cam_pos
			camera.look_at(ship_position, Vector3.UP)
			camera.fov = lerpf(camera.fov, 52.0, 1.0 - pow(2.0, -delta / 0.4))


func engine_shake() -> float:
	return _shake