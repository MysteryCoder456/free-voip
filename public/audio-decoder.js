/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

const audioDecoder = new AudioDecoder({
  /**
   * @param {AudioData} data
   */
  output(data) {
    // Send decoded audio back to main thread
    postMessage(data);
  },
  error(error) {
    console.error("Audio decoding error:", error);
  },
});
audioDecoder.configure({
  codec: "mp4a.40.2",
  sampleRate: 48000,
  numberOfChannels: 1,
});

onmessage = (event) => {
  /** @type {EncodedAudioChunk} */
  const audioChunk = event.data;

  if (audioDecoder.decodeQueueSize < 30) {
    audioDecoder.decode(audioChunk);
  }
};

onclose = (_event) => {
  audioDecoder.close();
};
