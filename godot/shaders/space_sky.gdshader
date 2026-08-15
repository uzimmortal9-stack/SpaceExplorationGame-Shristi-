shader_type sky;
// Procedural deep-space sky: star layers, a warm local sun and a faint nebula.
//
// Used as the ship scene's background so the windows look out onto space rather
// than a flat clear colour, and so falling outside the hull shows stars instead
// of a black void.

uniform vec3 horizon_tint : source_color = vec3(0.02, 0.03, 0.06);
uniform float star_density : hint_range(0.0, 1.0) = 0.55;
uniform float nebula_strength : hint_range(0.0, 2.0) = 0.35;
uniform vec3 sun_dir = vec3(0.75, 0.22, -0.62);

float hash(vec3 p) {
	p = fract(p * vec3(443.897, 441.423, 437.195));
	p += dot(p, p.yzx + 19.19);
	return fract((p.x + p.y) * p.z);
}

float star_layer(vec3 dir, float scale, float thresh) {
	vec3 p = dir * scale;
	vec3 cell = floor(p);
	float best = 0.0;
	for (int x = -1; x <= 1; x++) {
		for (int y = -1; y <= 1; y++) {
			for (int z = -1; z <= 1; z++) {
				vec3 c = cell + vec3(float(x), float(y), float(z));
				float h = hash(c);
				if (h < thresh) { continue; }
				vec3 star = c + vec3(hash(c + 1.0), hash(c + 2.0), hash(c + 3.0));
				float d = length(p - star);
				best = max(best, smoothstep(0.10, 0.0, d) * (h - thresh) / max(1.0 - thresh, 0.001));
			}
		}
	}
	return best;
}

float fbm(vec3 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * hash(floor(p));
		p *= 2.03;
		a *= 0.5;
	}
	return v;
}

void sky() {
	vec3 dir = EYEDIR;

	// three star layers at different scales for parallax-free depth
	float s = star_layer(dir, 90.0, 1.0 - star_density * 0.020) * 1.0;
	s += star_layer(dir, 190.0, 1.0 - star_density * 0.012) * 0.7;
	s += star_layer(dir, 380.0, 1.0 - star_density * 0.006) * 0.45;

	// tint stars slightly by direction so they are not uniformly white
	float warm = hash(floor(dir * 120.0));
	vec3 star_col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), warm);

	// faint nebula band
	float neb = fbm(dir * 3.0 + 11.0);
	neb = smoothstep(0.45, 0.95, neb);
	vec3 nebula = mix(vec3(0.05, 0.10, 0.22), vec3(0.16, 0.06, 0.20), fbm(dir * 2.0));

	// the system's star
	vec3 sd = normalize(sun_dir);
	float sun = pow(max(dot(dir, sd), 0.0), 900.0);
	float glow = pow(max(dot(dir, sd), 0.0), 18.0) * 0.28;

	vec3 col = horizon_tint;
	col += nebula * neb * nebula_strength;
	col += star_col * s * 2.2;
	col += vec3(1.0, 0.93, 0.82) * sun * 40.0;
	col += vec3(1.0, 0.85, 0.65) * glow;

	COLOR = col;
}