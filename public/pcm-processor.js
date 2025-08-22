class PCMProcessor extends AudioWorkletProcessor {
  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} _outputs
   * @param {Record<string, Float32Array>} _parameters
   */
  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input?.[0]) {
      const channelData = input[0].slice();
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
