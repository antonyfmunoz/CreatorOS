// Clean-room frame math. No clocks, global random state, or competitor code.
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const progress = (value) => {
  if (!finite(value)) throw new Error('Motion progress must be finite.');
  return clamp(value);
};

export function cubicBezier(x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every(finite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new Error('Bezier x controls must be within 0..1 and all controls finite.');
  const curve = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return (input) => {
    const x = progress(input);
    if (x === 0 || x === 1) return x;
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 32; iteration++) {
      const middle = (low + high) / 2;
      if (curve(middle, x1, x2) < x) low = middle; else high = middle;
    }
    return curve((low + high) / 2, y1, y2);
  };
}

const power = (exponent) => (value) => progress(value) ** exponent;
export const easing = Object.freeze({
  linear: progress,
  quadratic: power(2),
  cubic: power(3),
  sine: (value) => 1 - Math.cos(progress(value) * Math.PI / 2),
  bezier: cubicBezier,
  out: (curve) => {
    if (typeof curve !== 'function') throw new Error('An easing function is required.');
    return (value) => 1 - curve(1 - progress(value));
  },
  inOut: (curve) => {
    if (typeof curve !== 'function') throw new Error('An easing function is required.');
    return (value) => { const t = progress(value); return t < .5 ? curve(2 * t) / 2 : 1 - curve(2 - 2 * t) / 2; };
  },
});

export function interpolate(value, input, output, { left = 'clamp', right = 'clamp', ease = (t) => t } = {}) {
  if (!finite(value) || !Array.isArray(input) || !Array.isArray(output) || input.length < 2 || input.length !== output.length || input.some((point, index) => !finite(point) || (index > 0 && point <= input[index - 1])) || output.some((point) => !finite(point))) throw new Error('Interpolation requires matching finite, strictly ordered input ranges.');
  if (![left, right].every((mode) => ['clamp', 'extend', 'wrap'].includes(mode)) || typeof ease !== 'function') throw new Error('Invalid interpolation behavior.');
  const first = input[0], last = input.at(-1);
  const mode = value < first ? left : value > last ? right : null;
  if (mode === 'clamp') return value < first ? output[0] : output.at(-1);
  if (mode === 'wrap') value = first + ((value - first) % (last - first) + last - first) % (last - first);
  let index = 1;
  while (index < input.length - 1 && value > input[index]) index++;
  const t = (value - input[index - 1]) / (input[index] - input[index - 1]);
  // Extrapolation stays linear; curves operate only inside each keyframe span.
  const weight = t < 0 || t > 1 ? t : ease(t);
  if (!finite(weight)) throw new Error('The easing function returned an invalid value.');
  return output[index - 1] + (output[index] - output[index - 1]) * weight;
}

export function spring({ frame, fps, from = 0, to = 1, mass = 1, stiffness = 100, damping = 10, delay = 0, clampOvershoot = false }) {
  if (![frame, fps, from, to, mass, stiffness, damping, delay].every(finite) || fps <= 0 || fps > 240 || mass < .001 || mass > 1000 || stiffness < .001 || stiffness > 100000 || damping < 0 || damping > 10000 || delay < 0 || typeof clampOvershoot !== 'boolean') throw new Error('Invalid physical spring parameters.');
  if (frame <= delay || from === to) return from;
  const t = (frame - delay) / fps;
  const omega = Math.sqrt(stiffness / mass), alpha = damping / (2 * mass);
  // Solve m*x'' + c*x' + k*(x-1) = 0 with x(0)=x'(0)=0.
  // The three damping regimes use closed forms, not frame-order-dependent steps.
  let displacement;
  if (Math.abs(alpha - omega) <= omega * 1e-7) {
    const exponent = alpha * t;
    displacement = exponent > 700 ? 0 : Math.exp(-exponent) * (1 + exponent);
  } else if (alpha < omega) {
    const frequency = Math.sqrt(omega * omega - alpha * alpha);
    displacement = Math.exp(-alpha * t) * (Math.cos(frequency * t) + alpha / frequency * Math.sin(frequency * t));
  } else {
    const radical = Math.sqrt(alpha * alpha - omega * omega);
    const slow = -omega * omega / (alpha + radical), fast = -alpha - radical;
    displacement = (-fast * Math.exp(slow * t) + slow * Math.exp(fast * t)) / (slow - fast);
  }
  const amount = clampOvershoot ? clamp(1 - displacement) : 1 - displacement;
  const result = from + (to - from) * amount;
  if (!finite(result)) throw new Error('Spring calculation exceeded numeric bounds.');
  return result;
}

export function seededRandom(seed) {
  if ((typeof seed !== 'string' && typeof seed !== 'number') || (typeof seed === 'number' && !finite(seed))) throw new Error('A finite number or string seed is required.');
  let hash = 2166136261;
  for (const character of `${typeof seed}:${seed}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function interpolateColor(value, input, colors, options) {
  if (!Array.isArray(colors) || colors.some((color) => typeof color !== 'string' || !/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color))) throw new Error('Colors must be six- or eight-digit hex values.');
  const channels = colors.map((color) => [1, 3, 5, 7].map((offset) => offset === 7 && color.length === 7 ? 255 : parseInt(color.slice(offset, offset + 2), 16)));
  const mixed = [0, 1, 2, 3].map((channel) => clamp(interpolate(value, input, channels.map((color) => color[channel]), options), 0, 255));
  return `rgba(${mixed.slice(0, 3).map(Math.round).join(',')},${Number((mixed[3] / 255).toFixed(6))})`;
}
