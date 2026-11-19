// Netlify Function: serves /api/photo (Google Photos pass-through). See server/photoProxy.ts.
import { handlePhotoProxy } from '../../server/photoProxy';

export default (req: Request) => handlePhotoProxy(req);

export const config = { path: '/api/photo' };
