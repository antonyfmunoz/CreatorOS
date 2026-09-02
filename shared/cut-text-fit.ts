/** Self-contained DOM measurement, shared by preview and the native raster page. */
export function fitCutTextBox(input: { boxId: string; contentId: string; maximum: string; minimum: string; maxLines: number }) {
  if (![input.maximum, input.minimum].every((value) => /^\d+(?:\.\d+)?(?:px|cqw)$/.test(value)) || !Number.isInteger(input.maxLines) || input.maxLines < 0 || input.maxLines > 20) throw new Error("Invalid text fitting bounds");
  const box = document.getElementById(input.boxId);
  const content = document.getElementById(input.contentId);
  if (!box || !content) throw new Error("Text fitting elements are unavailable");
  content.style.fontSize = input.minimum;
  const minimum = Number.parseFloat(getComputedStyle(content).fontSize);
  content.style.fontSize = input.maximum;
  const maximum = Number.parseFloat(getComputedStyle(content).fontSize);
  if (![minimum, maximum].every((value) => Number.isFinite(value) && value > 0 && value <= 12800) || minimum > maximum) throw new Error("Invalid measured font bounds");
  const boxStyle = getComputedStyle(box);
  const availableHeight = Number.parseFloat(boxStyle.height) - Number.parseFloat(boxStyle.paddingTop) - Number.parseFloat(boxStyle.paddingBottom);
  const availableWidth = Number.parseFloat(boxStyle.width) - Number.parseFloat(boxStyle.paddingLeft) - Number.parseFloat(boxStyle.paddingRight);
  let low = minimum; let high = maximum; let best = minimum; let fit = false;
  for (let iteration = 0; iteration < 16; iteration++) {
    const candidate = iteration === 0 ? maximum : iteration === 1 ? minimum : (low + high) / 2;
    content.style.fontSize = `${candidate}px`;
    const measured = getComputedStyle(content);
    const height = Number.parseFloat(measured.height);
    const lineHeight = Number.parseFloat(measured.lineHeight);
    const fits = availableHeight > 0 && availableWidth > 0 && height <= availableHeight + .05 && content.scrollWidth <= Math.ceil(availableWidth) && (!input.maxLines || height <= lineHeight * input.maxLines + .05);
    if (iteration === 0 && fits) { best = maximum; fit = true; break; }
    if (iteration === 0) continue;
    if (fits) { best = candidate; low = candidate; fit = true; } else high = candidate;
    if (iteration === 1 && !fits) break;
  }
  content.style.fontSize = `${best}px`;
  return { fits: fit, fontSize: best };
}
