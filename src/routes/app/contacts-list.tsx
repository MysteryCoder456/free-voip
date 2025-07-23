import { Loader, PhoneCall, Plus, VideoIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

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
        <Button
          onClick={() => {
            // TODO: implement
          }}
        >
          <PhoneCall />
        </Button>
        <Button
          onClick={() => {
            // TODO: implement
          }}
        >
          <VideoIcon />
        </Button>
      </div>
    </div>
  );
}

export function Component() {
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);

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
    fetchContacts();
  }, [fetchContacts]);

  const addContactClicked = useCallback(() => {
    // TODO: implement
  }, []);

  return (
    <div className="size-full">
      <h2 className="w-full flex flex-row justify-between">
        <span>Contacts</span>
        <Button variant="outline" onClick={addContactClicked}>
          <Plus />
        </Button>
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
