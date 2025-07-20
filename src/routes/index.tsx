import { invoke } from "@tauri-apps/api/core";
import { Loader } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

export function Component() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  const fetchLoggedInState = useCallback(async () => {
    let isLoggedIn: boolean;

    try {
      isLoggedIn = await invoke("restore_login");
    } catch (error) {
      console.error("Unable to restore login state", error);
      isLoggedIn = false;
    }

    setIsLoading(false);
    if (isLoggedIn) navigate("/app");
  }, [navigate]);

  useEffect(() => {
    fetchLoggedInState();
  }, [fetchLoggedInState]);

  if (isLoading) return <Loader className="animate-spin" />;
  return (
    <div className="flex flex-col gap-4 items-center text-center">
      <h1>Free VoIP</h1>
      <h4>Privacy-first, Peer-2-Peer Video Calling</h4>
      <Button asChild>
        <Link to="/get-started">Get Started</Link>
      </Button>
    </div>
  );
}
