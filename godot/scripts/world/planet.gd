extends Node3D
class_name Planet
## Ilex Prime — the alien jungle surface. Port of `src/world/planet.ts`.
##
## Native advantages that fix the browser's biggest cost:
##   * every scatter layer becomes ONE MultiMeshInstance3D per source mesh, so
##     4,000+ plants cost a handful of draw calls with automatic per-instance
##     mesh LOD and distance fade
##   * the terrain is a real ArrayMesh with a matching HeightMapShape3D, so
##     collision is handled by the physics server, not per-frame script
##   * GPUParticles3D for spores and waterfall mist instead of CPU point clouds

const SIZE := 620.0
const SEG := 176
const HEIGHT_SCALE := 34.0

const CLIFF_DROP := 40.0
const CLIFF_SHARPNESS := 2.6
const CLIFF_EDGE_OFFSET := 44.0
const POOL_FLOOR := -3.4
const POOL_RADIUS := 30.0
const RUIN_RADIUS := 34.0
const RUIN_LEVEL := 6.5
const PAD_RADIUS := 44.0

const PAD := Vector3(0, 0, 0)
const WATERFALL := Vector3(-118, 0, -158)
const POOL := Vector3(-104, 0, -112)
const RUINS := Vector3(126, 0, -96)
const SIGNAL_POS := Vector3(132, 0, -104)

signal signal_found()

## Hoisted so the interaction callback stays readable.
const MONOLITH_LINE := (
	"The stone is warm. Eleven tones repeat under your palm - the same eleven the relay "
	+ "has sent for eleven months. It is not a warning. It is an invitation."
)

var sun: DirectionalLight3D
var _noise: FastNoiseLite
var _detail: FastNoiseLite
var _rng := RandomNumberGenerator.new()
var _tickers: Array[Callable] = []
var _elapsed := 0.0
var _pool_light: OmniLight3D
var _static: StaticBody3D


func build(quality: StringName = &"high") -> void:
	name = "Planet"
	add_to_group("terrain")
	_rng.seed = 0x9C3F

	_noise = FastNoiseLite.new()
	_noise.noise_type = FastNoiseLite.TYPE_VALUE
	_noise.seed = 0x11CE
	_noise.frequency = 1.0 / 210.0
	_noise.fractal_octaves = 5
	_noise.fractal_lacunarity = 2.05
	_noise.fractal_gain = 0.5

	_detail = FastNoiseLite.new()
	_detail.noise_type = FastNoiseLite.TYPE_VALUE
	_detail.seed = 0x5A71
	_detail.frequency = 1.0 / 52.0
	_detail.fractal_octaves = 3

	_static = StaticBody3D.new()
	_static.collision_layer = 1
	add_child(_static)

	_build_terrain()
	_build_lighting(quality)
	_build_sky()
	_scatter_vegetation(quality)
	_build_waterfall()
	_build_ruins()
	_build_atmosphere(quality)
	_build_pad()


func _process(delta: float) -> void:
	_elapsed += delta
	for t in _tickers:
		t.call(delta, _elapsed)


## Terrain height. Single source of truth for ground level.
func height_at(x: float, z: float) -> float:
	var h := _noise.get_noise_2d(x, z) * HEIGHT_SCALE
	h += _detail.get_noise_2d(x, z) * 3.4

	# escarpment: a plateau whose southern edge is a genuine cliff
	var edge_z := WATERFALL.z + CLIFF_EDGE_OFFSET
	var in_plateau := 1.0 - smoothstep(0.0, 1.0, (absf(x - WATERFALL.x) - 95.0) / 50.0)
	if in_plateau > 0.001:
		var rise := smoothstep(0.0, 1.0, (edge_z - z) / CLIFF_SHARPNESS)
		h += rise * in_plateau * CLIFF_DROP

	# pool basin
	var d_pool := Vector2(x - POOL.x, z - POOL.z).length()
	if d_pool < POOL_RADIUS:
		var k := 1.0 - smoothstep(0.0, 1.0, d_pool / POOL_RADIUS)
		h = lerpf(h, POOL_FLOOR, k * 0.95)

	# ruin terrace
	var d_ruin := Vector2(x - RUINS.x, z - RUINS.z).length()
	if d_ruin < RUIN_RADIUS + 26.0:
		var k := 1.0 - smoothstep(0.0, 1.0, clampf((d_ruin - RUIN_RADIUS) / 26.0, 0.0, 1.0))
		h = lerpf(h, RUIN_LEVEL, k)

	# landing pad
	var d_pad := Vector2(x - PAD.x, z - PAD.z).length()
	if d_pad < PAD_RADIUS + 26.0:
		var k := 1.0 - smoothstep(0.0, 1.0, clampf((d_pad - PAD_RADIUS) / 26.0, 0.0, 1.0))
		h = lerpf(h, 0.0, k)
	return h


func surface_at(x: float, z: float) -> StringName:
	if Vector2(x - POOL.x, z - POOL.z).length() < 22.0:
		return &"water"
	if Vector2(x - PAD.x, z - PAD.z).length() < PAD_RADIUS:
		return &"stone"
	return &"grass"


func _slope_at(x: float, z: float) -> float:
	var d := 2.2
	var hx := height_at(x + d, z) - height_at(x - d, z)
	var hz := height_at(x, z + d) - height_at(x, z - d)
	return Vector2(hx, hz).length() / (2.0 * d)


# ----------------------------------------------------------------- terrain

func _build_terrain() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var step := SIZE / float(SEG)
	var half := SIZE * 0.5
	var heights := PackedFloat32Array()
	heights.resize((SEG + 1) * (SEG + 1))

	for j in SEG + 1:
		for i in SEG + 1:
			var x := -half + i * step
			var z := -half + j * step
			heights[j * (SEG + 1) + i] = height_at(x, z)

	for j in SEG:
		for i in SEG:
			var x0 := -half + i * step
			var z0 := -half + j * step
			var x1 := x0 + step
			var z1 := z0 + step
			var h00 := heights[j * (SEG + 1) + i]
			var h10 := heights[j * (SEG + 1) + i + 1]
			var h01 := heights[(j + 1) * (SEG + 1) + i]
			var h11 := heights[(j + 1) * (SEG + 1) + i + 1]

			var v00 := Vector3(x0, h00, z0)
			var v10 := Vector3(x1, h10, z0)
			var v01 := Vector3(x0, h01, z1)
			var v11 := Vector3(x1, h11, z1)

			for tri: Array in [[v00, v01, v11], [v00, v11, v10]]:
				for v: Vector3 in tri:
					st.set_color(_terrain_tint(v.x, v.y, v.z))
					st.set_uv(Vector2(v.x / 16.0, v.z / 16.0))
					st.add_vertex(v)

	st.generate_normals()
	st.generate_tangents()

	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.albedo_color = Color.WHITE
	mat.roughness = 0.98
	mat.metallic = 0.0
	var ground_tex := _load_texture("res://assets/surfaces/ground_map.jpg")
	if ground_tex != null:
		mat.albedo_texture = ground_tex
		mat.uv1_scale = Vector3(48, 48, 1)
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)

	# matching collision, generated once by the physics server
	var shape := HeightMapShape3D.new()
	shape.map_width = SEG + 1
	shape.map_depth = SEG + 1
	shape.map_data = heights
	var cs := CollisionShape3D.new()
	cs.shape = shape
	# HeightMapShape3D spans map_width x map_depth units; scale to SIZE
	cs.scale = Vector3(step, 1.0, step)
	_static.add_child(cs)


func _terrain_tint(x: float, y: float, z: float) -> Color:
	var t := clampf(y / HEIGHT_SCALE, -0.4, 1.0)
	var c: Color
	if t < 0.08:
		c = Color.from_hsv(0.36, 0.42, 0.17)
	elif t < 0.4:
		c = Color.from_hsv(0.31, 0.50, 0.22 + t * 0.18)
	else:
		c = Color.from_hsv(0.16, 0.22, 0.30 + t * 0.22)
	var d_pool := Vector2(x - POOL.x, z - POOL.z).length()
	if d_pool < 55.0:
		c = c.lerp(Color(0.184, 0.435, 0.361), (1.0 - d_pool / 55.0) * 0.55)
	return c


func _load_texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path):
		return load(path) as Texture2D
	return null


# ---------------------------------------------------------------- lighting

func _build_lighting(quality: StringName) -> void:
	sun = DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.941, 0.831)
	sun.light_energy = 1.6
	sun.rotation = Vector3(deg_to_rad(-52.0), deg_to_rad(38.0), 0.0)
	sun.shadow_enabled = quality != &"low"
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 220.0
	sun.directional_shadow_split_1 = 0.06
	sun.directional_shadow_split_2 = 0.16
	sun.directional_shadow_split_3 = 0.44
	sun.shadow_bias = 0.03
	sun.shadow_normal_bias = 1.4
	add_child(sun)


func _build_sky() -> void:
	var star := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 58.0
	sm.height = 116.0
	star.mesh = sm
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(1.0, 0.957, 0.847)
	smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	smat.emission_enabled = true
	smat.emission = Color(1.0, 0.957, 0.847)
	smat.emission_energy_multiplier = 3.0
	star.material_override = smat
	star.position = Vector3(760, 900, -620)
	star.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(star)

	var moon := MeshInstance3D.new()
	var mm := SphereMesh.new()
	mm.radius = 110.0
	mm.height = 220.0
	moon.mesh = mm
	var mmat := StandardMaterial3D.new()
	mmat.albedo_color = Color(0.78, 0.83, 0.87)
	mmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	moon.material_override = mmat
	moon.position = Vector3(-880, 620, -1100)
	moon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(moon)


# -------------------------------------------------------------- vegetation

func _scatter_vegetation(quality: StringName) -> void:
	var density := 1.0
	match quality:
		&"medium": density = 0.7
		&"low": density = 0.45

	var layers := [
		{"ids": ["jungle_tree_1", "jungle_tree_2", "palm_1", "palm_2"],
			"count": 300, "min": 1.6, "max": 3.4, "slope": 0.55, "solid": true, "rad": 1.1, "pad": 52.0, "tilt": 0.04},
		{"ids": ["alien_tree_1", "alien_tree_2", "alien_tree_3", "alien_tree_4", "alien_tree_5", "alien_tree_6"],
			"count": 210, "min": 1.1, "max": 2.6, "slope": 0.60, "solid": true, "rad": 0.9, "pad": 48.0, "tilt": 0.07},
		{"ids": ["alien_bush_1", "alien_bush_2", "fern"],
			"count": 520, "min": 0.7, "max": 1.7, "slope": 0.80, "solid": false, "pad": 34.0, "tilt": 0.12},
		{"ids": ["alien_grass_1", "alien_grass_2"],
			"count": 1500, "min": 0.6, "max": 1.5, "slope": 0.90, "solid": false, "pad": 30.0, "tilt": 0.16},
		{"ids": ["alien_plant_1", "alien_plant_2"],
			"count": 300, "min": 0.8, "max": 1.9, "slope": 0.75, "solid": false, "pad": 32.0, "tilt": 0.10},
		{"ids": ["flower_1", "flower_2"],
			"count": 420, "min": 0.6, "max": 1.4, "slope": 0.70, "solid": false, "pad": 30.0, "tilt": 0.14},
		{"ids": ["mushroom_1", "mushroom_2"],
			"count": 260, "min": 0.7, "max": 2.0, "slope": 0.70, "solid": false, "pad": 30.0, "tilt": 0.18},
		{"ids": ["rock_1", "rock_2", "rock_3", "rock_4"],
			"count": 150, "min": 0.8, "max": 2.6, "slope": 1.40, "solid": true, "rad": 1.6, "pad": 46.0, "tilt": 0.20},
		{"ids": ["pebble_1", "pebble_2"],
			"count": 420, "min": 0.6, "max": 1.8, "slope": 1.20, "solid": false, "pad": 26.0, "tilt": 0.30},
	]

	var half := SIZE * 0.5 - 14.0

	for layer: Dictionary in layers:
		var per_id: Dictionary = {}
		var count := int(layer["count"] * density)
		for i in count:
			var x := _rng.randf_range(-half, half)
			var z := _rng.randf_range(-half, half)
			if Vector2(x - PAD.x, z - PAD.z).length() < layer["pad"]:
				continue
			if Vector2(x - POOL.x, z - POOL.z).length() < 30.0:
				continue
			if Vector2(x - RUINS.x, z - RUINS.z).length() < 20.0:
				continue
			if _slope_at(x, z) > layer["slope"]:
				continue
			var y := height_at(x, z)
			if y < -2.6:
				continue

			var id: String = layer["ids"][_rng.randi() % layer["ids"].size()]
			var s := _rng.randf_range(layer["min"], layer["max"])
			var tilt: float = layer["tilt"]
			var basis := Basis(Vector3.UP, _rng.randf() * TAU)
			if tilt > 0.0:
				basis = basis * Basis.from_euler(Vector3(
					_rng.randf_range(-tilt, tilt), 0.0, _rng.randf_range(-tilt, tilt)))
			basis = basis.scaled(Vector3.ONE * s)

			if not per_id.has(id):
				per_id[id] = [] as Array[Transform3D]
			per_id[id].append(Transform3D(basis, Vector3(x, y, z)))

			if layer.get("solid", false):
				var rad: float = layer["rad"] * s
				var shape := CylinderShape3D.new()
				shape.radius = rad
				shape.height = 6.0
				var owner_id := _static.create_shape_owner(_static)
				_static.shape_owner_add_shape(owner_id, shape)
				_static.shape_owner_set_transform(owner_id,
					Transform3D(Basis(), Vector3(x, y + 3.0, z)))

		_emit_multimesh(per_id, layer.get("solid", false))


func _emit_multimesh(per_id: Dictionary, casts_shadow: bool) -> void:
	for id: String in per_id:
		var xforms: Array = per_id[id]
		if xforms.is_empty():
			continue
		var proto := Assets.instance(id)
		if proto == null:
			continue
		Palette.apply(proto, id)

		# One MultiMesh per SURFACE. A MultiMeshInstance3D has a single material
		# slot, so a two-surface tree (bark + leaves) must be split or the second
		# surface renders untextured.
		var stack: Array[Node] = [proto]
		while not stack.is_empty():
			var n: Node = stack.pop_back()
			for c in n.get_children():
				stack.append(c)
			var mi := n as MeshInstance3D
			if mi == null or mi.mesh == null:
				continue
			for si in mi.mesh.get_surface_count():
				var arrays: Array = mi.mesh.surface_get_arrays(si)
				if arrays.is_empty():
					continue
				var surf := ArrayMesh.new()
				surf.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)

				var mm := MultiMesh.new()
				mm.transform_format = MultiMesh.TRANSFORM_3D
				mm.mesh = surf
				mm.instance_count = xforms.size()
				for i in xforms.size():
					mm.set_instance_transform(i, xforms[i] * mi.transform)

				var node := MultiMeshInstance3D.new()
				node.multimesh = mm
				node.cast_shadow = (
					GeometryInstance3D.SHADOW_CASTING_SETTING_ON
					if casts_shadow
					else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				)
				if not casts_shadow:
					node.visibility_range_end = 120.0
					node.visibility_range_end_margin = 20.0
					node.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
				var mat: Material = mi.get_surface_override_material(si)
				if mat == null:
					mat = mi.mesh.surface_get_material(si)
				if mat != null:
					node.material_override = mat
				add_child(node)
		proto.queue_free()


# --------------------------------------------------- waterfall + glowing pool

func _build_waterfall() -> void:
	var lip_x := WATERFALL.x + 6.0
	var scan_from := WATERFALL.z + CLIFF_EDGE_OFFSET - 14.0
	var top_y := height_at(lip_x, scan_from)
	var lip_z := scan_from
	var foot_z := scan_from + 16.0
	var z := scan_from
	while z < scan_from + 60.0:
		var hz := height_at(lip_x, z)
		if hz > top_y - 1.5:
			lip_z = z
		if hz < POOL_FLOOR + 1.5:
			foot_z = z
			break
		z += 0.25

	var lip_y := height_at(lip_x, lip_z)
	var fall_h := maxf(lip_y - POOL_FLOOR, 16.0)
	var width := 18.0
	var mid_z := (lip_z + foot_z) * 0.5

	var sheet := MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(width, fall_h)
	sheet.mesh = q
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(0.847, 0.949, 0.965, 0.72)
	smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smat.roughness = 0.06
	smat.emission_enabled = true
	smat.emission = Color(0.169, 0.651, 0.769)
	smat.emission_energy_multiplier = 0.25
	smat.cull_mode = BaseMaterial3D.CULL_DISABLED
	sheet.material_override = smat
	sheet.position = Vector3(lip_x, POOL_FLOOR + fall_h * 0.5, mid_z + 1.6)
	sheet.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(sheet)

	# boulders flanking the lip, sunk so none float
	for i in 6:
		var side := -1.0 if i < 3 else 1.0
		var t := side * (width * 0.5 + 1.5 + float(i % 3) * 3.2)
		var id := "rock_2" if i % 2 else "rock_1"
		var rock := Assets.instance(id)
		if rock == null:
			continue
		Palette.apply(rock, id)
		var sz := Assets.size_of(id)
		var sc := (5.5 + float(i % 3)) / maxf(sz.y, 0.01)
		rock.scale = Vector3.ONE * sc
		var rz := lip_z - 1.5 + float(i % 3) * 1.2
		var rx := lip_x + t
		rock.position = Vector3(rx, height_at(rx, rz) - 1.8, rz)
		rock.rotation.y = i * 1.3
		add_child(rock)

	# the pool
	var pool := MeshInstance3D.new()
	var pq := PlaneMesh.new()
	pq.size = Vector2(64, 64)
	pq.subdivide_width = 24
	pq.subdivide_depth = 24
	pool.mesh = pq
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.114, 0.435, 0.533, 0.72)
	pmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	pmat.roughness = 0.08
	pmat.metallic = 0.0
	pmat.emission_enabled = true
	pmat.emission = Color(0.275, 0.961, 0.784)
	pmat.emission_energy_multiplier = 0.35
	pool.material_override = pmat
	pool.position = Vector3(POOL.x, -1.1, POOL.z)
	pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(pool)

	_pool_light = OmniLight3D.new()
	_pool_light.light_color = Color(0.275, 0.961, 0.784)
	_pool_light.light_energy = 6.0
	_pool_light.omni_range = 90.0
	_pool_light.position = Vector3(POOL.x, 4.0, POOL.z)
	add_child(_pool_light)

	# mist — GPU particles instead of a CPU point cloud
	var mist := GPUParticles3D.new()
	mist.amount = 420
	mist.lifetime = 4.0
	mist.visibility_aabb = AABB(Vector3(-30, -5, -20), Vector3(60, 40, 40))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(width * 0.6, 1.0, 8.0)
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 25.0
	pm.initial_velocity_min = 2.0
	pm.initial_velocity_max = 5.0
	pm.gravity = Vector3(0, 0.8, 0)
	pm.scale_min = 0.6
	pm.scale_max = 2.2
	pm.color = Color(0.875, 0.965, 1.0, 0.35)
	mist.process_material = pm
	var mq := QuadMesh.new()
	mq.size = Vector2(1.6, 1.6)
	var mmat := StandardMaterial3D.new()
	mmat.albedo_color = Color(0.875, 0.965, 1.0, 0.35)
	mmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mmat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mq.material = mmat
	mist.draw_pass_1 = mq
	mist.position = Vector3(lip_x, POOL_FLOOR + 1.0, foot_z + 2.0)
	add_child(mist)

	Interact.register({
		"id": "pool", "position": Vector3(POOL.x, 1.0, POOL.z + 30.0), "radius": 12.0,
		"kind": &"use", "label": "Sample the pool",
		"on_use": func() -> String:
			Audio.play_noise(1.1, 0.14, 2400.0, 900.0, 0.6)
			GameState.say("The water is warm and faintly luminous. Whatever glows in it is alive.", 6.0)
			GameState.complete_objective("pool")
			return "Sample the pool",
	})

	_tickers.append(func(_delta: float, t: float) -> void:
		_pool_light.light_energy = 5.0 + sin(t * 1.3) * 1.2
		smat.emission_energy_multiplier = 0.22 + sin(t * 2.2) * 0.05)

	Audio.loop("water", &"water", "Ambient")
	Audio.set_loop_gain("water", 0.0)


# ------------------------------------------------------------------- ruins

func _build_ruins() -> void:
	var r := _rng

	var place := func(id: String, dx: float, dz: float, s: float, ry: float, solid := true) -> void:
		var x := RUINS.x + dx
		var z := RUINS.z + dz
		var y := height_at(x, z)
		var node := Assets.instance(id)
		if node == null:
			return
		Palette.apply(node, id)
		var sz := Assets.size_of(id)
		var scale := s / maxf(sz.y, 0.1)
		node.scale = Vector3.ONE * scale
		node.position = Vector3(x, y, z)
		node.rotation.y = ry
		add_child(node)
		if solid:
			var shape := BoxShape3D.new()
			shape.size = Vector3(
				maxf(sz.x * scale * 0.8, 0.8), sz.y * scale, maxf(sz.z * scale * 0.8, 0.8))
			var owner_id := _static.create_shape_owner(_static)
			_static.shape_owner_add_shape(owner_id, shape)
			_static.shape_owner_set_transform(owner_id,
				Transform3D(Basis(), Vector3(x, y + sz.y * scale * 0.5, z)))

	for i in 6:
		var t := float(i) / 5.0
		var dz := -26.0 + t * 52.0
		place.call("ruin_column", -13.0, dz, 7.5 + r.randf() * 1.5, r.randf() * 0.3)
		place.call("ruin_column" if i % 2 == 0 else "ruin_column_short", 13.0, dz,
			6.5 + r.randf() * 2.0, r.randf() * 0.3)

	place.call("ruin_arch", 0.0, -30.0, 9.5, 0.0)
	place.call("ruin_arch_gothic", 0.0, 30.0, 9.0, PI)
	place.call("ruin_wall_arch", -22.0, 6.0, 7.5, PI * 0.5)
	place.call("ruin_wall", 22.0, -8.0, 6.0, -PI * 0.5)
	place.call("ruin_wall_broken", 20.0, 14.0, 5.0, -PI * 0.5 + 0.3)
	place.call("ruin_statue", -8.0, 16.0, 7.0, 0.6)
	place.call("ruin_stairs", 0.0, 12.0, 2.2, PI)
	place.call("ruin_pot", 6.0, 8.0, 1.4, 0.4)
	place.call("ruin_pot", -5.0, -12.0, 1.2, -0.8)
	place.call("ruin_support", 16.0, -20.0, 8.0, 0.2)

	# plaza slabs
	var stone_mat := StandardMaterial3D.new()
	stone_mat.albedo_color = Color(0.604, 0.627, 0.561)
	stone_mat.roughness = 0.92
	for i in range(-2, 3):
		for j in range(-2, 3):
			var x := RUINS.x + i * 7.5
			var z := RUINS.z + j * 7.5
			var slab := MeshInstance3D.new()
			var pm := PlaneMesh.new()
			pm.size = Vector2(7.4, 7.4)
			slab.mesh = pm
			slab.material_override = stone_mat
			slab.position = Vector3(x, height_at(x, z) + 0.06, z)
			add_child(slab)

	# ---- the signal monolith ------------------------------------------------
	var sig_y := height_at(SIGNAL_POS.x, SIGNAL_POS.z)
	var mono := MeshInstance3D.new()
	var mbox := BoxMesh.new()
	mbox.size = Vector3(4.0, 13.0, 4.0)
	mono.mesh = mbox
	var mono_mat := StandardMaterial3D.new()
	mono_mat.albedo_color = Color(0.106, 0.149, 0.188)
	mono_mat.roughness = 0.42
	mono_mat.metallic = 0.55
	mono_mat.emission_enabled = true
	mono_mat.emission = Color(0.114, 0.878, 0.706)
	mono_mat.emission_energy_multiplier = 0.5
	mono.material_override = mono_mat
	mono.position = Vector3(SIGNAL_POS.x, sig_y + 6.6, SIGNAL_POS.z)
	add_child(mono)

	var shape := BoxShape3D.new()
	shape.size = Vector3(4.5, 13.0, 4.5)
	var owner_id := _static.create_shape_owner(_static)
	_static.shape_owner_add_shape(owner_id, shape)
	_static.shape_owner_set_transform(owner_id,
		Transform3D(Basis(), Vector3(SIGNAL_POS.x, sig_y + 6.5, SIGNAL_POS.z)))

	var sig_light := OmniLight3D.new()
	sig_light.light_color = Color(0.184, 0.941, 0.753)
	sig_light.light_energy = 6.0
	sig_light.omni_range = 70.0
	sig_light.position = Vector3(SIGNAL_POS.x, sig_y + 9.0, SIGNAL_POS.z)
	add_child(sig_light)

	Interact.register({
		"id": "signal_source",
		"position": Vector3(SIGNAL_POS.x, sig_y + 2.0, SIGNAL_POS.z),
		"radius": 8.0, "kind": &"use", "label": "Touch the monolith",
		"on_use": func() -> String:
			if GameState.signal_found:
				GameState.say("The tone continues, patient as ever. It has waited far longer than you have.", 6.0)
				return "Touch the monolith"
			GameState.signal_found = true
			Audio.play_tone(220.0, 2.4, 0.10, 880.0)
			GameState.complete_objective("signal")
			GameState.say(MONOLITH_LINE, 11.0)
			GameState.notify("SIGNAL SOURCE LOCATED", &"good")
			signal_found.emit()
			return "Touch the monolith",
	})

	_tickers.append(func(_delta: float, t: float) -> void:
		var pulse := 0.4 + absf(sin(t * 0.9)) * 0.7
		mono_mat.emission_energy_multiplier = pulse
		sig_light.light_energy = 4.0 + pulse * 4.0)


# -------------------------------------------------------------- atmosphere

func _build_atmosphere(quality: StringName) -> void:
	if quality == &"low":
		return
	# drifting bioluminescent spores
	var spores := GPUParticles3D.new()
	spores.amount = 900 if quality == &"high" else 450
	spores.lifetime = 14.0
	spores.visibility_aabb = AABB(Vector3(-300, -10, -300), Vector3(600, 80, 600))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(280, 18, 280)
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 90.0
	pm.initial_velocity_min = 0.2
	pm.initial_velocity_max = 1.0
	pm.gravity = Vector3(0.3, 0.15, 0.1)
	pm.scale_min = 0.25
	pm.scale_max = 0.7
	pm.color = Color(0.35, 0.95, 0.75, 0.9)
	spores.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(0.5, 0.5)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.35, 0.95, 0.75)
	mat.emission_enabled = true
	mat.emission = Color(0.35, 0.95, 0.75)
	mat.emission_energy_multiplier = 2.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = mat
	spores.draw_pass_1 = q
	spores.position = Vector3(0, 20, 0)
	add_child(spores)


func _build_pad() -> void:
	var pad := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = PAD_RADIUS
	cm.bottom_radius = PAD_RADIUS + 2.5
	cm.height = 1.2
	cm.radial_segments = 72
	pad.mesh = cm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.353, 0.373, 0.400)
	mat.roughness = 0.92
	mat.metallic = 0.08
	pad.material_override = mat
	pad.position = Vector3(PAD.x, -0.55, PAD.z)
	add_child(pad)

	var mark_mat := StandardMaterial3D.new()
	mark_mat.albedo_color = Color(1.0, 0.69, 0.0, 0.55)
	mark_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for radius in [PAD_RADIUS - 4.0, PAD_RADIUS - 12.0]:
		var ring := MeshInstance3D.new()
		var tm := TorusMesh.new()
		tm.inner_radius = radius - 0.7
		tm.outer_radius = radius
		tm.rings = 64
		ring.mesh = tm
		ring.material_override = mark_mat
		ring.position = Vector3(PAD.x, 0.09, PAD.z)
		add_child(ring)