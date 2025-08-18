import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Loader, Plus, VideoIcon } from "lucide-react";
import QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Contact {
  nickname: string;
  nodeId: string;
}

function ContactItem({
  nickname,
  nodeId,
}: {
  nickname: string;
  nodeId: string;
}) {
  return (
    <div className="flex flex-row w-full justify-between items-center">
      <div className="flex flex-col max-w-9/12 grow justify-center">
        <span>{nickname}</span>
        <span className="text-muted-foreground truncate">{nodeId}</span>
      </div>

      <div className="flex flex-row gap-2">
        <Button asChild>
          <Link to={`call?nickname=${nickname}&nodeId=${nodeId}`}>
            <VideoIcon />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function AddContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [ticket, setTicket] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [qrScanner, setQrScanner] = useState<QrScanner>();

  // Stop scanning for QR codes when component unmounts
  useEffect(() => {
    if (!open) {
      qrScanner?.destroy();
      setQrScanner(undefined);
    }
  }, [open, qrScanner]);

  // Start/stop QR scanner based on loading status
  // }, [isLoading, qrScanner?.stop, qrScanner?.start]);
  useEffect(() => {
    if (isLoading) {
      qrScanner?.stop();
    } else {
      qrScanner?.start();
    }
  }, [isLoading, qrScanner]);

  const sendRequest = useCallback(
    async (serializedTicket: string) => {
      setIsLoading(true);

      try {
        const [contact, accepted] = await invoke<[Contact, boolean]>(
          "send_contact_request",
          {
            serializedTicket,
          },
        );

        if (accepted) {
          // Accepted
          toast.success(`${contact.nickname} accepted your contact request`);
          onOpenChange(false);
          setTicket("");

          // Update contacts list
          try {
            await invoke("add_contact", { contactTicket: contact });
          } catch (error) {
            console.error("Unable to add contact", error);

            if (typeof error === "string") {
              toast.error("Unable to add contact", {
                description: error,
              });
            }
          }
        } else {
          // Rejected
          toast.warning(`${contact.nickname} rejected your contact request`);
        }
      } catch (error) {
        console.error("Unable to send contact request", error);

        if (typeof error === "string") {
          toast.error("Unable to send contact request", {
            description: error,
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [onOpenChange],
  );

  const onManualEntrySubmitted = useCallback(async () => {
    const trimmedTicket = ticket.trim();
    if (trimmedTicket.length === 0) return false;
    await sendRequest(trimmedTicket);
  }, [sendRequest, ticket]);

  const onScanClicked = useCallback(() => {
    if (!videoRef.current) return;

    const qrScanner = new QrScanner(
      videoRef.current,
      (result) => {
        qrScanner.stop();
        sendRequest(result.data);
      },
      {
        preferredCamera: "environment",
        highlightCodeOutline: true,
      },
    );

    qrScanner.start();
    setQrScanner(qrScanner);
  }, [sendRequest]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Add a new contact by scanning a <b>Contact Ticket</b> or by entering
            one manually.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="text"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          placeholder="Contact Ticket"
          disabled={isLoading}
          autoFocus={false}
        />

        {isLoading && (
          <div className="flex flex-row text-muted-foreground mx-auto gap-2 text-sm items-center">
            <Loader className="animate-spin size-5" />
            <span>Waiting for response...</span>
          </div>
        )}

        {/** biome-ignore lint/a11y/useMediaCaption: Renderer for QR scanner */}
        <video
          ref={videoRef}
          className={qrScanner ? "size-auto" : "size-0"}
        ></video>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onScanClicked}
            disabled={isLoading}
          >
            Scan
          </Button>

          <Button
            onClick={onManualEntrySubmitted}
            disabled={isLoading || ticket.trim().length === 0}
          >
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Component() {
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const contacts = await invoke<Contact[]>("get_contacts");
      setContacts(contacts);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching contacts:", error);

      if (typeof error === "string") {
        toast.error("Unable to fetch contacts", { description: error });
      }
    }
  }, []);
  useEffect(() => {
    // Fetch contacts and listen for changes
    fetchContacts();
    listen<Contact[]>("contacts-updated", (event) => {
      setContacts(event.payload);
    });
  }, [fetchContacts]);

  return (
    <div className="size-full">
      <h2 className="w-full flex flex-row justify-between">
        <span>Contacts</span>

        <AddContactDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
        />
      </h2>

      {isLoading ? (
        <Loader className="animate-spin mx-auto" />
      ) : contacts.length === 0 ? (
        <p className="text-muted-foreground text-center">No Contacts Yet</p>
      ) : (
        <div className="size-full flex flex-col gap-4 px-2 justify-start items-center-safe">
          {contacts.map((contact) => (
            <ContactItem key={contact.nodeId} {...contact} />
          ))}
        </div>
      )}
    </div>
  );
}
