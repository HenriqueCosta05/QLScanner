import { execFileSync } from "child_process";

/**
 * Canonical CodeQL language mapping used as the single source of truth for:
 *  - user input validation
 *  - default language inference
 *  - query pack/suite selection
 *  - database language selection
 */
export const CODEQL_LANGUAGES = {
  cpp: {
    aliases: ["c", "c++", "cpp"],
    extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"],
    queryPack: "codeql/cpp-queries@latest",
    querySuite: "codeql/cpp-queries:codeql-suites/cpp-security-and-quality.qls",
    databaseLanguage: "cpp",
    label: "C/C++",
  },
  csharp: {
    aliases: ["c#", "cs", "csharp"],
    extensions: [".cs"],
    queryPack: "codeql/csharp-queries@latest",
    querySuite:
      "codeql/csharp-queries:codeql-suites/csharp-security-and-quality.qls",
    databaseLanguage: "csharp",
    label: "C#",
  },
  go: {
    aliases: ["go", "golang"],
    extensions: [".go"],
    queryPack: "codeql/go-queries@latest",
    querySuite: "codeql/go-queries:codeql-suites/go-security-and-quality.qls",
    databaseLanguage: "go",
    label: "Go",
  },
  java: {
    aliases: ["java"],
    extensions: [".java", ".kt", ".kts"],
    queryPack: "codeql/java-queries@latest",
    querySuite: "codeql/java-queries:codeql-suites/java-security-and-quality.qls",
    databaseLanguage: "java",
    label: "Java",
  },
  javascript: {
    aliases: ["javascript", "js", "typescript", "ts"],
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"],
    queryPack: "codeql/javascript-queries@latest",
    querySuite:
      "codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls",
    databaseLanguage: "javascript",
    label: "JavaScript/TypeScript",
  },
  python: {
    aliases: ["py", "python"],
    extensions: [".py"],
    queryPack: "codeql/python-queries@latest",
    querySuite:
      "codeql/python-queries:codeql-suites/python-security-and-quality.qls",
    databaseLanguage: "python",
    label: "Python",
  },
  ruby: {
    aliases: ["rb", "ruby"],
    extensions: [".rb"],
    queryPack: "codeql/ruby-queries@latest",
    querySuite:
      "codeql/ruby-queries:codeql-suites/ruby-security-and-quality.qls",
    databaseLanguage: "ruby",
    label: "Ruby",
  },
  swift: {
    aliases: ["swift"],
    extensions: [".swift"],
    queryPack: "codeql/swift-queries@latest",
    querySuite:
      "codeql/swift-queries:codeql-suites/swift-security-and-quality.qls",
    databaseLanguage: "swift",
    label: "Swift",
  },
};

const SUPPORTED_ALIASES = Object.entries(CODEQL_LANGUAGES).reduce(
  (acc, [name, config]) => {
    acc.set(name, name);
    for (const alias of config.aliases) {
      acc.set(alias.toLowerCase(), name);
    }
    return acc;
  },
  new Map(),
);

const EXTENSION_TO_LANGUAGE = Object.entries(CODEQL_LANGUAGES).reduce(
  (acc, [name, config]) => {
    for (const extension of config.extensions) {
      acc.set(extension, name);
    }
    return acc;
  },
  new Map(),
);

const LANGUAGE_PRIORITY = Object.keys(CODEQL_LANGUAGES).reduce((acc, name, i) => {
  acc.set(name, i);
  return acc;
}, new Map());

export function getSupportedLanguageLabels() {
  return Object.values(CODEQL_LANGUAGES).map((entry) => entry.label);
}

export function resolveLanguageConfig(requestedLanguage) {
  const canonicalName = normalizeLanguageName(requestedLanguage);
  if (!canonicalName) {
    throw new Error(
      `Unsupported language "${requestedLanguage}". Supported languages: ${getSupportedLanguageLabels().join(", ")}.`,
    );
  }

  return { name: canonicalName, ...CODEQL_LANGUAGES[canonicalName] };
}

export function inferLanguageFromFilePaths(filePaths) {
  const score = new Map();

  for (const filePath of filePaths) {
    const extension = filePath
      .trim()
      .toLowerCase()
      .match(/\.[a-z0-9]+$/)?.[0];
    if (!extension) continue;

    const language = EXTENSION_TO_LANGUAGE.get(extension);
    if (!language) continue;

    score.set(language, (score.get(language) ?? 0) + 1);
  }

  let bestLanguage = null;
  let bestScore = 0;

  for (const [language, count] of score.entries()) {
    if (
      count > bestScore ||
      (count === bestScore &&
        bestLanguage &&
        LANGUAGE_PRIORITY.get(language) < LANGUAGE_PRIORITY.get(bestLanguage))
    ) {
      bestLanguage = language;
      bestScore = count;
    }
  }

  return bestLanguage;
}

export function inferLanguageFromTrackedFiles(repoRoot) {
  try {
    const trackedFiles = execFileSync("git", ["-C", repoRoot, "ls-files"], {
      encoding: "utf8",
    });

    return inferLanguageFromFilePaths(trackedFiles.split(/\r?\n/));
  } catch {
    return null;
  }
}

export function getSupportedExtensionPattern() {
  const escapedExtensions = [...EXTENSION_TO_LANGUAGE.keys()].map((extension) =>
    extension.replace(".", "\\."),
  );
  return new RegExp(`(${escapedExtensions.join("|")})$`, "i");
}

function normalizeLanguageName(value) {
  if (!value) return null;
  return SUPPORTED_ALIASES.get(value.trim().toLowerCase()) ?? null;
}
