import { requireAdmin } from '../../_lib/admin-auth.js';
import { handleScan } from '../../scan/route.js';

export const GET = requireAdmin(handleScan);
