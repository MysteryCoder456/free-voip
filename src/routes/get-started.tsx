import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const formSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(3, {
      error: (p) => `This must be at least ${p.minimum} characters long`,
    })
    .max(20, {
      error: (p) => `This must be at most ${p.maximum} characters long`,
    }),
});

type FormData = z.infer<typeof formSchema>;

export function Component() {
  const navigate = useNavigate();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nickname: "",
    },
  });

  async function onSubmit(values: FormData) {
    try {
      await invoke("login", values);
      navigate("/app");
    } catch (error) {
      console.error("Unable to login", error);

      if (typeof error === "string") {
        toast.error(`Unable to login`, { description: error });
      }
    }
  }

  return (
    <div className="flex flex-col size-full justify-center items-center">
      <h2 className="w-full">Get Started</h2>

      <div className="grow w-full grid grid-cols-6">
        <Form {...form}>
          <form
            className="w-full col-span-full sm:col-span-4 sm:col-start-2 flex flex-col items-center"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="w-full grow">
              <FormField
                control={form.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nickname</FormLabel>
                    <FormControl>
                      <Input placeholder="My name is..." {...field} />
                    </FormControl>
                    <FormDescription>
                      This is how your friends will recognize you.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit">Continue</Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
