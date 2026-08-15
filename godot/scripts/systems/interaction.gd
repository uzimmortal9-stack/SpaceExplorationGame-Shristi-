extends Node
## Interaction — proximity + look-at registry for every usable object.
## Port of `src/systems/interaction.ts`. Autoloaded as `Interact`.
##
## Same forgiving rule as the web build: the closest candidate that is within
## range AND roughly in front of the camera wins, which beats pure raycasting
## for small props while still feeling precise.

signal candidate_changed(label: String, detail: String)


class Item:
	var id: String
	var position: Vector3
	var node: Node3D
	var radius: float
	var kind: StringName
	var label: String
	var detail: String
	var enabled: bool
	## Score bonus. Two props can sit at the same spot (a safety lid and the
	## button underneath it); without this the one with the larger radius always
	## wins on distance and the inner control is unreachable forever.
	var priority: float
	var on_use: Callable
	var on_hover: Callable


var _items: Dictionary = {}
var _hovered := ""
var current: Dictionary = {}


func register(cfg: Dictionary) -> void:
	var it := Item.new()
	it.id = cfg["id"]
	it.position = cfg.get("position", Vector3.ZERO)
	it.node = cfg.get("node", null)
	it.radius = cfg.get("radius", 2.0)
	it.kind = cfg.get("kind", &"use")
	it.label = cfg.get("label", "Use")
	it.detail = cfg.get("detail", "")
	it.enabled = cfg.get("enabled", true)
	it.priority = cfg.get("priority", 0.0)
	it.on_use = cfg.get("on_use", Callable())
	it.on_hover = cfg.get("on_hover", Callable())
	_items[it.id] = it


func unregister(id: String) -> void:
	_items.erase(id)
	if _hovered == id:
		_hovered = ""


func get_item(id: String) -> Item:
	return _items.get(id)


func set_enabled(id: String, enabled: bool) -> void:
	var it: Item = _items.get(id)
	if it != null:
		it.enabled = enabled


func set_label(id: String, label: String) -> void:
	var it: Item = _items.get(id)
	if it != null:
		it.label = label


func clear() -> void:
	_items.clear()
	_hovered = ""
	current = {}


func size() -> int:
	return _items.size()


## Find the best candidate from the camera position and facing.
func update_from(eye: Vector3, forward: Vector3) -> void:
	var best: Item = null
	var best_score := -INF
	var best_dist := 0.0

	for id: String in _items:
		var it: Item = _items[id]
		if not it.enabled:
			continue
		var p := it.node.global_position if it.node != null and is_instance_valid(it.node) else it.position
		var dist := p.distance_to(eye)
		if dist > it.radius:
			continue
		var to := p - eye
		var len := to.length()
		if len < 0.00001:
			continue
		var facing := to / len
		var dot := facing.dot(forward)
		# must be broadly in front, unless we are right on top of it
		if dot < 0.35 and dist > 1.1:
			continue
		var score := dot * 2.2 - dist / maxf(it.radius, 0.001) + it.priority
		if score > best_score:
			best_score = score
			best = it
			best_dist = dist

	var next_id := best.id if best != null else ""
	if next_id != _hovered:
		var prev: Item = _items.get(_hovered)
		if prev != null and prev.on_hover.is_valid():
			prev.on_hover.call(false)
		if best != null and best.on_hover.is_valid():
			best.on_hover.call(true)
		_hovered = next_id

	if best != null:
		current = {
			"id": best.id,
			"label": best.label,
			"detail": best.detail,
			"kind": best.kind,
			"distance": best_dist,
		}
		candidate_changed.emit(best.label, best.detail)
	else:
		current = {}
		candidate_changed.emit("", "")


## Trigger the active candidate. Returns true if something happened.
func activate() -> bool:
	if current.is_empty():
		return false
	var it: Item = _items.get(current["id"])
	if it == null or not it.enabled or not it.on_use.is_valid():
		return false
	var next: Variant = it.on_use.call()
	if typeof(next) == TYPE_STRING and next != "":
		it.label = next
	return true