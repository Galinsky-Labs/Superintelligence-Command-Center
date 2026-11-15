import {proxyToEngine} from '../../../lib/engine-proxy.mjs';
export const dynamic='force-dynamic';
const handle=request=>proxyToEngine(request);
export {handle as GET,handle as POST,handle as PUT,handle as PATCH,handle as DELETE};
