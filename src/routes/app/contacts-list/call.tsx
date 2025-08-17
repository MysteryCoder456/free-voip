/** biome-ignore-all lint/a11y/useMediaCaption: Not applicable for a video call */
import { SwitchCamera } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Draggable from "react-draggable";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";

function getMediaStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
}

export function Component() {
  const [searchParams, _] = useSearchParams();
  const navigate = useNavigate();

  const selfVideoRef = useRef<HTMLVideoElement>(null);
  const otherVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [_currentStream, setCurrentStream] = useState<MediaStream>();

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

  const startCall = useCallback(async () => {
    // Make sure refs are set
    if (!selfVideoRef.current || !audioRef.current) return;

    // Create and listen to media stream
    const stream = await getMediaStream();
    setCurrentStream(stream);
    selfVideoRef.current.srcObject = stream;
    selfVideoRef.current.play();

    // TODO: connect to peer
  }, []);

  useEffect(() => {
    startCall();
  }, [startCall]);

  return (
    <>
      <Draggable nodeRef={selfVideoRef} bounds="body">
        <video
          className="w-auto h-36 bg-secondary rounded-xl absolute right-4 bottom-4 z-10"
          ref={selfVideoRef}
          muted
        />
      </Draggable>

      <div className="size-full flex flex-col gap-4">
        <video
          className="grow flex relative bg-secondary rounded-xl"
          ref={otherVideoRef}
          muted
        />
        <audio className="absolute opacity-0" ref={audioRef} />

        <div className="backdrop-blur-sm rounded-xl border-secondary border-1">
          <div className="flex flex-row justify-center p-2">
            <Button variant="ghost">
              <SwitchCamera />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
