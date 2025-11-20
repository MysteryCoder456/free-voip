/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

const videoDecoder = new VideoDecoder({
  /**
   * @param {VideoFrame} frame
   */
  output(frame) {
    // Send decoded video back to main thread
    postMessage(frame);
  },
  error(error) {
    console.error("Video decoding error:", error);
  },
});
videoDecoder.configure({
  codec: "avc1.42E01E",
});

onmessage = (event) => {
  /** @type {EncodedVideoChunk} */
  const videoChunk = event.data;

  if (videoDecoder.decodeQueueSize < 30) {
    videoDecoder.decode(videoChunk);
  }
};

onclose = (_event) => {
  videoDecoder.close();
};
