import { before, describe, test } from 'node:test'

import * as assert from 'assert'
import * as path from 'path'

import {
  clearWorkspaceCache,
  getWorkspaceFileDependencyInformation,
  resolveCatalogVersion,
  resolveWorkspaceVersion,
} from '../workspace'

const testdataDir = path.resolve('./src/test-node/testdata')
const catalogWorkspaceDir = path.resolve('./src/test-node/testdata/catalog-workspace')

describe('workspace', () => {
  before(() => {
    clearWorkspaceCache()
  })

  test('should return undefined for non-workspace versions', () => {
    const result = resolveWorkspaceVersion(
      '^1.2.3',
      'some-pkg',
      path.join(testdataDir, 'dummy.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should resolve workspace:* to the local package version', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-a',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '1.0.0', isWorkspace: true })
  })

  test('should resolve workspace:^ to the local package version', () => {
    const result = resolveWorkspaceVersion(
      'workspace:^',
      'pkg-b',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '2.5.0', isWorkspace: true })
  })

  test('should resolve workspace:~ to the local package version', () => {
    const result = resolveWorkspaceVersion(
      'workspace:~',
      'app',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '0.1.0', isWorkspace: true })
  })

  test('should resolve workspace:1.2.3 to the explicit version', () => {
    const result = resolveWorkspaceVersion(
      'workspace:1.2.3',
      'pkg-a',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '1.2.3', isWorkspace: true })
  })

  test('should resolve workspace:^1.2.3 to the explicit version', () => {
    const result = resolveWorkspaceVersion(
      'workspace:^1.2.3',
      'pkg-a',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '^1.2.3', isWorkspace: true })
  })

  test('should resolve deep workspace packages with ** glob', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'button',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '3.0.0-beta.1', isWorkspace: true })
  })

  test('should return undefined when workspace package is not found', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'non-existent-pkg',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should return undefined when no pnpm-workspace.yaml exists', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-a',
      path.join('/tmp', 'no-workspace', 'package.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should handle yaml with comments and mixed quotes', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-b',
      path.join(testdataDir, 'ws-comments', 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '2.5.0', isWorkspace: true })
  })

  test('should handle empty packages array', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-a',
      path.join(testdataDir, 'ws-empty', 'packages', 'consumer', 'package.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should use cache on repeated lookups', () => {
    clearWorkspaceCache()

    const first = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-a',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(first, { version: '1.0.0', isWorkspace: true })

    const second = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-b',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(second, { version: '2.5.0', isWorkspace: true })
  })

  test('should resolve catalog: to default catalog entry', () => {
    const result = resolveCatalogVersion(
      'catalog:',
      'react',
      path.join(catalogWorkspaceDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '^19.2.5', isCatalog: true })
  })

  test('should resolve catalog:default to default catalog entry', () => {
    const result = resolveCatalogVersion(
      'catalog:default',
      'lodash',
      path.join(catalogWorkspaceDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '4.17.21', isCatalog: true })
  })

  test('should resolve catalog:legacy to named catalog entry', () => {
    const result = resolveCatalogVersion(
      'catalog:legacy',
      'react',
      path.join(catalogWorkspaceDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '^17.0.2', isCatalog: true })
  })

  test('should resolve catalog:legacy for scoped package', () => {
    const result = resolveCatalogVersion(
      'catalog:legacy',
      'react-dom',
      path.join(catalogWorkspaceDir, 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '^17.0.2', isCatalog: true })
  })

  test('should return undefined for missing catalog entry', () => {
    const result = resolveCatalogVersion(
      'catalog:',
      'non-existent-pkg',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should return undefined for missing named catalog', () => {
    const result = resolveCatalogVersion(
      'catalog:missing',
      'react',
      path.join(testdataDir, 'packages', 'consumer', 'package.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should return undefined when no pnpm-workspace.yaml exists', () => {
    const result = resolveCatalogVersion(
      'catalog:',
      'react',
      path.join('/tmp', 'no-workspace', 'package.json'),
    )
    assert.strictEqual(result, undefined)
  })

  test('should return undefined for non-catalog versions', () => {
    const result = resolveCatalogVersion('^1.2.3', 'react', path.join(testdataDir, 'dummy.json'))
    assert.strictEqual(result, undefined)
  })

  test('should support pnpm-workspace.yml extension', () => {
    // ws-yml only contains a pnpm-workspace.yml (no .yaml) so this exercises the .yml fallback
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'app',
      path.join(testdataDir, 'ws-yml', 'packages', 'consumer', 'package.json'),
    )
    assert.deepStrictEqual(result, { version: '0.1.0', isWorkspace: true })
  })

  test('should gracefully handle invalid yaml', () => {
    const result = resolveWorkspaceVersion(
      'workspace:*',
      'pkg-a',
      path.join(testdataDir, 'ws-invalid', 'packages', 'consumer', 'package.json'),
    )
    assert.strictEqual(result, undefined)

    const catalogResult = resolveCatalogVersion(
      'catalog:',
      'react',
      path.join(testdataDir, 'ws-invalid', 'packages', 'consumer', 'package.json'),
    )
    assert.strictEqual(catalogResult, undefined)
  })

  test('should extract catalog dependencies from workspace file', () => {
    const groups = getWorkspaceFileDependencyInformation(`packages:
  - 'packages/*'
catalog:
  react: ^18.0.0
  lodash: ^4.17.0
`)

    assert.strictEqual(groups.length, 1)
    assert.strictEqual(groups[0].startLine, 2)
    assert.strictEqual(groups[0].deps.length, 2)

    const react = groups[0].deps.find((d) => d.dependencyName === 'react')
    assert.ok(react)
    assert.strictEqual(react.currentVersion, '^18.0.0')
    assert.strictEqual(react.line, 3)

    const lodash = groups[0].deps.find((d) => d.dependencyName === 'lodash')
    assert.ok(lodash)
    assert.strictEqual(lodash.currentVersion, '^4.17.0')
    assert.strictEqual(lodash.line, 4)
  })

  test('should extract named catalog dependencies from workspace file', () => {
    const groups = getWorkspaceFileDependencyInformation(`catalogs:
  legacy:
    react: ^17.0.2
    react-dom: ^17.0.2
`)

    assert.strictEqual(groups.length, 1)
    assert.strictEqual(groups[0].startLine, 1)
    assert.strictEqual(groups[0].deps.length, 2)

    const react = groups[0].deps.find((d) => d.dependencyName === 'react')
    assert.ok(react)
    assert.strictEqual(react.currentVersion, '^17.0.2')
    assert.strictEqual(react.line, 2)

    const reactDom = groups[0].deps.find((d) => d.dependencyName === 'react-dom')
    assert.ok(reactDom)
    assert.strictEqual(reactDom.currentVersion, '^17.0.2')
    assert.strictEqual(reactDom.line, 3)
  })

  test('should extract both catalog and named catalogs', () => {
    const groups = getWorkspaceFileDependencyInformation(`catalog:
  react: ^18.0.0
catalogs:
  legacy:
    react: ^17.0.2
`)

    assert.strictEqual(groups.length, 2)

    const catalogGroup = groups.find((g) => g.startLine === 0)
    assert.ok(catalogGroup)
    assert.strictEqual(catalogGroup.deps.length, 1)
    assert.strictEqual(catalogGroup.deps[0].dependencyName, 'react')
    assert.strictEqual(catalogGroup.deps[0].currentVersion, '^18.0.0')

    const legacyGroup = groups.find((g) => g.startLine === 3)
    assert.ok(legacyGroup)
    assert.strictEqual(legacyGroup.deps.length, 1)
    assert.strictEqual(legacyGroup.deps[0].dependencyName, 'react')
    assert.strictEqual(legacyGroup.deps[0].currentVersion, '^17.0.2')
  })

  test('should handle workspace file with comments and mixed quotes', () => {
    const groups = getWorkspaceFileDependencyInformation(`packages:
  - 'packages/*'
# main deps
catalog:
  react: ^18.0.0
  "lodash": '^4.17.0'
`)

    assert.strictEqual(groups.length, 1)
    assert.strictEqual(groups[0].deps.length, 2)

    const react = groups[0].deps.find((d) => d.dependencyName === 'react')
    assert.ok(react)
    assert.strictEqual(react.line, 4)

    const lodash = groups[0].deps.find((d) => d.dependencyName === 'lodash')
    assert.ok(lodash)
    assert.strictEqual(lodash.line, 5)
  })

  test('should return empty for invalid yaml', () => {
    const groups = getWorkspaceFileDependencyInformation('this is not { valid yaml ::::')
    assert.strictEqual(groups.length, 0)
  })

  test('should return empty for workspace file without catalogs', () => {
    const groups = getWorkspaceFileDependencyInformation(`packages:
  - 'packages/*'
`)
    assert.strictEqual(groups.length, 0)
  })

  test('should not confuse catalog name with dependency name in another section', () => {
    const groups = getWorkspaceFileDependencyInformation(`catalog:
  legacy: ^1.0.0
catalogs:
  legacy:
    react: ^18.0.0
`)

    assert.strictEqual(groups.length, 2)

    const catalogGroup = groups.find((g) => g.startLine === 0)
    assert.ok(catalogGroup)
    assert.strictEqual(catalogGroup.deps.length, 1)
    assert.strictEqual(catalogGroup.deps[0].dependencyName, 'legacy')
    assert.strictEqual(catalogGroup.deps[0].currentVersion, '^1.0.0')

    const legacyGroup = groups.find((g) => g.startLine === 3)
    assert.ok(legacyGroup)
    assert.strictEqual(legacyGroup.deps.length, 1)
    assert.strictEqual(legacyGroup.deps[0].dependencyName, 'react')
    assert.strictEqual(legacyGroup.deps[0].currentVersion, '^18.0.0')
  })

  test('should deduplicate lines when same dependency appears in catalog and catalogs with same version', () => {
    const groups = getWorkspaceFileDependencyInformation(`catalog:
  react: ^18.0.0
catalogs:
  legacy:
    react: ^18.0.0
`)

    assert.strictEqual(groups.length, 2)

    const catalogGroup = groups.find((g) => g.startLine === 0)
    assert.ok(catalogGroup)
    assert.strictEqual(catalogGroup.deps.length, 1)
    assert.strictEqual(catalogGroup.deps[0].dependencyName, 'react')
    assert.strictEqual(catalogGroup.deps[0].currentVersion, '^18.0.0')
    assert.strictEqual(catalogGroup.deps[0].line, 1)

    const legacyGroup = groups.find((g) => g.startLine === 3)
    assert.ok(legacyGroup)
    assert.strictEqual(legacyGroup.deps.length, 1)
    assert.strictEqual(legacyGroup.deps[0].dependencyName, 'react')
    assert.strictEqual(legacyGroup.deps[0].currentVersion, '^18.0.0')
    assert.strictEqual(legacyGroup.deps[0].line, 4)
  })
})
