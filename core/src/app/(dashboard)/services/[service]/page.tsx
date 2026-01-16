import { redirectIfNotAuthenticated } from '@/lib/auth/client-helpers'
import { ServicePageClient } from '@/components/dashboard/ServicePageClient'
import type { Session } from '@/lib/auth/client-helpers'

export default async function ServicePage() {
    const session = await redirectIfNotAuthenticated()

    // Type assertion safe because redirectIfNotAuthenticated redirects if session is null
    return <ServicePageClient session={session as Session} />
}
