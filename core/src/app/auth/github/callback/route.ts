import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const url = new URL(request.url)
  redirect(`/api/auth?action=callback&provider=github&${url.searchParams.toString()}`)
}
