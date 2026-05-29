import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as path from 'path'
import { globSync } from 'tinyglobby'

import type { Dependency, DependencyGroups } from './packageJson'

interface WorkspaceCache {
  packages: Map<string, string>
  mtime: number
}

interface CatalogCache {
  catalog: WorkspaceCatalog
  mtime: number
}

interface WorkspaceCatalog {
  default: Map<string, string>
  named: Map<string, Map<string, string>>
}

const workspaceCache = new Map<string, WorkspaceCache>()
const catalogCache = new Map<string, CatalogCache>()
const workspaceRootCache = new Map<string, string | undefined>()

export interface CatalogVersionResolution {
  version: string
  isCatalog: boolean
}

export const resolveCatalogVersion = (
  version: string,
  dependencyName: string,
  packageJsonPath: string,
): CatalogVersionResolution | undefined => {
  if (!version.startsWith('catalog:')) {
    return undefined
  }

  const workspaceRoot = findPnpmWorkspaceRoot(packageJsonPath)
  if (workspaceRoot === undefined) {
    return undefined
  }

  const catalogName = version === 'catalog:' ? 'default' : version.slice('catalog:'.length)
  const workspaceCatalog = getWorkspaceCatalog(workspaceRoot)

  const resolved =
    catalogName === 'default'
      ? (workspaceCatalog.default.get(dependencyName) ??
        workspaceCatalog.named.get('default')?.get(dependencyName))
      : workspaceCatalog.named.get(catalogName)?.get(dependencyName)

  if (resolved !== undefined) {
    return { version: resolved, isCatalog: true }
  }

  return undefined
}

export interface WorkspaceVersionResolution {
  version: string
  isWorkspace: boolean
}

export const resolveWorkspaceVersion = (
  version: string,
  dependencyName: string,
  packageJsonPath: string,
): WorkspaceVersionResolution | undefined => {
  if (!version.startsWith('workspace:')) {
    return undefined
  }

  const workspaceRoot = findPnpmWorkspaceRoot(packageJsonPath)
  if (workspaceRoot === undefined) {
    return undefined
  }

  const workspacePackages = getWorkspacePackages(workspaceRoot)
  const workspaceVersion = workspacePackages.get(dependencyName)
  if (workspaceVersion === undefined) {
    return undefined
  }

  const explicitSpecifier = version.slice('workspace:'.length)

  if (explicitSpecifier === '*' || explicitSpecifier === '^' || explicitSpecifier === '~') {
    return { version: workspaceVersion, isWorkspace: true }
  }

  return { version: explicitSpecifier, isWorkspace: true }
}

export const clearWorkspaceCache = () => {
  workspaceCache.clear()
  catalogCache.clear()
  workspaceRootCache.clear()
}

const findPnpmWorkspaceRoot = (packageJsonPath: string): string | undefined => {
  const cached = workspaceRootCache.get(packageJsonPath)
  if (cached !== undefined || workspaceRootCache.has(packageJsonPath)) {
    return cached
  }

  let dir = path.dirname(packageJsonPath)
  while (dir !== path.dirname(dir)) {
    if (findWorkspaceFile(dir) !== undefined) {
      workspaceRootCache.set(packageJsonPath, dir)
      return dir
    }
    dir = path.dirname(dir)
  }

  workspaceRootCache.set(packageJsonPath, undefined)
  return undefined
}

const getWorkspacePackages = (workspaceRoot: string): Map<string, string> => {
  const workspaceFile = findWorkspaceFile(workspaceRoot)
  if (workspaceFile === undefined) {
    return new Map()
  }

  const mtime = fs.statSync(workspaceFile).mtimeMs
  const cache = workspaceCache.get(workspaceRoot)

  if (cache !== undefined && cache.mtime >= mtime) {
    return cache.packages
  }

  const content = fs.readFileSync(workspaceFile, 'utf-8')
  const patterns = parseWorkspacePackages(content)
  const packages = new Map<string, string>()

  const pkgJsonPaths = globSync(
    patterns
      .filter((p) => p.length > 0)
      .map((p) => {
        const normalized = p.replace(/\/+$/, '')
        return `${normalized}/package.json`
      }),
    { cwd: workspaceRoot, absolute: true, onlyFiles: true },
  )

  for (const pkgJsonPath of pkgJsonPaths) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
        name?: string
        version?: string
      }
      if (pkgJson.name !== undefined && pkgJson.version !== undefined) {
        packages.set(pkgJson.name, pkgJson.version)
      }
    } catch {
      // ignore invalid or unreadable package.json files
    }
  }

  workspaceCache.set(workspaceRoot, { packages, mtime })
  return packages
}

const findWorkspaceFile = (workspaceRoot: string): string | undefined => {
  for (const ext of ['.yaml', '.yml']) {
    const filePath = path.join(workspaceRoot, `pnpm-workspace${ext}`)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return undefined
}

const parseWorkspacePackages = (content: string): string[] => {
  try {
    const parsed = yaml.load(content)
    if (!isRecord(parsed)) {
      return []
    }
    const packages = parsed.packages
    if (Array.isArray(packages)) {
      return packages.filter((p): p is string => typeof p === 'string')
    }
  } catch {
    // ignore invalid yaml
  }
  return []
}

const getWorkspaceCatalog = (workspaceRoot: string): WorkspaceCatalog => {
  const workspaceFile = findWorkspaceFile(workspaceRoot)
  if (workspaceFile === undefined) {
    return { default: new Map(), named: new Map() }
  }

  const mtime = fs.statSync(workspaceFile).mtimeMs
  const cache = catalogCache.get(workspaceRoot)

  if (cache !== undefined && cache.mtime >= mtime) {
    return cache.catalog
  }

  const content = fs.readFileSync(workspaceFile, 'utf-8')
  const catalog = parseWorkspaceCatalogs(content)

  catalogCache.set(workspaceRoot, { catalog, mtime })
  return catalog
}

const parseWorkspaceCatalogs = (content: string): WorkspaceCatalog => {
  const catalog = new Map<string, string>()
  const named = new Map<string, Map<string, string>>()

  try {
    const parsed = yaml.load(content)
    if (!isRecord(parsed)) {
      return { default: catalog, named }
    }

    if (isRecord(parsed.catalog)) {
      for (const [key, value] of Object.entries(parsed.catalog)) {
        if (typeof value === 'string') {
          catalog.set(key, value)
        }
      }
    }

    if (isRecord(parsed.catalogs)) {
      for (const [name, entries] of Object.entries(parsed.catalogs)) {
        if (isRecord(entries)) {
          const map = new Map<string, string>()
          for (const [key, value] of Object.entries(entries)) {
            if (typeof value === 'string') {
              map.set(key, value)
            }
          }
          named.set(name, map)
        }
      }
    }
  } catch {
    // ignore invalid yaml
  }

  return { default: catalog, named }
}

export const getWorkspaceFileDependencyInformation = (content: string): DependencyGroups[] => {
  try {
    const parsed = yaml.load(content)
    if (!isRecord(parsed)) {
      return []
    }

    const lines = content.split('\n')
    const usedLines = new Set<number>()

    const findLine = (name: string, version: string): number => {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(
        `^\\s*["']?${escapedName}["']?:\\s*["']?${escapedVersion}["']?\\s*(?:#.*)?$`,
      )
      for (let i = 0; i < lines.length; i++) {
        if (!usedLines.has(i) && regex.test(lines[i])) {
          usedLines.add(i)
          return i
        }
      }
      return -1
    }

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const findSectionLine = (name: string, parentName?: string): number => {
      const regex = new RegExp(`^\\s*${escapeRegex(name)}:\\s*(?:#.*)?$`)
      let startIndex = 0
      if (parentName !== undefined) {
        const parentRegex = new RegExp(`^\\s*${escapeRegex(parentName)}:\\s*(?:#.*)?$`)
        startIndex = lines.findIndex((line) => parentRegex.test(line))
        if (startIndex === -1) {
          return -1
        }
        startIndex += 1
      }
      for (let i = startIndex; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          return i
        }
      }
      return -1
    }

    const groups: DependencyGroups[] = []

    if (isRecord(parsed.catalog)) {
      const deps: Dependency[] = []
      for (const [name, version] of Object.entries(parsed.catalog)) {
        if (typeof version === 'string') {
          const line = findLine(name, version)
          if (line !== -1) {
            deps.push({ dependencyName: name, currentVersion: version, line })
          }
        }
      }
      const sectionLine = findSectionLine('catalog')
      if (deps.length > 0 && sectionLine !== -1) {
        groups.push({ startLine: sectionLine, deps })
      }
    }

    if (isRecord(parsed.catalogs)) {
      for (const [catalogName, entries] of Object.entries(parsed.catalogs)) {
        if (isRecord(entries)) {
          const deps: Dependency[] = []
          for (const [name, version] of Object.entries(entries)) {
            if (typeof version === 'string') {
              const line = findLine(name, version)
              if (line !== -1) {
                deps.push({ dependencyName: name, currentVersion: version, line })
              }
            }
          }
          const sectionLine = findSectionLine(catalogName, 'catalogs')
          if (deps.length > 0 && sectionLine !== -1) {
            groups.push({ startLine: sectionLine, deps })
          }
        }
      }
    }

    return groups
  } catch {
    return []
  }
}

export const getWorkspaceDependencyFromLine = (
  content: string,
  line: number,
): Dependency | undefined => {
  const dependencies = getWorkspaceFileDependencyInformation(content)
    .map((d) => d.deps)
    .flat()

  return dependencies.find((d) => d.line === line)
}

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
