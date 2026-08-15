shader_type canvas_item;
// Radial motion blur + chromatic aberration + speed vignette.
// Native equivalent of `src/core/shaders/warpDistort.ts`.

uniform float amount : hint_range(0.0, 1.0) = 0.0;
uniform float chroma : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 center = vec2(0.5);
	vec2 dir = uv - center;
	float dist = length(dir);

	// radial streak blur, stronger toward the edges
	vec3 acc = vec3(0.0);
	float total = 0.0;
	for (int i = 0; i < 12; i++) {
		float t = float(i) / 11.0;
		float scale = 1.0 - amount * 0.30 * t * smoothstep(0.05, 0.85, dist);
		float w = 1.0 - t * 0.55;
		acc += texture(screen_texture, center + dir * scale).rgb * w;
		total += w;
	}
	vec3 col = acc / max(total, 0.0001);

	// chromatic aberration along the radial axis
	if (chroma > 0.0005) {
		float o = chroma * 0.012 * smoothstep(0.0, 0.9, dist);
		vec3 shifted = col;
		shifted.r = texture(screen_texture, center + dir * (1.0 + o)).r;
		shifted.b = texture(screen_texture, center + dir * (1.0 - o)).b;
		col = mix(col, shifted, 0.65);
	}

	float vig = 1.0 - amount * 0.55 * smoothstep(0.25, 0.95, dist);
	COLOR = vec4(col * vig, 1.0);
}