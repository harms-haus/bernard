import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { logger } from '@/lib/logging/logger';
import { SERVICES } from '@/lib/services/ServiceConfig';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const services = Object.entries(SERVICES).map(([id, config]) => ({
      id,
      name: config.name,
      displayName: config.displayName,
      type: config.type,
      port: config.port,
      available: true
    }));

    return NextResponse.json({ services });
  } catch (error) {
    logger.error({ error }, 'Failed to list services');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const body = await request.json() as { service?: unknown; action?: string };
    const { service: serviceId, action = 'restart' } = body;

    if (!serviceId || typeof serviceId !== 'string') {
      return NextResponse.json({
        error: 'Service name is required',
        availableServices: Object.keys(SERVICES)
      }, { status: 400 });
    }

    const serviceConfig = SERVICES[serviceId];
    if (!serviceConfig) {
      return NextResponse.json({
        error: 'Invalid service name',
        availableServices: Object.keys(SERVICES)
      }, { status: 400 });
    }

    if (serviceConfig.type === 'docker') {
      return NextResponse.json({
        error: 'Cannot restart docker services via API',
        message: 'Use docker commands or service scripts to manage docker containers'
      }, { status: 400 });
    }

    logger.info({ actionType: 'services.manage', adminId: admin.user.id, serviceId, action });
    return NextResponse.json({
      success: true,
      serviceId,
      action,
      message: `${action.charAt(0).toUpperCase() + action.slice(1)} initiated for ${serviceConfig.displayName}`,
      note: 'Use service scripts or process manager to execute this action'
    });
  } catch (error) {
    logger.error({ error }, 'Failed to manage service');
    return NextResponse.json({
      error: 'Failed to manage service',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
