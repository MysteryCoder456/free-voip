import { invoke } from "@tauri-apps/api/core";
import { Loader } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";

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

  return (
    <div className="size-full">
      <h2 className="w-full">My Contact Card</h2>

      <div className="size-full flex flex-col justify-center-safe items-center-safe">
        <div className="w-[70%] xs:w-[50%] aspect-square place-content-center">
          {selfTicket ? (
            <div>
              <QRCode
                value={selfTicket.serializedTicket}
                className="p-2 size-full bg-white"
              />
              <p className="mt-4 text-center text-2xl">{selfTicket.nickname}</p>
            </div>
          ) : (
            <Loader className="animate-spin mx-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
