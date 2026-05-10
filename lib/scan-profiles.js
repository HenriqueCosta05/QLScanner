const LANGUAGE_PROFILES = [
  {
    id: "javascript",
    label: "JavaScript / TypeScript",
    aliases: ["js", "javascript", "ts", "typescript"],
    codeqlLanguage: "javascript",
    queryPack: "codeql/javascript-queries@latest",
    querySuite:
      "codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls",
  },
  {
    id: "python",
    label: "Python",
    aliases: ["py", "python"],
    codeqlLanguage: "python",
    queryPack: "codeql/python-queries@latest",
    querySuite: "codeql/python-queries:codeql-suites/python-security-and-quality.qls",
  },
  {
    id: "java",
    label: "Java",
    aliases: ["java"],
    codeqlLanguage: "java",
    queryPack: "codeql/java-queries@latest",
    querySuite: "codeql/java-queries:codeql-suites/java-security-and-quality.qls",
  },
  {
    id: "csharp",
    label: "C#",
    aliases: ["c#", "csharp", "cs"],
    codeqlLanguage: "csharp",
    queryPack: "codeql/csharp-queries@latest",
    querySuite: "codeql/csharp-queries:codeql-suites/csharp-security-and-quality.qls",
  },
  {
    id: "go",
    label: "Go",
    aliases: ["go", "golang"],
    codeqlLanguage: "go",
    queryPack: "codeql/go-queries@latest",
    querySuite: "codeql/go-queries:codeql-suites/go-security-and-quality.qls",
  },
];

export function listSupportedLanguageProfiles() {
  return LANGUAGE_PROFILES.map((profile) => ({ ...profile }));
}

export function getLanguageProfile(language) {
  const normalized = String(language ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    LANGUAGE_PROFILES.find((profile) => {
      return [profile.id, ...profile.aliases].some(
        (alias) => alias.toLowerCase() === normalized,
      );
    }) ?? null
  );
}

export function buildLanguageMenu() {
  return LANGUAGE_PROFILES.map((profile, index) => ({
    index: index + 1,
    id: profile.id,
    label: profile.label,
  }));
}
