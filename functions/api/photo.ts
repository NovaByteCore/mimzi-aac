// Cloudflare Pages Function: serves /api/photo (Google Photos pass-through). See server/photoProxy.ts.
import { handlePhotoProxy } from '../../server/photoProxy';

export const onRequestGet = ({ request }: { request: Request }) => handlePhotoProxy(request);
