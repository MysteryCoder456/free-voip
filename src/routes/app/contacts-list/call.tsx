/** biome-ignore-all lint/a11y/useMediaCaption: Not applicable for a video call */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Mic,
  MicOff,
  Phone,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Draggable from "react-draggable";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

enum CallState {
  Calling = "Calling",
  Ringing = "Ringing",
  InCall = "In Call",
}

var videoEncodeWorker: Worker | undefined;
var audioEncodeWorker: Worker | undefined;

async function setupEncodePipeline(
  videoTrack: MediaStreamTrack,
  audioTrack: MediaStreamTrack,
) {
  videoEncodeWorker = new Worker("/video-encoder.js");
  videoEncodeWorker.onmessage = (event) => {
    const videoChunk = event.data as EncodedVideoChunk;

    const dataBuffer = new ArrayBuffer(videoChunk.byteLength);
    videoChunk.copyTo(dataBuffer);

    const media = {
      video: {
        type: videoChunk.type,
        timestamp: videoChunk.timestamp,
        duration: videoChunk.duration,
        byteLength: videoChunk.byteLength,
        frameData: dataBuffer,
      },
    };
    invoke("send_call_media", { media });
  };
  videoEncodeWorker.onerror = console.error;

  audioEncodeWorker = new Worker("/audio-encoder.js");
  audioEncodeWorker.onmessage = (event) => {
    const audioChunk = event.data;

    const dataBuffer = new ArrayBuffer(audioChunk.byteLength);
    audioChunk.copyTo(dataBuffer);

    const media = {
      audio: {
        type: audioChunk.type,
        timestamp: audioChunk.timestamp,
        duration: audioChunk.duration,
        byteLength: audioChunk.byteLength,
        frameData: dataBuffer,
      },
    };
    invoke("send_call_media", { media });
  };
  audioEncodeWorker.onerror = console.error;

  const audioCtx = new AudioContext();
  await audioCtx.audioWorklet.addModule("/pcm-processor.js");

  // Create PCM processor node and hook into output
  // This should ideally only output silence
  const pcmNode = new AudioWorkletNode(audioCtx, "pcm-processor");
  pcmNode.port.onmessage = (event) => {
    const pcm = event.data as Float32Array;
    audioEncodeWorker?.postMessage(pcm);
  };
  pcmNode.connect(audioCtx.destination);

  // Create audio input node and hook into PCM processor
  const source = audioCtx.createMediaStreamSource(
    new MediaStream([audioTrack]),
  );
  source.connect(pcmNode);

  // Kick off workers
  videoEncodeWorker.postMessage(videoTrack);
  audioEncodeWorker.postMessage(audioTrack);
}

function getMediaStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
    },
    audio: {
      echoCancellation: true,
    },
  });
}

export function Component() {
  const [searchParams, _] = useSearchParams();
  const navigate = useNavigate();

  const selfVideoRef = useRef<HTMLVideoElement>(null);
  const peerVideoRef = useRef<HTMLVideoElement>(null);

  const [callState, setCallState] = useState<CallState>(CallState.Calling);
  const [isSelfVideoOn, setIsSelfVideoOn] = useState<boolean>(true);
  const [isSelfAudioOn, setIsSelfAudioOn] = useState<boolean>(true);

  const supportsCameraSwitching = useMemo(
    () => navigator.mediaDevices.getSupportedConstraints().facingMode === true,
    [],
  );

  const contact: { nickname: string; nodeId: string } = useMemo(() => {
    const nickname = searchParams.get("nickname");
    const nodeId = searchParams.get("nodeId");

    if (!nickname || !nodeId) {
      navigate(-1);
      console.error("Couldn't find contact information in search parameters!");
      return { nickname: "", nodeId: "" };
    }

    return { nickname, nodeId };
  }, [searchParams, navigate]);

  const cleanUpMediaStream = useCallback((mediaElement: HTMLMediaElement) => {
    mediaElement.pause();
    const stream = mediaElement.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => {
      t.stop();
    });
    mediaElement.srcObject = null;
  }, []);

  const flipCamera = useCallback(async () => {
    if (!supportsCameraSwitching) return;

    const stream = selfVideoRef.current?.srcObject as MediaStream;
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack) return;

    const currentFacingMode = videoTrack.getConstraints().facingMode;
    const newFacingMode = currentFacingMode === "user" ? "environment" : "user";
    await videoTrack.applyConstraints({
      facingMode: newFacingMode,
    });
    console.debug("🤳 Flipped camera!");
  }, [supportsCameraSwitching]);

  const hangUp = useCallback(() => {
    // TODO: close connection with peer

    if (selfVideoRef.current) cleanUpMediaStream(selfVideoRef.current);
    if (peerVideoRef.current) cleanUpMediaStream(peerVideoRef.current);

    // Leave call page
    navigate(-1);
  }, [cleanUpMediaStream, navigate]);

  const toggleSelfVideo = useCallback(() => {
    setIsSelfVideoOn((prevValue) => {
      if (!selfVideoRef.current) return prevValue;
      const newValue = !prevValue;

      const stream = selfVideoRef.current.srcObject as MediaStream;
      const [videoTrack] = stream.getVideoTracks();
      videoTrack.enabled = newValue;

      return newValue;
    });
  }, []);

  const toggleSelfAudio = useCallback(() => {
    setIsSelfAudioOn((prevValue) => {
      if (!selfVideoRef.current) return prevValue;
      const newValue = !prevValue;

      const stream = selfVideoRef.current.srcObject as MediaStream;
      const [audioTrack] = stream.getAudioTracks();
      audioTrack.enabled = newValue;

      return newValue;
    });
  }, []);

  const startCall = useCallback(async () => {
    if (!selfVideoRef.current) return;

    // Create and listen to media stream
    const stream = await getMediaStream();
    selfVideoRef.current.srcObject = stream;
    await selfVideoRef.current.play();

    if (!searchParams.has("acceptingCall")) {
      // Ring peer

      setCallState(CallState.Ringing);
      try {
        const response = await invoke<boolean>("ring_contact", {
          nodeAddr: contact.nodeId,
        });

        if (!response) {
          toast.warning(`${contact.nickname} didn't pick up the call`);
          hangUp();
          return;
        }
      } catch (error) {
        console.error("Unable to send ring", error);

        if (typeof error === "string") {
          toast.error("Unable to send ring", {
            description: error,
          });
        }
        return;
      }
    }
    setCallState(CallState.InCall);

    // Listen for incoming media
    listen("incoming_call_media", (_event) => {
      // TODO: handle incoming media stream
    });

    // Transmit self media to peer
    const [videoTrack] = stream.getVideoTracks();
    const [audioTrack] = stream.getAudioTracks();
    await setupEncodePipeline(videoTrack, audioTrack);
  }, [contact, hangUp, searchParams]);

  useEffect(() => {
    startCall();

    // Clean up media streams when the component unmounts
    return () => {
      if (selfVideoRef.current) cleanUpMediaStream(selfVideoRef.current);
      if (peerVideoRef.current) cleanUpMediaStream(peerVideoRef.current);

      videoEncodeWorker?.terminate();
      videoEncodeWorker = undefined;

      audioEncodeWorker?.terminate();
      audioEncodeWorker = undefined;
    };
  }, [startCall, cleanUpMediaStream]);

  return (
    <>
      <Draggable nodeRef={selfVideoRef} bounds="body">
        <video
          className="w-auto h-36 bg-secondary rounded-xl shadow-xl absolute right-4 top-4 z-10"
          ref={selfVideoRef}
          muted
        />
      </Draggable>

      <div className="size-full flex flex-col gap-4">
        <div className="grow flex relative bg-secondary rounded-xl">
          <video ref={peerVideoRef} muted />

          {/* TODO: Hide this if peer's camera is on */}
          <div className="absolute top-[50%] left-[50%] -translate-[50%] flex flex-col text-center">
            <span className="text-xl font-medium">{contact.nickname}</span>
            {callState !== CallState.InCall && (
              <span className="text-muted-foreground">{callState}</span>
            )}
          </div>
        </div>

        <div className="backdrop-blur-sm rounded-xl border-secondary border-1 z-20 flex flex-row justify-center items-center gap-4 p-2">
          {/* Left Group */}
          <div className="flex flex-1 flex-row justify-end gap-2">
            <Button variant="ghost" onClick={toggleSelfAudio}>
              {isSelfAudioOn ? <MicOff /> : <Mic />}
            </Button>
          </div>

          {/* Hang Up Button */}
          <Button variant="destructive" className="flex-none" onClick={hangUp}>
            <Phone className="m-2" />
          </Button>

          {/* Right Group */}
          <div className="flex flex-1 flex-row justify-start gap-2">
            <Button variant="ghost" onClick={toggleSelfVideo}>
              {isSelfVideoOn ? <VideoOff /> : <Video />}
            </Button>
            <Button
              variant="ghost"
              onClick={flipCamera}
              disabled={!supportsCameraSwitching}
            >
              <SwitchCamera />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
