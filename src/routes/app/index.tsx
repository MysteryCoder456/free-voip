import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import clsx from "clsx";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, type To, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

interface ContactRequest {
  nickname: string;
  nodeId: string;
}

const showNavigationIn = new Set(["/app/my-card", "/app/contacts-list"]);

function NavLink({
  to,
  icon,
  label,
}: {
  to: To;
  icon: IconName;
  label: string;
}) {
  const location = useLocation();
  const isActive = useMemo(
    () => location.pathname.startsWith(to.toString()),
    [to, location],
  );

  return (
    <NavigationMenuItem>
      <NavigationMenuLink asChild>
        <Link to={to} className="flex flex-col items-center">
          <DynamicIcon
            name={icon}
            className={clsx("size-8", {
              "text-foreground": isActive,
              "text-muted-foreground": !isActive,
            })}
          />
          <p
            className={clsx("text-xs", {
              "text-foreground": isActive,
              "text-muted-foreground": !isActive,
            })}
          >
            {label}
          </p>
        </Link>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}

export function Component() {
  const location = useLocation();
  const navigate = useNavigate();
  const [contactRequest, setContactRequest] = useState<ContactRequest>();
  const [ringRequest, setRingRequest] = useState<ContactRequest>();

  const showNavigation = useMemo(
    () => showNavigationIn.has(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    listen<ContactRequest>("contact-request", (event) => {
      setContactRequest(event.payload);
    });
    listen<ContactRequest>("ring-request", (event) => {
      setRingRequest(event.payload);
    });
  }, []);

  const respondToContactRequest = useCallback(
    async (accept: boolean) => {
      // Acknowledge the request
      try {
        await invoke("respond_to_contact_request", { accept });
      } catch (error) {
        console.error("Unable to respond to contact request", error);

        if (typeof error === "string") {
          toast.error("Unable to respond to contact request", {
            description: error,
          });
        }
        return;
      }

      // Update contacts list
      if (accept) {
        try {
          await invoke("add_contact", { contactTicket: contactRequest });
        } catch (error) {
          console.error("Unable to add contact", error);

          if (typeof error === "string") {
            toast.error("Unable to add contact", {
              description: error,
            });
          }
        }
      }

      setContactRequest(undefined);
    },
    [contactRequest],
  );

  const respondToRingRequest = useCallback(
    async (accept: boolean) => {
      try {
        await invoke("respond_to_ring", { accept });
      } catch (error) {
        console.error("Unable to respond to ring", error);

        if (typeof error === "string") {
          toast.error("Unable to respond to ring", {
            description: error,
          });
        }
        return;
      }

      if (accept) {
        navigate(
          `/app/contacts-list/call?nickname=${ringRequest?.nickname}&nodeId=${ringRequest?.nodeId}&acceptingCall`,
        );
      }

      setRingRequest(undefined);
    },
    [navigate, ringRequest],
  );

  return (
    <>
      <div className="size-full flex flex-col gap-6">
        <div className="grow flex justify-center-safe items-center-safe">
          <Outlet />
        </div>

        {showNavigation && (
          <NavigationMenu
            viewport={false}
            className="max-w-full max-h-max sticky bottom-3 backdrop-blur-sm rounded-xl border-secondary border-1"
          >
            <NavigationMenuList className="gap-4 my-2">
              <NavLink to="/app/my-card" icon="qr-code" label="My Card" />
              <NavLink
                to="/app/contacts-list"
                icon="contact"
                label="Contacts"
              />
            </NavigationMenuList>
          </NavigationMenu>
        )}
      </div>

      <Dialog
        open={contactRequest && !ringRequest}
        onOpenChange={(open) => {
          if (!open) {
            respondToContactRequest(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Contact Request</DialogTitle>
            <DialogDescription>
              <b>{contactRequest?.nickname}</b> wants to add you as a contact.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => respondToContactRequest(false)}
            >
              Decline
            </Button>
            <Button onClick={() => respondToContactRequest(true)}>
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!ringRequest}
        onOpenChange={(open) => {
          if (!open) {
            respondToRingRequest(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ringRequest?.nickname}</DialogTitle>
            <DialogDescription>
              Incoming call from <b>{ringRequest?.nickname}</b>.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => respondToRingRequest(false)}
            >
              Decline
            </Button>
            <Button onClick={() => respondToRingRequest(true)}>Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
