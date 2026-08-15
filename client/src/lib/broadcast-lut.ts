import type { parseCubeLutData } from "@shared/cut-studio";

type CubeLut = ReturnType<typeof parseCubeLutData>;

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = (position + 1.0) * 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragmentSource = `
precision mediump float;
varying vec2 uv;
uniform sampler2D sourceTexture;
uniform sampler2D lutTexture;
uniform float lutSize;
uniform vec3 domainMin;
uniform vec3 domainMax;
uniform vec4 crop;
vec3 lutAt(float r, float g, float b) {
  float x = r + b * lutSize;
  return texture2D(lutTexture, vec2((x + 0.5) / (lutSize * lutSize), (g + 0.5) / lutSize)).rgb;
}
void main() {
  vec2 sourceUv = vec2(mix(crop.x, 1.0 - crop.y, uv.x), mix(crop.w, 1.0 - crop.z, uv.y));
  vec3 inputColor = texture2D(sourceTexture, sourceUv).rgb;
  vec3 scaled = clamp((inputColor - domainMin) / (domainMax - domainMin), 0.0, 1.0) * (lutSize - 1.0);
  vec3 low = floor(scaled); vec3 high = min(low + 1.0, vec3(lutSize - 1.0)); vec3 f = fract(scaled);
  vec3 c000 = lutAt(low.r, low.g, low.b); vec3 c100 = lutAt(high.r, low.g, low.b);
  vec3 c010 = lutAt(low.r, high.g, low.b); vec3 c110 = lutAt(high.r, high.g, low.b);
  vec3 c001 = lutAt(low.r, low.g, high.b); vec3 c101 = lutAt(high.r, low.g, high.b);
  vec3 c011 = lutAt(low.r, high.g, high.b); vec3 c111 = lutAt(high.r, high.g, high.b);
  vec3 lowBlue = mix(mix(c000, c100, f.r), mix(c010, c110, f.r), f.g);
  vec3 highBlue = mix(mix(c001, c101, f.r), mix(c011, c111, f.r), f.g);
  gl_FragColor = vec4(mix(lowBlue, highBlue, f.b), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const value = gl.createShader(type);
  if (!value) throw new Error("WebGL shader allocation failed");
  gl.shaderSource(value, source); gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) ?? "WebGL shader compilation failed");
  return value;
}

export function createBroadcastLutRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const sourceTexture = gl.createTexture(); const lutTexture = gl.createTexture();
  let activeLut: CubeLut | null = null;
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(uniform("sourceTexture"), 0); gl.uniform1i(uniform("lutTexture"), 1);
  return {
    render(source: TexImageSource, lut: CubeLut, width: number, height: number, crop: { left: number; right: number; top: number; bottom: number }) {
      canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height)); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sourceTexture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (activeLut !== lut) {
        const bytes = new Uint8Array(lut.entries.length * 4);
        lut.entries.forEach((entry, index) => { bytes[index * 4] = Math.round(Math.max(0, Math.min(1, entry[0])) * 255); bytes[index * 4 + 1] = Math.round(Math.max(0, Math.min(1, entry[1])) * 255); bytes[index * 4 + 2] = Math.round(Math.max(0, Math.min(1, entry[2])) * 255); bytes[index * 4 + 3] = 255; });
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTexture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.size * lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes); activeLut = lut;
      }
      gl.uniform1f(uniform("lutSize"), lut.size); gl.uniform3fv(uniform("domainMin"), lut.domainMin); gl.uniform3fv(uniform("domainMax"), lut.domainMax); gl.uniform4f(uniform("crop"), crop.left, crop.right, crop.top, crop.bottom);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return canvas;
    },
  };
}
