import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Loader } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SerializedTicketResponse {
  nickname: string;
  serializedTicket: string;
}

export function Component() {
  const [selfTicket, setSelfTicket] = useState<SerializedTicketResponse>();

  const fetchSelfTicket = useCallback(async () => {
    try {
      const selfTicket = await invoke<SerializedTicketResponse>(
        "get_serialized_self_ticket",
      );
      setSelfTicket(selfTicket);
    } catch (error) {
      console.error("Error fetching self ticket:", error);

      if (typeof error === "string") {
        toast.error("Unable to get contact card", { description: error });
      }
    }
  }, []);
  useEffect(() => {
    fetchSelfTicket();
  }, [fetchSelfTicket]);

  const onCopyClicked = useCallback(async () => {
    if (!selfTicket) return;

    try {
      await writeText(selfTicket.serializedTicket);
      toast.success("Contact ticket copied to clipboard");
    } catch (error) {
      console.error("Unable to copy contact ticket to clipboard", error);

      if (typeof error === "string") {
        toast.error("Unable to copy contact ticket to clipboard", {
          description: error,
        });
      }
    }
  }, [selfTicket]);

  return (
    <div className="size-full">
      <h2 className="w-full">My Contact Card</h2>

      <div className="size-full flex flex-col justify-center-safe items-center-safe">
        <div className="w-[70%] xs:w-[50%] aspect-square place-content-center text-center">
          {selfTicket ? (
            <div>
              <QRCode
                value={selfTicket.serializedTicket}
                className="p-2 mb-4 size-full bg-white"
              />

              <p className="text-xl">{selfTicket.nickname}</p>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm truncate">
                  {selfTicket.serializedTicket}
                </span>

                <Button variant="ghost" onClick={onCopyClicked}>
                  <Copy />
                </Button>
              </div>
            </div>
          ) : (
            <Loader className="animate-spin mx-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
