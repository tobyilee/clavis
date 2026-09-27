// The only Web API shared code uses. It exists in browsers, Workers and Node; this package
// compiles against plain ES2023 on purpose, so declare just what is needed.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
