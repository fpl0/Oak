// Checkpoint (focus mode, contracts §7.6, §11.9). The route parameter is the checkpoint ID without `.CP` for core
// checkpoints (`U07`) and the full ID for track checkpoints (`J.CP1`). The player lives in app/src/lesson/checkpoint.
import { createFileRoute } from "@tanstack/react-router";
import { CheckpointPlayer } from "../../lesson/checkpoint/CheckpointPlayer.tsx";

export const Route = createFileRoute("/checkpoint/$unitId")({ component: CheckpointRoute });

function CheckpointRoute() {
  const { unitId } = Route.useParams();
  return <CheckpointPlayer unitId={unitId} />;
}
