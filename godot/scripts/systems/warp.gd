extends Node3D
class_name WarpSystem
## Warp — spin-up, tunnel and exit. Port of `src/systems/warp.ts`.
##
## Native version uses a real screen-space shader for the radial blur and
## chromatic aberration instead of a three.js post pass, plus GPUParticles3D
## for the streaking star volume.

signal arrived

enum Stage { IDLE, CHARGING, READY, TUNNEL, EXIT }

const CHARGE_TIME := 9.0
const TUNNEL_TIME := 7.5
const EXIT_TIME := 3.2

var stage: Stage = Stage.IDLE
var progress := 0.0

var _t := 0.0
var _streaks: GPUParticles3D
var _tunnel: MeshInstance3D
var _distort: ColorRect


func build(distort_rect: ColorRect) -> void:
	name = "WarpFX"
	visible = false
	_distort = distort_rect

	_streaks = GPUParticles3D.new()
	_streaks.amount = 2600
	_streaks.lifetime = 1.4
	_streaks.local_coords = true
	_streaks.visibility_aabb = AABB(Vector3(-260, -260, -1400), Vector3(520, 520, 2800))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	pm.emission_ring_radius = 210.0
	pm.emission_ring_inner_radius = 12.0
	pm.emission_ring_height = 40.0
	pm.emission_ring_axis = Vector3(0, 0, 1)
	pm.direction = Vector3(0, 0, 1)
	pm.spread = 0.0
	pm.initial_velocity_min = 900.0
	pm.initial_velocity_max = 1600.0
	pm.scale_min = 0.6
	pm.scale_max = 2.4
	pm.color = Color(0.4, 0.85, 1.0)
	_streaks.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(1.2, 26.0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.45, 0.9, 1.0)
	mat.emission_enabled = true
	mat.emission = Color(0.45, 0.9, 1.0)
	mat.emission_energy_multiplier = 3.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	q.material = mat
	_streaks.draw_pass_1 = q
	_streaks.emitting = false
	add_child(_streaks)

	_tunnel = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 240.0
	cyl.bottom_radius = 240.0
	cyl.height = 2600.0
	cyl.radial_segments = 48
	_tunnel.mesh = cyl
	var tmat := StandardMaterial3D.new()
	tmat.albedo_color = Color(0.165, 0.816, 1.0, 0.16)
	tmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	tmat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	tmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	tmat.cull_mode = BaseMaterial3D.CULL_FRONT
	_tunnel.material_override = tmat
	_tunnel.rotation.x = PI * 0.5
	_tunnel.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_tunnel)


func is_active() -> bool:
	return stage != Stage.IDLE


func begin_charge() -> void:
	if stage != Stage.IDLE:
		return
	stage = Stage.CHARGING
	_t = 0.0
	progress = 0.0
	Audio.loop("warp", &"warp", "SFX")
	Audio.set_loop_gain("warp", 0.04)
	GameState.notify("Warp core spinning up")


func engage() -> bool:
	if stage != Stage.READY and stage != Stage.CHARGING:
		return false
	stage = Stage.TUNNEL
	_t = 0.0
	progress = 0.0
	visible = true
	_streaks.emitting = true
	Audio.set_loop_gain("warp", 0.85)
	Audio.play_noise(2.2, 0.4, 300.0, 5200.0, 0.7)
	return true


func abort() -> void:
	stage = Stage.IDLE
	visible = false
	_streaks.emitting = false
	progress = 0.0
	GameState.systems["warp_charge"] = 0.0
	Audio.stop_loop("warp")
	_set_distortion(0.0)


func update(delta: float, ship_pos: Vector3, ship_basis: Basis) -> void:
	if stage == Stage.IDLE:
		return
	_t += delta
	global_transform = Transform3D(ship_basis, ship_pos)

	var tmat: StandardMaterial3D = _tunnel.material_override

	match stage:
		Stage.CHARGING:
			progress = clampf(_t / CHARGE_TIME, 0.0, 1.0)
			GameState.systems["warp_charge"] = progress
			Audio.set_loop_gain("warp", 0.04 + progress * 0.4)
			if progress >= 1.0:
				stage = Stage.READY
				Audio.ui_confirm()
				GameState.notify("WARP CORE READY - pull the lever", &"good")

		Stage.READY:
			GameState.systems["warp_charge"] = 1.0

		Stage.TUNNEL:
			progress = clampf(_t / TUNNEL_TIME, 0.0, 1.0)
			var p := progress
			var intensity := 1.0
			if p < 0.18:
				intensity = pow(p / 0.18, 3.0)
			elif p > 0.85:
				intensity = 1.0 - pow((p - 0.85) / 0.15, 3.0)
			tmat.albedo_color.a = intensity * 0.16
			_tunnel.rotation.y += delta * (2.0 + intensity * 5.0)
			_set_distortion(intensity * 0.95)
			Audio.set_loop_gain("warp", 0.35 + intensity * 0.55)
			if progress >= 1.0:
				stage = Stage.EXIT
				_t = 0.0
				_streaks.emitting = false
				Audio.set_loop_gain("warp", 0.1)
				Audio.play_noise(2.0, 0.3, 5000.0, 300.0)

		Stage.EXIT:
			progress = clampf(_t / EXIT_TIME, 0.0, 1.0)
			var fade := 1.0 - (1.0 - pow(1.0 - progress, 3.0))
			tmat.albedo_color.a = fade * 0.06
			_set_distortion(fade * 0.35)
			GameState.systems["warp_charge"] = lerpf(1.0, 0.0, progress)
			if progress >= 1.0:
				stage = Stage.IDLE
				visible = false
				_set_distortion(0.0)
				Audio.stop_loop("warp")
				GameState.systems["warp_charge"] = 0.0
				arrived.emit()


func _set_distortion(amount: float) -> void:
	if _distort == null:
		return
	_distort.visible = amount > 0.001
	var mat := _distort.material as ShaderMaterial
	if mat != null:
		mat.set_shader_parameter("amount", amount)
		mat.set_shader_parameter("chroma", amount * 0.8)