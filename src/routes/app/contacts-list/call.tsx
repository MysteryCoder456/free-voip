/** biome-ignore-all lint/a11y/useMediaCaption: Not applicable for a video call */
import { SwitchCamera } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [currentStream, setCurrentStream] = useState<MediaStream>();

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Need to run when refs are set
  const startCall = useCallback(async () => {
    // Make sure refs are set
    if (!videoRef.current || !audioRef.current) return;

    // Create and listen to media stream
    const stream = await getMediaStream();
    setCurrentStream(stream);
    videoRef.current.srcObject = stream;

    // TODO: connect to peer
  }, [videoRef, audioRef]);

  useEffect(() => {
    startCall();
  }, [startCall]);

  return (
    <>
      <video className="size-full absolute top-0 left-0" ref={videoRef} />
      <audio className="absolute opacity-0" ref={audioRef} />

      <div className="size-full">
        <h2 className="w-full flex flex-row justify-between">
          <span>Calling {contact.nickname}</span>

          <div className="flex flex-row">
            <Button variant="ghost">
              <SwitchCamera className="size-8" />
            </Button>
          </div>
        </h2>
      </div>
    </>
  );
}
