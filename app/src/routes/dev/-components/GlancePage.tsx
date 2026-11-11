// The mini Oak (`OakGlance` from app/src/map) at 240 px (1440 wide) and 180 px (1280 wide), inside cards the
// way the Today page shows it.
import { usePageTitle } from "../../../lib/nav.ts";
import { OakGlance } from "../../../map/index.ts";
import { LeafIcon } from "../../../ui/icons/index.tsx";
import { Card, Page, PageHeader } from "../../../ui/kit/basics.tsx";

export function GlancePage() {
  usePageTitle("Mini Oak");
  return (
    <Page>
      <PageHeader title="Mini Oak" sub="The Today page's map thumbnail, at its two sizes." />
      <div className="flex flex-wrap items-start gap-6">
        {[240, 180].map((w) => (
          <Card key={w} className="p-4" style={{ width: w + 34 }}>
            <h2 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-text-2">
              <LeafIcon size={16} /> The Oak <span className="font-normal text-text-3">· {w} px</span>
            </h2>
            <OakGlance width={w} />
          </Card>
        ))}
      </div>
    </Page>
  );
}
