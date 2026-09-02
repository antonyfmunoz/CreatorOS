/** Same declarative defaults in the composition preview and native export. */
export function cutColorMatrixControls(parameters: Record<string, unknown>) {
  const control = (name: string) => {
    const value = parameters[name] ?? parameters.amount ?? parameters.intensity;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 1;
  };
  return { contrast: control("contrast"), brightness: control("brightness"), saturation: control("saturation") };
}
