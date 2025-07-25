import clsx from "clsx";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { useMemo } from "react";
import { Link, Outlet, type To, useLocation } from "react-router";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

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
  return (
    <div className="size-full flex flex-col">
      <div className="grow flex justify-center-safe items-center-safe mb-6">
        <Outlet />
      </div>

      <NavigationMenu
        viewport={false}
        className="max-w-full max-h-max sticky bottom-3 backdrop-blur-sm rounded-xl border-secondary border-1"
      >
        <NavigationMenuList className="gap-4 my-2">
          <NavLink to="/app/my-card" icon="qr-code" label="My Card" />
          <NavLink to="/app/contacts-list" icon="contact" label="Contacts" />
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}
