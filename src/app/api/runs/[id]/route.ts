// GET /api/runs/:id — live run view (polled by the dashboards).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, rateLimit } from '@/lib/auth';
import { getRunView } from '@/mastra';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const auth = await requireAuth(req);
  if ('error' in auth) return auth.error;
  // Rehydrates from durable Mastra storage when the in-memory registry is empty
  // (serverless cold process) so a SUSPENDED run renders instead of 404-ing.
  const view = await getRunView(params.id);
  if (!view) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run: view });
}
