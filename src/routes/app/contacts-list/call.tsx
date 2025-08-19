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
    stream?.getTracks().forEach((t) => t.stop());
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
    // TODO: implement in netcode
    setIsSelfVideoOn((prev) => !prev);
  }, []);

  const toggleSelfAudio = useCallback(() => {
    // TODO: implement in netcode
    setIsSelfAudioOn((prev) => !prev);
  }, []);

  const startCall = useCallback(async () => {
    // Create and listen to media stream
    if (selfVideoRef.current) {
      const stream = await getMediaStream();
      selfVideoRef.current.srcObject = stream;
      await selfVideoRef.current.play();
    }

    // Ring peer
    const response = await invoke<boolean>("ring_contact", {
      nodeAddr: contact.nodeId,
    });

    if (response) {
      listen("call_media", (event) => {
        // TODO: handle incoming media stream
      });
    } else {
      toast.warning(`${contact.nickname} didn't pick up the call`);
      hangUp();
    }
  }, [contact, hangUp]);

  useEffect(() => {
    startCall();

    // Clean up media streams when the component unmounts
    return () => {
      if (selfVideoRef.current) cleanUpMediaStream(selfVideoRef.current);
      if (peerVideoRef.current) cleanUpMediaStream(peerVideoRef.current);
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
        <video
          className="grow flex relative bg-secondary rounded-xl"
          ref={peerVideoRef}
          muted
        />

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
