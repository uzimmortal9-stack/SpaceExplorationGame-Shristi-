/**
 * Radial motion blur + chromatic aberration + vignette, used for the warp
 * tunnel and (at low strength) atmospheric entry.
 */

import { Vector2 } from 'three';

export const WarpDistortShader = {
  name: 'WarpDistortShader',
  uniforms: {
    tDiffuse: { value: null as unknown },
    uAmount: { value: 0.0 },
    uChroma: { value: 0.0 },
    uResolution: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uChroma;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);

      // radial streak blur, stronger toward the edges
      const int SAMPLES = 12;
      vec3 acc = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1);
        float scale = 1.0 - uAmount * 0.30 * t * smoothstep(0.05, 0.85, dist);
        vec2 uv = center + dir * scale;
        float w = 1.0 - t * 0.55;
        acc += texture2D(tDiffuse, uv).rgb * w;
        total += w;
      }
      vec3 col = acc / max(total, 0.0001);

      // chromatic aberration along the radial axis
      if (uChroma > 0.0005) {
        float o = uChroma * 0.012 * smoothstep(0.0, 0.9, dist);
        col.r = texture2D(tDiffuse, center + dir * (1.0 + o)).r;
        col.b = texture2D(tDiffuse, center + dir * (1.0 - o)).b;
        vec3 blurred = acc / max(total, 0.0001);
        col = mix(blurred, col, 0.65);
      }

      // subtle speed vignette so the tunnel reads as a corridor
      float vig = 1.0 - uAmount * 0.55 * smoothstep(0.25, 0.95, dist);
      gl_FragColor = vec4(col * vig, 1.0);
    }
  `,
};
