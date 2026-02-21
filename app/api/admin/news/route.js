import { requireAdmin } from '../../_lib/admin-auth.js';
import { handleNews } from '../../news/route.js';

export const GET = requireAdmin(handleNews);
