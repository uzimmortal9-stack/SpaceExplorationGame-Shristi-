extends Node3D
class_name ShipBuilder
## Builds the ship shell from the modular sci-fi kit.
##
## Port of `src/world/ship/structure.ts`, using the same measured kit
## conventions (verified against the actual GLB bounds, not assumed):
##
##   floor tiles  4 x 4 m, pivot at tile centre, surface at y = 0
##   wall panels  4 m along local +Z, inner face at local x = max.x,
##                so "into the room" is +X and the pivot is the tile centre
##
## Native advantages over the WebGL build:
##   * MultiMeshInstance3D per source mesh — one draw call for hundreds of
##     copies, with Godot's automatic LOD applied per instance
##   * StaticBody3D + BoxShape3D collision handled by Jolt/Godot Physics on a
##     worker thread instead of a hand-rolled AABB grid on the main thread
##   * OccluderInstance3D on the hull shell so rooms behind walls are culled

const WALL_VARIANTS := ["wall_flat", "wall_band", "wall_flat", "wall_divided"]
const VIEWPORT_ROOMS := ["bridge", "lounge", "galley", "cabin_a", "cabin_b", "medical", "science"]

var _batches: Dictionary = {}  ## key -> {mesh: Mesh, xforms: Array[Transform3D]}
## Cache of single-surface meshes pulled out of multi-surface source meshes.
## MUST be declared: GDScript resolves every identifier at compile time, so a
## missing declaration here is a hard "Identifier not declared" error that stops
## the whole script — and with it the ship, because game.gd types a field as
## `ShipBuilder`. That is what deleted the interior on the last build.
var _surface_cache: Dictionary = {}
var _static_body: StaticBody3D
var door_frames: Dictionary = {}
var wall_count := 0


func build() -> void:
	name = "ShipStructure"
	_static_body = StaticBody3D.new()
	_static_body.name = "ShipCollision"
	_static_body.collision_layer = 1
	_static_body.collision_mask = 0
	add_child(_static_body)

	var rects: Array = ShipLayout.walkable_rects()
	_build_decks(rects)
	_build_walls(rects)
	_build_deck_collision(rects)
	_build_door_frames()
	_build_hull_shell()
	_flush_batches()


# ------------------------------------------------------------------- decks


func _floor_for(room: Variant, cx: float, cz: float) -> String:
	if room == null:
		return (
			"floor_plates"
			if int(abs(round(cx / ShipLayout.TILE + cz / ShipLayout.TILE))) % 2 == 1
			else "floor"
		)
	match room["mood"]:
		"engineering", "cargo":
			return "floor_dark"
		"crew", "medical":
			return "floor_squares"
		_:
			return "floor_plates"


func _build_decks(rects: Array) -> void:
	for rect: Dictionary in rects:
		var room: Variant = ShipLayout.room_at(
			(rect["x0"] + rect["x1"]) * 0.5, (rect["z0"] + rect["z1"]) * 0.5
		)
		for sx: Dictionary in ShipLayout.spans(rect["x0"], rect["x1"]):
			for sz: Dictionary in ShipLayout.spans(rect["z0"], rect["z1"]):
				var id := _floor_for(room, sx["centre"], sz["centre"])
				var xf := Transform3D(
					Basis().scaled(Vector3(sx["scale"], 1.0, sz["scale"])),
					Vector3(sx["centre"], 0.0, sz["centre"])
				)
				_queue(id, xf)

				# Ceiling: a floor tile flipped over. The kit's "Top" modules
				# are wall-top trims, not horizontal panels.
				var ceil_basis := Basis().rotated(Vector3.RIGHT, PI)
				ceil_basis = ceil_basis.scaled(Vector3(sx["scale"], 1.0, sz["scale"]))
				_queue("floor", Transform3D(ceil_basis, Vector3(sx["centre"], rect["ceiling"], sz["centre"])))


# ------------------------------------------------------------------- walls


func _build_walls(rects: Array) -> void:
	for rect: Dictionary in rects:
		var room: Variant = ShipLayout.room_at(
			(rect["x0"] + rect["x1"]) * 0.5, (rect["z0"] + rect["z1"]) * 0.5
		)
		var ceiling: float = rect["ceiling"]

		# edges running along X (walls at z = z0 / z1)
		for edge: Array in [[rect["z0"], 1.0], [rect["z1"], -1.0]]:
			var z_edge: float = edge[0]
			var nz: float = edge[1]
			var run_start: Variant = null
			var step := 0.5
			var x := float(rect["x0"])
			while x <= float(rect["x1"]) + 0.000001:
				# A ROOM boundary is always a wall (minus doorways), even when the
				# spine abuts it — the spine has to touch the rooms so the deck is
				# continuous, but that must not delete the partition between them.
				# Corridor-to-corridor seams stay open so the spine is walkable.
				var exposed := x < float(rect["x1"]) and (
					room != null
					or not ShipLayout.walkable(x + step * 0.5, z_edge - nz * 0.5)
				)
				if exposed and run_start == null:
					run_start = x
				if (not exposed or x >= float(rect["x1"])) and run_start != null:
					_emit_run(run_start, minf(x, rect["x1"]), z_edge, "x", 0.0, nz, ceiling, room)
					run_start = null
				x += step

		# edges running along Z (walls at x = x0 / x1)
		for edge: Array in [[rect["x0"], 1.0], [rect["x1"], -1.0]]:
			var x_edge: float = edge[0]
			var nx: float = edge[1]
			var run_start: Variant = null
			var step := 0.5
			var z := float(rect["z0"])
			while z <= float(rect["z1"]) + 0.000001:
				var exposed := z < float(rect["z1"]) and (
					room != null
					or not ShipLayout.walkable(x_edge - nx * 0.5, z + step * 0.5)
				)
				if exposed and run_start == null:
					run_start = z
				if (not exposed or z >= float(rect["z1"])) and run_start != null:
					_emit_run(run_start, minf(z, rect["z1"]), x_edge, "z", nx, 0.0, ceiling, room)
					run_start = null
				z += step


func _emit_run(
	from: float, to: float, fixed: float, along: String, nx: float, nz: float, ceiling: float, room: Variant
) -> void:
	for piece: Array in ShipLayout.subtract_doors(from, to, fixed, along):
		for sp: Dictionary in ShipLayout.spans(piece[0], piece[1]):
			if along == "x":
				_emit_wall(sp["centre"], fixed, nx, nz, sp["scale"] * ShipLayout.TILE, ceiling, room)
			else:
				_emit_wall(fixed, sp["centre"], nx, nz, sp["scale"] * ShipLayout.TILE, ceiling, room)


func _emit_wall(
	bx: float, bz: float, nx: float, nz: float, length: float, ceiling: float, room: Variant
) -> void:
	var is_outer := (nx != 0.0 and (bx <= -14.9 or bx >= 14.9)) or (nz != 0.0 and (bz <= -29.9 or bz >= 77.9))
	var want_window := is_outer and room != null and VIEWPORT_ROOMS.has(room["id"])

	var id: String
	if want_window:
		id = "wall_window"
	else:
		var pick := int(abs(round(bx / ShipLayout.TILE + bz / ShipLayout.TILE))) % WALL_VARIANTS.size()
		id = WALL_VARIANTS[pick]

	# +X faces into the room; yaw turns it toward the inward normal.
	var yaw := atan2(-nz, nx)
	# The panel's inner surface sits at local x = max.x (a negative number), so
	# offsetting by -max.x lands it exactly on the boundary plane for any depth.
	var b: Dictionary = Assets.bounds(id)
	var face_offset: float = -b["max"].x if not b.is_empty() else ShipLayout.TILE * 0.5
	var px := bx + nx * face_offset
	var pz := bz + nz * face_offset

	var basis := Basis(Vector3.UP, yaw).scaled(Vector3(1.0, ceiling / 3.0, length / ShipLayout.TILE))
	_queue(id, Transform3D(basis, Vector3(px, 0.0, pz)))
	wall_count += 1

	# collision for this edge
	var t := 0.45
	if nz != 0.0:
		_add_box(Vector3(bx, ceiling * 0.5, bz + nz * t * 0.5), Vector3(length, ceiling + 1.6, t))
	else:
		_add_box(Vector3(bx + nx * t * 0.5, ceiling * 0.5, bz), Vector3(t, ceiling + 1.6, length))


# ---------------------------------------------------------------- collision


func _build_deck_collision(rects: Array) -> void:
	for rect: Dictionary in rects:
		var cx: float = (rect["x0"] + rect["x1"]) * 0.5
		var cz: float = (rect["z0"] + rect["z1"]) * 0.5
		var sx: float = rect["x1"] - rect["x0"]
		var sz: float = rect["z1"] - rect["z0"]
		_add_box(Vector3(cx, -0.5, cz), Vector3(sx, 1.0, sz))
		_add_box(Vector3(cx, rect["ceiling"] + 0.5, cz), Vector3(sx, 1.0, sz))


func _add_box(centre: Vector3, size: Vector3) -> void:
	var shape := BoxShape3D.new()
	shape.size = size
	var owner_id := _static_body.create_shape_owner(_static_body)
	_static_body.shape_owner_add_shape(owner_id, shape)
	_static_body.shape_owner_set_transform(owner_id, Transform3D(Basis(), centre))


# -------------------------------------------------------------- door frames


func _build_door_frames() -> void:
	var frame_mat := StandardMaterial3D.new()
	frame_mat.albedo_color = Color(0.549, 0.596, 0.651)
	frame_mat.roughness = 0.42
	frame_mat.metallic = 0.68

	var trim_mat := StandardMaterial3D.new()
	trim_mat.albedo_color = Color(0.086, 0.110, 0.141)
	trim_mat.roughness = 0.35
	trim_mat.metallic = 0.85

	for d: Dictionary in ShipLayout.DOORWAYS:
		var width: float = d["width"]
		door_frames[d["id"]] = {
			"centre": Vector3(d["x"], 0.0, d["z"]),
			"axis": d["axis"],
			"width": width,
		}

		# The kit frame is authored 5 m tall for a 5 m deck; squashing it into a
		# 3 m deck distorts the profile. Build the surround from simple boxes in
		# the corridor palette instead.
		var jamb_w := 0.55
		var header_h: float = ShipLayout.DECK_HEIGHT - 2.25
		var along := Vector3(1, 0, 0) if d["axis"] == "x" else Vector3(0, 0, 1)
		var yaw := 0.0 if d["axis"] == "x" else PI * 0.5

		var surround := Node3D.new()
		surround.name = "frame_%s" % d["id"]

		for sign_i in [-1.0, 1.0]:
			var jamb := MeshInstance3D.new()
			var jbox := BoxMesh.new()
			jbox.size = Vector3(jamb_w, ShipLayout.DECK_HEIGHT - 0.05, 0.62)
			jamb.mesh = jbox
			jamb.material_override = frame_mat
			jamb.position = (
				Vector3(d["x"], (ShipLayout.DECK_HEIGHT - 0.05) * 0.5, d["z"])
				+ along * (sign_i * (width * 0.5 + jamb_w * 0.5))
			)
			jamb.rotation.y = yaw
			surround.add_child(jamb)

		var header := MeshInstance3D.new()
		var hbox := BoxMesh.new()
		hbox.size = Vector3(width + jamb_w * 2.0, header_h, 0.62)
		header.mesh = hbox
		header.material_override = frame_mat
		header.position = Vector3(d["x"], ShipLayout.DECK_HEIGHT - header_h * 0.5 - 0.03, d["z"])
		header.rotation.y = yaw
		surround.add_child(header)

		var sill := MeshInstance3D.new()
		var sbox := BoxMesh.new()
		sbox.size = Vector3(width + jamb_w * 2.0, 0.03, 0.66)
		sill.mesh = sbox
		sill.material_override = trim_mat
		sill.position = Vector3(d["x"], 0.015, d["z"])
		sill.rotation.y = yaw
		surround.add_child(sill)

		add_child(surround)

		# jambs + header collision keeps the opening exactly `width` wide
		var half := width * 0.5
		var jamb := 0.7
		if d["axis"] == "x":
			_add_box(
				Vector3(d["x"] - half - jamb * 0.5, ShipLayout.DECK_HEIGHT * 0.5, d["z"]),
				Vector3(jamb, ShipLayout.DECK_HEIGHT + 1.6, 0.6)
			)
			_add_box(
				Vector3(d["x"] + half + jamb * 0.5, ShipLayout.DECK_HEIGHT * 0.5, d["z"]),
				Vector3(jamb, ShipLayout.DECK_HEIGHT + 1.6, 0.6)
			)
			_add_box(
				Vector3(d["x"], ShipLayout.DECK_HEIGHT - header_h * 0.5, d["z"]),
				Vector3(width, header_h, 0.6)
			)
		else:
			_add_box(
				Vector3(d["x"], ShipLayout.DECK_HEIGHT * 0.5, d["z"] - half - jamb * 0.5),
				Vector3(0.6, ShipLayout.DECK_HEIGHT + 1.6, jamb)
			)
			_add_box(
				Vector3(d["x"], ShipLayout.DECK_HEIGHT * 0.5, d["z"] + half + jamb * 0.5),
				Vector3(0.6, ShipLayout.DECK_HEIGHT + 1.6, jamb)
			)
			_add_box(
				Vector3(d["x"], ShipLayout.DECK_HEIGHT - header_h * 0.5, d["z"]),
				Vector3(0.6, header_h, width)
			)


# --------------------------------------------------------------- hull shell


func _build_hull_shell() -> void:
	# The shell seals the silhouette so gaps between rooms never show through,
	# but it must NOT cover the viewports or every window renders black.
	# So build it as five slabs (floor, ceiling, bow, stern, and the two flanks
	# split above/below the window band) rather than one closed box.
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.051, 0.067, 0.086)
	mat.roughness = 0.55
	mat.metallic = 0.8

	var half_w := 18.0
	var z0 := -34.0
	var z1 := 82.0
	var cz := (z0 + z1) * 0.5
	var length := z1 - z0
	var top := ShipLayout.DECK_HEIGHT + 1.8
	# the window band on the outer walls sits roughly 1.0 .. 2.6 m
	var band_lo := 0.9
	var band_hi := 2.7

	var slabs: Array = [
		# under-floor and over-ceiling caps
		[Vector3(0.0, -1.2, cz), Vector3(half_w * 2.0, 1.2, length)],
		[Vector3(0.0, top + 0.6, cz), Vector3(half_w * 2.0, 1.2, length)],
		# bow and stern
		[Vector3(0.0, top * 0.5, z0 - 0.6), Vector3(half_w * 2.0, top + 2.4, 1.2)],
		[Vector3(0.0, top * 0.5, z1 + 0.6), Vector3(half_w * 2.0, top + 2.4, 1.2)],
	]
	# port and starboard flanks, split so the window band stays open
	for sx: float in [-1.0, 1.0]:
		var x := sx * (half_w + 0.6)
		slabs.append([Vector3(x, band_lo * 0.5, cz), Vector3(1.2, band_lo, length)])
		slabs.append([
			Vector3(x, (band_hi + top + 1.2) * 0.5, cz),
			Vector3(1.2, top + 1.2 - band_hi, length),
		])

	for slab: Array in slabs:
		var mi := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = slab[1]
		mi.mesh = box
		mi.material_override = mat
		mi.position = slab[0]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)


# ---------------------------------------------------------------- batching


func _queue(id: String, xf: Transform3D) -> void:
	var proto := Assets.instance(id)
	if proto == null:
		return
	Palette.apply(proto, id)
	# Collect every MeshInstance3D in the prototype, baking its local transform.
	var stack: Array[Node] = [proto]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		# One batch per SURFACE. MultiMeshInstance3D has a single material slot,
		# so a multi-surface mesh must be split or every surface but the first
		# loses its texture (this is why the ship rendered white).
		for si in mi.mesh.get_surface_count():
			var key := "%s|%s|%d" % [id, mi.name, si]
			if not _batches.has(key):
				var surf_mesh := _extract_surface(mi.mesh, si)
				if surf_mesh == null:
					continue
				var mat: Material = mi.get_surface_override_material(si)
				if mat == null:
					mat = mi.mesh.surface_get_material(si)
				_batches[key] = {
					"mesh": surf_mesh,
					"mat": mat,
					"xforms": [] as Array[Transform3D],
				}
			_batches[key]["xforms"].append(xf * mi.transform)
	proto.queue_free()


## Pull one surface out of a multi-surface mesh into its own ArrayMesh, so it
## can be driven by a MultiMesh with the correct material attached.
func _extract_surface(mesh: Mesh, index: int) -> ArrayMesh:
	var cache_key := "%s#%d" % [mesh.get_rid(), index]
	if _surface_cache.has(cache_key):
		return _surface_cache[cache_key]
	var arrays: Array = mesh.surface_get_arrays(index)
	if arrays.is_empty():
		return null
	var out := ArrayMesh.new()
	out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	_surface_cache[cache_key] = out
	return out


func _flush_batches() -> void:
	for key: String in _batches:
		var batch: Dictionary = _batches[key]
		var xforms: Array = batch["xforms"]
		if xforms.is_empty():
			continue

		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = batch["mesh"]
		mm.instance_count = xforms.size()
		for i in xforms.size():
			mm.set_instance_transform(i, xforms[i])

		var node := MultiMeshInstance3D.new()
		node.multimesh = mm
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		# Godot applies automatic mesh LOD to MultiMesh instances too.
		node.lod_bias = 1.0
		# Each batch is a single surface, so its material maps 1:1.
		var mat: Material = batch["mat"]
		if mat != null:
			node.material_override = mat
		add_child(node)
	_batches.clear()