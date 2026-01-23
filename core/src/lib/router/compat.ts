import {
  useSearchParams as useSearchParamsRR,
  useParams as useParamsRR,
  useLocation,
  useNavigate,
  Link as LinkRR,
} from 'react-router-dom'

// UseSearchParams compatibility
export function useSearchParams() {
  const [rrSearchParams, rrSetSearchParams] = useSearchParamsRR()

  const setParams = (params: Record<string, string>) => {
    const newSearchParams = new URLSearchParams(rrSearchParams)
    Object.entries(params).forEach(([key, value]) => {
      newSearchParams.set(key, value)
    })
    rrSetSearchParams(newSearchParams)
  }

  return [rrSearchParams, setParams] as const
}

// UseRouter compatibility
export function useRouter() {
  const navigate = useNavigate()
  const location = useLocation()

  return {
    push: (path: string) => navigate(path),
    replace: (path: string) => navigate(path, { replace: true }),
    pathname: location.pathname,
    query: Object.fromEntries(new URLSearchParams(location.search)),
  }
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
