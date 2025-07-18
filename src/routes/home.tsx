import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function Component() {
  return (
    <div className="flex flex-col gap-4 items-center">
      <h1>Free VoIP</h1>
      <h4>Privacy-first, Peer-2-Peer Video Calling</h4>
      <Button asChild>
        <Link to="/get-started">Get Started</Link>
      </Button>
    </div>
  );
}
