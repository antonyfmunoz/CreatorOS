const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function pad(bytes, fill = 0x20) {
  const result = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
  result.fill(fill);
  result.set(bytes);
  return result;
}

export function createTriangleGlb({ uri } = {}) {
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }, { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 }],
    buffers: uri ? [{ byteLength: 44, uri }] : [{ byteLength: 44 }],
  };
  const jsonBytes = pad(new TextEncoder().encode(JSON.stringify(json)));
  const binary = pad(new Uint8Array(44), 0);
  const binaryView = new DataView(binary.buffer);
  [-1, -1, 0, 1, -1, 0, 0, 1, 0].forEach((value, index) => binaryView.setFloat32(index * 4, value, true));
  [0, 1, 2].forEach((value, index) => binaryView.setUint16(36 + index * 2, value, true));
  const total = 12 + 8 + jsonBytes.length + 8 + binary.length;
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true); view.setUint32(16, JSON_CHUNK, true); output.set(jsonBytes, 20);
  const binaryOffset = 20 + jsonBytes.length;
  view.setUint32(binaryOffset, binary.length, true); view.setUint32(binaryOffset + 4, BIN_CHUNK, true); output.set(binary, binaryOffset + 8);
  return output;
}
