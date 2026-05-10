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

const CODEQL_MODES = [
  {
    id: "managed",
    label: "Use QLScanner-managed CodeQL",
    description:
      "Downloads and keeps a managed CodeQL installation up to date.",
  },
  {
    id: "installed",
    label: "Use a CodeQL installation already available in PATH",
    description:
      "Reuses an existing CodeQL binary already installed on the machine.",
  },
  {
    id: "update",
    label: "Update the managed CodeQL installation to the latest version",
    description: "Forces a refresh of the managed CodeQL bundle.",
  },
];

export function listSupportedLanguageProfiles() {
  return LANGUAGE_PROFILES.map((profile) => ({ ...profile }));
}

export function listSupportedLanguageIds() {
  return LANGUAGE_PROFILES.map((profile) => profile.id);
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

export function listCodeQLModes() {
  return CODEQL_MODES.map((mode) => ({ ...mode }));
}

export function getCodeQLMode(mode) {
  const normalized = String(mode ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return CODEQL_MODES.find((item) => item.id === normalized) ?? null;
}
