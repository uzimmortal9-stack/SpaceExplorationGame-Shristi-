extends Node3D
class_name PropPlacer
## Places props with correct pivots and matching colliders.
## Port of `src/world/ship/props.ts`.
##
## Zero-float discipline: AssetRegistry has already normalised every model's
## pivot to its bottom face, so `place()` sets y = floor and the object sits
## exactly on the deck. The collider is derived from the same measured bounds,
## so visual and physical footprints always agree.

var _body: StaticBody3D
var _rng := RandomNumberGenerator.new()


func _init() -> void:
	_rng.seed = 0xA17CE


func setup() -> void:
	name = "Props"
	_body = StaticBody3D.new()
	_body.name = "PropCollision"
	_body.collision_layer = 1
	_body.collision_mask = 0
	add_child(_body)


## Place a model with its base flush to `y` (default: the deck).
##
## opts: ry, scale, height, width, solid, collider_scale, y, no_shadow
func place(id: String, x: float, z: float, opts: Dictionary = {}) -> Node3D:
	var node := Assets.instance(id)
	if node == null:
		return null
	Palette.apply(node, id)

	var size := Assets.size_of(id)
	var s: float = opts.get("scale", 1.0)
	if opts.has("height") and size.y > 0.0001:
		s = opts["height"] / size.y
	elif opts.has("width"):
		# Scale by the LONGEST horizontal axis. Many kit pieces (railings,
		# pipes, trims) are authored along Z; dividing by a 6 cm X extent
		# would blow them up enormously.
		var span := maxf(size.x, size.z)
		if span > 0.0001:
			s = opts["width"] / span

	var y: float = opts.get("y", 0.0)
	var ry: float = opts.get("ry", 0.0)
	node.scale = Vector3.ONE * s
	node.position = Vector3(x, y, z)
	node.rotation.y = ry

	if opts.get("no_shadow", false):
		_set_shadows_off(node)

	add_child(node)

	if opts.get("solid", false):
		var cs: float = opts.get("collider_scale", 0.92)
		var sx := maxf(size.x * s * cs, 0.12)
		var sz := maxf(size.z * s * cs, 0.12)
		var sy := maxf(size.y * s, 0.12)
		var swap := absf(sin(ry)) > 0.7
		var box := BoxShape3D.new()
		box.size = Vector3(sz if swap else sx, sy, sx if swap else sz)
		var owner_id := _body.create_shape_owner(_body)
		_body.shape_owner_add_shape(owner_id, box)
		_body.shape_owner_set_transform(owner_id, Transform3D(Basis(), Vector3(x, y + sy * 0.5, z)))

	return node


## Place several copies along a line, e.g. lockers down a wall.
func line(id: String, from: Vector2, to: Vector2, count: int, opts: Dictionary = {}) -> Array:
	var out: Array = []
	if count <= 0:
		return out
	for i in count:
		var t := 0.5 if count == 1 else float(i) / float(count - 1)
		out.append(place(id, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, opts))
	return out


## Scatter small clutter inside a rectangle.
func scatter(
	ids: Array, x0: float, z0: float, x1: float, z1: float, count: int, opts: Dictionary = {}
) -> void:
	for i in count:
		var id: String = ids[_rng.randi() % ids.size()]
		var o := opts.duplicate()
		o["ry"] = _rng.randf_range(0.0, TAU)
		place(id, _rng.randf_range(x0, x1), _rng.randf_range(z0, z1), o)


## Top surface height of a placed node — used to stack items on desks.
static func top_of(node: Node3D) -> float:
	var aabb := AABB()
	var first := true
	var stack: Array[Node] = [node]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		var world := mi.global_transform * mi.mesh.get_aabb()
		if first:
			aabb = world
			first = false
		else:
			aabb = aabb.merge(world)
	return aabb.position.y + aabb.size.y


func _set_shadows_off(node: Node3D) -> void:
	var stack: Array[Node] = [node]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		var gi := n as GeometryInstance3D
		if gi != null:
			gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF