extends Node3D
class_name ShipExterior
## Exterior hull. Port of `src/world/shipExterior.ts`.
##
## Real downloaded hull mesh (Quaternius Ultimate Spaceships, CC0) retoned to a
## graphite livery, plus authored additions the base mesh lacks: retractable
## gear, thruster nozzles with GPU exhaust, nav strobes and a re-entry heat shell.

const HULL_LENGTH := 128.0

var _gear_legs: Array[Node3D] = []
var _thrusters: Array = []
var _strobes: Array[MeshInstance3D] = []
var _heat: MeshInstance3D
var _gear_t := 0.0
var _heat_amount := 0.0
var _thrust := 0.0
var _elapsed := 0.0


func build() -> void:
	name = "ShipExterior"

	var hull := Assets.instance("hull_imperial")
	if hull != null:
		var sz := Assets.size_of("hull_imperial")
		if sz.z > 1.0:
			hull.scale = Vector3.ONE * (HULL_LENGTH / sz.z)
		hull.position = Vector3(0, 1.4, 24)
		hull.rotation.y = PI
		_retone(hull)
		add_child(hull)

	_build_gear()
	_build_thrusters()
	_build_strobes()
	_build_heat_shell()


func _retone(root: Node3D) -> void:
	# The kit hull is authored near-white; give it a real spacecraft livery so
	# the sun and HDRI actually shape the panels.
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		for i in mi.mesh.get_surface_count():
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color(0.30, 0.325, 0.36)
			mat.metallic = 0.86
			mat.roughness = 0.34
			mi.set_surface_override_material(i, mat)


func _build_gear() -> void:
	for spot: Array in [[-11.0, -14.0], [11.0, -14.0], [-12.0, 44.0], [12.0, 44.0], [0.0, 66.0]]:
		var leg := Node3D.new()
		leg.position = Vector3(spot[0], -1.1, spot[1])
		var strut := _cyl(0.34, 4.2, Color(0.553, 0.592, 0.639), 0.9, 0.3)
		strut.position.y = -2.1
		leg.add_child(strut)
		var foot := _cyl(1.15, 0.42, Color(0.11, 0.13, 0.16), 0.7, 0.5)
		foot.position.y = -4.4
		leg.add_child(foot)
		leg.visible = false
		add_child(leg)
		_gear_legs.append(leg)


func _build_thrusters() -> void:
	for spot: Array in [[-7.5, 82.0], [7.5, 82.0], [-14.0, 74.0], [14.0, 74.0]]:
		var bell := _cyl(2.5, 4.0, Color(0.11, 0.13, 0.16), 0.75, 0.4)
		bell.position = Vector3(spot[0], 1.2, spot[1])
		bell.rotation.x = PI * 0.5
		add_child(bell)

		var plume := GPUParticles3D.new()
		plume.amount = 120
		plume.lifetime = 0.5
		plume.local_coords = true
		plume.visibility_aabb = AABB(Vector3(-6, -6, -2), Vector3(12, 12, 30))
		var pm := ParticleProcessMaterial.new()
		pm.direction = Vector3(0, 0, 1)
		pm.spread = 6.0
		pm.initial_velocity_min = 30.0
		pm.initial_velocity_max = 60.0
		pm.scale_min = 1.2
		pm.scale_max = 3.0
		pm.color = Color(0.39, 0.83, 1.0)
		plume.process_material = pm
		var q := QuadMesh.new()
		q.size = Vector2(3.4, 3.4)
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(0.39, 0.83, 1.0)
		m.emission_enabled = true
		m.emission = Color(0.39, 0.83, 1.0)
		m.emission_energy_multiplier = 4.0
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		q.material = m
		plume.draw_pass_1 = q
		plume.position = Vector3(spot[0], 1.2, spot[1] + 2.0)
		plume.emitting = false
		add_child(plume)

		var light := OmniLight3D.new()
		light.light_color = Color(0.39, 0.83, 1.0)
		light.light_energy = 0.0
		light.omni_range = 40.0
		light.position = Vector3(spot[0], 1.2, spot[1] + 4.0)
		add_child(light)

		_thrusters.append({"plume": plume, "light": light})


func _build_strobes() -> void:
	for spot: Array in [
		[-16.0, 2.6, -6.0, Color(1, 0.2, 0.27)],
		[16.0, 2.6, -6.0, Color(0.2, 1, 0.4)],
		[0.0, 5.2, -22.0, Color.WHITE],
		[0.0, 5.2, 60.0, Color.WHITE],
		[-16.0, 2.6, 50.0, Color(1, 0.2, 0.27)],
		[16.0, 2.6, 50.0, Color(0.2, 1, 0.4)]
	]:
		var bulb := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.42
		sm.height = 0.84
		bulb.mesh = sm
		var mat := StandardMaterial3D.new()
		mat.albedo_color = spot[3]
		mat.emission_enabled = true
		mat.emission = spot[3]
		mat.emission_energy_multiplier = 3.0
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		bulb.material_override = mat
		bulb.position = Vector3(spot[0], spot[1], spot[2])
		bulb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(bulb)
		_strobes.append(bulb)


func _build_heat_shell() -> void:
	_heat = MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 32
	_heat.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.48, 0.16, 0.0)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_FRONT
	_heat.material_override = mat
	_heat.scale = Vector3(30, 12, 72)
	_heat.position = Vector3(0, 1.5, 22)
	_heat.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_heat)


func set_gear(t: float) -> void:
	_gear_t = clampf(t, 0.0, 1.0)


func set_thrust(t: float) -> void:
	_thrust = clampf(t, 0.0, 1.0)


func set_heat(t: float) -> void:
	_heat_amount = clampf(t, 0.0, 1.0)


func _process(delta: float) -> void:
	_elapsed += delta
	var t := _elapsed

	var e := _ease(_gear_t)
	for leg in _gear_legs:
		leg.visible = _gear_t > 0.001
		leg.scale.y = lerpf(0.06, 1.0, e)
		leg.position.y = lerpf(0.6, -1.1, e)

	for th: Dictionary in _thrusters:
		var flick := 0.85 + sin(t * 40.0) * 0.15
		var amount := _thrust * flick
		th["plume"].emitting = amount > 0.02
		th["light"].light_energy = amount * 9.0

	var phase := fmod(t * 1.1, 2.0)
	var on := phase < 0.14 or (phase > 0.28 and phase < 0.36)
	for s in _strobes:
		s.scale = Vector3.ONE * (1.5 if on else 1.0)
		var m: StandardMaterial3D = s.material_override
		m.emission_energy_multiplier = 5.0 if on else 0.6

	var hm: StandardMaterial3D = _heat.material_override
	hm.albedo_color.a = _heat_amount * (0.42 + sin(t * 22.0) * 0.08)
	_heat.scale = Vector3(30.0 + _heat_amount * 6.0, 12.0 + _heat_amount * 4.0, 72.0 + _heat_amount * 16.0)


func _cyl(radius: float, height: float, colour: Color, metal: float, rough: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = radius
	cm.bottom_radius = radius
	cm.height = height
	mi.mesh = cm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = colour
	mat.metallic = metal
	mat.roughness = rough
	mi.material_override = mat
	return mi


func _ease(t: float) -> float:
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0