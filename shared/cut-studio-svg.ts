const allowedTags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const commonAttributes = new Set(["id", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "transform"]);
const tagAttributes: Record<string, Set<string>> = {
  svg: new Set(["viewbox", "width", "height", "preserveaspectratio", "xmlns"]),
  g: new Set(),
  path: new Set(["d", "pathlength"]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
  circle: new Set(["cx", "cy", "r"]),
  ellipse: new Set(["cx", "cy", "rx", "ry"]),
  line: new Set(["x1", "x2", "y1", "y2"]),
  polyline: new Set(["points"]),
  polygon: new Set(["points"]),
};
const outputNames: Record<string, string> = { viewbox: "viewBox", preserveaspectratio: "preserveAspectRatio" };
const number = "[-+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
const numeric = new RegExp(`^${number}%?$`);
const numericList = new RegExp(`^\\s*${number}(?:[\\s,]+${number})*\\s*$`);
const viewBox = new RegExp(`^\\s*${number}[\\s,]+${number}[\\s,]+${number}[\\s,]+${number}\\s*$`);
const pathData = /^[MmLlHhVvCcSsQqTtAaZz0-9+.,\s-]+$/;
const transform = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([-+eE0-9.,\s]+\)\s*)+$/;
const color = /^(?:#[0-9a-fA-F]{3,8}|none|currentColor|transparent|[a-zA-Z]{1,30}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\))$/;

function validAttribute(tag: string, name: string, value: string) {
  if (!value || value.length > 4_000 || /[<>&"']|url\s*\(|javascript:|data:/i.test(value)) return false;
  if (name === "xmlns") return tag === "svg" && value === "http://www.w3.org/2000/svg";
  if (name === "viewbox") return tag === "svg" && viewBox.test(value);
  if (name === "preserveaspectratio") return /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value);
  if (name === "d") return value.length <= 4_000 && pathData.test(value);
  if (name === "points" || name === "stroke-dasharray") return numericList.test(value);
  if (name === "transform") return transform.test(value);
  if (name === "fill" || name === "stroke") return color.test(value);
  if (name === "fill-rule") return value === "nonzero" || value === "evenodd";
  if (name === "stroke-linecap") return ["butt", "round", "square"].includes(value);
  if (name === "stroke-linejoin") return ["arcs", "bevel", "miter", "miter-clip", "round"].includes(value);
  if (name === "id") return /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(value);
  return numeric.test(value);
}

/**
 * Converts a deliberately small, inert SVG subset into canonical markup.
 * The function fails closed: no entities, active elements, CSS, links,
 * external resources, namespaces, filters, or unparsed source survive.
 */
export function sanitizeCutStudioSvg(input: string) {
  const source = input.trim();
  if (!source || source.length > 20_000) throw new Error("SVG source must contain between 1 and 20,000 characters");
  if (/<!|<\?|\]\]>|&/i.test(source)) throw new Error("SVG declarations, entities, and active document features are not allowed");
  const token = /<[^<>]+>/g;
  const output: string[] = [];
  const stack: string[] = [];
  let cursor = 0;
  let rootSeen = false;
  let visualElements = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source)) !== null) {
    if (source.slice(cursor, match.index).trim()) throw new Error("SVG may contain only allowlisted vector elements");
    cursor = match.index + match[0].length;
    const body = match[0].slice(1, -1).trim();
    const closing = body.match(/^\/([A-Za-z][A-Za-z0-9]*)\s*$/);
    if (closing) {
      const name = closing[1].toLowerCase();
      if (!allowedTags.has(name) || stack.pop() !== name) throw new Error("SVG elements must be correctly nested and allowlisted");
      output.push(`</${name}>`);
      continue;
    }
    const opening = body.match(/^([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/)?$/);
    if (!opening) throw new Error("SVG contains malformed markup");
    const name = opening[1].toLowerCase();
    const attributesSource = opening[2];
    const selfClosing = Boolean(opening[3]);
    if (!allowedTags.has(name)) throw new Error(`SVG element ${name} is not allowed`);
    if (!rootSeen) {
      if (name !== "svg") throw new Error("SVG source must begin with an svg root element");
      rootSeen = true;
    } else if (name === "svg") throw new Error("Nested svg documents are not allowed");
    if (!stack.length && name !== "svg") throw new Error("SVG elements must remain inside the root element");
    const attributes: string[] = [];
    const seen = new Set<string>();
    let attributeCursor = 0;
    while (attributeCursor < attributesSource.length) {
      const parsed = attributesSource.slice(attributeCursor).match(/^\s+([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!parsed) throw new Error("SVG attributes must be quoted and allowlisted");
      attributeCursor += parsed[0].length;
      const rawName = parsed[1];
      const attributeName = rawName.toLowerCase();
      const value = (parsed[2] ?? parsed[3]).trim();
      if (seen.has(attributeName) || (!commonAttributes.has(attributeName) && !tagAttributes[name].has(attributeName)) || !validAttribute(name, attributeName, value)) {
        throw new Error(`SVG attribute ${rawName} is not allowed`);
      }
      seen.add(attributeName);
      attributes.push(`${outputNames[attributeName] ?? attributeName}="${value}"`);
    }
    if (name !== "svg" && name !== "g") visualElements += 1;
    output.push(`<${name}${attributes.length ? ` ${attributes.join(" ")}` : ""}${selfClosing ? "/>" : ">"}`);
    if (!selfClosing) stack.push(name);
  }
  if (source.slice(cursor).trim() || !rootSeen || stack.length || visualElements === 0) throw new Error("SVG must be a complete, non-empty allowlisted vector document");
  return output.join("");
}
