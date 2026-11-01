"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function HeaderMenu({ username }: { username: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="min-h-10 px-3 py-2" style={{ backgroundColor: "transparent" }} />}>
        {username}
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuItem>menu a</DropdownMenuItem>
        <DropdownMenuItem>menu b</DropdownMenuItem>
        <DropdownMenuItem>menu c</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
