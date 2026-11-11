// `/capstone/$id`: the capstone workspace (ux §2.3, contracts §2.4, §6.4–§6.6). The screen is app/src/capstone.
import { createFileRoute } from "@tanstack/react-router";
import { CapstoneScreen } from "../../capstone/CapstoneScreen.tsx";

export const Route = createFileRoute("/capstone/$id")({ component: Capstone });

function Capstone() {
  const { id } = Route.useParams();
  return <CapstoneScreen id={id} />;
}
