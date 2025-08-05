import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Format, scan } from "@tauri-apps/plugin-barcode-scanner";
import { Loader, Plus, VideoIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

function ContactCard({
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
        {/* <Button */}
        {/*   onClick={() => { */}
        {/*     // TODO: implement */}
        {/*   }} */}
        {/* > */}
        {/*   <PhoneCall /> */}
        {/* </Button> */}

        <Button asChild>
          <Link to={`call?nickname=${nickname}&nodeId=${nodeId}`}>
            <VideoIcon />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function Component() {
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogTicket, setAddDialogTicket] = useState<string>("");
  const [addDialogIsLoading, setAddDialogIsLoading] = useState(false);

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

  const sendRequest = useCallback(async (serializedTicket: string) => {
    setAddDialogIsLoading(true);

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
        setAddDialogOpen(false);
        setAddDialogTicket("");

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
      setAddDialogIsLoading(false);
    }
  }, []);

  const onManualEntrySubmitted = useCallback(async () => {
    const trimmedTicket = addDialogTicket.trim();
    if (trimmedTicket.length === 0) return false;
    await sendRequest(trimmedTicket);
  }, [sendRequest, addDialogTicket]);

  const onScanClicked = useCallback(async () => {
    const scanned = await scan({
      cameraDirection: "back",
      formats: [Format.QRCode],
      windowed: false,
    });
    await sendRequest(scanned.content);
  }, [sendRequest]);

  return (
    <div className="size-full">
      <h2 className="w-full flex flex-row justify-between">
        <span>Contacts</span>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus />
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Contact</DialogTitle>
              <DialogDescription>
                Add a new contact by scanning a <b>Contact Ticket</b> or by
                entering one manually.
              </DialogDescription>
            </DialogHeader>

            <Input
              type="text"
              value={addDialogTicket}
              onChange={(e) => setAddDialogTicket(e.target.value)}
              placeholder="Contact Ticket"
              disabled={addDialogIsLoading}
              autoFocus={false}
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={onScanClicked}
                disabled={addDialogIsLoading}
              >
                Scan
              </Button>

              <Button
                onClick={onManualEntrySubmitted}
                disabled={
                  addDialogIsLoading || addDialogTicket.trim().length === 0
                }
              >
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </h2>

      {isLoading ? (
        <Loader className="animate-spin mx-auto" />
      ) : contacts.length === 0 ? (
        <p className="text-muted-foreground text-center">No Contacts Yet</p>
      ) : (
        <div className="size-full flex flex-col gap-4 px-2 justify-start items-center-safe">
          {contacts.map((contact) => (
            <ContactCard key={contact.nodeId} {...contact} />
          ))}
        </div>
      )}
    </div>
  );
}
