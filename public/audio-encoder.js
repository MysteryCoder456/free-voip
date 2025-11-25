/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

/** @type {number | undefined} */
var audioSampleRate;

const audioEncoder = new AudioEncoder({
  /**
   * @param {EncodedAudioChunk} chunk
   * @param {any} _metadata
   */
  output(chunk, _metadata) {
    postMessage(chunk);
  },
  error(error) {
    console.error("Audio encoding error:", error);
  },
});

onmessage = (event) => {
  if (event.data instanceof MediaStreamTrack) {
    const audioTrack = event.data;
    audioSampleRate = audioTrack.getSettings().sampleRate || 48000;

    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audioSampleRate,
      numberOfChannels: 1, // audioTrack.getSettings().channelCount || 2,
      opus: {
        application: "voip",
      },
    });

    return;
  }

  if (!audioSampleRate) {
    console.error("audioSampleRate is not set");
    return;
  }

  /** @type {Float32Array} */
  const pcm = event.data;

  const audioData = new AudioData({
    format: "f32",
    sampleRate: audioSampleRate,
    numberOfFrames: pcm.length,
    numberOfChannels: 1,
    timestamp: performance.now(),
    data: pcm.buffer,
  });
  audioEncoder.encode(audioData);
};

onclose = (_event) => {
  audioEncoder.close();
};
