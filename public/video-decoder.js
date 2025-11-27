/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

const generator = new VideoTrackGenerator();

var initialized = false;
var receivedFirstKeyFrame = false;

/** @type {VideoDecoder} */
var videoDecoder;

function createVideoDecoder() {
  const vd = new VideoDecoder({
    /**
     * @param {VideoFrame} frame
     */
    output(frame) {
      // Send decoded video back to main thread
      generator.writable.getWriter().write(frame);
      // FIXME: NEW ERROR LET'S FUCKING GO
      console.log("decoder output");
    },
    error(error) {
      console.error(`Video decoding ${error.name} error: ${error.message}`);
    },
  });
  vd.configure({
    codec: "vp8",
    hardwareAcceleration: "prefer-hardware",
    optimizeForLatency: true,
  });

  return vd;
}

onmessage = (event) => {
  if (!initialized) {
    videoDecoder = createVideoDecoder();
    postMessage(generator.track, [generator.track]);
    initialized = true;
    return;
  }

  if (videoDecoder.state === "closed") {
    videoDecoder = createVideoDecoder();
    receivedFirstKeyFrame = false;
  }

  if (videoDecoder.decodeQueueSize >= 30) return;

  /** @type {EncodedVideoChunk} */
  const videoChunk = event.data;

  if (videoChunk.type === "key") receivedFirstKeyFrame = true;
  else if (videoChunk.type === "delta" && !receivedFirstKeyFrame) return;
  videoDecoder.decode(videoChunk);
  console.log("queued for decode");
};

onclose = (_event) => {
  videoDecoder.close();
};
