// Native browser-layout helpers. No competitor implementation or remote font
// service is used; measurements share the isolated composition's loaded fonts.
const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace']);
const commonKeys = ['text', 'fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'direction'];
const finite = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;

function normalize(input, fitting) {
  const keys = [...commonKeys, ...(fitting ? ['withinWidth', 'withinHeight', 'minFontSize', 'maxFontSize', 'maxLines'] : ['fontSize', 'width'])];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !keys.includes(key))) throw new Error('Invalid text layout options.');
  if (typeof input.text !== 'string' || input.text.length > 10000 || typeof input.fontFamily !== 'string' || !/^[\p{L}\p{N} _-]{1,120}$/u.test(input.fontFamily) || !input.fontFamily.trim()) throw new Error('Text and a bounded single font family are required.');
  const result = { text: input.text, fontFamily: input.fontFamily.trim(), fontWeight: input.fontWeight ?? 400, fontStyle: input.fontStyle ?? 'normal', letterSpacing: input.letterSpacing ?? 0, lineHeight: input.lineHeight ?? 1.2, direction: input.direction ?? 'ltr' };
  if (!Number.isInteger(result.fontWeight) || !finite(result.fontWeight, 1, 1000) || !['normal', 'italic', 'oblique'].includes(result.fontStyle) || !finite(result.letterSpacing, -64, 256) || !finite(result.lineHeight, .5, 4) || !['ltr', 'rtl'].includes(result.direction)) throw new Error('Invalid text typography.');
  if (fitting) {
    Object.assign(result, { width: input.withinWidth, height: input.withinHeight, minFontSize: input.minFontSize ?? 8, maxFontSize: input.maxFontSize ?? 128, maxLines: input.maxLines ?? 1 });
    if (!finite(result.width, 1, 16384) || (result.height !== undefined && !finite(result.height, 1, 16384)) || !finite(result.minFontSize, 1, 2048) || !finite(result.maxFontSize, result.minFontSize, 2048) || !Number.isInteger(result.maxLines) || !finite(result.maxLines, 1, 20)) throw new Error('Invalid text fitting bounds.');
    result.wrap = result.maxLines > 1;
  } else {
    Object.assign(result, { fontSize: input.fontSize, width: input.width, wrap: input.width !== undefined });
    if (!finite(result.fontSize, 1, 2048) || (result.width !== undefined && !finite(result.width, 1, 16384))) throw new Error('Invalid text measurement bounds.');
  }
  return result;
}

function familyName(value) { return value.replace(/^["']|["']$/g, '').toLocaleLowerCase('en-US'); }
function requireFont(options, size) {
  if (typeof document === 'undefined' || !document.body || !document.fonts) throw new Error('Text layout requires the composition browser.');
  const family = options.fontFamily.toLocaleLowerCase('en-US');
  const generic = genericFamilies.has(family);
  if (!generic && ![...document.fonts].some((face) => familyName(face.family) === family && face.status === 'loaded')) throw new Error('Register and load the requested private font before measuring text.');
  const cssFamily = generic ? family : JSON.stringify(options.fontFamily);
  if (!document.fonts.check(`${options.fontStyle} ${options.fontWeight} ${size}px ${cssFamily}`, options.text || 'M')) throw new Error('The requested text font is not ready.');
  return cssFamily;
}

function withMeasure(options, callback) {
  const fontFamily = requireFont(options, options.fontSize ?? options.maxFontSize);
  const node = document.createElement('div');
  const style = {
    display: 'inline-block', boxSizing: 'content-box', margin: 0, padding: 0,
    border: 0, minWidth: 0, maxWidth: 'none', height: 'auto', minHeight: 0,
    maxHeight: 'none', fontFamily, fontWeight: options.fontWeight,
    fontStyle: options.fontStyle, fontStretch: 'normal', fontVariant: 'normal',
    fontKerning: 'normal', letterSpacing: options.letterSpacing,
    wordSpacing: 0, lineHeight: options.lineHeight, direction: options.direction,
    textAlign: 'start', textIndent: 0, textTransform: 'none', textDecoration: 'none',
    writingMode: 'horizontal-tb', whiteSpace: options.wrap ? 'pre-wrap' : 'pre',
    overflowWrap: options.wrap ? 'anywhere' : 'normal', wordBreak: 'normal',
    width: options.wrap ? options.width : 'max-content',
  };
  const unitless = new Set(['fontWeight', 'lineHeight']);
  for (const [key, value] of Object.entries(style)) node.style[key] = typeof value === 'number' && !unitless.has(key) ? `${value}px` : String(value);
  Object.assign(node.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none' });
  node.textContent = options.text;
  document.body.appendChild(node);
  const range = document.createRange(); range.selectNodeContents(node);
  try {
    const measure = (fontSize) => {
      node.style.fontSize = `${fontSize}px`;
      // Use an explicit browser-layout-unit line height in the returned style,
      // so tiny fractional sizes cannot invent an extra line through rounding.
      const lineHeight = Math.ceil(fontSize * options.lineHeight * 64) / 64;
      node.style.lineHeight = `${lineHeight}px`;
      const height = node.getBoundingClientRect().height;
      let width = 0;
      for (const rect of range.getClientRects()) width = Math.max(width, rect.width);
      const lines = Math.max(0, Math.round(height / lineHeight));
      return { fontSize, width, height, lines, style: Object.freeze({ ...style, fontSize, lineHeight: `${lineHeight}px` }) };
    };
    return callback(measure);
  } finally { node.remove(); }
}

export function measureText(input) {
  const options = normalize(input, false);
  return Object.freeze(withMeasure(options, (measure) => measure(options.fontSize)));
}

export function fitText(input) {
  const options = normalize(input, true);
  return Object.freeze(withMeasure(options, (measure) => {
    const fits = (value) => value.width <= options.width + .001 && (options.height === undefined || value.height <= options.height + .001) && value.lines <= options.maxLines;
    const largest = measure(options.maxFontSize);
    if (fits(largest)) return { ...largest, fits: true };
    let best = measure(options.minFontSize);
    if (!fits(best)) return { ...best, fits: false };
    let low = options.minFontSize; let high = options.maxFontSize;
    // Bounded search of actual CSS layout; no guessed average character widths.
    for (let iteration = 0; iteration < 18 && high - low > 1 / 64; iteration++) {
      const size = (low + high) / 2;
      const current = measure(size);
      if (fits(current)) { best = current; low = size; } else high = size;
    }
    return { ...best, fits: true };
  }));
}
