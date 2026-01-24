import {
  useSearchParams as useSearchParamsRR,
  useParams as useParamsRR,
  useLocation,
  useNavigate,
  Link as LinkRR,
} from 'react-router-dom'
import { useMemo, useCallback } from 'react'

// UseSearchParams compatibility
export function useSearchParams() {
  const [rrSearchParams, rrSetSearchParams] = useSearchParamsRR()

  const setParams = useCallback((params: Record<string, string>) => {
    const newSearchParams = new URLSearchParams(rrSearchParams)
    Object.entries(params).forEach(([key, value]) => {
      newSearchParams.set(key, value)
    })
    rrSetSearchParams(newSearchParams)
  }, [rrSearchParams, rrSetSearchParams])

  return [rrSearchParams, setParams] as const
}

// UseRouter compatibility
export function useRouter() {
  const navigate = useNavigate()
  const location = useLocation()

  const push = useCallback((path: string) => {
    navigate(path)
  }, [navigate])

  const replace = useCallback((path: string) => {
    navigate(path, { replace: true })
  }, [navigate])

  return useMemo(() => ({
    push,
    replace,
    pathname: location.pathname,
    query: Object.fromEntries(new URLSearchParams(location.search)),
  }), [push, replace, location.pathname, location.search])
}

// UsePathname compatibility
export function usePathname() {
  const location = useLocation()
  return location.pathname
}

// UseParams compatibility
export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  return useParamsRR<T>()
}

// Link compatibility
export const Link = LinkRR
