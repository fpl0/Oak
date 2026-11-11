// Stands in for Node's `worker_threads` in the browser build: wavesurfer's spectrogram probes it with a
// guarded `require`, which Vite would otherwise externalize with a console warning.
export default {};
