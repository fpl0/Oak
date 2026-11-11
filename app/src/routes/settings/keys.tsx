import { createFileRoute } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { useShell } from "../../lib/shell-store.ts";
import { IS_MAC } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Kbd } from "../../ui/kit/basics.tsx";
import { Field, Section, Switch } from "../../ui/kit/Field.tsx";
import { usePrefs } from "../../ui/theme/prefs.ts";

export const Route = createFileRoute("/settings/keys")({ component: KeysSettings });

function KeysSettings() {
  usePageTitle("Settings · Keys");
  const macCtrl = usePrefs((s) => s.macCtrl);
  const set = usePrefs((s) => s.set);
  const openSheet = useShell((s) => s.setShortcutsOpen);
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Shortcuts"
        description={
          <>
            Keys act only in the region that has focus. Press <Kbd>?</Kbd> anywhere for the full sheet.
          </>
        }
      >
        <div className="py-3">
          <Button onClick={() => openSheet(true)}>Show the shortcut sheet</Button>
        </div>
        <Field
          label="Strudel-compatible Ctrl"
          help={IS_MAC ? "Ctrl works wherever ⌘ does, as on strudel.cc." : "Only applies on macOS."}
        >
          {({ id, describedBy }) => (
            <Switch
              id={id}
              describedBy={describedBy}
              checked={macCtrl}
              onChange={(v) => set({ macCtrl: v })}
            />
          )}
        </Field>
      </Section>
    </div>
  );
}
