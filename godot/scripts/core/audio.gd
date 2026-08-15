extends Node
## Audio — procedural synthesis, no sample files.
## Port of `src/core/audio.ts` onto AudioStreamGenerator.
##
## Every sound is generated at runtime: pink-noise beds, filtered noise bursts
## (door hydraulics, thrusters, footsteps, water, wind), FM tones (console
## blips, target lock, alarms) and sustained detuned drones (ship hum, reactor,
## warp core).
##
## Autoloaded as `Audio`.

const MIX_RATE := 44100.0
const POOL_SIZE := 12

var master_volume := 0.8
var ambient_volume := 0.7
var sfx_volume := 0.85

var _pool: Array[AudioStreamPlayer] = []
var _pool_next := 0
var _loops: Dictionary = {}  ## id -> {player, target_gain, gain, kind}
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_ensure_buses()
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_pool.append(p)


func _ensure_buses() -> void:
	# Create Master -> {SFX, Ambient} if the project has no bus layout.
	var idx_sfx := AudioServer.get_bus_index("SFX")
	if idx_sfx == -1:
		AudioServer.add_bus()
		var i := AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, "SFX")
		AudioServer.set_bus_send(i, "Master")
	var idx_amb := AudioServer.get_bus_index("Ambient")
	if idx_amb == -1:
		AudioServer.add_bus()
		var i := AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, "Ambient")
		AudioServer.set_bus_send(i, "Master")
	set_volume(&"master", master_volume)
	set_volume(&"sfx", sfx_volume)
	set_volume(&"ambient", ambient_volume)


func set_volume(bus: StringName, value: float) -> void:
	var v := clampf(value, 0.0, 1.0)
	var name := "Master"
	match bus:
		&"sfx":
			name = "SFX"
			sfx_volume = v
		&"ambient":
			name = "Ambient"
			ambient_volume = v
		_:
			master_volume = v
	var idx := AudioServer.get_bus_index(name)
	if idx >= 0:
		AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(v, 0.0001)))


func _next_player() -> AudioStreamPlayer:
	var p := _pool[_pool_next]
	_pool_next = (_pool_next + 1) % POOL_SIZE
	return p


# ------------------------------------------------------------------ one-shots


## Short filtered-noise burst — doors, thrusters, dust, water, footsteps.
func play_noise(
	duration: float, gain: float, filter_start: float, filter_end: float = -1.0, q: float = 1.0
) -> void:
	var f_end := filter_end if filter_end > 0.0 else filter_start
	var frames := int(MIX_RATE * duration)
	var data := PackedVector2Array()
	data.resize(frames)

	# one-pole band-limited noise with a swept cutoff
	var lp := 0.0
	var hp := 0.0
	for i in frames:
		var t := float(i) / float(frames)
		var cutoff := lerpf(filter_start, f_end, t)
		var alpha := clampf(cutoff / (MIX_RATE * 0.5), 0.001, 0.999)
		var white := _rng.randf_range(-1.0, 1.0)
		lp += alpha * (white - lp)
		hp = lp - hp * (1.0 - alpha) * 0.5
		# attack/decay envelope
		var env := minf(t / 0.02, 1.0) * pow(1.0 - t, 1.6)
		data[i] = Vector2.ONE * (hp * gain * env * q)

	_play_buffer(data, "SFX")


## Pitched tone — UI clicks, confirms, target lock, alarms.
func play_tone(
	freq: float, duration: float, gain: float, freq_end: float = -1.0, wave: StringName = &"sine"
) -> void:
	var f_end := freq_end if freq_end > 0.0 else freq
	var frames := int(MIX_RATE * duration)
	var data := PackedVector2Array()
	data.resize(frames)
	var phase := 0.0
	for i in frames:
		var t := float(i) / float(frames)
		var f := lerpf(freq, f_end, t)
		phase += TAU * f / MIX_RATE
		var s := 0.0
		match wave:
			&"square":
				s = 1.0 if sin(phase) > 0.0 else -1.0
			&"saw":
				s = fmod(phase / PI, 2.0) - 1.0
			&"triangle":
				s = asin(sin(phase)) * (2.0 / PI)
			_:
				s = sin(phase)
		var env := minf(t / 0.01, 1.0) * pow(1.0 - t, 1.2)
		data[i] = Vector2.ONE * (s * gain * env)
	_play_buffer(data, "SFX")


func _play_buffer(data: PackedVector2Array, bus: String) -> void:
	if data.is_empty():
		return
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = int(MIX_RATE)
	stream.stereo = true
	var bytes := PackedByteArray()
	bytes.resize(data.size() * 4)
	for i in data.size():
		var l := int(clampf(data[i].x, -1.0, 1.0) * 32767.0)
		var r := int(clampf(data[i].y, -1.0, 1.0) * 32767.0)
		bytes.encode_s16(i * 4, l)
		bytes.encode_s16(i * 4 + 2, r)
	stream.data = bytes

	var p := _next_player()
	p.bus = bus
	p.stream = stream
	p.play()


# ------------------------------------------------------------- named effects


func ui_hover() -> void:
	play_tone(1200.0, 0.035, 0.035, -1.0, &"square")


func ui_click() -> void:
	play_tone(660.0, 0.06, 0.09, 880.0, &"square")


func ui_denied() -> void:
	play_tone(220.0, 0.2, 0.11, 150.0, &"saw")


func beep(freq: float = 1400.0) -> void:
	play_tone(freq, 0.05, 0.06)


func ui_confirm() -> void:
	play_tone(620.0, 0.09, 0.09, -1.0, &"triangle")
	await get_tree().create_timer(0.07).timeout
	play_tone(930.0, 0.14, 0.08, -1.0, &"triangle")


func switch_clunk() -> void:
	play_noise(0.09, 0.34, 2400.0, 380.0, 1.4)
	play_tone(160.0, 0.1, 0.14, 90.0, &"square")


func lever_pull() -> void:
	play_noise(0.42, 0.30, 900.0, 200.0, 2.2)
	play_tone(120.0, 0.45, 0.16, 60.0, &"saw")


func door_slide(opening: bool) -> void:
	play_noise(0.85, 0.26, 420.0 if opening else 900.0, 1500.0 if opening else 260.0, 1.1)
	play_tone(90.0 if opening else 130.0, 0.5, 0.07, 150.0 if opening else 70.0)
	await get_tree().create_timer(0.38).timeout
	play_noise(0.5, 0.14, 3800.0, 1800.0, 0.7)


func footstep(surface: StringName) -> void:
	var table: Dictionary = {
		&"metal": [1500.0, 0.10, 0.09, 2.4],
		&"grass": [900.0, 0.07, 0.13, 0.7],
		&"stone": [1100.0, 0.09, 0.10, 1.2],
		&"water": [2200.0, 0.10, 0.16, 0.6],
	}
	var cfg: Array = table.get(surface, [1500.0, 0.10, 0.09, 2.4])
	var jitter := _rng.randf_range(0.85, 1.3)
	play_noise(float(cfg[2]), float(cfg[1]) * _rng.randf_range(0.75, 1.25), float(cfg[0]) * jitter, float(cfg[0]) * 0.4, float(cfg[3]))


func target_lock() -> void:
	play_tone(900.0, 0.05, 0.08, -1.0, &"square")
	await get_tree().create_timer(0.06).timeout
	play_tone(1350.0, 0.09, 0.08, -1.0, &"square")


func alarm() -> void:
	for i in 2:
		play_tone(720.0, 0.24, 0.11, 480.0, &"saw")
		await get_tree().create_timer(0.3).timeout


func impact(strength: float = 1.0) -> void:
	play_noise(0.7 * strength, 0.4 * strength, 260.0, 60.0, 0.8)
	play_tone(70.0, 0.6 * strength, 0.22 * strength, 35.0)


func pour() -> void:
	play_noise(1.4, 0.12, 1800.0, 900.0, 0.8)


# ------------------------------------------------------------------- loops
#
# Sustained beds use a looping generated buffer per layer, crossfaded by gain.


func loop(id: String, kind: StringName, bus: String = "Ambient") -> void:
	if _loops.has(id):
		return
	var p := AudioStreamPlayer.new()
	p.bus = bus
	p.stream = _loop_stream(kind)
	p.volume_db = -60.0
	add_child(p)
	p.play()
	_loops[id] = {"player": p, "gain": 0.0, "target": 0.0}


func _loop_stream(kind: StringName) -> AudioStreamWAV:
	var seconds := 3.0
	var frames := int(MIX_RATE * seconds)
	var data := PackedVector2Array()
	data.resize(frames)

	var lp := 0.0
	var p1 := 0.0
	var p2 := 0.0
	var p3 := 0.0

	for i in frames:
		var t := float(i) / MIX_RATE
		var s := 0.0
		var white := _rng.randf_range(-1.0, 1.0)
		match kind:
			&"hum":
				p1 += TAU * 52.0 / MIX_RATE
				p2 += TAU * 104.0 / MIX_RATE
				lp += 0.02 * (white - lp)
				s = sin(p1) * 0.28 + sin(p2) * 0.10 + lp * 0.14
			&"air":
				lp += 0.08 * (white - lp)
				s = lp * 0.55
			&"engine":
				p1 += TAU * 70.0 / MIX_RATE
				p2 += TAU * 140.0 / MIX_RATE
				lp += 0.05 * (white - lp)
				s = (fmod(p1 / PI, 2.0) - 1.0) * 0.055 + sin(p2) * 0.05 + lp * 0.3
			&"warp":
				p1 += TAU * 120.0 / MIX_RATE
				p2 += TAU * 180.0 / MIX_RATE
				p3 += TAU * 240.0 / MIX_RATE
				lp += 0.14 * (white - lp)
				s = (
					(fmod(p1 / PI, 2.0) - 1.0) * 0.06
					+ (fmod(p2 / PI, 2.0) - 1.0) * 0.05
					+ (1.0 if sin(p3) > 0.0 else -1.0) * 0.025
					+ lp * 0.35
				)
			&"wind":
				lp += 0.035 * (white - lp)
				s = lp * 0.55 + white * 0.03
			&"water":
				lp += 0.15 * (white - lp)
				s = lp * 0.4 + white * 0.08
			&"reactor":
				p1 += TAU * 38.0 / MIX_RATE
				p2 += TAU * 76.0 / MIX_RATE
				lp += 0.01 * (white - lp)
				s = sin(p1) * 0.34 + asin(sin(p2)) * (2.0 / PI) * 0.12 + lp * 0.2
		# fade the seam so the loop is inaudible
		var edge := minf(t / 0.15, minf((seconds - t) / 0.15, 1.0))
		data[i] = Vector2.ONE * (s * edge)

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = int(MIX_RATE)
	stream.stereo = true
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = frames
	var bytes := PackedByteArray()
	bytes.resize(frames * 4)
	for i in frames:
		var l := int(clampf(data[i].x, -1.0, 1.0) * 32767.0)
		bytes.encode_s16(i * 4, l)
		bytes.encode_s16(i * 4 + 2, l)
	stream.data = bytes
	return stream


func set_loop_gain(id: String, value: float) -> void:
	var l: Dictionary = _loops.get(id, {})
	if l.is_empty():
		return
	l["target"] = clampf(value, 0.0, 2.0)


func stop_loop(id: String) -> void:
	var l: Dictionary = _loops.get(id, {})
	if l.is_empty():
		return
	l["target"] = 0.0
	await get_tree().create_timer(1.0).timeout
	if _loops.has(id):
		var p: AudioStreamPlayer = _loops[id]["player"]
		p.stop()
		p.queue_free()
		_loops.erase(id)


func stop_all_loops() -> void:
	for id: String in _loops.keys():
		var p: AudioStreamPlayer = _loops[id]["player"]
		p.stop()
		p.queue_free()
	_loops.clear()


func _process(delta: float) -> void:
	# smooth every loop toward its target gain
	for id: String in _loops:
		var l: Dictionary = _loops[id]
		var g: float = l["gain"]
		var target: float = l["target"]
		if absf(g - target) < 0.001:
			continue
		g = lerpf(g, target, 1.0 - pow(2.0, -delta / 0.25))
		l["gain"] = g
		var p: AudioStreamPlayer = l["player"]
		p.volume_db = linear_to_db(maxf(g, 0.0001))