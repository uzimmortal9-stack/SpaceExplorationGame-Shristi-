extends Node3D
class_name DoorSystem
## Automatic bi-parting sliding doors. Port of `src/systems/doors.ts`.
##
## Behaviour preserved exactly:
##   * opens when the player enters the trigger radius
##   * stays open while anything occupies the doorway (obstruction safety) and
##     re-opens instantly if the player steps back in while closing
##   * the collider is only disabled once the leaves are far enough apart
##   * airlock interlocks: a door refuses to open while its partner is unsealed


class Door:
	var id: String
	var leaves: Array[Node3D] = []
	var rest: Array[Vector3] = []
	var travel: Array[Vector3] = []
	var centre: Vector3
	var half_extent: Vector2
	var body: StaticBody3D
	var state := "closed"
	var t := 0.0
	var hold := 0.0
	var open_time := 0.9
	var hold_time := 1.8
	var trigger := 3.6
	var interlock := ""
	var last_audible := ""


var doors: Dictionary = {}


func build(frames: Dictionary) -> void:
	name = "Doors"
	for d: Dictionary in ShipLayout.DOORWAYS:
		var frame: Dictionary = frames.get(d["id"], {})
		if frame.is_empty():
			continue
		var width: float = frame["width"]
		var leaf_w := width * 0.5
		var along := Vector3(1, 0, 0) if d["axis"] == "x" else Vector3(0, 0, 1)

		var door := Door.new()
		door.id = d["id"]
		door.centre = Vector3(d["x"], 1.2, d["z"])
		door.interlock = d.get("interlock", "")
		door.half_extent = Vector2(
			width * 0.5 if d["axis"] == "x" else 1.0, 1.0 if d["axis"] == "x" else width * 0.5
		)

		var body := StaticBody3D.new()
		body.collision_layer = 1
		add_child(body)
		door.body = body

		for sign_i in [-1.0, 1.0]:
			var leaf := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(
				leaf_w if d["axis"] == "x" else 0.16,
				ShipLayout.DECK_HEIGHT - 0.12,
				leaf_w if d["axis"] == "z" else 0.16
			)
			leaf.mesh = box
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color(0.224, 0.259, 0.302)
			mat.roughness = 0.4
			mat.metallic = 0.78
			mat.emission_enabled = true
			mat.emission = Color(0.039, 0.102, 0.133)
			mat.emission_energy_multiplier = 0.25
			leaf.material_override = mat
			var pos: Vector3 = (
				Vector3(d["x"], (ShipLayout.DECK_HEIGHT - 0.12) * 0.5, d["z"])
				+ along * (sign_i * leaf_w * 0.5)
			)
			leaf.position = pos
			add_child(leaf)
			door.leaves.append(leaf)
			door.rest.append(pos)
			door.travel.append(along * (sign_i * leaf_w * 0.98))

			var shape := CollisionShape3D.new()
			var cbox := BoxShape3D.new()
			cbox.size = box.size
			shape.shape = cbox
			shape.position = pos
			body.add_child(shape)

		doors[door.id] = door


func _physics_process(delta: float) -> void:
	var player := get_tree().get_first_node_in_group("player") as Node3D
	if player == null:
		return
	var p := player.global_position
	# doors live in ship-local space; convert when the hull has moved
	var local := global_transform.affine_inverse() * p

	for id: String in doors:
		var d: Door = doors[id]
		_update_door(d, delta, local)


func _update_door(d: Door, delta: float, player_local: Vector3) -> void:
	var dist := player_local.distance_to(d.centre)
	var blocked := (
		absf(player_local.x - d.centre.x) < d.half_extent.x + 0.34
		and absf(player_local.z - d.centre.z) < d.half_extent.y + 0.34
		and player_local.y < ShipLayout.DECK_HEIGHT
	)

	if d.state != "locked":
		var interlock_ok := true
		if d.interlock != "" and doors.has(d.interlock):
			interlock_ok = (doors[d.interlock] as Door).t < 0.02

		var want_open := dist < d.trigger and interlock_ok
		if want_open or blocked:
			if interlock_ok or blocked:
				if d.state == "closed" or d.state == "closing":
					d.state = "opening"
				d.hold = d.hold_time
		elif d.state == "open":
			d.hold -= delta
			if d.hold <= 0.0:
				d.state = "closing"

		# safety: never close on the player
		if d.state == "closing" and blocked:
			d.state = "opening"

	var speed := 1.0 / d.open_time
	match d.state:
		"opening":
			d.t = clampf(d.t + delta * speed, 0.0, 1.0)
			if d.t >= 1.0:
				d.state = "open"
		"closing":
			d.t = clampf(d.t - delta * speed, 0.0, 1.0)
			if d.t <= 0.0:
				d.state = "closed"
		"locked":
			d.t = clampf(d.t - delta * speed, 0.0, 1.0)

	if d.state != d.last_audible:
		if d.state == "opening":
			Audio.door_slide(true)
		elif d.state == "closing":
			Audio.door_slide(false)
		d.last_audible = d.state

	var e := _ease(d.t)
	for i in d.leaves.size():
		d.leaves[i].position = d.rest[i] + d.travel[i] * e
		var shape := d.body.get_child(i) as CollisionShape3D
		if shape != null:
			shape.position = d.leaves[i].position

	# passable once the leaves are clear
	d.body.collision_layer = 0 if d.t > 0.55 else 1


func get_door(id: String) -> Door:
	return doors.get(id)


func _ease(t: float) -> float:
	return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0