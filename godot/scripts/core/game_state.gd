extends Node
## GameState — phase machine, ship systems and typed signals.
## Port of `src/core/state.ts`. Autoloaded as `GameState`.

signal phase_changed(phase: StringName)
signal systems_changed(systems: Dictionary)
signal target_changed(target: Dictionary)
signal objectives_changed(objectives: Array)
signal toast(text: String, tone: StringName)
signal subtitle(text: String, duration: float)
signal cinematic_changed(active: bool)
signal interact_prompt(label: String, detail: String)

enum Phase { BOOT, MENU, INTERIOR, FLIGHT, WARP_CHARGE, WARP_TUNNEL, ENTRY, LANDING, LANDED, SURFACE }

var phase: Phase = Phase.BOOT
var cinematic := false

var systems := {
	"hull": 1.0,
	"shields": 1.0,
	"fuel": 0.82,
	"power": 0.94,
	"oxygen": 0.98,
	"warp_charge": 0.0,
	"reactor_output": 0.72,
	"landing_gear": 0.0,
	"ramp_angle": 0.0,
}

var target: Dictionary = {}
var warp_armed := false
var warp_lever_pulled := false
var throttle_unlocked := false
var has_landed := false
var suit_on := false
var signal_found := false
var objectives: Array = []


func set_phase(p: Phase) -> void:
	if phase == p:
		return
	phase = p
	phase_changed.emit(phase_name(p))


func phase_name(p: Phase) -> StringName:
	match p:
		Phase.INTERIOR:
			return &"interior"
		Phase.FLIGHT:
			return &"flight"
		Phase.WARP_CHARGE:
			return &"warp_charge"
		Phase.WARP_TUNNEL:
			return &"warp_tunnel"
		Phase.ENTRY:
			return &"entry"
		Phase.LANDING:
			return &"landing"
		Phase.LANDED:
			return &"landed"
		Phase.SURFACE:
			return &"surface"
		Phase.MENU:
			return &"menu"
		_:
			return &"boot"


func set_cinematic(active: bool) -> void:
	cinematic = active
	cinematic_changed.emit(active)


func notify(text: String, tone: StringName = &"info") -> void:
	toast.emit(text, tone)


func say(text: String, duration: float = 4.5) -> void:
	subtitle.emit(text, duration)


func push_systems() -> void:
	systems_changed.emit(systems)


func set_target(t: Dictionary) -> void:
	target = t
	target_changed.emit(t)


func set_objectives(list: Array) -> void:
	objectives = list
	objectives_changed.emit(objectives)


func add_objective(id: String, text: String) -> void:
	for o in objectives:
		if o["id"] == id:
			return
	objectives.append({"id": id, "text": text, "done": false})
	objectives_changed.emit(objectives)


func complete_objective(id: String) -> void:
	for o in objectives:
		if o["id"] == id and not o["done"]:
			o["done"] = true
			objectives_changed.emit(objectives)
			return


func reset() -> void:
	phase = Phase.BOOT
	cinematic = false
	warp_armed = false
	warp_lever_pulled = false
	throttle_unlocked = false
	has_landed = false
	suit_on = false
	signal_found = false
	target = {}
	objectives.clear()
	systems["fuel"] = 0.82
	systems["warp_charge"] = 0.0
	systems["landing_gear"] = 0.0
	systems["ramp_angle"] = 0.0