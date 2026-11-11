// /studio/$sketchId (ux §2.3): one sketch in the full Workbench. The page lives in app/src/studio.
import { createFileRoute } from "@tanstack/react-router";
import { useSketch } from "../../lib/queries.ts";
import { SketchEditor } from "../../studio/SketchEditor.tsx";
import { Page } from "../../ui/kit/basics.tsx";
import { LoadingState, QueryView } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/studio/$sketchId")({ component: SketchRoute });

function SketchRoute() {
  const { sketchId } = Route.useParams();
  const sketch = useSketch(sketchId);
  return (
    <QueryView
      query={{ ...sketch, refetch: sketch.refetch }}
      loading={
        <Page>
          <LoadingState label="Opening the sketch" />
        </Page>
      }
    >
      {(s) => <SketchEditor key={s.id} sketch={s} />}
    </QueryView>
  );
}
