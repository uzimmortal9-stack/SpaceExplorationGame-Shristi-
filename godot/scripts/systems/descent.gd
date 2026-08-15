extends Node3D
class_name DescentSystem
## Atmospheric entry and landing. Port of `src/systems/descent.ts`.
##
## Six stages with real composed camera shots. The ship's altitude is genuinely
## animated against the terrain, so the ground visibly rushes up throughout.

signal landed

const ALT := {
	"approach": [26000.0, 12000.0],
	"entry": [12000.0, 3400.0],
	"clouds": [3400.0, 420.0],
	"descent": [420.0, 46.0],
	"flare": [46.0, 6.6],
	"touchdown": [6.6, 0.0],
}
const TIMELINE := [
	["approach", 6.0],
	["entry", 9.0],
	["clouds", 5.0],
	["descent", 8.0],
	["flare", 4.0],
	["touchdown", 3.5],
]

var stage := ""
var altitude := 26000.0
var atmosphere := 0.0
var pad_position := Vector3.ZERO
var active := false

var _index := -1
var _t := 0.0
var _ship_pitch := 0.0
var _dust_t := -1.0
var _exterior: ShipExterior
var _camera: Camera3D
var _dust: GPUParticles3D
var _distort: ColorRect


func setup(exterior: ShipExterior, camera: Camera3D, distort: ColorRect) -> void:
	name = "Descent"
	_exterior = exterior
	_camera = camera
	_distort = distort

	_dust = GPUParticles3D.new()
	_dust.amount = 600
	_dust.lifetime = 3.2
	_dust.one_shot = true
	_dust.explosiveness = 0.75
	_dust.emitting = false
	_dust.visibility_aabb = AABB(Vector3(-60, -2, -60), Vector3(120, 30, 120))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	pm.emission_ring_radius = 6.0
	pm.emission_ring_inner_radius = 1.0
	pm.emission_ring_height = 0.5
	pm.emission_ring_axis = Vector3(0, 1, 0)
	pm.direction = Vector3(1, 0.25, 0)
	pm.spread = 60.0
	pm.initial_velocity_min = 14.0
	pm.initial_velocity_max = 30.0
	pm.gravity = Vector3(0, -1.5, 0)
	pm.scale_min = 2.0
	pm.scale_max = 6.0
	pm.damping_min = 6.0
	pm.damping_max = 12.0
	pm.color = Color(0.85, 0.78, 0.66, 0.55)
	_dust.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(4, 4)
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.85, 0.78, 0.66, 0.5)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	_dust.draw_pass_1 = q
	add_child(_dust)


func begin() -> void:
	stage = "approach"
	_index = 0
	_t = 0.0
	altitude = ALT["approach"][0]
	active = true
	GameState.set_cinematic(true)
	Audio.loop("wind", &"wind", "SFX")
	Audio.set_loop_gain("wind", 0.0)


func _process(delta: float) -> void:
	if not active:
		return
	if _index >= TIMELINE.size():
		_finish()
		return

	var spec: Array = TIMELINE[_index]
	stage = spec[0]
	_t += delta
	var p := clampf(_t / spec[1], 0.0, 1.0)

	var bounds: Array = ALT[stage]
	var curve := _ease_out(p) if stage in ["flare", "touchdown"] else _ease_in_out(p)
	altitude = lerpf(bounds[0], bounds[1], curve)
	atmosphere = clampf(1.0 - altitude / 12000.0, 0.0, 1.0)

	var ship_pos := Vector3(pad_position.x, altitude, pad_position.z)

	match stage:
		"approach":
			_exterior.set_thrust(0.35)
			_exterior.set_heat(0.0)
			var ang := -0.9 + p * 0.5
			var dist := lerpf(420.0, 240.0, _ease_in_out(p))
			_camera.global_position = ship_pos + Vector3(cos(ang) * dist, lerpf(120, 60, p), sin(ang) * dist)
			_camera.look_at(ship_pos, Vector3.UP)
			_camera.fov = lerpf(52.0, 46.0, p)
			if p > 0.5 and p < 0.52:
				GameState.say("Ilex Prime. Atmospheric interface in ninety seconds.", 4.0)

		"entry":
			_exterior.set_thrust(0.15)
			var heat := pow(sin(p * PI), 0.7)
			_exterior.set_heat(heat)
			var dist := lerpf(240.0, 130.0, pow(p, 3.0))
			var ang := -0.4 - p * 0.35
			_camera.global_position = ship_pos + Vector3(cos(ang) * dist, lerpf(60, 22, p), sin(ang) * dist)
			_camera.look_at(ship_pos, Vector3.UP)
			_camera.fov = lerpf(46.0, 68.0, pow(p, 3.0))
			_set_distort(heat * 0.35)
			Audio.set_loop_gain("wind", heat * 0.75)
			if p > 0.15 and p < 0.17:
				Audio.play_noise(3.0, 0.3, 240.0, 1200.0)
				GameState.say("Hull temperature climbing. Ionisation blackout in three... two...", 4.0)

		"clouds":
			_exterior.set_thrust(0.2)
			_exterior.set_heat(lerpf(0.5, 0.0, p))
			_set_distort(lerpf(0.2, 0.0, p))
			var dist := lerpf(130.0, 110.0, p)
			_camera.global_position = ship_pos + Vector3(dist * 0.7, 26, dist * 0.7)
			_camera.look_at(ship_pos, Vector3.UP)
			_camera.fov = lerpf(68.0, 60.0, p)
			Audio.set_loop_gain("wind", 0.55)
			if p > 0.7 and p < 0.72:
				GameState.say("Through the deck. Visual on the canopy.", 3.5)

		"descent":
			var gear := clampf((p - 0.2) / 0.5, 0.0, 1.0)
			GameState.systems["landing_gear"] = gear
			_exterior.set_gear(gear)
			_exterior.set_thrust(0.3 + p * 0.35)
			_exterior.set_heat(0.0)
			_set_distort(0.0)
			if p > 0.2 and p < 0.22:
				Audio.play_noise(1.6, 0.3, 700.0, 200.0, 1.6)
				GameState.say("Landing gear down and locked.", 3.0)
			var ang := 0.6 + p * 1.1
			var dist := lerpf(110.0, 62.0, p)
			_camera.global_position = ship_pos + Vector3(cos(ang) * dist, lerpf(30, 16, p), sin(ang) * dist)
			_camera.look_at(ship_pos + Vector3(0, -6, 0), Vector3.UP)
			_camera.fov = lerpf(60.0, 55.0, p)
			Audio.set_loop_gain("wind", lerpf(0.5, 0.25, p))

		"flare":
			_ship_pitch = lerpf(_ship_pitch, 0.16, delta * 2.0)
			_exterior.set_thrust(lerpf(0.65, 1.0, p))
			GameState.systems["landing_gear"] = 1.0
			_exterior.set_gear(1.0)
			var dist := lerpf(62.0, 46.0, p)
			_camera.global_position = (
				ship_pos + Vector3(cos(1.7) * dist, lerpf(16, 9, p) + 6.0, sin(1.7) * dist)
			)
			_camera.look_at(ship_pos + Vector3(0, -2, 0), Vector3.UP)
			_camera.fov = lerpf(55.0, 58.0, p)
			Audio.set_loop_gain("wind", lerpf(0.25, 0.12, p))
			if p > 0.3 and _dust_t < 0.0:
				_dust_t = 0.0
				_dust.global_position = Vector3(pad_position.x, 0.3, pad_position.z)
				_dust.restart()
				_dust.emitting = true
				Audio.play_noise(2.6, 0.28, 400.0, 900.0)

		"touchdown":
			_exterior.set_thrust(lerpf(1.0, 0.0, pow(p, 3.0)))
			_ship_pitch = lerpf(_ship_pitch, 0.0, delta * 3.0)
			if p > 0.14 and p < 0.17:
				Audio.impact(1.0)
				GameState.say("Contact. All six struts loaded. Welcome to Ilex Prime.", 5.0)
			var dist := lerpf(46.0, 40.0, p)
			_camera.global_position = (
				ship_pos + Vector3(cos(2.2) * dist, lerpf(9, 7, p) + 4.0, sin(2.2) * dist)
			)
			_camera.look_at(ship_pos + Vector3(0, 1, 0), Vector3.UP)
			_camera.fov = lerpf(58.0, 54.0, p)
			Audio.set_loop_gain("wind", 0.08)

	_exterior.global_position = Vector3(pad_position.x, altitude, pad_position.z)
	_exterior.rotation.x = _ship_pitch

	if p >= 1.0:
		_index += 1
		_t = 0.0
		if _index >= TIMELINE.size():
			_finish()


func _finish() -> void:
	active = false
	stage = "done"
	altitude = 0.0
	_exterior.set_thrust(0.0)
	_exterior.set_heat(0.0)
	GameState.systems["landing_gear"] = 1.0
	GameState.has_landed = true
	_set_distort(0.0)
	Audio.set_loop_gain("wind", 0.1)
	GameState.set_cinematic(false)
	landed.emit()


func _set_distort(a: float) -> void:
	if _distort == null:
		return
	_distort.visible = a > 0.001
	var m := _distort.material as ShaderMaterial
	if m != null:
		m.set_shader_parameter("amount", a)
		m.set_shader_parameter("chroma", a * 0.6)


func _ease_in_out(t: float) -> float:
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0


func _ease_out(t: float) -> float:
	return 1.0 - pow(1.0 - t, 3.0)