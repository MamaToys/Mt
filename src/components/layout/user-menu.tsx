"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Moon, Sun, Monitor, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function UserMenu({ email }: { email: string }) {
  const { setTheme } = useTheme();
  const router = useRouter();
  const item = "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5" aria-label="User menu">
        <User className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-md border border-border bg-card p-1 shadow-lg">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={item} onSelect={() => setTheme("light")}><Sun className="size-4" />Light</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => setTheme("dark")}><Moon className="size-4" />Dark</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => setTheme("system")}><Monitor className="size-4" />System</DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={item}
            onSelect={async () => {
              await authClient.signOut();
              router.replace("/login");
            }}
          >
            <LogOut className="size-4" />Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
