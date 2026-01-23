#!/usr/bin/env bun
/**
 * Migration script to convert Next.js pages to React Router pages
 * 
 * This script:
 * 1. Reads all page.tsx files from app/(dashboard)
 * 2. Converts Next.js imports to React Router imports
 * 3. Updates export default to named exports
 * 4. Creates corresponding files in src/pages/
 */

import { readdir, readFile, writeFile, mkdir, access } from 'fs/promises'
import { join, dirname, basename } from 'path'

// Helper function to build component name from route path
function buildComponentNameFromPath(pathParts: string[]): string {
  // Convert path parts to PascalCase component name
  // e.g., ["admin", "users"] -> "AdminUsers"
  // e.g., ["admin", "users", "[id]"] -> "AdminUsersDetail"
  const parts = pathParts.filter(p => p && p !== 'page.tsx')
  
  if (parts.length === 0) {
    return 'Home'
  }
  
  // Handle dynamic routes
  const lastPart = parts[parts.length - 1]
  if (lastPart === '[id]' || lastPart === '[jobId]') {
    const baseName = parts.length >= 2 ? parts[parts.length - 2] : 'Index'
    const detailName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + 'Detail'
    return detailName
  }
  
  // Convert all parts to PascalCase and join
  const componentName = parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  
  return componentName || 'Home'
}

const MIGRATIONS = [
  // Combined imports from next/navigation - must come before individual imports
  {
    from: /import\s+{\s*([^}]+)\s*}\s+from\s+['"]next\/navigation['"]/g,
    to: (match: string, imports: string) => {
      const importList = imports.split(',').map(i => i.trim())
      const compatImports: string[] = []
      let hasRedirect = false
      
      // Check each import token
      for (const imp of importList) {
        const token = imp.split(' as ')[0].trim() // Handle "useRouter as router" cases
        if (token === 'useRouter' && !compatImports.includes('useRouter')) {
          compatImports.push('useRouter')
        } else if (token === 'useSearchParams' && !compatImports.includes('useSearchParams')) {
          compatImports.push('useSearchParams')
        } else if (token === 'usePathname' && !compatImports.includes('usePathname')) {
          compatImports.push('usePathname')
        } else if (token === 'redirect') {
          hasRedirect = true
        }
      }
      
      let result = compatImports.length > 0 
        ? `import { ${compatImports.join(', ')} } from "@/lib/router/compat"`
        : ''
      
      if (hasRedirect) {
        result += (result ? '\n' : '') + '// Note: redirect() is server-side only. Use navigate() from useRouter() instead'
      }
      
      return result || match // Return original if nothing to replace
    },
  },
  // Individual imports (fallback for cases not caught above)
  {
    from: /import\s+{\s*useRouter\s*}\s+from\s+['"]next\/navigation['"]/g,
    to: 'import { useRouter } from "@/lib/router/compat"',
  },
  {
    from: /import\s+{\s*useSearchParams\s*}\s+from\s+['"]next\/navigation['"]/g,
    to: 'import { useSearchParams } from "@/lib/router/compat"',
  },
  {
    from: /import\s+{\s*usePathname\s*}\s+from\s+['"]next\/navigation['"]/g,
    to: 'import { usePathname } from "@/lib/router/compat"',
  },
  {
    from: /import\s+Link\s+from\s+['"]next\/link['"]/g,
    to: 'import { Link } from "@/lib/router/compat"',
  },
  {
    from: /import\s+{\s*Link\s*}\s+from\s+['"]next\/link['"]/g,
    to: 'import { Link } from "@/lib/router/compat"',
  },
  {
    from: /import\s+{\s*redirect\s*}\s+from\s+['"]next\/navigation['"]/g,
    to: '// Note: redirect() is server-side only. Use navigate() from useRouter() instead',
  },
  {
    from: /const\s+router\s*=\s*useRouter\(\)/g,
    to: 'const router = useRouter()',
  },
  {
    from: /const\s+searchParams\s*=\s*useSearchParams\(\)/g,
    to: 'const [searchParams] = useSearchParams()',
  },
  {
    from: /router\.push\(/g,
    to: 'router.push(',
  },
  {
    from: /router\.replace\(/g,
    to: 'router.replace(',
  },
  {
    from: /<Link\s+href=/g,
    to: '<Link to=',
  },
  {
    from: /process\.env\.NEXT_PUBLIC_/g,
    to: 'import.meta.env.VITE_',
  },
  {
    from: /export\s+default\s+function\s+(\w+)/g,
    to: 'export function $1',
  },
]

async function migrateFile(sourcePath: string, targetPath: string) {
  const content = await readFile(sourcePath, 'utf-8')
  let migrated = content

  // Apply all migrations
  for (const migration of MIGRATIONS) {
    if (typeof migration.to === 'function') {
      migrated = migrated.replace(migration.from, migration.to as any)
    } else {
      migrated = migrated.replace(migration.from, migration.to)
    }
  }

  // Remove "use client" directive (not needed in React Router)
  migrated = migrated.replace(/^"use client";\s*\n/gm, '')

  // Remove Suspense wrappers that were only for Next.js
  migrated = migrated.replace(/<Suspense\s+fallback=\{<div>Loading\.\.\.<\/div>\}>\s*\n\s*<(\w+)\s*\/>\s*\n\s*<\/Suspense>/g, '<$1 />')

  // Ensure directory exists
  await mkdir(dirname(targetPath), { recursive: true })

  await writeFile(targetPath, migrated, 'utf-8')
  console.log(`Migrated: ${sourcePath} -> ${targetPath}`)
}

async function main() {
  const appDir = join(process.cwd(), 'src/app/(dashboard)')
  const pagesDir = join(process.cwd(), 'src/pages')

  // Find all page.tsx files
  const pages: string[] = []
  
  async function findPages(dir: string, basePath: string = '') {
    const entries = await readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relativePath = join(basePath, entry.name)
      
      if (entry.isDirectory()) {
        await findPages(fullPath, relativePath)
      } else if (entry.name === 'page.tsx') {
        pages.push(fullPath)
      }
    }
  }

  await findPages(appDir)

  console.log(`Found ${pages.length} pages to migrate`)

  for (const pagePath of pages) {
    // Determine target path
    const relativePath = pagePath.replace(appDir + '/', '')
    const pathParts = relativePath.split('/').filter(p => p !== 'page.tsx')
    
    // Build component name from full route path to ensure uniqueness
    const componentName = buildComponentNameFromPath(pathParts)
    const targetPath = join(pagesDir, `${componentName}.tsx`)
    
    // Check if target file already exists to prevent overwrite
    try {
      await access(targetPath)
      console.error(`ERROR: Target file already exists: ${targetPath}`)
      console.error(`  Source: ${pagePath}`)
      console.error(`  This would overwrite an existing file. Skipping migration.`)
      continue
    } catch {
      // File doesn't exist, safe to proceed
    }
    
    try {
      await migrateFile(pagePath, targetPath)
    } catch (error) {
      console.error(`Error migrating ${pagePath}:`, error)
    }
  }

  console.log('Migration complete!')
}

main().catch(console.error)
