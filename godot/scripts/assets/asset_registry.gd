extends Node
## AssetRegistry — manifest-driven asset loading (Godot port).
##
## Reads the SAME `assets/manifest.json` the web build uses, so the two ports
## never diverge on what art exists. Re-running `npm run assets` at the repo
## root updates both.
##
## What this fixes versus the browser build:
##   * Models load in a BACKGROUND THREAD via ResourceLoader.load_threaded_*,
##     so the window stays responsive and the loading bar is real.
##   * Only the assets a scene actually needs are resident; the planet's
##     library is not touched until descent begins.
##   * Meshes get automatic LOD (Godot generates it on import) and every
##     instance is a MultiMesh or an LOD-aware MeshInstance3D.
##
## Autoloaded as `Assets`.

signal progress(done: int, total: int, label: String)
signal finished

const MANIFEST_PATH := "res://assets/manifest.json"

## Model ids grouped by where they are used, so we can stream per-scene.
const SHIP_ONLY := [
	"wall",
	"wall_window",
	"wall_flat",
	"wall_divided",
	"wall_band",
	"wall_corner_in",
	"wall_corner_out",
	"wall_viewport",
	"floor",
	"floor_plates",
	"floor_squares",
	"floor_dark",
	"ceiling",
	"ceiling_cables",
	"ceiling_plastic",
	"stairs",
	"ramp",
	"railing",
	"door_frame",
	"door_panel",
	"door_dark",
	"column",
	"column_pipes",
	"column_support",
	"light_wide",
	"light_small",
	"light_floor",
	"vent_big",
	"vent_wide",
	"cable_a",
	"cable_b",
	"access_point",
	"console",
	"console_small",
	"barrel_large",
	"clamp",
	"item_holder",
	"fan",
	"pipes",
	"seat",
	"desk_large",
	"desk_medium",
	"desk_small",
	"desk_plain",
	"locker",
	"shelves_tall",
	"shelves_short",
	"shelves_thin",
	"crate",
	"crate_large",
	"crate_tarp",
	"barrel",
	"barrel_open",
	"satellite_dish",
	"mug",
	"keycard",
	"healthpack",
	"health_tube",
	"syringe",
	"ammo_box",
	"rifle",
	"pistol",
	"sniper",
	"pod",
	"capsule",
	"vessel",
	"vessel_tall",
	"teleporter",
	"container_full",
	"bed",
	"nightstand",
	"toilet",
	"sink",
	"shower",
	"bathtub",
	"mirror",
	"towel",
	"couch",
	"couch_small",
	"table_round",
	"table_long",
	"chair_soft",
	"stool",
	"bookshelf",
	"plant_a",
	"plant_b",
	"plant_c",
	"fridge",
	"kitchen_counter",
	"kitchen_cabinet",
	"kitchen_sink",
	"oven",
	"plate",
	"desk_lamp",
	"trashcan",
	"carpet",
	"drawer",
	"office_chair",
	"closet",
]

const PLANET_ONLY := [
	"rock_1",
	"rock_2",
	"rock_3",
	"rock_4",
	"pebble_1",
	"pebble_2",
	"alien_tree_1",
	"alien_tree_2",
	"alien_tree_3",
	"alien_tree_4",
	"alien_tree_5",
	"alien_tree_6",
	"alien_bush_1",
	"alien_bush_2",
	"alien_grass_1",
	"alien_grass_2",
	"alien_plant_1",
	"alien_plant_2",
	"palm_1",
	"palm_2",
	"jungle_tree_1",
	"jungle_tree_2",
	"fern",
	"mushroom_1",
	"mushroom_2",
	"flower_1",
	"flower_2",
	"ruin_arch",
	"ruin_arch_gothic",
	"ruin_column",
	"ruin_column_short",
	"ruin_column_sq",
	"ruin_wall",
	"ruin_wall_broken",
	"ruin_wall_arch",
	"ruin_floor",
	"ruin_stairs",
	"ruin_statue",
	"ruin_brazier",
	"ruin_pot",
	"ruin_support",
]

const HULL := ["hull_imperial", "hull_zenith", "hull_challenger"]

var manifest: Dictionary = {}
var _scenes: Dictionary = {}  ## id -> PackedScene
var _bounds: Dictionary = {}  ## id -> {size: Vector3, min: Vector3, max: Vector3}
var _missing: Array[String] = []
var _queued: Array[String] = []
var _loading := false
var _done := 0
var _total := 0


func _ready() -> void:
	set_process(false)
	_read_manifest()


func _read_manifest() -> void:
	if not FileAccess.file_exists(MANIFEST_PATH):
		push_error("AssetRegistry: %s missing. Run `npm run assets` at the repo root." % MANIFEST_PATH)
		return
	var text := FileAccess.get_file_as_string(MANIFEST_PATH)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("AssetRegistry: manifest.json is not valid JSON")
		return
	manifest = parsed


## Model ids that should be resident for a given phase.
func ids_for(group: StringName) -> Array:
	match group:
		&"ship":
			return SHIP_ONLY + HULL
		&"planet":
			return PLANET_ONLY
		&"all":
			return SHIP_ONLY + HULL + PLANET_ONLY
		_:
			return []


## Begin threaded loading of a group. Emits `progress` then `finished`.
func load_group(group: StringName) -> void:
	var ids: Array = ids_for(group)
	_queued.clear()
	for id: String in ids:
		if _scenes.has(id):
			continue
		var path := "res://assets/models/%s.glb" % id
		if not ResourceLoader.exists(path):
			if not _missing.has(id):
				_missing.append(id)
			continue
		ResourceLoader.load_threaded_request(path, "PackedScene", true)
		_queued.append(id)

	_done = 0
	_total = _queued.size()
	if _total == 0:
		finished.emit()
		return
	_loading = true
	set_process(true)


func _process(_delta: float) -> void:
	if not _loading:
		return
	# Drain a few completed loads per frame so the UI keeps painting.
	var budget := 4
	var still_pending: Array[String] = []
	for id: String in _queued:
		var path := "res://assets/models/%s.glb" % id
		var status := ResourceLoader.load_threaded_get_status(path)
		if status == ResourceLoader.THREAD_LOAD_LOADED and budget > 0:
			budget -= 1
			var packed: PackedScene = ResourceLoader.load_threaded_get(path)
			if packed != null:
				_register(id, packed)
			_done += 1
			progress.emit(_done, _total, id)
		elif (
			status == ResourceLoader.THREAD_LOAD_FAILED
			or status == ResourceLoader.THREAD_LOAD_INVALID_RESOURCE
		):
			if not _missing.has(id):
				_missing.append(id)
			_done += 1
			progress.emit(_done, _total, id)
		else:
			still_pending.append(id)
	_queued = still_pending

	if _queued.is_empty():
		_loading = false
		set_process(false)
		finished.emit()


func _register(id: String, packed: PackedScene) -> void:
	_scenes[id] = packed
	# Measure the authored bounds once, so placement code can size and seat
	# props exactly the way the web build does.
	var probe: Node3D = packed.instantiate() as Node3D
	if probe == null:
		return
	var aabb := _aabb_of(probe)
	_bounds[id] = {
		"size": aabb.size,
		"min": aabb.position,
		"max": aabb.position + aabb.size,
	}
	probe.queue_free()


func _aabb_of(root: Node3D) -> AABB:
	var out := AABB()
	var first := true
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		var local := mi.mesh.get_aabb()
		var xf := (
			root.global_transform.affine_inverse() * mi.global_transform
			if root.is_inside_tree()
			else mi.transform
		)
		var world := xf * local
		if first:
			out = world
			first = false
		else:
			out = out.merge(world)
	return out


## Instantiate a model. Returns null only if the id is unknown.
func instance(id: String) -> Node3D:
	var packed: PackedScene = _scenes.get(id)
	if packed == null:
		return _placeholder(id)
	var node: Node3D = packed.instantiate() as Node3D
	node.name = id
	return node


## Instantiate scaled so the model's height equals `metres`.
func instance_sized_y(id: String, metres: float) -> Node3D:
	var node := instance(id)
	var b: Dictionary = _bounds.get(id, {})
	if not b.is_empty():
		var h: float = b["size"].y
		if h > 0.0001:
			node.scale = Vector3.ONE * (metres / h)
	return node


## Instantiate scaled by the longest horizontal axis (matches the web build's
## `width` option, which must not divide by a 6 cm axis on Z-authored props).
func instance_sized_span(id: String, metres: float) -> Node3D:
	var node := instance(id)
	var b: Dictionary = _bounds.get(id, {})
	if not b.is_empty():
		var span: float = maxf(b["size"].x, b["size"].z)
		if span > 0.0001:
			node.scale = Vector3.ONE * (metres / span)
	return node


func bounds(id: String) -> Dictionary:
	return _bounds.get(id, {})


func size_of(id: String) -> Vector3:
	var b: Dictionary = _bounds.get(id, {})
	return b.get("size", Vector3.ONE) as Vector3


func has_model(id: String) -> bool:
	return _scenes.has(id)


func missing() -> Array[String]:
	return _missing


## Free a group's meshes when leaving a scene, so the planet's library does not
## sit in VRAM while you are walking the ship (and vice versa).
func unload_group(group: StringName) -> void:
	for id: String in ids_for(group):
		_scenes.erase(id)
		_bounds.erase(id)


## The same clearly-marked stand-in the web build uses: a magenta hazard block,
## impossible to mistake for finished art.
func _placeholder(id: String) -> Node3D:
	var root := Node3D.new()
	root.name = "placeholder_%s" % id
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.8, 0.8, 0.8)
	mi.mesh = box
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.85, 0.13, 0.76)
	mat.emission_enabled = true
	mat.emission = Color(0.2, 0.0, 0.15)
	mat.emission_energy_multiplier = 0.4
	mi.material_override = mat
	mi.position.y = 0.4
	root.add_child(mi)
	return root


## Credits rows for the in-game panel, grouped by source pack.
func credit_rows() -> Array:
	var by_pack: Dictionary = {}
	for m: Dictionary in manifest.get("models", []):
		var pack: String = m.get("pack", "unknown")
		if not by_pack.has(pack):
			by_pack[pack] = {
				"pack": pack,
				"author": m.get("author", ""),
				"license": m.get("license", ""),
				"count": 0,
			}
		by_pack[pack]["count"] += 1
	var rows: Array = by_pack.values()
	rows.sort_custom(func(a, b): return a["count"] > b["count"])
	return rows