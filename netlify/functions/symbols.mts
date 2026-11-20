// Netlify Function: serves /api/symbols (OpenSymbols search). See server/openSymbols.ts.
// Set OPENSYMBOLS_SECRET in Netlify → Project configuration → Environment variables.
import { handleSymbolSearch } from '../../server/openSymbols';

export default (req: Request) => handleSymbolSearch(req, process.env.OPENSYMBOLS_SECRET);

export const config = { path: '/api/symbols' };
