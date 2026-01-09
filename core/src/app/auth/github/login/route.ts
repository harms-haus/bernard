import { redirect } from 'next/navigation'

export async function GET() {
  redirect('/api/auth?action=login&provider=github&returnTo=/bernard/chat')
}
