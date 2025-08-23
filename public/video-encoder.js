/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

const videoEncoder = new VideoEncoder({
  /**
   * @param {EncodedVideoChunk} chunk
   * @param {any} _metadata
   */
  output(chunk, _metadata) {
    // Send encoded video back to main thread
    postMessage({ encodedData: chunk });
  },
  error(error) {
    console.error("Video encoding error:", error);
  },
});

onmessage = (event) => {
  /** @type {MediaStreamTrack} */
  const videoTrack = event.data;

  videoEncoder.configure({
    codec: "avc1.42E01E",
    width: videoTrack.getSettings().width,
    height: videoTrack.getSettings().height,
    hardwareAcceleration: "prefer-hardware",
    latencyMode: "realtime",
    framerate: 60,
  });

  const videoProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
  /** @type {ReadableStreamDefaultReader<VideoFrame>} */
  const videoReader = videoProcessor.readable.getReader();

  async function pumpVideo() {
    const keyFrameInterval = 60; // frames
    var frameCount = 0;

    while (true) {
      try {
        const { value, done } = await videoReader.read();

        videoEncoder.encode(value, {
          keyFrame: frameCount % keyFrameInterval === 0,
        });
        frameCount = (frameCount + 1) % keyFrameInterval;

        value.close();
        if (done) break;
      } catch (error) {
        console.error("Error reading video track:", error);
        break;
      }
    }
  }
  pumpVideo();
};

onclose = (_event) => {
  videoEncoder.close();
};
