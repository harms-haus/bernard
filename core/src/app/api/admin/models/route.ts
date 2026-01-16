import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { SettingsStore, ModelsSettingsSchema } from '@/lib/config/settingsStore';

const store = new SettingsStore();

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const models = await store.getModels();
  return NextResponse.json(models);
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await request.json();
  const parsed = ModelsSettingsSchema.parse(body);
  const saved = await store.setModels(parsed);
  return NextResponse.json(saved);
}
