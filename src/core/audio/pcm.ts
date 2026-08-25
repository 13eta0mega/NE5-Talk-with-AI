export function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const stride = 0x8000;
  for (let i = 0; i < bytes.length; i += stride) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + stride, bytes.length)));
  }
  return btoa(binary);
}

export function base64ToInt16(value: string): Int16Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export function resamplePcm16(input: Int16Array, fromRate: number, toRate: number): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  const outputLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outputLength; i += 1) {
    const source = i * ratio;
    const left = Math.floor(source);
    const right = Math.min(input.length - 1, left + 1);
    const mix = source - left;
    output[i] = ((input[left] * (1 - mix)) + (input[right] * mix)) / 32768;
  }
  return output;
}
