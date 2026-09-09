const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;
const MAX_PRIVATE_GLB_BYTES = 20 * 1024 * 1024;

function decodeBase64(value) {
  if (typeof globalThis.atob !== 'function') throw new Error('The isolated renderer cannot decode private GLB data.');
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function rejectExternalUris(value, depth = 0) {
  if (depth > 128) throw new Error('Private GLB metadata exceeds the safe nesting limit.');
  if (Array.isArray(value)) {
    for (const item of value) rejectExternalUris(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    // GLB assets may use bufferViews for geometry and images, but they may not
    // reference an external or host-controlled resource through a URI.
    if (key === 'uri') throw new Error('Private GLB files may not reference external resources.');
    rejectExternalUris(item, depth + 1);
  }
}

/**
 * Decodes only a capsule-bundled binary glTF asset. It proves the source is a
 * self-contained GLB before GLTFLoader sees it, so loader-relative URLs cannot
 * turn into network or filesystem requests inside the isolated renderer.
 */
export function decodePrivateGlb(source) {
  if (typeof source !== 'string' || !/^data:application\/octet-stream;base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) throw new Error('usePrivateGLTF requires a binary GLB imported from this private capsule.');
  const bytes = decodeBase64(source.slice(source.indexOf(',') + 1));
  if (bytes.byteLength < 20 || bytes.byteLength > MAX_PRIVATE_GLB_BYTES) throw new Error('Private GLB bytes exceed the supported limit.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error('Private GLB header is invalid.');

  let offset = 12;
  let json = null;
  let binaryChunks = 0;
  let chunkIndex = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('Private GLB chunk header is truncated.');
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (!length || length % 4 || offset + length > bytes.byteLength) throw new Error('Private GLB chunk bounds are invalid.');
    if (chunkIndex === 0 && type !== GLB_JSON_CHUNK) throw new Error('Private GLB must begin with a JSON chunk.');
    if (type === GLB_JSON_CHUNK) {
      if (json !== null) throw new Error('Private GLB must contain one JSON chunk.');
      try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + length)).trim()); } catch { throw new Error('Private GLB JSON is invalid.'); }
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Private GLB JSON root is invalid.');
    } else if (type === GLB_BINARY_CHUNK) {
      binaryChunks += 1;
      if (binaryChunks > 1) throw new Error('Private GLB must contain at most one binary chunk.');
    } else {
      throw new Error('Private GLB contains an unsupported chunk.');
    }
    offset += length;
    chunkIndex += 1;
  }
  if (offset !== bytes.byteLength || json === null) throw new Error('Private GLB is incomplete.');
  rejectExternalUris(json);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
