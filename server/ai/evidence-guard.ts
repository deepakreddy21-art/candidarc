function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9+#.]/g, "");
}

export function validateEvidenceIds(data: unknown, allowed: unknown): void {
  if (!Array.isArray(allowed)) return;
  const valid = new Set(allowed.filter((item): item is string => typeof item === "string"));
  const inspect = (value: unknown, key = ""): void => {
    if (Array.isArray(value)) {
      if (/evidenceids?/i.test(key)) {
        const invalid = value.filter((item) => typeof item === "string" && !valid.has(item));
        if (invalid.length) throw new Error(`Unknown evidence IDs: ${invalid.join(", ")}`);
      }
      value.forEach((item) => inspect(item, key));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([childKey, child]) => inspect(child, childKey));
    }
  };
  inspect(data);
}

export function assertNoInventedTech(bulletTechs: string[], evidenceTechs: string[]): void {
  const supported = new Set(evidenceTechs.map(normalized));
  const invented = bulletTechs.filter((technology) => !supported.has(normalized(technology)));
  if (invented.length) {
    throw new Error(`Unsupported technologies: ${invented.join(", ")}`);
  }
}

export function validateResumeTechnologies(data: unknown, evidenceTechnologies: unknown): void {
  if (!Array.isArray(evidenceTechnologies)) return;
  const supported = evidenceTechnologies.filter((item): item is string => typeof item === "string");
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.technologies)) {
      assertNoInventedTech(
        record.technologies.filter((item): item is string => typeof item === "string"),
        supported,
      );
    }
    Object.values(record).forEach(inspect);
  };
  inspect(data);
}
