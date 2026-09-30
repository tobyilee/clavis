// The one place a Clavis release is set is the root package.json (README "버전"); the Worker
// and the web app both read it from here, so they always ship the same number.
import { version } from '../../../package.json';

/** The Clavis release, e.g. "0.9.0": in the sidebar, /api/v1/health and the MCP server info. */
export const APP_VERSION: string = version;
