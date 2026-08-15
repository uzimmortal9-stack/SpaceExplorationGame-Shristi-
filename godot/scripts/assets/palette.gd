extends Node
## Palette — flat-colour palettisation for atlas-less kits (Godot port).
##
## Mirrors `src/assets/palette.ts` exactly. Some Quaternius packs UV-map into a
## shared colour atlas that the public CC0 mirror does not carry, so those
## meshes arrive with one neutral base colour and no texture. Rather than ship
## grey foliage or fabricate a map, assign the flat colour the atlas encodes,
## keyed off the material name the artist authored.
##
## Materials that DO carry a real downloaded texture are never touched, so if
## the genuine atlas is added later it simply takes priority.
##
## Autoloaded as `Palette`.

## Structural roles must win over a model-wide tint (a trunk must not be
## painted with the leaf colour).
const STRUCTURAL := "bark|trunk|wood|branch|stem|stone|rock|metal|dark"

## name-pattern -> swatch
const RULES: Array = [
	["leaves|leaf|foliage|canopy", {"c": Color(0.247, 0.612, 0.290), "r": 0.82, "two": true}],
	["bark|trunk|wood|branch", {"c": Color(0.361, 0.275, 0.196), "r": 0.92}],
	["grass", {"c": Color(0.349, 0.639, 0.290), "r": 0.88, "two": true}],
	["flower|petal|blossom", {"c": Color(0.847, 0.373, 0.659), "r": 0.70, "two": true}],
	["mushroom|fungus|fungi", {"c": Color(0.847, 0.541, 0.290), "r": 0.78}],
	["bush|shrub|fern|plant", {"c": Color(0.216, 0.533, 0.290), "r": 0.85, "two": true}],
	["rock|stone|pebble|cliff|boulder", {"c": Color(0.498, 0.510, 0.533), "r": 0.95}],
	["sand|dirt|soil|ground|path", {"c": Color(0.604, 0.518, 0.376), "r": 0.97}],
	["snow|ice", {"c": Color(0.875, 0.918, 0.949), "r": 0.35}],
	["water|liquid", {"c": Color(0.184, 0.498, 0.588), "r": 0.12}],
	# Glass is force-overridden even when the kit supplies a texture: the source
	# M_Glass material is an OPAQUE grey, which renders viewports as black panels.
	["glass|window|viewport", {"c": Color(0.62, 0.83, 0.91, 0.12), "r": 0.03, "m": 0.0, "glass": true}],
	["screen|display|monitor", {"c": Color(0.05, 0.09, 0.14), "r": 0.18, "m": 0.05}],
	["metal|steel|iron|chrome|hull", {"c": Color(0.604, 0.643, 0.690), "r": 0.35, "m": 0.85}],
	["gold|brass", {"c": Color(0.816, 0.627, 0.290), "r": 0.30, "m": 0.95}],
	["dark|black|shadow", {"c": Color(0.137, 0.153, 0.176), "r": 0.55, "m": 0.40}],
	["white|light", {"c": Color(0.867, 0.890, 0.914), "r": 0.50, "m": 0.10}],
	["red|danger|alert", {"c": Color(0.753, 0.224, 0.169), "r": 0.50}],
	["orange|warn", {"c": Color(0.847, 0.478, 0.165), "r": 0.55}],
	["yellow|accent", {"c": Color(0.847, 0.690, 0.165), "r": 0.50}],
	["blue|cyan", {"c": Color(0.184, 0.498, 0.753), "r": 0.45}],
	["green", {"c": Color(0.247, 0.612, 0.353), "r": 0.60}],
]

## Per-model overrides so Ilex Prime reads as another world, not an Earth forest.
const ALIEN_TINTS := {
	"alien_tree_1": {"c": Color(0.184, 0.561, 0.478), "r": 0.78, "e": Color(0.051, 0.227, 0.196), "ei": 0.18},
	"alien_tree_2": {"c": Color(0.227, 0.498, 0.561), "r": 0.78, "e": Color(0.051, 0.184, 0.227), "ei": 0.16},
	"alien_tree_3": {"c": Color(0.435, 0.373, 0.659), "r": 0.80, "e": Color(0.141, 0.114, 0.267), "ei": 0.20},
	"alien_tree_4": {"c": Color(0.561, 0.659, 0.247), "r": 0.82},
	"alien_tree_5": {"c": Color(0.275, 0.784, 0.627), "r": 0.70, "e": Color(0.106, 0.478, 0.369), "ei": 0.45},
	"alien_tree_6": {"c": Color(0.624, 0.373, 0.561), "r": 0.80},
	"alien_bush_1": {"c": Color(0.184, 0.612, 0.416), "r": 0.85, "two": true},
	"alien_bush_2": {"c": Color(0.373, 0.659, 0.247), "r": 0.85, "two": true},
	"alien_grass_1": {"c": Color(0.384, 0.690, 0.290), "r": 0.88, "two": true},
	"alien_grass_2": {"c": Color(0.310, 0.627, 0.435), "r": 0.88, "two": true},
	"alien_plant_1":
	{"c": Color(0.247, 0.659, 0.627), "r": 0.80, "e": Color(0.078, 0.314, 0.286), "ei": 0.25},
	"alien_plant_2": {"c": Color(0.659, 0.373, 0.498), "r": 0.80},
	"flower_1":
	{"c": Color(0.910, 0.435, 0.722), "r": 0.68, "e": Color(0.353, 0.090, 0.251), "ei": 0.22, "two": true},
	"flower_2":
	{"c": Color(0.941, 0.659, 0.247), "r": 0.68, "e": Color(0.353, 0.227, 0.051), "ei": 0.20, "two": true},
	"mushroom_1": {"c": Color(0.498, 0.847, 0.784), "r": 0.60, "e": Color(0.165, 0.561, 0.478), "ei": 0.55},
	"mushroom_2": {"c": Color(0.847, 0.627, 0.247), "r": 0.72, "e": Color(0.353, 0.227, 0.051), "ei": 0.30},
	"fern": {"c": Color(0.184, 0.612, 0.353), "r": 0.84, "two": true},
	"jungle_tree_1": {"c": Color(0.208, 0.498, 0.259), "r": 0.84, "two": true},
	"jungle_tree_2": {"c": Color(0.184, 0.498, 0.310), "r": 0.84, "two": true},
	"palm_1": {"c": Color(0.247, 0.612, 0.384), "r": 0.82, "two": true},
	"palm_2": {"c": Color(0.310, 0.612, 0.322), "r": 0.82, "two": true},
	"rock_1": {"c": Color(0.467, 0.475, 0.498), "r": 0.95},
	"rock_2": {"c": Color(0.435, 0.447, 0.471), "r": 0.95},
	"rock_3": {"c": Color(0.498, 0.506, 0.533), "r": 0.94},
	"rock_4": {"c": Color(0.416, 0.427, 0.451), "r": 0.96},
	"pebble_1": {"c": Color(0.478, 0.490, 0.514), "r": 0.95},
	"pebble_2": {"c": Color(0.447, 0.459, 0.482), "r": 0.95},
}

var _cache: Dictionary = {}


## Apply palettisation to every material under `root`, in place.
func apply(root: Node3D, model_id: String) -> void:
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		for i in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(i) as StandardMaterial3D
			if mat == null:
				continue
			# A real downloaded texture always wins.
			# Glass is the one case where a shipped texture must be replaced:
			# the kit authors it opaque, which blacks out every viewport.
			var is_glass := "glass" in mat.resource_name.to_lower()
			if mat.albedo_texture != null and not is_glass:
				continue
			var swatch := resolve(model_id, mat.resource_name)
			if swatch.is_empty():
				continue
			mi.set_surface_override_material(i, _material_for(swatch))


func resolve(model_id: String, material_name: String) -> Dictionary:
	var name := material_name if material_name != null else ""
	var re := RegEx.new()

	# 1. structural roles first
	re.compile(STRUCTURAL)
	if re.search(name.to_lower()) != null:
		return _by_name(name)

	# 2. the model-wide alien tint
	if ALIEN_TINTS.has(model_id):
		return ALIEN_TINTS[model_id]

	# 3. any other name rule
	var by_name := _by_name(name)
	if not by_name.is_empty():
		return by_name

	# 4. unmatched atlas material -> muted organic green, never near-white
	re.compile("atlas|main|default|material")
	if re.search(name.to_lower()) != null:
		return {"c": Color(0.435, 0.561, 0.373), "r": 0.85}
	return {}


func _by_name(material_name: String) -> Dictionary:
	var lower := material_name.to_lower()
	var re := RegEx.new()
	for rule: Array in RULES:
		re.compile(rule[0])
		if re.search(lower) != null:
			return rule[1]
	return {}


func _material_for(swatch: Dictionary) -> StandardMaterial3D:
	var key := str(swatch)
	if _cache.has(key):
		return _cache[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = swatch.get("c", Color.WHITE)
	mat.roughness = swatch.get("r", 0.7)
	mat.metallic = swatch.get("m", 0.0)
	if swatch.get("glass", false):
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.metallic_specular = 0.9
		mat.clearcoat_enabled = true
		mat.clearcoat = 0.8
	if swatch.has("e"):
		mat.emission_enabled = true
		mat.emission = swatch["e"]
		mat.emission_energy_multiplier = swatch.get("ei", 0.2)
	if swatch.get("two", false):
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_cache[key] = mat
	return mat