const MAX_SAMPLES = 64;

export async function computeWaveform(blob: Blob): Promise<number[]> {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const ctx = new AudioContext();
    const buffer = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    await ctx.close();
    const channel = audio.getChannelData(0);
    if (channel.length === 0) {
      return [];
    }
    const blockSize = Math.max(1, Math.floor(channel.length / MAX_SAMPLES));
    const samples: number[] = [];
    for (let i = 0; i < MAX_SAMPLES; i += 1) {
      const start = i * blockSize;
      let peak = 0;
      for (let j = start; j < start + blockSize && j < channel.length; j += 1) {
        peak = Math.max(peak, Math.abs(channel[j] ?? 0));
      }
      samples.push(Number(peak.toFixed(4)));
    }
    return samples;
  } catch {
    return [];
  }
}
