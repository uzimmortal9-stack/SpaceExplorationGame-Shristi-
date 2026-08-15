extends CanvasLayer
class_name Hud
## HUD — sparse by design. Port of `src/ui/hud.ts`.
##
## On foot: a small reticle and one contextual prompt. Nothing else.
## Seated: flight avionics fade in. Everything else lives on world-space panels.

const CYAN := Color(0.0, 0.94, 1.0)
const AMBER := Color(1.0, 0.69, 0.0)
const RED := Color(1.0, 0.13, 0.27)
const GOOD := Color(0.24, 0.91, 0.55)
const DIM := Color(0.5, 0.58, 0.67)

var _reticle: Panel
var _prompt: Label
var _prompt_detail: Label
var _objectives: VBoxContainer
var _objectives_panel: PanelContainer
var _toasts: VBoxContainer
var _subtitle: Label
var _subtitle_t := 0.0
var _avionics: Control
var _gauges: Dictionary = {}
var _speed: Label
var _target: Label
var _fps: Label
var _bar_top: ColorRect
var _bar_bottom: ColorRect
var _fade: ColorRect
var _displayed_speed := 0.0


func build() -> void:
	layer = 10
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	# reticle
	_reticle = Panel.new()
	_reticle.custom_minimum_size = Vector2(5, 5)
	_reticle.set_anchors_preset(Control.PRESET_CENTER)
	_reticle.position = Vector2(-2.5, -2.5)
	var rs := StyleBoxFlat.new()
	rs.bg_color = Color(0.86, 0.94, 1.0, 0.55)
	rs.corner_radius_top_left = 3
	rs.corner_radius_top_right = 3
	rs.corner_radius_bottom_left = 3
	rs.corner_radius_bottom_right = 3
	_reticle.add_theme_stylebox_override("panel", rs)
	root.add_child(_reticle)

	# interaction prompt
	var pv := VBoxContainer.new()
	pv.set_anchors_preset(Control.PRESET_CENTER)
	pv.position = Vector2(-200, 42)
	pv.custom_minimum_size = Vector2(400, 0)
	pv.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_child(pv)
	_prompt = _label("", 16, Color(0.92, 0.96, 1.0), HORIZONTAL_ALIGNMENT_CENTER)
	_prompt_detail = _label("", 11, DIM, HORIZONTAL_ALIGNMENT_CENTER)
	pv.add_child(_prompt)
	pv.add_child(_prompt_detail)

	# objectives
	_objectives_panel = _panel()
	_objectives_panel.position = Vector2(26, 26)
	_objectives_panel.custom_minimum_size = Vector2(290, 0)
	_objectives_panel.modulate.a = 0.0
	root.add_child(_objectives_panel)
	var ov := VBoxContainer.new()
	_objectives_panel.add_child(ov)
	ov.add_child(_label("OBJECTIVES", 11, AMBER))
	_objectives = VBoxContainer.new()
	ov.add_child(_objectives)

	# toasts
	_toasts = VBoxContainer.new()
	_toasts.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_toasts.position = Vector2(-330, 26)
	_toasts.custom_minimum_size = Vector2(300, 0)
	_toasts.alignment = BoxContainer.ALIGNMENT_BEGIN
	root.add_child(_toasts)

	# subtitle
	_subtitle = _label("", 17, Color(0.93, 0.96, 1.0), HORIZONTAL_ALIGNMENT_CENTER)
	_subtitle.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_subtitle.position = Vector2(-450, -120)
	_subtitle.custom_minimum_size = Vector2(900, 0)
	_subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_subtitle.modulate.a = 0.0
	root.add_child(_subtitle)

	_build_avionics(root)
	_build_cinematic(root)

	_fps = _label("", 10, DIM)
	_fps.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_fps.position = Vector2(-140, -28)
	root.add_child(_fps)

	GameState.toast.connect(_on_toast)
	GameState.subtitle.connect(_on_subtitle)
	GameState.objectives_changed.connect(_on_objectives)
	GameState.systems_changed.connect(_on_systems)
	GameState.target_changed.connect(_on_target)
	GameState.cinematic_changed.connect(_on_cinematic)
	GameState.phase_changed.connect(_on_phase)
	Interact.candidate_changed.connect(set_prompt)


func _build_avionics(root: Control) -> void:
	_avionics = Control.new()
	_avionics.set_anchors_preset(Control.PRESET_FULL_RECT)
	_avionics.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_avionics.modulate.a = 0.0
	root.add_child(_avionics)

	var left := _panel()
	left.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	left.position = Vector2(26, -190)
	left.custom_minimum_size = Vector2(190, 0)
	_avionics.add_child(left)
	var lv := VBoxContainer.new()
	left.add_child(lv)
	lv.add_child(_label("FLIGHT", 10, AMBER))
	for g: Array in [["throttle", "THROTTLE"], ["speed", "VELOCITY"], ["gear", "GEAR"]]:
		lv.add_child(_gauge(g[0], g[1]))

	var right := _panel()
	right.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	right.position = Vector2(-216, -190)
	right.custom_minimum_size = Vector2(190, 0)
	_avionics.add_child(right)
	var rv := VBoxContainer.new()
	right.add_child(rv)
	rv.add_child(_label("SYSTEMS", 10, AMBER))
	for g: Array in [["hull", "HULL"], ["fuel", "FUEL"], ["warp", "WARP"]]:
		rv.add_child(_gauge(g[0], g[1]))

	_speed = _label("0", 30, AMBER, HORIZONTAL_ALIGNMENT_CENTER)
	_speed.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_speed.position = Vector2(-100, -70)
	_speed.custom_minimum_size = Vector2(200, 0)
	_avionics.add_child(_speed)

	_target = _label("NO TARGET", 14, CYAN, HORIZONTAL_ALIGNMENT_CENTER)
	_target.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_target.position = Vector2(-200, 26)
	_target.custom_minimum_size = Vector2(400, 0)
	_avionics.add_child(_target)


func _build_cinematic(root: Control) -> void:
	_bar_top = ColorRect.new()
	_bar_top.color = Color.BLACK
	_bar_top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_bar_top.custom_minimum_size = Vector2(0, 0)
	_bar_top.size.y = 0
	root.add_child(_bar_top)

	_bar_bottom = ColorRect.new()
	_bar_bottom.color = Color.BLACK
	_bar_bottom.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_bar_bottom.size.y = 0
	root.add_child(_bar_bottom)

	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 0)
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_fade)


func _panel() -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.039, 0.059, 0.086, 0.75)
	sb.border_color = Color(0.122, 0.200, 0.278)
	sb.set_border_width_all(1)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 11
	sb.content_margin_bottom = 11
	p.add_theme_stylebox_override("panel", sb)
	return p


func _label(
	text: String, size: int, colour: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT
) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	l.horizontal_alignment = align
	return l


func _gauge(id: String, title: String) -> Control:
	var v := VBoxContainer.new()
	var head := HBoxContainer.new()
	head.add_child(_label(title, 10, DIM))
	var value := _label("0%", 10, Color(0.86, 0.91, 0.95))
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(value)
	v.add_child(head)
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(160, 3)
	bar.show_percentage = false
	bar.max_value = 1.0
	var fill := StyleBoxFlat.new()
	fill.bg_color = CYAN
	bar.add_theme_stylebox_override("fill", fill)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.08)
	bar.add_theme_stylebox_override("background", bg)
	v.add_child(bar)
	_gauges[id] = {"bar": bar, "value": value, "fill": fill}
	return v


func set_gauge(id: String, ratio: float, text: String, tone := "ok") -> void:
	var g: Dictionary = _gauges.get(id, {})
	if g.is_empty():
		return
	g["bar"].value = clampf(ratio, 0.0, 1.0)
	g["value"].text = text
	g["fill"].bg_color = RED if tone == "crit" else (Color(1.0, 0.4, 0.0) if tone == "warn" else CYAN)


func set_prompt(label: String, detail: String) -> void:
	_prompt.text = label.to_upper() if label != "" else ""
	_prompt_detail.text = detail
	_prompt.modulate.a = 1.0 if label != "" else 0.0
	_prompt_detail.modulate.a = 1.0 if detail != "" else 0.0
	_reticle.scale = Vector2.ONE * (1.9 if label != "" else 1.0)


func set_flight(throttle: float, spd: float) -> void:
	set_gauge("throttle", throttle, "%d%%" % int(throttle * 100.0))
	set_gauge("speed", clampf(spd / 1700.0, 0.0, 1.0), "%d" % int(spd))
	_displayed_speed = lerpf(_displayed_speed, spd, 0.18)
	_speed.text = "%d" % int(_displayed_speed)


func _on_systems(s: Dictionary) -> void:
	set_gauge(
		"hull",
		s["hull"],
		"%d%%" % int(s["hull"] * 100.0),
		"crit" if s["hull"] < 0.3 else ("warn" if s["hull"] < 0.6 else "ok")
	)
	set_gauge(
		"fuel",
		s["fuel"],
		"%d%%" % int(s["fuel"] * 100.0),
		"crit" if s["fuel"] < 0.15 else ("warn" if s["fuel"] < 0.3 else "ok")
	)
	set_gauge("warp", s["warp_charge"], "%d%%" % int(s["warp_charge"] * 100.0))
	var gear: float = s["landing_gear"]
	set_gauge(
		"gear",
		gear,
		"DOWN" if gear > 0.9 else ("UP" if gear < 0.1 else "MOVING"),
		"ok" if gear > 0.9 else "warn"
	)


func _on_target(t: Dictionary) -> void:
	if t.is_empty():
		_target.text = "NO TARGET"
	else:
		_target.text = (
			"%s   %s" % [String(t.get("name", "")).to_upper(), _format_distance(t.get("distance", 0.0))]
		)


func _on_toast(text: String, tone: StringName) -> void:
	var p := _panel()
	var l := _label(
		text.to_upper(),
		11,
		(
			Color(1.0, 0.85, 0.71)
			if tone == &"warn"
			else (Color(0.78, 0.96, 0.86) if tone == &"good" else Color(0.86, 0.91, 0.95))
		)
	)
	p.add_child(l)
	_toasts.add_child(p)
	var tw := create_tween()
	tw.tween_interval(4.2)
	tw.tween_property(p, "modulate:a", 0.0, 0.4)
	tw.tween_callback(p.queue_free)


func _on_subtitle(text: String, duration: float) -> void:
	_subtitle.text = text
	_subtitle.modulate.a = 1.0
	_subtitle_t = duration


func _on_objectives(list: Array) -> void:
	for c in _objectives.get_children():
		c.queue_free()
	for o: Dictionary in list:
		var l := _label(
			("* " if not o["done"] else "x ") + o["text"], 13, DIM if o["done"] else Color(0.86, 0.91, 0.95)
		)
		_objectives.add_child(l)
	_objectives_panel.modulate.a = 1.0 if list.size() > 0 else 0.0


func _on_cinematic(active: bool) -> void:
	var target := get_viewport().get_visible_rect().size.y * 0.105 if active else 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_bar_top, "size:y", target, 0.85)
	tw.tween_property(_bar_bottom, "size:y", target, 0.85)
	tw.tween_property(_bar_bottom, "position:y", get_viewport().get_visible_rect().size.y - target, 0.85)
	_avionics.modulate.a = 0.0 if active else _avionics.modulate.a
	_objectives_panel.modulate.a = 0.0 if active else _objectives_panel.modulate.a


func _on_phase(phase: StringName) -> void:
	var flying := phase in [&"flight", &"warp_charge", &"warp_tunnel"]
	var tw := create_tween()
	tw.tween_property(_avionics, "modulate:a", 1.0 if flying else 0.0, 0.5)


func fade_to(alpha: float, duration := 0.6) -> void:
	create_tween().tween_property(_fade, "color:a", alpha, duration)


func _process(delta: float) -> void:
	if _subtitle_t > 0.0:
		_subtitle_t -= delta
		if _subtitle_t <= 0.0:
			create_tween().tween_property(_subtitle, "modulate:a", 0.0, 0.4)
	_fps.text = "%d FPS" % int(Engine.get_frames_per_second())


func _format_distance(m: float) -> String:
	if m >= 1e9:
		return "%.2f Gm" % (m / 1e9)
	if m >= 1e6:
		return "%.2f Mm" % (m / 1e6)
	if m >= 1e3:
		return "%.1f km" % (m / 1e3)
	return "%d m" % int(m)