import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createEditor, type EditorHandle } from './oakStrudel';

const EDITORS = [
  { id: 'oak_s2_1_', code: 'note("c4 e4 g4").s("triangle")' },
  { id: 'oak_s2_2_', code: 'note("c3 g3").s("sawtooth")' },
  { id: 'oak_s2_3_', code: 'drums: note("c5*4").s("square")\nbass: note("c2 g2").s("sawtooth")' },
];
const PROBE = new URLSearchParams(location.search).get('probe');

function Controls({ id, handle, playing }: { id: string; handle: () => EditorHandle | null; playing: boolean }) {
  const [err, setErr] = useState('');
  return (
    <div>
      <button
        type="button"
        data-testid={`play-${id}`}
        onClick={() => {
          setErr('');
          handle()
            ?.play()
            .catch((e) => setErr(String(e)));
        }}
      >
        play
      </button>
      <button type="button" data-testid={`stop-${id}`} onClick={() => handle()?.stop()}>
        stop
      </button>
      <span data-testid={`state-${id}`}>{playing ? 'playing' : 'stopped'}</span>
      <span data-testid={`err-${id}`}>{err}</span>
    </div>
  );
}

/** Variant A: useEffect + cleanup (StrictMode: mount -> cleanup -> mount). */
function EffectEditor({ id, code }: { id: string; code: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const h = createEditor(rootRef.current as HTMLDivElement, { id, initialCode: code, onToggle: setPlaying });
    handleRef.current = h;
    return () => {
      handleRef.current = null;
      h.dispose();
    };
  }, [id, code]);
  return (
    <section data-editor={id}>
      <Controls id={id} handle={() => handleRef.current} playing={playing} />
      <div ref={rootRef} className="oak-editor" />
    </section>
  );
}

/** Variant B: React 19 ref callback with cleanup, kept STABLE with useCallback. */
function RefEditor({ id, code }: { id: string; code: string }) {
  const handleRef = useRef<EditorHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const mount = useCallback(
    (el: HTMLDivElement) => {
      const h = createEditor(el, { id, initialCode: code, onToggle: setPlaying });
      handleRef.current = h;
      return () => {
        handleRef.current = null;
        h.dispose();
      };
    },
    [id, code],
  );
  return (
    <section data-editor={id}>
      <Controls id={id} handle={() => handleRef.current} playing={playing} />
      <div ref={mount} className="oak-editor" />
    </section>
  );
}

/** Probe: the architecture doc's INLINE ref callback. Without React Compiler its identity changes on
 *  every render, so React runs cleanup + ref again -> the editor is destroyed and rebuilt per render. */
function InlineRefProbe() {
  return (
    <section data-editor="oak_probe_">
      <div
        className="oak-editor"
        ref={(el: HTMLDivElement) => {
          const h = createEditor(el, { id: 'oak_probe_', initialCode: 'note("a3")' });
          return () => h.dispose();
        }}
      />
    </section>
  );
}

export function App() {
  const [show, setShow] = useState(true);
  const [renders, rerender] = useReducer((x: number) => x + 1, 0);
  return (
    <main>
      <h1>Oak spike S2</h1>
      <button type="button" id="toggle-mount" onClick={() => setShow((s) => !s)}>
        {show ? 'unmount editors' : 'mount editors'}
      </button>
      <button type="button" id="rerender" onClick={rerender}>
        rerender ({renders})
      </button>
      {show &&
        EDITORS.map((e, i) =>
          i === 2 ? <RefEditor key={e.id} id={e.id} code={e.code} /> : <EffectEditor key={e.id} id={e.id} code={e.code} />,
        )}
      {show && PROBE === 'inlineref' && <InlineRefProbe />}
    </main>
  );
}
