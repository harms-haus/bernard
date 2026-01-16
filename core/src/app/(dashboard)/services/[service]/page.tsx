import { ServicePageClient } from '@/components/dashboard/ServicePageClient'
import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';

export default function ServicePage() {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <ServicePageClient session={null} />
      </DarkModeProvider>
    </AuthProvider>
  );
}
