/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

const generator = new VideoTrackGenerator();

const videoDecoder = new VideoDecoder({
  /**
   * @param {VideoFrame} frame
   */
  output(frame) {
    // Send decoded video back to main thread
    generator.writable.write(frame);
  },
  error(error) {
    console.error("Video decoding error:", error);
  },
});
videoDecoder.configure({
  codec: "avc1.42E01E",
});

var initialized = false;

onmessage = (event) => {
  if (!initialized) {
    postMessage(generator.track, [generator.track]);
    initialized = true;
    return;
  }

  /** @type {EncodedVideoChunk} */
  const videoChunk = event.data;

  if (videoDecoder.decodeQueueSize < 30) {
    videoDecoder.decode(videoChunk);
  }
};

onclose = (_event) => {
  videoDecoder.close();
};
