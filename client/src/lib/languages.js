export const LANGUAGES = ["javascript", "python", "java"];

export const STARTERS = {
  javascript: `// Nyx workspace
console.log("hello from Nyx");
`,
  python: `# Nyx workspace
print("hello from Nyx")
`,
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("hello from Nyx");
  }
}
`,
};

export function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "";
  }
}
