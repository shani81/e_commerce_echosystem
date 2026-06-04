// ffprobe-static ships no type declarations; it exports the binary path.
declare module 'ffprobe-static' {
  const ffprobe: { path: string; version: string };
  export default ffprobe;
}
