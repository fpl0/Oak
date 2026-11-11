import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { buttonClass } from "../kit/Button.tsx";
import { EmptyState } from "../kit/basics.tsx";

export function NotFound() {
  return (
    <EmptyState
      icon={<Compass aria-hidden />}
      title="This page isn't part of Oak"
      action={
        <Link to="/" className={buttonClass("primary")}>
          Back to Today
        </Link>
      }
    >
      The address may be from an older version. Everything you made is still here.
    </EmptyState>
  );
}
