// Cloudflare Pages Function: serves /api/symbols (OpenSymbols search). See server/openSymbols.ts.
// Set OPENSYMBOLS_SECRET as an encrypted environment variable in Cloudflare Pages.
import { handleSymbolSearch } from '../../server/openSymbols';

export const onRequestGet = ({ request, env }: { request: Request; env: { OPENSYMBOLS_SECRET?: string } }) =>
  handleSymbolSearch(request, env.OPENSYMBOLS_SECRET);
