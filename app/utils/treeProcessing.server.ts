// // Types for the GitHub API response

// export interface TreeItem {
//   path: string;
//   mode: string;
//   type: string;
//   sha: string;
//   size?: number;
//   url: string;
// }

// export interface GitHubTreeResponse {
//   sha: string;
//   url: string;
//   truncated: boolean;
//   tree: TreeItem[];
// }

// export interface FilterConfig {
//   maxFileSize?: number; // bytes
//   includeDotFiles?: boolean;
//   includeTests?: boolean;
// }

// // TODO - could probably improve this
// const binaryExtensions = new Set([
//   "png",
//   "jpg",
//   "jpeg",
//   "gif",
//   "ico",
//   "svg",
//   "webp",
//   "bmp",
//   "tiff",
//   "mp3",
//   "wav",
//   "ogg",
//   "flac",
//   "m4a",
//   "mp4",
//   "avi",
//   "mov",
//   "wmv",
//   "flv",
//   "webm",
//   "pdf",
//   "doc",
//   "docx",
//   "xls",
//   "xlsx",
//   "ppt",
//   "pptx",
//   "zip",
//   "rar",
//   "tar",
//   "gz",
//   "7z",
//   "ttf",
//   "otf",
//   "eot",
//   "woff",
//   "woff2",
//   "db",
//   "sqlite",
//   "sqlite3",
//   "exe",
//   "dll",
//   "so",
//   "dylib",
//   "bin",
//   "dat",
// ]);

// const skipDirectories = new Set([
//   "node_modules",
//   "vendor",
//   "dist",
//   "build",
//   "target",
//   "out",
//   "output",
//   "coverage",
//   ".next",
//   ".nuxt",
//   ".git",
//   ".svn",
//   ".hg",
//   "venv",
//   "env",
//   ".env",
//   "__pycache__",
//   ".pytest_cache",
//   ".sass-cache",
//   "bower_components",
//   ".gradle",
//   "bin",
//   "obj",
// ]);

// const skipFiles = new Set([
//   "package-lock.json",
//   "yarn.lock",
//   "pnpm-lock.yaml",
//   "composer.lock",
//   "Gemfile.lock",
//   "poetry.lock",
//   ".DS_Store",
//   "thumbs.db",
//   ".gitkeep",
//   ".npmrc",
//   ".yarnrc",
//   ".eslintcache",
//   ".env",
//   ".env.local",
//   ".env.development",
//   ".env.test",
//   ".env.production",
// ]);

// // simple static 'pruning' of the tree - we also do another pass with LLM, in case this missed anything
// export function preFilterGithubTree(
//   tree: TreeItem[],
//   config: FilterConfig = {
//     maxFileSize: 1024 * 1024,
//     includeDotFiles: false,
//     includeTests: true,
//   }
// ): TreeItem[] {
//   return tree.filter((item) => {
//     if (item.type === "tree") {
//       const dirName = item.path.split("/").pop()!;
//       if (skipDirectories.has(dirName)) {
//         return false;
//       }
//     }

//     if (config.maxFileSize && item.size && item.size > config.maxFileSize) {
//       return false;
//     }

//     if (!config.includeDotFiles) {
//       const pathParts = item.path.split("/");
//       if (
//         pathParts.some((part) => part.startsWith(".") && part !== ".github")
//       ) {
//         return false;
//       }
//     }

//     if (!config.includeTests) {
//       const isTestFile = item.path.match(/\.(spec|test|e2e)\.[^.]+$/);
//       const isInTestDir = item.path
//         .split("/")
//         .some((part) =>
//           [
//             "test",
//             "tests",
//             "__tests__",
//             "spec",
//             "specs",
//             "__specs__",
//             "e2e",
//           ].includes(part)
//         );
//       if (isTestFile || isInTestDir) {
//         return false;
//       }
//     }

//     if (item.type === "blob") {
//       const fileName = item.path.split("/").pop()!;

//       if (skipFiles.has(fileName)) {
//         return false;
//       }

//       const extension = fileName.split(".").pop()?.toLowerCase();
//       if (extension && binaryExtensions.has(extension)) {
//         return false;
//       }

//       if (fileName.includes(".min.")) {
//         return false;
//       }

//       if (fileName.endsWith(".map")) {
//         return false;
//       }
//     }

//     return true;
//   });
// }

// export function githubTreeToMarkdown(response: GitHubTreeResponse): string {
//   if (!response.tree || response.tree.length === 0) {
//     return "";
//   }

//   const sortedTree = [...response.tree].sort((a, b) => {
//     if (a.type === "tree" && b.type !== "tree") return -1;
//     if (a.type !== "tree" && b.type === "tree") return 1;
//     return a.path.localeCompare(b.path);
//   });

//   const pathHierarchy = new Map<string, Set<string>>();
//   const rootItems = new Set<string>();

//   sortedTree.forEach((item) => {
//     const pathParts = item.path.split("/");

//     if (pathParts.length === 1) {
//       rootItems.add(item.path);
//     } else {
//       const parentPath = pathParts.slice(0, -1).join("/");
//       if (!pathHierarchy.has(parentPath)) {
//         pathHierarchy.set(parentPath, new Set());
//       }
//       pathHierarchy.get(parentPath)!.add(item.path);
//     }
//   });

//   // recursively format a path and its children
//   function formatPath(path: string, level: number = 0): string {
//     const indent = "  ".repeat(level);
//     const item = sortedTree.find((i) => i.path === path);

//     if (!item) return "";

//     let result = "";

//     if (item.type === "tree") {
//       result += `${indent}${path.split("/").pop()}/\n`;
//     } else {
//       result += `${indent}${path.split("/").pop()}\n`;
//     }

//     if (pathHierarchy.has(path)) {
//       const children = Array.from(pathHierarchy.get(path)!);
//       children.sort((a, b) => {
//         const aItem = sortedTree.find((i) => i.path === a);
//         const bItem = sortedTree.find((i) => i.path === b);
//         if (aItem?.type === "tree" && bItem?.type !== "tree") return -1;
//         if (aItem?.type !== "tree" && bItem?.type === "tree") return 1;
//         return a.localeCompare(b);
//       });

//       children.forEach((childPath) => {
//         result += formatPath(childPath, level + 1);
//       });
//     }

//     return result;
//   }

//   let result = "";
//   Array.from(rootItems)
//     .sort((a, b) => {
//       const aItem = sortedTree.find((i) => i.path === a);
//       const bItem = sortedTree.find((i) => i.path === b);
//       if (aItem?.type === "tree" && bItem?.type !== "tree") return -1;
//       if (aItem?.type !== "tree" && bItem?.type === "tree") return 1;
//       return a.localeCompare(b);
//     })
//     .forEach((path) => {
//       result += formatPath(path);
//     });

//   return result;
// }

export interface TreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  truncated: boolean;
  tree: TreeItem[];
}

export interface FilterConfig {
  maxFileSize?: number;
  includeDotFiles?: boolean;
  includeTests?: boolean;
}

// Size thresholds for text-based files (in bytes)
const TEXT_FILE_SIZE_LIMITS: Record<string, number> = {
  json: 100 * 1024, // 100KB
  xml: 100 * 1024, // 100KB
  sql: 500 * 1024, // 500KB
  txt: 100 * 1024, // 100KB
  csv: 500 * 1024, // 500KB
  yml: 50 * 1024, // 50KB
  yaml: 50 * 1024, // 50KB
};

const binaryExtensions = new Set([
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "ico",
  "svg",
  "webp",
  "bmp",
  "tiff",
  // Audio
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  // Video
  "mp4",
  "avi",
  "mov",
  "wmv",
  "flv",
  "webm",
  // Documents
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  // Archives
  "zip",
  "rar",
  "tar",
  "gz",
  "7z",
  // Fonts
  "ttf",
  "otf",
  "eot",
  "woff",
  "woff2",
  // Database
  "db",
  "sqlite",
  "sqlite3",
  // Executables
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "dat",
]);

const skipDirectories = new Set([
  // Package managers
  "node_modules",
  "vendor",
  "bower_components",
  // Build outputs
  "dist",
  "build",
  "target",
  "out",
  "output",
  "bin",
  "obj",
  // Cache and temp
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".sass-cache",
  // Framework specific
  ".next",
  ".nuxt",
  ".gradle",
  // Version control
  ".git",
  ".svn",
  ".hg",
  // Environment
  "venv",
  "env",
  ".env",
]);

const skipFiles = new Set([
  // Lock files
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  // System files
  ".DS_Store",
  "thumbs.db",
  ".gitkeep",
  // Config files
  ".npmrc",
  ".yarnrc",
  ".eslintcache",
  // Environment files
  ".env",
  ".env.local",
  ".env.development",
  ".env.test",
  ".env.production",
]);

/**
 * Determines if a file should be skipped based on size limits
 */
function shouldSkipBySize(
  path: string,
  size: number,
  maxFileSize: number
): boolean {
  const extension = path.split(".").pop()?.toLowerCase();
  if (!extension) return false;

  const specificLimit = TEXT_FILE_SIZE_LIMITS[extension];
  return specificLimit ? size > specificLimit : size > maxFileSize;
}

/**
 * Checks if a file is a build-generated timestamp variant
 */
function isTimestampVariant(path: string): boolean {
  const timestampPattern = /\.timestamp-[\d-]+/;
  const configVariantPattern = /\.(dev|prod|staging|test)\.[^.]+$/;

  if (timestampPattern.test(path)) return true;

  // Check if it's a variant of a config file
  const baseFile = path.replace(configVariantPattern, "");
  return path !== baseFile && /\.(config|conf)\.[^.]+$/.test(baseFile);
}

/**
 * Pre-filters GitHub tree to remove unnecessary files and empty directories
 */
export function preFilterGithubTree(
  tree: TreeItem[],
  config: FilterConfig = {
    maxFileSize: 1024 * 1024,
    includeDotFiles: false,
    includeTests: true,
  }
): TreeItem[] {
  // First, identify all valid files
  const validFiles = new Set<string>();
  const directories = new Set<string>();

  // Filter files first
  const filteredItems = tree.filter((item): boolean => {
    // Skip timestamp variants and config duplicates
    if (isTimestampVariant(item.path)) return false;

    // Handle directories
    if (item.type === "tree") {
      const dirName = item.path.split("/").pop()!;
      if (skipDirectories.has(dirName)) return false;
      directories.add(item.path);
      return true;
    }

    // Check file size
    if (config.maxFileSize && item.size) {
      if (shouldSkipBySize(item.path, item.size, config.maxFileSize))
        return false;
    }

    // Handle dot files
    if (!config.includeDotFiles) {
      const pathParts = item.path.split("/");
      if (
        pathParts.some((part) => part.startsWith(".") && part !== ".github")
      ) {
        return false;
      }
    }

    // Handle test files
    if (!config.includeTests) {
      const isTestFile = /\.(spec|test|e2e)\.[^.]+$/.test(item.path);
      const isInTestDir = item.path
        .split("/")
        .some((part) =>
          [
            "test",
            "tests",
            "__tests__",
            "spec",
            "specs",
            "__specs__",
            "e2e",
          ].includes(part)
        );
      if (isTestFile || isInTestDir) return false;
    }

    // Handle specific files
    if (item.type === "blob") {
      const fileName = item.path.split("/").pop()!;

      if (skipFiles.has(fileName)) return false;

      const extension = fileName.split(".").pop()?.toLowerCase();
      if (extension && binaryExtensions.has(extension)) return false;

      if (fileName.includes(".min.")) return false;
      if (fileName.endsWith(".map")) return false;

      // Skip migration files
      if (
        item.path.includes("/migrations/") &&
        (item.path.endsWith(".sql") || item.path.endsWith(".migration"))
      ) {
        return false;
      }

      validFiles.add(item.path);
      return true;
    }

    return false;
  });

  // Now remove directories that don't contain any valid files
  function hasValidDescendants(dirPath: string): boolean {
    return Array.from(validFiles).some(
      (filePath) => filePath.startsWith(dirPath + "/") || filePath === dirPath
    );
  }

  return filteredItems.filter((item) => {
    if (item.type === "tree") {
      return hasValidDescendants(item.path);
    }
    return true;
  });
}

/**
 * Converts filtered GitHub tree to markdown format
 */
export function githubTreeToMarkdown(response: GitHubTreeResponse): string {
  if (!response.tree || response.tree.length === 0) return "";

  const sortedTree = [...response.tree].sort((a, b) => {
    if (a.type === "tree" && b.type !== "tree") return -1;
    if (a.type !== "tree" && b.type === "tree") return 1;
    return a.path.localeCompare(b.path);
  });

  // Build hierarchy excluding empty directories
  const pathHierarchy = new Map<string, Set<string>>();
  const rootItems = new Set<string>();

  // First pass: collect all paths
  sortedTree.forEach((item) => {
    const pathParts = item.path.split("/");

    if (pathParts.length === 1) {
      rootItems.add(item.path);
    } else {
      const parentPath = pathParts.slice(0, -1).join("/");
      if (!pathHierarchy.has(parentPath)) {
        pathHierarchy.set(parentPath, new Set());
      }
      pathHierarchy.get(parentPath)!.add(item.path);
    }
  });

  function formatPath(path: string, level: number = 0): string {
    const indent = "  ".repeat(level);
    const item = sortedTree.find((i) => i.path === path);

    if (!item) return "";

    let result = "";
    const name = path.split("/").pop()!;

    // Only add directories if they have children
    if (item.type === "tree") {
      const hasChildren =
        pathHierarchy.has(path) && pathHierarchy.get(path)!.size > 0;
      if (!hasChildren) return "";
      result += `${indent}${name}/\n`;
    } else {
      result += `${indent}${name}\n`;
    }

    if (pathHierarchy.has(path)) {
      const children = Array.from(pathHierarchy.get(path)!).sort((a, b) => {
        const aItem = sortedTree.find((i) => i.path === a);
        const bItem = sortedTree.find((i) => i.path === b);
        if (aItem?.type === "tree" && bItem?.type !== "tree") return -1;
        if (aItem?.type !== "tree" && bItem?.type === "tree") return 1;
        return a.localeCompare(b);
      });

      for (const childPath of children) {
        result += formatPath(childPath, level + 1);
      }
    }

    return result;
  }

  return Array.from(rootItems)
    .sort((a, b) => {
      const aItem = sortedTree.find((i) => i.path === a);
      const bItem = sortedTree.find((i) => i.path === b);
      if (aItem?.type === "tree" && bItem?.type !== "tree") return -1;
      if (aItem?.type !== "tree" && bItem?.type === "tree") return 1;
      return a.localeCompare(b);
    })
    .map((path) => formatPath(path))
    .filter(Boolean)
    .join("");
}
