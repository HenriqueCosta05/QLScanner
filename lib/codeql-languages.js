const CODEQL_LANGUAGE_TABLE = [
  {
    key: "cpp",
    label: "C/C++",
    aliases: ["c", "c++", "cpp", "c/c++"],
    databaseLanguage: "cpp",
    queryPack: "codeql/cpp-queries@latest",
    querySuite:
      "codeql/cpp-queries:codeql-suites/cpp-security-and-quality.qls",
    extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"],
  },
  {
    key: "csharp",
    label: "C#",
    aliases: ["c#", "csharp", "dotnet"],
    databaseLanguage: "csharp",
    queryPack: "codeql/csharp-queries@latest",
    querySuite:
      "codeql/csharp-queries:codeql-suites/csharp-security-and-quality.qls",
    extensions: [".cs"],
  },
  {
    key: "go",
    label: "Go",
    aliases: ["go", "golang"],
    databaseLanguage: "go",
    queryPack: "codeql/go-queries@latest",
    querySuite: "codeql/go-queries:codeql-suites/go-security-and-quality.qls",
    extensions: [".go"],
  },
  {
    key: "java",
    label: "Java",
    aliases: ["java"],
    databaseLanguage: "java",
    queryPack: "codeql/java-queries@latest",
    querySuite:
      "codeql/java-queries:codeql-suites/java-security-and-quality.qls",
    extensions: [".java"],
  },
  {
    key: "javascript",
    label: "JavaScript/TypeScript",
    aliases: ["javascript", "typescript", "js", "ts", "javascript/typescript"],
    databaseLanguage: "javascript",
    queryPack: "codeql/javascript-queries@latest",
    querySuite:
      "codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls",
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"],
  },
  {
    key: "python",
    label: "Python",
    aliases: ["python", "py"],
    databaseLanguage: "python",
    queryPack: "codeql/python-queries@latest",
    querySuite:
      "codeql/python-queries:codeql-suites/python-security-and-quality.qls",
    extensions: [".py"],
  },
  {
    key: "ruby",
    label: "Ruby",
    aliases: ["ruby", "rb"],
    databaseLanguage: "ruby",
    queryPack: "codeql/ruby-queries@latest",
    querySuite:
      "codeql/ruby-queries:codeql-suites/ruby-security-and-quality.qls",
    extensions: [".rb"],
  },
  {
    key: "swift",
    label: "Swift",
    aliases: ["swift"],
    databaseLanguage: "swift",
    queryPack: "codeql/swift-queries@latest",
    querySuite:
      "codeql/swift-queries:codeql-suites/swift-security-and-quality.qls",
    extensions: [".swift"],
  },
];

const ALIAS_TO_KEY = new Map(
  CODEQL_LANGUAGE_TABLE.flatMap((entry) => [
    [entry.key, entry.key],
    ...entry.aliases.map((alias) => [alias, entry.key]),
  ]),
);

export const SUPPORTED_CODEQL_LANGUAGE_KEYS = CODEQL_LANGUAGE_TABLE.map(
  (entry) => entry.key,
);

export const SUPPORTED_CODEQL_LANGUAGE_LABELS = CODEQL_LANGUAGE_TABLE.map(
  (entry) => entry.label,
);

export function resolveCodeQLLanguage(input) {
  if (!input) return null;
  const normalized = String(input).trim().toLowerCase();
  const key = ALIAS_TO_KEY.get(normalized);
  if (!key) return null;
  return CODEQL_LANGUAGE_TABLE.find((entry) => entry.key === key) ?? null;
}

export function inferCodeQLLanguageFromFiles(filePaths) {
  const detected = new Set();

  for (const filePath of filePaths) {
    const lower = filePath.toLowerCase();
    const match = CODEQL_LANGUAGE_TABLE.find((entry) =>
      entry.extensions.some((extension) => lower.endsWith(extension)),
    );
    if (match) detected.add(match.key);
  }

  if (detected.size !== 1) return null;

  const [key] = detected;
  return CODEQL_LANGUAGE_TABLE.find((entry) => entry.key === key) ?? null;
}

export function getSupportedCodeQLLanguageHelpText() {
  return CODEQL_LANGUAGE_TABLE.map((entry) => entry.label).join(", ");
}
