/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

const generator = new VideoTrackGenerator();

/** @type {WritableStreamDefaultWriter} */
var generatorWriter;

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
      generatorWriter.write(frame);
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
    generatorWriter = generator.writable.getWriter();
    postMessage(generator.track, [generator.track]);
    videoDecoder = createVideoDecoder();

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
};

onclose = (_event) => {
  generatorWriter.ready.then(() => generatorWriter.close());
  videoDecoder.close();
};
