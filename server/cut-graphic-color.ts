/**
 * CSS brightness/saturate operate on unpremultiplied sRGB channels, not YUV
 * additive brightness. Expressions here are compiler-generated numeric data;
 * never pass user-authored FFmpeg/filter text to this internal helper.
 */
export function cutGraphicColorFilters(brightness: string, saturation: string): string[] {
  if (!brightness.trim() || !saturation.trim()) throw new Error("Graphic color expressions must not be empty");
  for (const expression of [brightness, saturation]) {
    const value = Number(expression);
    if (Number.isFinite(value) && (value < 0 || value > 8)) throw new Error("Graphic color multipliers must be between zero and eight");
  }
  const constantBrightness = Number(brightness), constantSaturation = Number(saturation);
  if (constantBrightness === 1 && constantSaturation === 1) return ["format=rgba"];
  if (constantSaturation === 1 && Number.isFinite(constantBrightness)) {
    const value = `round(clip(val*${constantBrightness},0,255))`;
    return ["format=rgba", `lutrgb=r='${value}':g='${value}':b='${value}'`];
  }
  if (constantSaturation === 1) {
    const channels = ["r", "g", "b"].map((channel) => `${channel}='round(clip(${channel}(X,Y)*(${brightness}),0,255))'`);
    return ["format=rgba", `geq=${channels.join(":")}:a='alpha(X,Y)'`];
  }
  // Slots 0/1 belong to the authored-curve evaluator; 2..6 are reset for every
  // output channel/pixel. Each filter function clamps before the next function.
  const prepare = `st(2,${brightness});st(3,${saturation});st(4,clip(r(X,Y)*ld(2),0,255));st(5,clip(g(X,Y)*ld(2),0,255));st(6,clip(b(X,Y)*ld(2),0,255));`;
  const matrix = [
    "(0.213+0.787*ld(3))*ld(4)+(0.715-0.715*ld(3))*ld(5)+(0.072-0.072*ld(3))*ld(6)",
    "(0.213-0.213*ld(3))*ld(4)+(0.715+0.285*ld(3))*ld(5)+(0.072-0.072*ld(3))*ld(6)",
    "(0.213-0.213*ld(3))*ld(4)+(0.715-0.715*ld(3))*ld(5)+(0.072+0.928*ld(3))*ld(6)",
  ];
  const channels = ["r", "g", "b"].map((channel, index) => `${channel}='${prepare}round(clip(${matrix[index]},0,255))'`);
  return ["format=rgba", `geq=${channels.join(":")}:a='alpha(X,Y)'`];
}
