/** The expression and labels are generated internally, never user filter code. */
export function cutGraphicOpacityFilters(input: string, output: string, expression: string, options: { frameUniform?: boolean } = {}): string[] {
  if (![input, output].every((label) => /^[A-Za-z][A-Za-z0-9]*$/.test(label))) throw new Error("Invalid graphic filter label");
  if (!expression.trim()) throw new Error("Graphic opacity expression cannot be empty");
  const constant = Number(expression);
  if (expression.trim() && Number.isFinite(constant)) {
    if (constant < 0 || constant > 1) throw new Error("Graphic opacity must be between zero and one");
    // A lookup table retains geq's truncation instead of the rounding used by
    // colorchannelmixer, while evaluating only 256 alpha values once.
    return [`[${input}]format=rgba${constant === 1 ? "" : `,lutrgb=a='val*${constant}'`}[${output}]`];
  }
  // The envelope is constant across a frame. Evaluating it independently for
  // every RGB channel needlessly copies/recomputes three unaffected planes.
  // Opt in only for compiler-proven time curves, never pixel-dependent code.
  // geq keeps independent state per slice; each caches once per frame, not once
  // globally. Slots 0/1 remain available to the authored-curve evaluator.
  const prepare = options.frameUniform ? `if(eq(ld(7),N+1),0,st(2,${expression});st(7,N+1));` : "";
  const multiplier = options.frameUniform ? "ld(2)" : `(${expression})`;
  return [
    `[${input}]format=rgba,split[${output}color][${output}alpha]`,
    `[${output}alpha]alphaextract,geq=lum='${prepare}lum(X,Y)*${multiplier}'[${output}opacity]`,
    `[${output}color][${output}opacity]alphamerge[${output}]`,
  ];
}
