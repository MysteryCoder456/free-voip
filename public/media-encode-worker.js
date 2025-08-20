/** biome-ignore-all lint/suspicious/noGlobalAssign: This is fine in a web worker */
/// <reference lib="webworker" />

onmessage = (event) => {
  /** @type {MediaStreamTrack[]} */
  const [videoTrack, audioTrack] = event.data;

  const videoProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
  const videoReader = videoProcessor.readable.getReader();

  const videoEncoder = new VideoEncoder({
    /**
     * @param {EncodedVideoChunk} chunk
     * @param {any} _metadata
     */
    output(chunk, _metadata) {
      // Send encoded video back to main thread
      postMessage({ dataType: "video", encodedData: chunk });
    },
    error(error) {
      console.error("Video encoding error:", error);
    },
  });
  videoEncoder.configure({
    codec: "avc1.42E01E",
    width: videoTrack.getSettings().width,
    height: videoTrack.getSettings().height,
    hardwareAcceleration: "prefer-hardware",
    latencyMode: "realtime",
    framerate: 60,
  });

  const audioProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
  const audioReader = audioProcessor.readable.getReader();
  const audioEncoder = new AudioEncoder({
    output(chunk, metadata) {
      // TODO
    },
    error(error) {
      console.error("Audio encoding error:", error);
    },
  });
  audioEncoder.configure({
    codec: "mp4a.40.2",
    sampleRate: audioTrack.getSettings().sampleRate || 48000,
    numberOfChannels: audioTrack.getSettings().channelCount || 2,
    opus: {
      application: "voip",
    },
  });

  async function pumpVideo() {
    while (true) {
      try {
        const { value, done } = await videoReader.read();
        videoEncoder.encode(value);
        value.close();
        if (done) break;
      } catch (error) {
        console.error("Error reading video track:", error);
        break;
      }
    }
  }

  async function pumpAudio() {
    while (true) {
      try {
        const { value, done } = await audioReader.read();
        audioEncoder.encode(value);
        value.close();
        if (done) break;
      } catch (error) {
        console.error("Error reading audio track:", error);
        break;
      }
    }
  }

  pumpVideo();
  pumpAudio();
};
