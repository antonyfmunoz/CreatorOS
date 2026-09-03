import path from "node:path";

function safeSourceExtension(filename?: string | null) {
  const extension = path.extname(filename ?? "").toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

export function cutRenderWorkspacePaths(tempDirectory: string, projectName: string, sourceFilename?: string | null, format: "mp4" | "webm" = "mp4") {
  if (format !== "mp4" && format !== "webm") throw new Error("Unsupported render output format");
  const outputName = `${projectName.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "cut"}.${format}`;
  return {
    outputName,
    sourcePath: path.join(tempDirectory, `input-source${safeSourceExtension(sourceFilename)}`),
    outputPath: path.join(tempDirectory, `render-output.${format}`),
  };
}

export function cutJobErrorDetail(error: unknown, maxLength = 240) {
  if (!(error instanceof Error)) return "Processing failed";
  const message = error.message.trim();
  if (message.length <= maxLength) return message;
  const separator = " ... ";
  const leadingLength = Math.min(48, Math.max(0, maxLength - separator.length));
  const trailingLength = Math.max(0, maxLength - leadingLength - separator.length);
  return `${message.slice(0, leadingLength)}${separator}${message.slice(-trailingLength)}`;
}
