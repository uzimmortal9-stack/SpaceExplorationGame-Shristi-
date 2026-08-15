extends Node
## ShipLayout — the deck plan. Mechanically ported from `src/world/ship/layout.ts`
## so the web and native builds can never disagree on the ship.
##
## Autoloaded as `ShipLayout`.

const DECK_HEIGHT := 3.0
const CORRIDOR_HALF := 2.0
const TILE := 4.0

const SPAWN := {"x": -8.0, "y": 0.0, "z": -2.0, "yaw": PI * 0.5}
const PILOT_SEAT := Vector3(-1.5, 0.0, -24.5)
const COPILOT_SEAT := Vector3(1.5, 0.0, -24.5)
const RAMP_HINGE := Vector3(0.0, 0.0, 78.0)
const RAMP_LENGTH := 9.0
const RAMP_WIDTH := 5.0

const ROOMS: Array = [
	{
		"id": "bridge",
		"name": "BRIDGE",
		"subtitle": "Flight Command",
		"x0": -9,
		"z0": -30,
		"x1": 9,
		"z1": -16,
		"mood": "command",
		"ceiling": 3.2
	},
	{
		"id": "defense",
		"name": "DEFENCE",
		"subtitle": "Security & Turret Control",
		"x0": -15,
		"z0": -16,
		"x1": -3,
		"z1": -8,
		"mood": "utility",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "comms",
		"name": "COMMS",
		"subtitle": "Briefing & Long Range",
		"x0": 3,
		"z0": -16,
		"x1": 15,
		"z1": -8,
		"mood": "command",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "cabin_a",
		"name": "CABIN 01",
		"subtitle": "Cmdr. R. Okonkwo",
		"x0": -15,
		"z0": -6,
		"x1": -3,
		"z1": 1,
		"mood": "crew",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "cabin_b",
		"name": "CABIN 02",
		"subtitle": "Sci. Off. L. Meier",
		"x0": -15,
		"z0": 3,
		"x1": -3,
		"z1": 10,
		"mood": "crew",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "washroom_a",
		"name": "WASHROOM A",
		"subtitle": "Hygiene Module",
		"x0": -15,
		"z0": 12,
		"x1": -9,
		"z1": 18,
		"mood": "service",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "washroom_b",
		"name": "WASHROOM B",
		"subtitle": "Hygiene Module",
		"x0": -9,
		"z0": 12,
		"x1": -3,
		"z1": 18,
		"mood": "service",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "lounge",
		"name": "LOUNGE",
		"subtitle": "Crew Recreation",
		"x0": 3,
		"z0": -6,
		"x1": 15,
		"z1": 2,
		"mood": "crew",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "galley",
		"name": "GALLEY",
		"subtitle": "Dining & Food Prep",
		"x0": 3,
		"z0": 4,
		"x1": 15,
		"z1": 12,
		"mood": "crew",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "medical",
		"name": "MEDICAL",
		"subtitle": "Infirmary & Cryo",
		"x0": 3,
		"z0": 14,
		"x1": 15,
		"z1": 22,
		"mood": "medical",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "science",
		"name": "SCIENCE LAB",
		"subtitle": "Analysis & Samples",
		"x0": -15,
		"z0": 20,
		"x1": -3,
		"z1": 28,
		"mood": "science",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "storage",
		"name": "STORAGE",
		"subtitle": "Supplies & Tools",
		"x0": -15,
		"z0": 30,
		"x1": -3,
		"z1": 38,
		"mood": "utility",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "fuel",
		"name": "FUEL PROCESSING",
		"subtitle": "Hydrogen Handling",
		"x0": 3,
		"z0": 24,
		"x1": 15,
		"z1": 32,
		"mood": "engineering",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "lifesupport",
		"name": "LIFE SUPPORT",
		"subtitle": "Atmosphere & Water",
		"x0": 3,
		"z0": 34,
		"x1": 15,
		"z1": 41,
		"mood": "engineering",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "power",
		"name": "POWER DIST.",
		"subtitle": "Grid & Batteries",
		"x0": -15,
		"z0": 40,
		"x1": -3,
		"z1": 47,
		"mood": "engineering",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "reactor",
		"name": "REACTOR",
		"subtitle": "Primary Core — Hazard",
		"x0": 3,
		"z0": 43,
		"x1": 15,
		"z1": 51,
		"mood": "engineering",
		"ceiling": 4.2
	},
	{
		"id": "warp",
		"name": "WARP DRIVE",
		"subtitle": "FTL Core & Lever",
		"x0": -9,
		"z0": 49,
		"x1": 9,
		"z1": 62,
		"mood": "engineering",
		"ceiling": 4.6
	},
	{
		"id": "engineering",
		"name": "ENGINEERING",
		"subtitle": "Workshop & Maintenance",
		"x0": -15,
		"z0": 49,
		"x1": -9,
		"z1": 58,
		"mood": "engineering",
		"ceiling": DECK_HEIGHT
	},
	{
		"id": "cargo",
		"name": "CARGO BAY",
		"subtitle": "Airlock & Boarding Ramp",
		"x0": -10,
		"z0": 64,
		"x1": 10,
		"z1": 78,
		"mood": "cargo",
		"ceiling": 4.2
	},
]

## Corridors. CRITICAL: these must ABUT the rooms they serve, not stop short of
## them. The spine spans x=-3..3 so it meets every side room's face exactly; if
## it were narrower the deck tiles would leave an open strip at each doorway and
## the player would fall straight through into the void.
const CORRIDORS: Array = [
	{"x0": -3, "z0": -16, "x1": 3, "z1": 49},
	{"x0": -15, "z0": -8, "x1": -3, "z1": -6},
	{"x0": 3, "z0": -8, "x1": 15, "z1": -6},
	{"x0": -15, "z0": 1, "x1": -3, "z1": 3},
	{"x0": -15, "z0": 10, "x1": -3, "z1": 12},
	{"x0": -15, "z0": 18, "x1": -3, "z1": 20},
	{"x0": -15, "z0": 38, "x1": -3, "z1": 40},
	{"x0": 3, "z0": 22, "x1": 15, "z1": 24},
	{"x0": 3, "z0": 32, "x1": 15, "z1": 34},
	{"x0": 3, "z0": 41, "x1": 15, "z1": 43},
	{"x0": -15, "z0": 47, "x1": -3, "z1": 49},
	{"x0": -3, "z0": 62, "x1": 3, "z1": 64},
]

const DOORWAYS: Array = [
	{"id": "d_bridge", "from": "bridge", "to": "spine", "x": 0, "z": -16, "axis": "x", "width": 3.2},
	{"id": "d_defense", "from": "defense", "to": "spine", "x": -3, "z": -7, "axis": "z", "width": 2.4},
	{"id": "d_comms", "from": "comms", "to": "spine", "x": 3, "z": -7, "axis": "z", "width": 2.4},
	{"id": "d_cabin_a", "from": "cabin_a", "to": "spine", "x": -3, "z": -2.5, "axis": "z", "width": 2.2},
	{"id": "d_cabin_b", "from": "cabin_b", "to": "spine", "x": -3, "z": 6.5, "axis": "z", "width": 2.2},
	{"id": "d_wash_a", "from": "washroom_a", "to": "spine", "x": -12, "z": 12, "axis": "x", "width": 1.8},
	{"id": "d_wash_b", "from": "washroom_b", "to": "spine", "x": -6, "z": 12, "axis": "x", "width": 1.8},
	{"id": "d_lounge", "from": "lounge", "to": "spine", "x": 3, "z": -2, "axis": "z", "width": 2.4},
	{"id": "d_galley", "from": "galley", "to": "spine", "x": 3, "z": 8, "axis": "z", "width": 2.4},
	{"id": "d_medical", "from": "medical", "to": "spine", "x": 3, "z": 18, "axis": "z", "width": 2.4},
	{"id": "d_science", "from": "science", "to": "spine", "x": -3, "z": 24, "axis": "z", "width": 2.4},
	{"id": "d_storage", "from": "storage", "to": "spine", "x": -3, "z": 34, "axis": "z", "width": 2.4},
	{"id": "d_fuel", "from": "fuel", "to": "spine", "x": 3, "z": 28, "axis": "z", "width": 2.4},
	{
		"id": "d_lifesupport",
		"from": "lifesupport",
		"to": "spine",
		"x": 3,
		"z": 37.5,
		"axis": "z",
		"width": 2.4
	},
	{"id": "d_power", "from": "power", "to": "spine", "x": -3, "z": 43.5, "axis": "z", "width": 2.4},
	{"id": "d_reactor", "from": "reactor", "to": "spine", "x": 3, "z": 47, "axis": "z", "width": 2.4},
	{
		"id": "d_engineering",
		"from": "engineering",
		"to": "spine",
		"x": -9,
		"z": 53.5,
		"axis": "x",
		"width": 2.2
	},
	{"id": "d_warp", "from": "warp", "to": "spine", "x": 0, "z": 49, "axis": "x", "width": 3.0},
	{"id": "d_cargo", "from": "cargo", "to": "spine", "x": 0, "z": 64, "axis": "x", "width": 3.2},
]

const ROOM_TELEPORTS: Array = [
	{"id": "bridge", "label": "Bridge", "x": 0, "z": -22, "yaw": PI},
	{"id": "cabin_a", "label": "Crew Cabin 01", "x": -8, "z": -2, "yaw": PI / 2},
	{"id": "lounge", "label": "Lounge", "x": 9, "z": -2, "yaw": -PI / 2},
	{"id": "galley", "label": "Galley", "x": 9, "z": 8, "yaw": -PI / 2},
	{"id": "medical", "label": "Medical Bay", "x": 9, "z": 18, "yaw": -PI / 2},
	{"id": "science", "label": "Science Lab", "x": -9, "z": 24, "yaw": PI / 2},
	{"id": "storage", "label": "Storage", "x": -9, "z": 34, "yaw": PI / 2},
	{"id": "fuel", "label": "Fuel Processing", "x": 7, "z": 30, "yaw": -PI / 2},
	{"id": "reactor", "label": "Reactor", "x": 6, "z": 50, "yaw": -PI / 2},
	{"id": "warp", "label": "Warp Drive", "x": -4.5, "z": 59, "yaw": 0},
	{"id": "cargo", "label": "Cargo Bay", "x": 0, "z": 70, "yaw": 0},
]


## All walkable rectangles (rooms + corridors), used for decks and collision.
func walkable_rects() -> Array:
	var out: Array = []
	for r: Dictionary in ROOMS:
		(
			out
			. append(
				{
					"x0": r["x0"],
					"z0": r["z0"],
					"x1": r["x1"],
					"z1": r["z1"],
					"ceiling": r["ceiling"],
					"room": r,
				}
			)
		)
	for c: Dictionary in CORRIDORS:
		(
			out
			. append(
				{
					"x0": c["x0"],
					"z0": c["z0"],
					"x1": c["x1"],
					"z1": c["z1"],
					"ceiling": DECK_HEIGHT,
					"room": null,
				}
			)
		)
	return out


func room_at(x: float, z: float) -> Variant:
	for r: Dictionary in ROOMS:
		if x > r["x0"] and x < r["x1"] and z > r["z0"] and z < r["z1"]:
			return r
	return null


## Is this point on walkable deck? (drives the hull perimeter)
func walkable(x: float, z: float) -> bool:
	for r: Dictionary in ROOMS:
		if x > r["x0"] + 0.01 and x < r["x1"] - 0.01 and z > r["z0"] + 0.01 and z < r["z1"] - 0.01:
			return true
	for c: Dictionary in CORRIDORS:
		if x > c["x0"] + 0.01 and x < c["x1"] - 0.01 and z > c["z0"] + 0.01 and z < c["z1"] - 0.01:
			return true
	return false


## Split a span into whole 4 m modules plus a scaled remainder, so rooms of any
## size tile seamlessly without gaps or overlap.
func spans(a: float, b: float) -> Array:
	var length := b - a
	var whole := int(floor(length / TILE + 0.000001))
	var out: Array = []
	for i in whole:
		out.append({"centre": a + i * TILE + TILE * 0.5, "scale": 1.0})
	var rem := length - whole * TILE
	if rem > 0.05:
		out.append({"centre": a + whole * TILE + rem * 0.5, "scale": rem / TILE})
	return out


## Subtract every doorway from a wall run, returning the solid pieces.
func subtract_doors(a: float, b: float, fixed: float, along: String) -> Array:
	var pieces: Array = [[a, b]]
	for d: Dictionary in DOORWAYS:
		var perp: float = d["z"] if along == "x" else d["x"]
		if absf(perp - fixed) > 1.4:
			continue
		var c: float = d["x"] if along == "x" else d["z"]
		var half: float = d["width"] * 0.5 + 0.12
		var lo := c - half
		var hi := c + half
		var next: Array = []
		for piece: Array in pieces:
			var s0: float = piece[0]
			var s1: float = piece[1]
			if hi <= s0 or lo >= s1:
				next.append([s0, s1])
				continue
			if lo > s0:
				next.append([s0, lo])
			if hi < s1:
				next.append([hi, s1])
		pieces = next
	var solid: Array = []
	for piece: Array in pieces:
		if piece[1] - piece[0] > 0.08:
			solid.append(piece)
	return solid